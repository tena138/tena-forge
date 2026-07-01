import math
import mimetypes
import re
from datetime import datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from database import get_db, get_settings
from models import Academy, AcademyClass, AcademyStaffMembership, AcademyWorkspaceSettings, ClassScheduleEvent, ClassTeacher, PaperSession
from services.academy_student_access import ensure_academy_subscription
from services.ownership import current_user_id, current_workspace_id, require_workspace_owner
from services.private_files import sign_static_url, static_file_path, static_relative_path

router = APIRouter(prefix="/api/live-interactions", tags=["live-interactions"])

LIVE_LECTURE_EVENT_METADATA_KEY = "live_lecture"
LIVE_LECTURE_CLASS_DEFAULTS_METADATA_KEY = "live_lecture_class_defaults"
MAX_LIVE_SLIDE_BYTES = 80 * 1024 * 1024
LEGACY_DEFAULT_LIVE_NOTES = "수업 시작 전 출석 확인\n핵심 개념 설명 후 대표 문항 풀이\n마지막 5분 질문 정리"
DEFAULT_LIVE_NOTES = ""


class LiveInteractionSettingsPayload(BaseModel):
    live_start_lead_minutes: int = Field(ge=0, le=240)


class LiveLectureSlidePayload(BaseModel):
    url: str | None = None
    name: str | None = Field(default=None, max_length=255)
    size: int | None = Field(default=None, ge=0)
    content_type: str | None = Field(default=None, max_length=120)


class LiveLectureLessonPlanItemPayload(BaseModel):
    id: str | None = Field(default=None, max_length=80)
    title: str = Field(min_length=1, max_length=120)
    kind: str = Field(default="lesson", max_length=20)
    start_minute: int = Field(ge=0, le=1440)
    duration_minutes: int = Field(ge=1, le=1440)
    paper_session_id: UUID | None = None
    color: str | None = Field(default=None, max_length=24)


class LiveLectureSessionPayload(BaseModel):
    notes: str | None = None
    page_notes: dict[str, str] | None = None
    page_number: int | None = Field(default=None, ge=1, le=10000)
    slide_pdf: LiveLectureSlidePayload | None = None
    lesson_plan: list[LiveLectureLessonPlanItemPayload] | None = None


def _workspace_settings(db: Session, academy_id: str) -> AcademyWorkspaceSettings:
    row = db.get(AcademyWorkspaceSettings, academy_id)
    if not row:
        row = AcademyWorkspaceSettings(academy_id=academy_id, live_start_lead_minutes=5)
        db.add(row)
        db.flush()
    return row


def _safe_path_part(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]+", "_", value).strip("_") or "item"


def _safe_filename(filename: str | None) -> str:
    original = Path(filename or "lecture.pdf").name
    stem = re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", Path(original).stem).strip("._") or "lecture"
    return f"{stem[:120]}.pdf"


def _stored_slide_name(filename: str | None) -> str:
    safe = _safe_filename(filename)
    return f"{Path(safe).stem}_{uuid4().hex}.pdf"


def _live_slide_root(academy_id: str, event_id: UUID) -> Path:
    root = Path(get_settings().uploads_dir) / "live-lectures" / _safe_path_part(str(academy_id)) / str(event_id)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _clean_live_notes(value: str | None) -> str:
    if value is None:
        return ""
    cleaned = str(value).replace("\r\n", "\n").replace("\r", "\n")[:10000]
    return "" if cleaned.strip() == LEGACY_DEFAULT_LIVE_NOTES.strip() else cleaned


def _clean_live_page_notes(value: dict | None) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    cleaned: dict[str, str] = {}
    for raw_page, raw_note in value.items():
        try:
            page = int(raw_page)
        except (TypeError, ValueError):
            continue
        if page < 1 or page > 10000:
            continue
        note = _clean_live_notes(str(raw_note or ""))
        if note.strip():
            cleaned[str(page)] = note
    return cleaned


def _event_duration_minutes(event: ClassScheduleEvent) -> int:
    starts_at = event.starts_at
    ends_at = event.ends_at or starts_at + timedelta(minutes=60)
    return max(1, math.ceil((ends_at - starts_at).total_seconds() / 60))


def _validate_live_test_session(db: Session, academy_id: str, event: ClassScheduleEvent, paper_session_id: UUID) -> str:
    session = db.get(PaperSession, paper_session_id)
    if not session or session.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="Test session not found.")
    class_ids = {str(value) for value in (session.class_ids or [])}
    if str(event.class_id) not in class_ids:
        raise HTTPException(status_code=400, detail="Test session is not assigned to this class.")
    return str(session.id)


def _clean_lesson_plan_item(
    db: Session,
    academy_id: str,
    event: ClassScheduleEvent,
    raw_item: dict | LiveLectureLessonPlanItemPayload,
    *,
    strict: bool,
) -> dict | None:
    raw = raw_item.model_dump() if isinstance(raw_item, LiveLectureLessonPlanItemPayload) else dict(raw_item or {})
    item_id = re.sub(r"[^0-9A-Za-z_-]+", "", str(raw.get("id") or ""))[:80] or uuid4().hex
    title = str(raw.get("title") or "").strip()[:120]
    kind = str(raw.get("kind") or "lesson").strip().lower()
    if kind not in {"lesson", "break", "test"}:
        kind = "lesson"
    if not title:
        if strict:
            raise HTTPException(status_code=400, detail="Lesson plan title is required.")
        return None
    try:
        start_minute = int(raw.get("start_minute"))
        duration_minutes = int(raw.get("duration_minutes"))
    except (TypeError, ValueError):
        if strict:
            raise HTTPException(status_code=400, detail="Lesson plan time is invalid.")
        return None
    total_minutes = _event_duration_minutes(event)
    if start_minute < 0 or duration_minutes < 1 or start_minute + duration_minutes > total_minutes:
        if strict:
            raise HTTPException(status_code=400, detail="Lesson plan block must stay inside the class time.")
        return None
    paper_session_id = None
    if raw.get("paper_session_id"):
        try:
            paper_session_id = _validate_live_test_session(db, academy_id, event, UUID(str(raw.get("paper_session_id"))))
        except (TypeError, ValueError):
            if strict:
                raise HTTPException(status_code=400, detail="Test session id is invalid.")
            return None
        kind = "test"
    elif kind == "test":
        kind = "lesson"
    color = str(raw.get("color") or "").strip().lower()
    if not re.fullmatch(r"#[0-9a-f]{6}", color):
        color = None
    return {
        "id": item_id,
        "title": title,
        "kind": kind,
        "start_minute": start_minute,
        "duration_minutes": duration_minutes,
        "paper_session_id": paper_session_id,
        "color": color,
    }


def _clean_lesson_plan(
    db: Session,
    academy_id: str,
    event: ClassScheduleEvent,
    value: list | None,
    *,
    strict: bool = False,
) -> list[dict]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict] = []
    for raw_item in value[:80]:
        item = _clean_lesson_plan_item(db, academy_id, event, raw_item, strict=strict)
        if item:
            cleaned.append(item)
    return sorted(cleaned, key=lambda item: (item["start_minute"], item["title"]))


def _normalize_slide(slide: dict | LiveLectureSlidePayload | None) -> dict | None:
    if not slide:
        return None
    raw = slide.model_dump() if isinstance(slide, LiveLectureSlidePayload) else dict(slide)
    relative = static_relative_path(str(raw.get("url") or ""))
    if not relative:
        return None
    return {
        "url": f"/static/{relative}",
        "name": _safe_filename(str(raw.get("name") or "lecture.pdf")),
        "size": max(0, int(raw.get("size") or 0)),
        "content_type": str(raw.get("content_type") or mimetypes.guess_type(relative)[0] or "application/pdf")[:120],
    }


def _public_slide(slide: dict | None, academy_id: str) -> dict | None:
    normalized = _normalize_slide(slide)
    if not normalized:
        return None
    return {
        **normalized,
        "url": sign_static_url(normalized["url"], academy_id, expires_seconds=8 * 60 * 60),
    }


def _delete_slide_file(slide: dict | None) -> None:
    normalized = _normalize_slide(slide)
    if not normalized:
        return
    try:
        path = static_file_path(normalized["url"])
    except HTTPException:
        return
    if path.exists() and path.is_file():
        path.unlink()


def _event_live_metadata(event: ClassScheduleEvent) -> dict:
    metadata = event.metadata_json if isinstance(event.metadata_json, dict) else {}
    live = metadata.get(LIVE_LECTURE_EVENT_METADATA_KEY)
    return dict(live) if isinstance(live, dict) else {}


def _class_live_defaults(db: Session, academy_id: str) -> tuple[object, dict, dict]:
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = dict(subscription.billing_metadata or {})
    defaults = metadata.get(LIVE_LECTURE_CLASS_DEFAULTS_METADATA_KEY)
    if not isinstance(defaults, dict):
        defaults = {}
    return subscription, metadata, defaults


def _class_live_default(db: Session, academy_id: str, class_id: UUID) -> dict:
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = subscription.billing_metadata if isinstance(subscription.billing_metadata, dict) else {}
    defaults = metadata.get(LIVE_LECTURE_CLASS_DEFAULTS_METADATA_KEY)
    if not isinstance(defaults, dict):
        return {}
    value = defaults.get(str(class_id))
    return dict(value) if isinstance(value, dict) else {}


def _is_academy_workspace(db: Session, academy_id: str) -> bool:
    try:
        account = db.get(Academy, UUID(str(academy_id)))
    except (TypeError, ValueError):
        return False
    return bool(account and account.account_type == "academy")


def _require_academy_workspace(db: Session, academy_id: str) -> None:
    if not _is_academy_workspace(db, academy_id):
        raise HTTPException(status_code=403, detail="Live interaction settings require an academy workspace.")


def _settings_payload(row: AcademyWorkspaceSettings) -> dict:
    return {
        "academy_id": row.academy_id,
        "live_start_lead_minutes": row.live_start_lead_minutes,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _visible_class_ids(db: Session, academy_id: str, user_id: str) -> list | None:
    if user_id == academy_id:
        return None
    staff = db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.academy_id == academy_id,
            AcademyStaffMembership.user_id == user_id,
            AcademyStaffMembership.is_active.is_(True),
        )
    )
    if not staff:
        return None
    if staff.role in {"teacher", "assistant"}:
        return list(db.scalars(select(ClassTeacher.class_id).where(ClassTeacher.academy_staff_user_id == user_id)).all())
    return None


def _event_payload(event: ClassScheduleEvent, class_row: AcademyClass, now: datetime) -> dict:
    seconds_until = (event.starts_at - now).total_seconds()
    minutes_until = max(0, math.ceil(seconds_until / 60))
    return {
        "id": str(event.id),
        "academy_id": event.academy_id,
        "class_id": str(event.class_id),
        "class_name": class_row.name,
        "title": event.title,
        "starts_at": event.starts_at.isoformat(),
        "ends_at": event.ends_at.isoformat() if event.ends_at else None,
        "minutes_until_start": minutes_until,
        "status": "ready" if seconds_until <= 0 else "opening",
        "live_href": f"/live-lecture?eventId={event.id}&classId={event.class_id}",
    }


def _visible_event(db: Session, academy_id: str, user_id: str, event_id: UUID) -> tuple[ClassScheduleEvent, AcademyClass]:
    event = db.get(ClassScheduleEvent, event_id)
    if not event or event.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="Lecture event not found.")
    visible_class_ids = _visible_class_ids(db, academy_id, user_id)
    if visible_class_ids == [] or (visible_class_ids is not None and event.class_id not in visible_class_ids):
        raise HTTPException(status_code=404, detail="Lecture event not found.")
    class_row = db.get(AcademyClass, event.class_id)
    if not class_row or class_row.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="Class not found.")
    return event, class_row


def _live_session_payload(db: Session, academy_id: str, event: ClassScheduleEvent, class_row: AcademyClass, *, created_class_default: bool = False) -> dict:
    event_live = _event_live_metadata(event)
    class_default = _class_live_default(db, academy_id, event.class_id)
    has_event_live = bool(event_live)
    has_class_default = bool(class_default)
    source = "event" if has_event_live else "class_default" if has_class_default else "empty"
    notes = event_live.get("notes") if isinstance(event_live.get("notes"), str) else class_default.get("notes") if isinstance(class_default.get("notes"), str) else DEFAULT_LIVE_NOTES
    page_notes = event_live.get("page_notes") if isinstance(event_live.get("page_notes"), dict) else class_default.get("page_notes") if isinstance(class_default.get("page_notes"), dict) else {}
    page_number = event_live.get("page_number") if isinstance(event_live.get("page_number"), int) else 1
    lesson_plan = _clean_lesson_plan(db, academy_id, event, event_live.get("lesson_plan") if isinstance(event_live, dict) else None)
    return {
        "event": _event_payload(event, class_row, datetime.utcnow()),
        "source": source,
        "event_initialized": has_event_live,
        "class_default_initialized": has_class_default or created_class_default,
        "created_class_default": created_class_default,
        "lecture": {
            "notes": _clean_live_notes(notes),
            "page_notes": _clean_live_page_notes(page_notes),
            "slide_pdf": _public_slide(event_live.get("slide_pdf") if isinstance(event_live, dict) else None, academy_id),
            "page_number": max(1, int(page_number or 1)),
            "lesson_plan": lesson_plan,
            "updated_at": event_live.get("updated_at") if isinstance(event_live.get("updated_at"), str) else class_default.get("updated_at") if isinstance(class_default.get("updated_at"), str) else None,
        },
    }


@router.get("/settings")
def get_live_interaction_settings(request: Request, db: Session = Depends(get_db)):
    academy_id = current_workspace_id(request, db)
    require_workspace_owner(request, db, academy_id)
    _require_academy_workspace(db, academy_id)
    row = _workspace_settings(db, academy_id)
    db.commit()
    return _settings_payload(row)


@router.patch("/settings")
def update_live_interaction_settings(payload: LiveInteractionSettingsPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = current_workspace_id(request, db)
    require_workspace_owner(request, db, academy_id)
    _require_academy_workspace(db, academy_id)
    row = _workspace_settings(db, academy_id)
    row.live_start_lead_minutes = payload.live_start_lead_minutes
    row.updated_at = datetime.utcnow()
    db.commit()
    return _settings_payload(row)


@router.get("/upcoming")
def list_upcoming_live_interactions(request: Request, db: Session = Depends(get_db)):
    academy_id = current_workspace_id(request, db)
    user_id = current_user_id(request)
    if not _is_academy_workspace(db, academy_id):
        return {"settings": {"academy_id": academy_id, "live_start_lead_minutes": 5, "updated_at": None}, "events": []}
    settings = _workspace_settings(db, academy_id)
    now = datetime.utcnow()
    lead_until = now + timedelta(minutes=settings.live_start_lead_minutes)
    recent_floor = now - timedelta(hours=4)
    visible_class_ids = _visible_class_ids(db, academy_id, user_id)
    if visible_class_ids == []:
        db.commit()
        return {"settings": _settings_payload(settings), "events": []}

    stmt = (
        select(ClassScheduleEvent, AcademyClass)
        .join(AcademyClass, AcademyClass.id == ClassScheduleEvent.class_id)
        .where(
            ClassScheduleEvent.academy_id == academy_id,
            ClassScheduleEvent.event_type == "class",
            ClassScheduleEvent.starts_at <= lead_until,
            ClassScheduleEvent.starts_at >= recent_floor,
            or_(ClassScheduleEvent.ends_at.is_(None), ClassScheduleEvent.ends_at >= now),
        )
        .order_by(ClassScheduleEvent.starts_at.asc())
        .limit(10)
    )
    if visible_class_ids is not None:
        stmt = stmt.where(ClassScheduleEvent.class_id.in_(visible_class_ids))

    events = [_event_payload(event, class_row, now) for event, class_row in db.execute(stmt).all()]
    db.commit()
    return {"settings": _settings_payload(settings), "events": events}


@router.get("/events/{event_id}/session")
def get_live_lecture_session(event_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = current_workspace_id(request, db, permission="can_manage_schedule")
    user_id = current_user_id(request)
    _require_academy_workspace(db, academy_id)
    event, class_row = _visible_event(db, academy_id, user_id, event_id)
    payload = _live_session_payload(db, academy_id, event, class_row)
    db.commit()
    return payload


@router.patch("/events/{event_id}/session")
def update_live_lecture_session(event_id: UUID, payload: LiveLectureSessionPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = current_workspace_id(request, db, permission="can_manage_schedule")
    user_id = current_user_id(request)
    _require_academy_workspace(db, academy_id)
    event, class_row = _visible_event(db, academy_id, user_id, event_id)
    metadata = dict(event.metadata_json or {})
    live = dict(metadata.get(LIVE_LECTURE_EVENT_METADATA_KEY) or {})
    fields = payload.model_fields_set
    now = datetime.utcnow().isoformat()
    created_class_default = False

    if "notes" in fields:
        live["notes"] = _clean_live_notes(payload.notes)
    if "page_notes" in fields:
        live["page_notes"] = _clean_live_page_notes(payload.page_notes)
    if "page_number" in fields and payload.page_number:
        live["page_number"] = payload.page_number
    if "slide_pdf" in fields:
        if payload.slide_pdf is None:
            _delete_slide_file(live.get("slide_pdf") if isinstance(live.get("slide_pdf"), dict) else None)
            live.pop("slide_pdf", None)
        else:
            normalized = _normalize_slide(payload.slide_pdf)
            if normalized:
                live["slide_pdf"] = normalized
    if "lesson_plan" in fields:
        live["lesson_plan"] = _clean_lesson_plan(db, academy_id, event, payload.lesson_plan or [], strict=True)

    live["updated_at"] = now
    metadata[LIVE_LECTURE_EVENT_METADATA_KEY] = live
    event.metadata_json = metadata
    event.updated_at = datetime.utcnow()

    subscription, class_metadata, class_defaults = _class_live_defaults(db, academy_id)
    class_id = str(event.class_id)
    if class_id not in class_defaults and "notes" in fields:
        class_defaults[class_id] = {
            "notes": _clean_live_notes(payload.notes) or DEFAULT_LIVE_NOTES,
            "page_notes": _clean_live_page_notes(payload.page_notes) if "page_notes" in fields else {},
            "updated_by": current_user_id(request),
            "updated_at": now,
        }
        class_metadata[LIVE_LECTURE_CLASS_DEFAULTS_METADATA_KEY] = class_defaults
        subscription.billing_metadata = class_metadata
        created_class_default = True

    db.commit()
    db.refresh(event)
    return _live_session_payload(db, academy_id, event, class_row, created_class_default=created_class_default)


@router.post("/events/{event_id}/slide")
async def upload_live_lecture_slide(event_id: UUID, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    academy_id = current_workspace_id(request, db, permission="can_manage_schedule")
    user_id = current_user_id(request)
    _require_academy_workspace(db, academy_id)
    event, class_row = _visible_event(db, academy_id, user_id, event_id)
    filename = file.filename or "lecture.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")
    if file.content_type and file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")
    data = await file.read()
    if len(data) > MAX_LIVE_SLIDE_BYTES:
        raise HTTPException(status_code=413, detail="슬라이드 PDF는 80MB 이하만 업로드할 수 있습니다.")

    metadata = dict(event.metadata_json or {})
    live = dict(metadata.get(LIVE_LECTURE_EVENT_METADATA_KEY) or {})
    _delete_slide_file(live.get("slide_pdf") if isinstance(live.get("slide_pdf"), dict) else None)

    stored_name = _stored_slide_name(filename)
    root = _live_slide_root(academy_id, event_id)
    path = root / stored_name
    path.write_bytes(data)
    slide = {
        "url": f"/static/live-lectures/{_safe_path_part(str(academy_id))}/{event_id}/{stored_name}",
        "name": _safe_filename(filename),
        "size": len(data),
        "content_type": "application/pdf",
    }
    live["slide_pdf"] = slide
    live["page_number"] = 1
    live["updated_at"] = datetime.utcnow().isoformat()
    metadata[LIVE_LECTURE_EVENT_METADATA_KEY] = live
    event.metadata_json = metadata
    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return _live_session_payload(db, academy_id, event, class_row)
