import io
import json
import logging
import math
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, delete, func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from database import get_db, get_settings
from models import (
    AcademyClass,
    AcademyMaterialAssignment,
    AcademySeat,
    AcademyStudentSubscription,
    ArchiveAccessGrant,
    AssignmentSubmission,
    Batch,
    CalendarEvent,
    ClassScheduleEvent,
    ClassStudent,
    ContentVersion,
    DailyStudentQuotaUsage,
    HubTemplate,
    LearningAssignmentTarget,
    LearningSubmission,
    MaterialDeliveryLog,
    PaperSession,
    PaperSessionResult,
    Problem,
    ProblemAttempt,
    ProblemResult,
    ProblemSet,
    ProblemSetItem,
    RoutineAction,
    RoutineMessage,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    StudentNotification,
    StudentPersonalSet,
    StudentPersonalSetItem,
    StudentTuitionPayment,
    StudentTuitionSessionAdjustment,
    TestSession,
    WatermarkedExport,
    WrongAnswerAttempt,
    WrongAnswerItem,
    WrongAnswerRecord,
    WrongAnswerReview,
)
from services.export_service import generate_hub_context_pdf
from services.academy_student_access import (
    academy_seat_key_status,
    create_seat,
    ensure_academy_subscription,
    invite_code_matches,
    is_unlinked_academy_student,
    rotate_seat_code,
    save_student_profile_collection_settings,
    student_profile_collection_settings,
)
from services.ownership import LOCAL_OWNER_ID, current_owner_ids, current_user_id, current_workspace_id
from services.problem_usage_history import record_problem_set_usage
from services.template_renderer import render_hub_template_for_context

router = APIRouter(prefix="/api/student-management", tags=["student management"])
logger = logging.getLogger(__name__)
CLASS_ORDER_METADATA_KEY = "student_management_class_order"
COUNSELING_FORMATS_METADATA_KEY = "student_management_counseling_formats"
COUNSELING_PRESETS_METADATA_KEY = "student_management_counseling_presets"
ROUTINE_CHANNEL = "student_notification"
ROUTINE_ACTIVE_STATUSES = {"suggested", "reviewing"}
ROUTINE_RECENT_DAYS = 14
ROUTINE_MAX_NEW_PER_REFRESH = 8
TUITION_LOOKAHEAD_DAYS = 14
TUITION_OVERDUE_DAYS = 30
SCHEDULE_SERIES_METADATA_KEY = "schedule_series_id"
SCHEDULE_SERIES_POSITION_METADATA_KEY = "schedule_series_position"
SCHEDULE_SERIES_SIZE_METADATA_KEY = "schedule_series_size"
STUDENT_PERSON_METADATA_KEY = "student_person_id"
EXPORTED_REVIEW_SOURCE_STUDENT = "\uc774\uc6b0\ub178"
EXPORTED_REVIEW_TARGET_STUDENTS = {"\uc774\uc6b0\ub178", "\uc774\ub098\uc740", "\uc774\uc218\ud604", "\ud669\uc9c0\uc724"}
EXPORTED_REVIEW_TITLE_KEYWORDS = ("\ubbf8\uce5c\uac1c\ub150", "\uc2182", "\ubcf5\uc2b5", "(2)")
EXPORTED_REVIEW_DATE = "2026-05-29"
DEFAULT_COUNSELING_FIELDS = [
    {"id": "notes", "label": "상담하면서 기록할 내용", "placeholder": "상담하면서 기록할 내용", "include_in_report": True},
    {"id": "weekly_report", "label": "주간 리포트 초안", "placeholder": "주간 리포트 초안", "include_in_report": False},
    {"id": "next_plan", "label": "다음 지도 계획", "placeholder": "다음 지도 계획 / 과제 제안", "include_in_report": True},
]


def _academy_id(request: Request) -> str:
    return current_user_id(request)


def _student_management_academy_id(request: Request, db: Session) -> str:
    owner_id = current_workspace_id(request, db, permission="can_manage_students")
    owner_ids = current_owner_ids(request, db)
    if owner_id == LOCAL_OWNER_ID or LOCAL_OWNER_ID not in owner_ids:
        return owner_id

    legacy_class_count = db.scalar(select(func.count(AcademyClass.id)).where(AcademyClass.academy_id == LOCAL_OWNER_ID)) or 0
    legacy_student_count = db.scalar(select(func.count(StudentAcademyMembership.id)).where(StudentAcademyMembership.academy_id == LOCAL_OWNER_ID)) or 0
    legacy_schedule_count = db.scalar(select(func.count(ClassScheduleEvent.id)).where(ClassScheduleEvent.academy_id == LOCAL_OWNER_ID)) or 0
    legacy_score = legacy_class_count + legacy_student_count + legacy_schedule_count
    if legacy_score:
        return LOCAL_OWNER_ID

    return owner_id


def _student_management_academy_ids(request: Request, db: Session, academy_id: str | None = None) -> set[str]:
    owner_ids = current_owner_ids(request, db)
    if academy_id:
        owner_ids.add(academy_id)
    return owner_ids


def _now() -> datetime:
    return datetime.utcnow()


def _date_boundary(value: str | None, end: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None
    if end:
        return parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    return parsed.replace(hour=0, minute=0, second=0, microsecond=0)


def _uuid_list(values: list[UUID | str] | None) -> list[str]:
    return [str(value) for value in values or [] if value]


def _id_equals(column, value):
    return cast(column, String) == str(value)


def _id_columns_equal(left, right):
    return cast(left, String) == cast(right, String)


def _id_in(column, values) -> object:
    normalized = [str(value) for value in values or [] if value]
    return cast(column, String).in_(normalized or [str(uuid.uuid4())])


def _decimal_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return value


def _round_stat(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, 2)


def _quantile(sorted_values: list[float], fraction: float) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * fraction
    lower_index = math.floor(position)
    upper_index = math.ceil(position)
    if lower_index == upper_index:
        return sorted_values[lower_index]
    lower = sorted_values[lower_index]
    upper = sorted_values[upper_index]
    return lower + (upper - lower) * (position - lower_index)


def _score_distribution(results: list[PaperSessionResult]) -> dict:
    scores = sorted(
        float(row.score)
        for row in results
        if row.status == "graded" and row.score is not None and math.isfinite(float(row.score))
    )
    if not scores:
        return {
            "respondent_count": 0,
            "average_score": None,
            "highest_score": None,
            "lowest_score": None,
            "q1_score": None,
            "q2_score": None,
            "q3_score": None,
            "score_standard_deviation": None,
        }
    average_score = sum(scores) / len(scores)
    variance = sum((score - average_score) ** 2 for score in scores) / len(scores)
    return {
        "respondent_count": len(scores),
        "average_score": _round_stat(average_score),
        "highest_score": _round_stat(max(scores)),
        "lowest_score": _round_stat(min(scores)),
        "q1_score": _round_stat(_quantile(scores, 0.25)),
        "q2_score": _round_stat(_quantile(scores, 0.5)),
        "q3_score": _round_stat(_quantile(scores, 0.75)),
        "score_standard_deviation": _round_stat(math.sqrt(variance)),
    }


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _stored_class_order(db: Session, academy_id: str) -> list[str]:
    subscription = db.scalar(select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id == academy_id))
    if not subscription:
        return []
    metadata = subscription.billing_metadata or {}
    class_ids = metadata.get(CLASS_ORDER_METADATA_KEY)
    if not isinstance(class_ids, list):
        return []
    return [str(value) for value in class_ids if value]


def _save_class_order(db: Session, academy_id: str, class_ids: list[str]) -> None:
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = dict(subscription.billing_metadata or {})
    metadata[CLASS_ORDER_METADATA_KEY] = class_ids
    subscription.billing_metadata = metadata


def _billing_metadata(db: Session, academy_id: str) -> dict:
    subscription = db.scalar(select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id == academy_id))
    if not subscription:
        return {}
    return dict(subscription.billing_metadata or {})


def _field_id(value: str | None, fallback: str, used: set[str]) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", (value or "").strip()).strip("_")[:48] or fallback
    candidate = cleaned
    suffix = 2
    while candidate in used:
        candidate = f"{cleaned}_{suffix}"[:48]
        suffix += 1
    used.add(candidate)
    return candidate


def _normalize_counseling_fields(fields: list[dict] | None) -> list[dict]:
    source = fields if isinstance(fields, list) else DEFAULT_COUNSELING_FIELDS
    normalized: list[dict] = []
    used: set[str] = set()
    for index, field in enumerate(source[:12]):
        if not isinstance(field, dict):
            continue
        label = str(field.get("label") or "").strip()[:80]
        if not label:
            continue
        field_id = _field_id(str(field.get("id") or ""), f"field_{index + 1}", used)
        placeholder = str(field.get("placeholder") or label).strip()[:160]
        normalized.append(
            {
                "id": field_id,
                "label": label,
                "placeholder": placeholder,
                "include_in_report": bool(field.get("include_in_report", True)),
            }
        )
    return normalized or [dict(field) for field in DEFAULT_COUNSELING_FIELDS]


def _normalize_counseling_sections(sections: list[dict] | None) -> list[dict]:
    if not isinstance(sections, list):
        return []
    normalized: list[dict] = []
    used: set[str] = set()
    for index, section in enumerate(sections[:20]):
        if not isinstance(section, dict):
            continue
        label = str(section.get("label") or "").strip()[:80]
        if not label:
            continue
        field_id = _field_id(str(section.get("field_id") or section.get("id") or ""), f"field_{index + 1}", used)
        normalized.append(
            {
                "field_id": field_id,
                "label": label,
                "value": str(section.get("value") or ""),
                "include_in_report": bool(section.get("include_in_report", True)),
            }
        )
    return normalized


def _counseling_format_for_class(db: Session, academy_id: str, class_id: UUID | str) -> dict:
    metadata = _billing_metadata(db, academy_id)
    formats = metadata.get(COUNSELING_FORMATS_METADATA_KEY)
    row = formats.get(str(class_id)) if isinstance(formats, dict) else None
    row = row if isinstance(row, dict) else {}
    return {
        "class_id": str(class_id),
        "fields": _normalize_counseling_fields(row.get("fields") if isinstance(row, dict) else None),
        "updated_at": row.get("updated_at") if isinstance(row, dict) else None,
    }


def _counseling_presets(db: Session, academy_id: str) -> list[dict]:
    metadata = _billing_metadata(db, academy_id)
    rows = metadata.get(COUNSELING_PRESETS_METADATA_KEY)
    by_slot: dict[int, dict] = {}
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                slot = int(row.get("slot"))
            except (TypeError, ValueError):
                continue
            if 1 <= slot <= 4:
                by_slot[slot] = row
    presets: list[dict] = []
    for slot in range(1, 5):
        row = by_slot.get(slot, {})
        presets.append(
            {
                "slot": slot,
                "name": row.get("name") or f"프리셋 {slot}",
                "subject": row.get("subject"),
                "fields": _normalize_counseling_fields(row.get("fields")) if row.get("fields") else [],
                "updated_at": row.get("updated_at"),
            }
        )
    return presets


def _sort_class_rows(rows: list[AcademyClass], class_order: list[str]) -> list[AcademyClass]:
    order_index = {class_id: index for index, class_id in enumerate(class_order)}
    fallback_index = len(order_index)
    return sorted(
        rows,
        key=lambda row: (
            0 if row.is_active else 1,
            0 if str(row.id) in order_index else 1,
            order_index.get(str(row.id), fallback_index),
            row.name.lower(),
        ),
    )


def _ordered_classes(db: Session, academy_id: str) -> list[AcademyClass]:
    rows = db.scalars(select(AcademyClass).where(AcademyClass.academy_id == academy_id)).all()
    return _sort_class_rows(rows, _stored_class_order(db, academy_id))


def _ordered_classes_for_academies(db: Session, academy_ids: set[str], primary_academy_id: str) -> list[AcademyClass]:
    rows = db.scalars(select(AcademyClass).where(AcademyClass.academy_id.in_(list(academy_ids)))).all()
    return _sort_class_rows(rows, _stored_class_order(db, primary_academy_id))


def _schedule_event_payload(row: ClassScheduleEvent) -> dict:
    metadata = row.metadata_json if isinstance(row.metadata_json, dict) else {}
    return {
        "id": str(row.id),
        "class_id": str(row.class_id),
        "title": row.title,
        "description": row.description,
        "event_type": row.event_type,
        "starts_at": row.starts_at.isoformat(),
        "ends_at": row.ends_at.isoformat() if row.ends_at else None,
        "linked_paper_session_id": str(row.linked_paper_session_id) if row.linked_paper_session_id else None,
        "counts_for_tuition": bool(row.counts_for_tuition),
        "series_id": metadata.get(SCHEDULE_SERIES_METADATA_KEY) if isinstance(metadata.get(SCHEDULE_SERIES_METADATA_KEY), str) else None,
        "series_position": metadata.get(SCHEDULE_SERIES_POSITION_METADATA_KEY) if isinstance(metadata.get(SCHEDULE_SERIES_POSITION_METADATA_KEY), int) else None,
        "series_size": metadata.get(SCHEDULE_SERIES_SIZE_METADATA_KEY) if isinstance(metadata.get(SCHEDULE_SERIES_SIZE_METADATA_KEY), int) else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _schedule_event_series_id(row: ClassScheduleEvent) -> str | None:
    metadata = row.metadata_json if isinstance(row.metadata_json, dict) else {}
    value = metadata.get(SCHEDULE_SERIES_METADATA_KEY)
    return value if isinstance(value, str) and value else None


def _tuition_settings_from_metadata(metadata: dict | None) -> dict:
    metadata = metadata or {}
    tuition = metadata.get("tuition") if isinstance(metadata.get("tuition"), dict) else {}
    cycle_sessions = tuition.get("cycle_sessions")
    amount = tuition.get("amount")
    try:
        cycle_sessions = int(cycle_sessions) if cycle_sessions else None
    except (TypeError, ValueError):
        cycle_sessions = None
    try:
        amount = int(amount) if amount not in {None, ""} else None
    except (TypeError, ValueError):
        amount = None
    return {
        "enabled": bool(tuition.get("enabled") and cycle_sessions and cycle_sessions > 0),
        "cycle_sessions": cycle_sessions,
        "amount": amount,
        "guardian_name": _clean_optional_text(str(tuition.get("guardian_name") or "")),
        "guardian_phone": _clean_optional_text(str(tuition.get("guardian_phone") or "")),
    }


def _set_tuition_metadata(metadata: dict, *, guardian_name=None, guardian_phone=None, enabled=None, cycle_sessions=None, amount=None) -> dict:
    next_metadata = dict(metadata or {})
    tuition = dict(next_metadata.get("tuition") or {})
    if guardian_name is not None:
        tuition["guardian_name"] = _clean_optional_text(guardian_name)
    if guardian_phone is not None:
        tuition["guardian_phone"] = _clean_optional_text(guardian_phone)
    if enabled is not None:
        tuition["enabled"] = bool(enabled)
    if cycle_sessions is not None:
        tuition["cycle_sessions"] = max(1, int(cycle_sessions))
    if amount is not None:
        tuition["amount"] = max(0, int(amount))
    next_metadata["tuition"] = tuition
    return next_metadata


def _counseling_logs(membership: StudentAcademyMembership) -> list[dict]:
    logs = (membership.metadata_json or {}).get("counseling_logs") or []
    if not isinstance(logs, list):
        return []
    rows = []
    for row in logs:
        if not isinstance(row, dict):
            continue
        next_row = dict(row)
        sections = _normalize_counseling_sections(next_row.get("sections"))
        if not sections:
            fallback_sections = [
                {"field_id": "notes", "label": "상담하면서 기록할 내용", "value": next_row.get("notes") or "", "include_in_report": True},
                {"field_id": "weekly_report", "label": "주간 리포트", "value": next_row.get("weekly_report") or "", "include_in_report": False},
                {"field_id": "next_plan", "label": "다음 지도 계획", "value": next_row.get("next_plan") or "", "include_in_report": True},
            ]
            sections = [section for section in fallback_sections if section["value"]]
        next_row["sections"] = sections
        rows.append(next_row)
    return sorted(rows, key=lambda row: str(row.get("counseling_date") or row.get("created_at") or ""), reverse=True)


def _student_name(membership: StudentAcademyMembership) -> str:
    metadata = membership.metadata_json or {}
    return membership.display_name_in_academy or metadata.get("name") or metadata.get("display_name") or "학생 대기 중"


def _student_person_id(membership: StudentAcademyMembership) -> str:
    metadata = membership.metadata_json or {}
    return str(metadata.get(STUDENT_PERSON_METADATA_KEY) or membership.student_user_id or membership.id)


def _seat_class_row(db: Session, seat: AcademySeat | None) -> AcademyClass | None:
    return db.get(AcademyClass, seat.class_id) if seat and seat.class_id else None


def _invite_code_entry(
    db: Session,
    membership: StudentAcademyMembership,
    seat: AcademySeat | None = None,
    invite_code: str | None = None,
) -> dict | None:
    seat = seat or (db.get(AcademySeat, membership.academy_seat_id) if membership.academy_seat_id else None)
    if not seat:
        return None
    class_row = _seat_class_row(db, seat)
    metadata = membership.metadata_json or {}
    return {
        "membership_id": str(membership.id),
        "seat_id": str(seat.id),
        "class_id": str(class_row.id) if class_row else None,
        "class_name": class_row.name if class_row else None,
        "invite_code": invite_code if invite_code is not None else metadata.get("invite_code"),
        "invite_code_preview": seat.invite_code_preview,
    }


def _related_student_key_memberships(
    db: Session,
    visible_academy_ids: set[str],
    membership: StudentAcademyMembership,
) -> list[StudentAcademyMembership]:
    person_id = _student_person_id(membership)
    rows = _visible_student_memberships(db, visible_academy_ids)
    related = [
        row
        for row in rows
        if (row.status or "active") == "active"
        and (_student_person_id(row) == person_id or row.student_user_id == membership.student_user_id)
    ]
    return sorted(related, key=lambda row: (row.joined_at or datetime.min, str(row.id)))


def _ensure_membership_invite_code(
    db: Session,
    visible_academy_ids: set[str],
    membership: StudentAcademyMembership,
) -> dict | None:
    seat = db.scalar(
        select(AcademySeat).where(
            AcademySeat.academy_id.in_(list(visible_academy_ids)),
            AcademySeat.id == membership.academy_seat_id,
            AcademySeat.is_active.is_(True),
        )
    )
    if not seat:
        return None
    metadata = dict(membership.metadata_json or {})
    code = metadata.get("invite_code")
    if not invite_code_matches(code, seat.invite_code_hash):
        code = rotate_seat_code(db, seat)
        metadata["invite_code"] = code
        metadata[STUDENT_PERSON_METADATA_KEY] = metadata.get(STUDENT_PERSON_METADATA_KEY) or _student_person_id(membership)
        membership.metadata_json = metadata
    return _invite_code_entry(db, membership, seat, code)


def _create_class_membership_for_existing_student(
    db: Session,
    academy_id: str,
    source: StudentAcademyMembership,
    class_row: AcademyClass,
    actor_id: str,
) -> tuple[StudentAcademyMembership, str]:
    seat, invite_code = create_seat(db, academy_id, _student_name(source), class_id=class_row.id)
    source_metadata = dict(source.metadata_json or {})
    person_id = source_metadata.get(STUDENT_PERSON_METADATA_KEY) or _student_person_id(source)
    source_metadata[STUDENT_PERSON_METADATA_KEY] = person_id
    source.metadata_json = source_metadata
    metadata = dict(source_metadata)
    metadata["invite_code"] = invite_code
    metadata[STUDENT_PERSON_METADATA_KEY] = person_id
    membership = StudentAcademyMembership(
        student_user_id=source.student_user_id,
        academy_id=academy_id,
        academy_seat_id=seat.id,
        display_name_in_academy=source.display_name_in_academy,
        status=source.status or "active",
        created_by=actor_id,
        claimed_by=source.claimed_by,
        metadata_json=metadata,
    )
    db.add(membership)
    db.flush()
    seat.current_student_membership_id = membership.id
    db.add(SeatAssignmentHistory(academy_seat_id=seat.id, academy_id=academy_id, student_user_id=membership.student_user_id, membership_id=membership.id))
    db.add(ClassStudent(class_id=class_row.id, student_membership_id=membership.id))
    return membership, invite_code


def _split_legacy_multiclass_memberships(
    db: Session,
    academy_id: str,
    visible_academy_ids: set[str],
    actor_id: str,
) -> bool:
    changed = False
    for membership in _visible_student_memberships(db, visible_academy_ids):
        if (membership.status or "active") != "active":
            continue
        links = db.scalars(
            select(ClassStudent)
            .where(
                _id_equals(ClassStudent.student_membership_id, membership.id),
                ClassStudent.left_at.is_(None),
            )
            .order_by(ClassStudent.joined_at.asc())
        ).all()
        unique_links: list[ClassStudent] = []
        seen_class_ids: set[str] = set()
        for link in links:
            class_id = str(link.class_id)
            if class_id in seen_class_ids:
                link.left_at = _now()
                changed = True
                continue
            seen_class_ids.add(class_id)
            unique_links.append(link)
        if len(unique_links) <= 1:
            continue

        seat = db.get(AcademySeat, membership.academy_seat_id) if membership.academy_seat_id else None
        primary_class_id = str(seat.class_id) if seat and seat.class_id and str(seat.class_id) in seen_class_ids else str(unique_links[0].class_id)
        metadata = dict(membership.metadata_json or {})
        metadata[STUDENT_PERSON_METADATA_KEY] = metadata.get(STUDENT_PERSON_METADATA_KEY) or _student_person_id(membership)
        membership.metadata_json = metadata
        if seat and not seat.class_id:
            seat.class_id = UUID(primary_class_id)
            changed = True

        for link in unique_links:
            if str(link.class_id) == primary_class_id:
                continue
            class_row = db.get(AcademyClass, link.class_id)
            if not class_row or class_row.academy_id not in visible_academy_ids:
                continue
            _create_class_membership_for_existing_student(db, membership.academy_id, membership, class_row, actor_id)
            link.left_at = _now()
            changed = True
    return changed


def _normalize_legacy_student_keys(db: Session, academy_id: str, visible_academy_ids: set[str], actor_id: str) -> None:
    try:
        if _split_legacy_multiclass_memberships(db, academy_id, visible_academy_ids, actor_id):
            db.commit()
    except HTTPException as exc:
        db.rollback()
        logger.warning("Legacy student key normalization skipped: %s", exc.detail)
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Legacy student key normalization failed")


def _safe_scalar(db: Session, statement, fallback=None):
    try:
        return db.scalar(statement)
    except SQLAlchemyError:
        db.rollback()
        return fallback


def _safe_scalars(db: Session, statement) -> list:
    try:
        return db.scalars(statement).all()
    except SQLAlchemyError:
        db.rollback()
        return []


def _student_payload(db: Session, academy_id: str, membership: StudentAcademyMembership, class_rows: list[AcademyClass] | None = None) -> dict:
    classes = class_rows
    if classes is None:
        classes = _safe_scalars(
            db,
            select(AcademyClass)
            .join(ClassStudent, _id_columns_equal(ClassStudent.class_id, AcademyClass.id))
            .where(
                _id_equals(ClassStudent.student_membership_id, membership.id),
                ClassStudent.left_at.is_(None),
            )
            .order_by(AcademyClass.name)
        )
    metadata = membership.metadata_json or {}
    latest_result = _safe_scalar(
        db,
        select(PaperSessionResult)
        .where(
            PaperSessionResult.academy_id.in_([academy_id, membership.academy_id]),
            _id_equals(PaperSessionResult.student_membership_id, membership.id),
            PaperSessionResult.status == "graded",
        )
        .order_by(PaperSessionResult.graded_at.desc().nullslast(), PaperSessionResult.updated_at.desc())
        .limit(1)
    )
    unresolved = _safe_scalar(
        db,
        select(func.count(WrongAnswerRecord.id)).where(
            WrongAnswerRecord.academy_id.in_([academy_id, membership.academy_id]),
            WrongAnswerRecord.student_id == membership.student_user_id,
            WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]),
        )
    ) or 0
    status = membership.status or "active"
    if unresolved >= 10:
        status_chip = "Needs Review"
    elif status != "active":
        status_chip = "Inactive"
    else:
        status_chip = "Active"
    seat = db.get(AcademySeat, membership.academy_seat_id) if membership.academy_seat_id else None
    invite_entry = _invite_code_entry(db, membership, seat)
    return {
        "id": str(membership.id),
        "student_user_id": membership.student_user_id,
        "student_person_id": _student_person_id(membership),
        "academy_seat_id": str(membership.academy_seat_id),
        "invite_code": metadata.get("invite_code"),
        "invite_code_preview": seat.invite_code_preview if seat else None,
        "invite_codes": [invite_entry] if invite_entry else [],
        "name": _student_name(membership),
        "grade_level": metadata.get("grade_level") or metadata.get("grade"),
        "school": metadata.get("school"),
        "status": status,
        "status_chip": status_chip,
        "memo": metadata.get("memo"),
        "tuition": _tuition_settings_from_metadata(metadata),
        "class_ids": [str(row.id) for row in classes],
        "class_names": [row.name for row in classes],
        "class_subjects": [row.subject for row in classes],
        "recent_score": _decimal_float(latest_result.score) if latest_result else None,
        "recent_completion_status": latest_result.status if latest_result else "not_started",
        "unresolved_wrong_count": unresolved,
        "recent_weakness_label": None,
        "joined_at": membership.joined_at.isoformat() if membership.joined_at else None,
    }


def _safe_student_payload(
    db: Session,
    academy_id: str,
    membership: StudentAcademyMembership,
    class_rows: list[AcademyClass] | None = None,
) -> dict:
    try:
        return _student_payload(db, academy_id, membership, class_rows)
    except Exception:
        db.rollback()
        metadata = membership.metadata_json or {}
        return {
            "id": str(membership.id),
            "student_user_id": membership.student_user_id,
            "student_person_id": _student_person_id(membership),
            "academy_seat_id": str(membership.academy_seat_id) if membership.academy_seat_id else None,
            "invite_code": metadata.get("invite_code"),
            "invite_code_preview": None,
            "invite_codes": [],
            "name": _student_name(membership),
            "grade_level": metadata.get("grade_level") or metadata.get("grade"),
            "school": metadata.get("school"),
            "status": membership.status or "active",
            "status_chip": "Active" if (membership.status or "active") == "active" else "Inactive",
            "memo": metadata.get("memo"),
            "tuition": _tuition_settings_from_metadata(metadata),
            "class_ids": [str(row.id) for row in class_rows or []],
            "class_names": [row.name for row in class_rows or []],
            "class_subjects": [row.subject for row in class_rows or []],
            "recent_score": None,
            "recent_completion_status": "not_started",
            "unresolved_wrong_count": 0,
            "recent_weakness_label": None,
            "joined_at": membership.joined_at.isoformat() if membership.joined_at else None,
        }


def _unclaimed_seats_for_class(db: Session, academy_id: str, class_id: UUID) -> list[AcademySeat]:
    seats = _safe_scalars(
        db,
        select(AcademySeat)
        .where(
            AcademySeat.academy_id == academy_id,
            _id_equals(AcademySeat.class_id, class_id),
            AcademySeat.is_active.is_(True),
        )
        .order_by(AcademySeat.created_at.asc(), AcademySeat.seat_number.asc()),
    )
    return [seat for seat in seats if academy_seat_key_status(db, seat) == "unclaimed"]


def _pending_student_card_for_seat(seat: AcademySeat, class_row: AcademyClass) -> dict:
    seat_id = str(seat.id)
    invitation = dict(seat.invite_metadata or {})
    recipient_name = str(invitation.get("recipient_name") or seat.display_name or "").strip()
    invite_code = str(invitation.get("key_code") or invitation.get("invite_code") or "").strip() or None
    return {
        "id": f"pending-seat-{seat_id}",
        "student_user_id": f"pending-seat-{seat_id}",
        "student_person_id": None,
        "academy_seat_id": seat_id,
        "pending_seat_id": seat_id,
        "invite_metadata": invitation,
        "invite_code": invite_code,
        "invite_code_preview": seat.invite_code_preview,
        "invite_codes": [
            {
                "membership_id": None,
                "seat_id": seat_id,
                "class_id": str(class_row.id),
                "class_name": class_row.name,
                "invite_code": invite_code,
                "invite_code_preview": seat.invite_code_preview,
            }
        ],
        "name": f"{recipient_name} \ub300\uae30 \uc911" if recipient_name else "\ud559\uc0dd \ub300\uae30 \uc911",
        "grade_level": None,
        "school": None,
        "status": "pending_key",
        "status_chip": "\ub300\uae30",
        "memo": None,
        "tuition": None,
        "class_ids": [str(class_row.id)],
        "class_names": [class_row.name],
        "class_subjects": [class_row.subject],
        "recent_score": None,
        "recent_completion_status": "pending_key",
        "unresolved_wrong_count": 0,
        "recent_weakness_label": None,
        "joined_at": seat.created_at.isoformat() if seat.created_at else None,
        "card_type": "pending_key",
        "key_status": "unclaimed",
        "recipient_phone": invitation.get("recipient_phone"),
        "delivery_status": invitation.get("delivery_status"),
    }


def _active_memberships_for_class(db: Session, academy_id: str, class_id: UUID) -> list[StudentAcademyMembership]:
    rows = _safe_scalars(
        db,
        select(StudentAcademyMembership)
        .join(ClassStudent, _id_columns_equal(ClassStudent.student_membership_id, StudentAcademyMembership.id))
        .where(
            _id_equals(ClassStudent.class_id, class_id),
            ClassStudent.left_at.is_(None),
            StudentAcademyMembership.status == "active",
        )
        .order_by(StudentAcademyMembership.display_name_in_academy)
    )
    return [row for row in rows if not is_unlinked_academy_student(row)]


def _visible_student_memberships(db: Session, academy_ids: set[str], linked_student_ids: list[UUID] | None = None) -> list[StudentAcademyMembership]:
    linked_ids = linked_student_ids or []
    rows = db.scalars(
        select(StudentAcademyMembership).where(
            (StudentAcademyMembership.academy_id.in_(list(academy_ids)))
            | (_id_in(StudentAcademyMembership.id, linked_ids))
        )
    ).all()
    rows_by_id = {row.id: row for row in rows}
    return sorted(rows_by_id.values(), key=lambda row: (row.status or "", (_student_name(row) or "").lower()))


def _visible_membership_by_id(db: Session, academy_ids: set[str], student_id: UUID) -> StudentAcademyMembership:
    for row in _visible_student_memberships(db, academy_ids):
        if str(row.id) == str(student_id):
            return row
    linked_row = db.scalar(
        select(StudentAcademyMembership)
        .join(ClassStudent, _id_columns_equal(ClassStudent.student_membership_id, StudentAcademyMembership.id))
        .join(AcademyClass, _id_columns_equal(AcademyClass.id, ClassStudent.class_id))
        .where(
            AcademyClass.academy_id.in_(list(academy_ids)),
            _id_equals(StudentAcademyMembership.id, student_id),
            ClassStudent.left_at.is_(None),
        )
    )
    if linked_row:
        return linked_row
    raise HTTPException(status_code=404, detail="Student not found.")


def _session_belongs_to_class(session: PaperSession, class_row: AcademyClass, memberships: list[StudentAcademyMembership]) -> bool:
    if str(class_row.id) in {str(value) for value in (session.class_ids or [])}:
        return True
    student_membership_ids = {str(membership.id) for membership in memberships}
    return bool(student_membership_ids.intersection({str(value) for value in (session.student_membership_ids or [])}))


def _class_payload(db: Session, academy_id: str, row: AcademyClass, include_students: bool = True) -> dict:
    memberships = _active_memberships_for_class(db, academy_id, row.id)
    pending_seats = _unclaimed_seats_for_class(db, row.academy_id, row.id)
    student_ids = [membership.student_user_id for membership in memberships]
    student_membership_ids = {str(membership.id) for membership in memberships}
    unresolved = 0
    avg_score = None
    if student_ids:
        unresolved = _safe_scalar(
            db,
            select(func.count(WrongAnswerRecord.id)).where(
                WrongAnswerRecord.academy_id == academy_id,
                WrongAnswerRecord.student_id.in_(student_ids),
                WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]),
            )
        ) or 0
        avg_score = _safe_scalar(
            db,
            select(func.avg(PaperSessionResult.score)).where(
                PaperSessionResult.academy_id == academy_id,
                PaperSessionResult.student_membership_id.in_([membership.id for membership in memberships]),
                PaperSessionResult.status == "graded",
                PaperSessionResult.score.is_not(None),
            )
        )
    sessions = _safe_scalars(
        db,
        select(PaperSession).where(PaperSession.academy_id == academy_id).order_by(PaperSession.created_at.desc()),
    )
    now = _now()
    class_sessions = [session for session in sessions if _session_belongs_to_class(session, row, memberships)]
    schedule_events = _safe_scalars(
        db,
        select(ClassScheduleEvent)
        .where(
            ClassScheduleEvent.academy_id == row.academy_id,
            ClassScheduleEvent.class_id == row.id,
        )
        .order_by(ClassScheduleEvent.starts_at.asc())
        .limit(500),
    )
    upcoming_count = sum(
        1
        for session in class_sessions
        if session.status in {"draft", "scheduled", "exported", "grading"}
        and ((session.scheduled_at and session.scheduled_at >= now) or (session.due_at and session.due_at >= now))
    ) + sum(1 for event in schedule_events if event.starts_at >= now)
    recent_session = class_sessions[0] if class_sessions else None
    students = []
    if include_students:
        students = [_safe_student_payload(db, academy_id, membership, [row]) for membership in memberships]
        students.extend(_pending_student_card_for_seat(seat, row) for seat in pending_seats)
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description,
        "subject": row.subject,
        "grade_level": row.grade_level,
        "is_active": row.is_active,
        "student_count": len(memberships),
        "pending_key_count": len(pending_seats),
        "upcoming_count": upcoming_count,
        "recent_session": _session_summary(db, academy_id, recent_session) if recent_session else None,
        "average_recent_score": _decimal_float(avg_score),
        "unresolved_wrong_count": unresolved,
        "students": students,
        "schedule_events": [_schedule_event_payload(event) for event in schedule_events],
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "student_membership_ids": list(student_membership_ids),
    }


def _fallback_class_payload(row: AcademyClass) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description,
        "subject": row.subject,
        "grade_level": row.grade_level,
        "is_active": row.is_active,
        "student_count": 0,
        "pending_key_count": 0,
        "upcoming_count": 0,
        "recent_session": None,
        "average_recent_score": None,
        "unresolved_wrong_count": 0,
        "students": [],
        "schedule_events": [],
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "student_membership_ids": [],
    }


def _safe_class_payload(db: Session, academy_id: str, row: AcademyClass, include_students: bool = True) -> dict:
    try:
        return _class_payload(db, academy_id, row, include_students=include_students)
    except Exception:
        db.rollback()
        return _fallback_class_payload(row)


def _safe_session_summary(db: Session, academy_id: str, session: PaperSession) -> dict | None:
    try:
        return _session_summary(db, academy_id, session)
    except Exception:
        db.rollback()
        return None


def _get_class(db: Session, academy_id: str, class_id: UUID, academy_ids: set[str] | None = None) -> AcademyClass:
    visible_academy_ids = set(academy_ids or {academy_id})
    visible_academy_ids.add(academy_id)
    row = db.scalar(select(AcademyClass).where(_id_equals(AcademyClass.id, class_id)))
    if not row or row.academy_id not in visible_academy_ids:
        raise HTTPException(status_code=404, detail="Class not found.")
    return row


def _get_membership(
    db: Session,
    academy_id: str,
    student_id: UUID,
    academy_ids: set[str] | None = None,
) -> StudentAcademyMembership:
    visible_academy_ids = set(academy_ids or {academy_id})
    visible_academy_ids.add(academy_id)
    row = db.scalar(select(StudentAcademyMembership).where(_id_equals(StudentAcademyMembership.id, student_id)))
    if not row:
        raise HTTPException(status_code=404, detail="Student not found.")
    if row.academy_id in visible_academy_ids:
        return row
    linked_class = db.scalar(
        select(AcademyClass.id)
        .join(ClassStudent, _id_columns_equal(ClassStudent.class_id, AcademyClass.id))
        .where(
            AcademyClass.academy_id.in_(list(visible_academy_ids)),
            _id_equals(ClassStudent.student_membership_id, row.id),
            ClassStudent.left_at.is_(None),
        )
        .limit(1)
    )
    if not linked_class:
        raise HTTPException(status_code=404, detail="Student not found.")
    return row


def _problem_set_snapshot(db: Session, owner_id: str, academy_id: str, problem_set_id: UUID, created_by: str | None) -> ContentVersion:
    problem_set = db.scalars(
        select(ProblemSet)
        .where(ProblemSet.id == problem_set_id, ProblemSet.owner_id == owner_id)
        .options(joinedload(ProblemSet.items).joinedload(ProblemSetItem.problem).joinedload(Problem.tags))
    ).unique().first()
    if not problem_set:
        raise HTTPException(status_code=404, detail="Problem set not found.")
    items = sorted(problem_set.items, key=lambda item: item.order_index)
    if not items:
        raise HTTPException(status_code=400, detail="PaperSession requires at least one problem.")
    problems = []
    for index, item in enumerate(items, start=1):
        problem = item.problem
        tags = problem.tags
        problems.append(
            {
                "problem_id": str(problem.id),
                "problem_number": index,
                "original_problem_number": problem.problem_number,
                "review_page_number": problem.review_page_number,
                "problem_text": problem.problem_text,
                "answer": problem.answer,
                "solution_steps": None,
                "source_label": problem.source_label,
                "subject": tags.subject if tags else None,
                "unit": tags.unit if tags else None,
                "difficulty": tags.difficulty if tags else None,
            }
        )
    version = ContentVersion(
        academy_id=academy_id,
        source_type="paper_session_problem_set",
        source_id=str(problem_set.id),
        title=problem_set.name,
        version_label=f"paper-session-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        snapshot={
            "source_type": "problem_set",
            "problem_set_id": str(problem_set.id),
            "title": problem_set.name,
            "subtitle": problem_set.subtitle,
            "subject": problem_set.subject,
            "grade": problem_set.grade,
            "unit": problem_set.unit,
            "problem_count": len(problems),
            "problems": problems,
        },
        created_by=created_by,
    )
    db.add(version)
    db.flush()
    return version


def _snapshot_problem_rows(problems: list[Problem]) -> list[dict]:
    rows = []
    for index, problem in enumerate(problems, start=1):
        tags = problem.tags
        rows.append(
            {
                "problem_id": str(problem.id),
                "problem_number": index,
                "original_problem_number": problem.problem_number,
                "review_page_number": problem.review_page_number,
                "problem_text": problem.problem_text,
                "answer": problem.answer,
                "solution_steps": None,
                "source_label": problem.source_label,
                "subject": tags.subject if tags else None,
                "unit": tags.unit if tags else None,
                "difficulty": tags.difficulty if tags else None,
            }
        )
    return rows


def _problem_selection_snapshot(
    db: Session,
    owner_id: str,
    academy_id: str,
    problem_ids: list[UUID],
    title: str,
    created_by: str | None,
) -> ContentVersion:
    unique_ids: list[UUID] = []
    seen: set[UUID] = set()
    for problem_id in problem_ids:
        if problem_id not in seen:
            unique_ids.append(problem_id)
            seen.add(problem_id)
    if not unique_ids:
        raise HTTPException(status_code=400, detail="PaperSession requires at least one problem.")
    rows = db.scalars(
        select(Problem)
        .where(Problem.id.in_(unique_ids), Problem.owner_id == owner_id, Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags))
    ).unique().all()
    by_id = {problem.id: problem for problem in rows}
    missing = [str(problem_id) for problem_id in unique_ids if problem_id not in by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"Problems not found: {', '.join(missing)}")
    ordered = [by_id[problem_id] for problem_id in unique_ids]
    problems = _snapshot_problem_rows(ordered)
    source_id = f"selection-{uuid.uuid4().hex}"
    version = ContentVersion(
        academy_id=academy_id,
        source_type="paper_session_selection",
        source_id=source_id,
        title=title,
        version_label=f"paper-session-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        snapshot={
            "source_type": "selection",
            "problem_ids": [str(problem_id) for problem_id in unique_ids],
            "title": title,
            "problem_count": len(problems),
            "problems": problems,
        },
        created_by=created_by,
    )
    db.add(version)
    db.flush()
    return version


def _batch_snapshot(db: Session, owner_id: str, academy_id: str, batch_id: UUID, created_by: str | None) -> ContentVersion:
    batch = db.scalar(select(Batch).where(Batch.id == batch_id, Batch.owner_id == owner_id))
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")
    problems = list(
        db.scalars(
            select(Problem)
            .where(Problem.source_batch_id == batch.id, Problem.owner_id == owner_id, Problem.deleted_at.is_(None))
            .options(joinedload(Problem.tags))
            .order_by(Problem.problem_number, Problem.created_at)
        ).all()
    )
    if not problems:
        raise HTTPException(status_code=400, detail="PaperSession requires at least one problem.")
    rows = _snapshot_problem_rows(problems)
    version = ContentVersion(
        academy_id=academy_id,
        source_type="paper_session_batch",
        source_id=str(batch.id),
        title=batch.name,
        version_label=f"paper-session-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        snapshot={
            "source_type": "batch",
            "batch_id": str(batch.id),
            "title": batch.name,
            "problem_count": len(rows),
            "problems": rows,
        },
        created_by=created_by,
    )
    db.add(version)
    db.flush()
    return version


def _session_problems(session: PaperSession) -> list[dict]:
    snapshot = session.content_version.snapshot if session.content_version else {}
    return list((snapshot or {}).get("problems") or [])


def _session_problems_for_response(db: Session, session: PaperSession) -> list[dict]:
    problems = [dict(problem) for problem in _session_problems(session)]
    problem_ids: list[UUID] = []
    for problem in problems:
        try:
            problem_ids.append(UUID(str(problem.get("problem_id"))))
        except (TypeError, ValueError):
            continue
    if not problem_ids:
        return problems
    rows = {
        row.id: row
        for row in db.scalars(
            select(Problem)
            .where(Problem.id.in_(problem_ids))
            .options(joinedload(Problem.tags))
        ).all()
    }
    for problem in problems:
        try:
            row = rows.get(UUID(str(problem.get("problem_id"))))
        except (TypeError, ValueError):
            row = None
        if not row:
            continue
        if not problem.get("original_problem_number"):
            problem["original_problem_number"] = row.problem_number
        if not problem.get("review_page_number"):
            problem["review_page_number"] = row.review_page_number
        if not problem.get("source_label"):
            problem["source_label"] = row.source_label
        if not problem.get("subject"):
            problem["subject"] = row.tags.subject if row.tags else None
        if not problem.get("unit"):
            problem["unit"] = row.tags.unit if row.tags else None
        if not problem.get("difficulty"):
            problem["difficulty"] = row.tags.difficulty if row.tags else None
    return problems


def _session_summary(db: Session, academy_id: str, session: PaperSession | None) -> dict | None:
    if not session:
        return None
    session_academy_id = session.academy_id or academy_id
    results = _safe_scalars(
        db,
        select(PaperSessionResult).where(
            PaperSessionResult.academy_id == session_academy_id,
            PaperSessionResult.paper_session_id == session.id,
        )
    )
    graded = [row for row in results if row.status == "graded"]
    score_stats = _score_distribution(results)
    return {
        "id": str(session.id),
        "title": session.title,
        "description": session.description,
        "source_problem_set_id": str(session.source_problem_set_id) if session.source_problem_set_id else None,
        "content_version_id": str(session.content_version_id),
        "session_type": session.session_type,
        "target_type": session.target_type,
        "class_ids": [str(value) for value in session.class_ids or []],
        "student_membership_ids": [str(value) for value in session.student_membership_ids or []],
        "scheduled_at": session.scheduled_at.isoformat() if session.scheduled_at else None,
        "due_at": session.due_at.isoformat() if session.due_at else None,
        "status": session.status,
        "problem_count": len(_session_problems(session)),
        "assigned_count": len(results),
        "graded_count": len(graded),
        "respondent_count": score_stats["respondent_count"],
        "average_score": score_stats["average_score"],
        "highest_score": score_stats["highest_score"],
        "lowest_score": score_stats["lowest_score"],
        "q1_score": score_stats["q1_score"],
        "q2_score": score_stats["q2_score"],
        "q3_score": score_stats["q3_score"],
        "score_standard_deviation": score_stats["score_standard_deviation"],
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }


def _is_exported_review_session(session: PaperSession) -> bool:
    title = session.title or ""
    return all(keyword in title for keyword in EXPORTED_REVIEW_TITLE_KEYWORDS)


def _ensure_exported_review_session_assigned(db: Session, academy_id: str) -> None:
    try:
        memberships = db.scalars(
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.status == "active",
            )
        ).all()
    except SQLAlchemyError:
        db.rollback()
        return
    membership_by_name = {_student_name(row): row for row in memberships}
    targets = [membership_by_name.get(name) for name in EXPORTED_REVIEW_TARGET_STUDENTS]
    source = membership_by_name.get(EXPORTED_REVIEW_SOURCE_STUDENT)
    if not source or any(target is None for target in targets):
        return

    try:
        sessions = [
            session
            for session in db.scalars(
                select(PaperSession)
                .where(PaperSession.academy_id == academy_id)
                .options(joinedload(PaperSession.content_version))
                .order_by(PaperSession.scheduled_at.desc().nullslast(), PaperSession.created_at.desc())
            ).all()
            if _is_exported_review_session(session)
        ]
    except SQLAlchemyError:
        db.rollback()
        return
    if not sessions:
        return

    source_results = _safe_scalars(
        db,
        select(PaperSessionResult).where(
            PaperSessionResult.academy_id == academy_id,
            PaperSessionResult.student_membership_id == source.id,
            PaperSessionResult.paper_session_id.in_([session.id for session in sessions]),
        ),
    )
    if not source_results:
        return
    source_session_ids = {row.paper_session_id for row in source_results}
    candidates = [session for session in sessions if session.id in source_session_ids]
    dated_candidates = [session for session in candidates if session.scheduled_at and session.scheduled_at.date().isoformat() == EXPORTED_REVIEW_DATE]
    session = dated_candidates[0] if dated_candidates else candidates[0]
    problems = _session_problems(session)
    if not problems:
        return

    existing_results = {
        row.student_membership_id: row
        for row in _safe_scalars(
            db,
            select(PaperSessionResult).where(
                PaperSessionResult.academy_id == academy_id,
                PaperSessionResult.paper_session_id == session.id,
            ),
        )
    }
    changed = False
    session_student_ids = [str(value) for value in (session.student_membership_ids or [])]
    for target in targets:
        if target is None:
            continue
        target_id = str(target.id)
        if target_id not in session_student_ids:
            session_student_ids.append(target_id)
            changed = True
        if target.id not in existing_results:
            db.add(
                PaperSessionResult(
                    academy_id=academy_id,
                    paper_session_id=session.id,
                    student_membership_id=target.id,
                    student_user_id=target.student_user_id,
                    status="pending_grading",
                    total_count=len(problems),
                )
            )
            changed = True
    if changed:
        session.student_membership_ids = session_student_ids
        session.target_type = "mixed" if session.class_ids else "students"
        session.updated_at = _now()
        db.commit()


def _get_session(db: Session, academy_id: str, session_id: UUID) -> PaperSession:
    row = db.scalars(
        select(PaperSession)
        .where(_id_equals(PaperSession.id, session_id), PaperSession.academy_id == academy_id)
        .options(joinedload(PaperSession.content_version))
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Paper session not found.")
    return row


def _get_visible_session(db: Session, academy_ids: set[str], session_id: UUID) -> PaperSession:
    row = db.scalars(
        select(PaperSession)
        .where(_id_equals(PaperSession.id, session_id), PaperSession.academy_id.in_(list(academy_ids)))
        .options(joinedload(PaperSession.content_version))
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Paper session not found.")
    return row


def _target_memberships(db: Session, academy_id: str, class_ids: list[UUID], student_ids: list[UUID]) -> list[StudentAcademyMembership]:
    rows: dict[UUID, StudentAcademyMembership] = {}
    if class_ids:
        valid_classes = db.scalars(
            select(AcademyClass.id).where(AcademyClass.academy_id == academy_id, AcademyClass.id.in_(class_ids))
        ).all()
        if len(valid_classes) != len(set(class_ids)):
            raise HTTPException(status_code=404, detail="One or more classes were not found.")
        for membership in db.scalars(
            select(StudentAcademyMembership)
            .join(ClassStudent, ClassStudent.student_membership_id == StudentAcademyMembership.id)
            .where(
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.status == "active",
                ClassStudent.class_id.in_(class_ids),
                ClassStudent.left_at.is_(None),
            )
        ).all():
            rows[membership.id] = membership
    if student_ids:
        direct_rows = db.scalars(
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.status == "active",
                StudentAcademyMembership.id.in_(student_ids),
            )
        ).all()
        direct_found: set[UUID] = set()
        for membership in direct_rows:
            rows[membership.id] = membership
            direct_found.add(membership.id)
        missing = [str(student_id) for student_id in set(student_ids) if student_id not in direct_found]
        if missing:
            raise HTTPException(status_code=404, detail=f"Students not found: {', '.join(missing)}")
    return sorted(rows.values(), key=_student_name)

def _parse_wrong_numbers(value: str | None) -> set[int]:
    if not value:
        return set()
    numbers: set[int] = set()
    for token in re.split(r"[\s,;/]+", value.strip()):
        if not token:
            continue
        if "-" in token or "~" in token:
            parts = re.split(r"[-~]", token, maxsplit=1)
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                start, end = int(parts[0]), int(parts[1])
                if start <= end:
                    numbers.update(range(start, end + 1))
                continue
        if not token.isdigit():
            raise HTTPException(status_code=400, detail=f"Invalid problem number: {token}")
        numbers.add(int(token))
    return numbers


def _is_wrong_result_status(status: str | None) -> bool:
    return status in {"wrong", "unanswered"}


def _sync_wrong_answer(
    db: Session,
    *,
    academy_id: str,
    student_user_id: str,
    problem_id: UUID,
    problem_version_id: UUID,
    paper_session_id: UUID,
    was_wrong: bool,
    is_wrong: bool,
    is_review_correct: bool,
) -> None:
    record = db.scalar(
        select(WrongAnswerRecord).where(
            WrongAnswerRecord.academy_id == academy_id,
            WrongAnswerRecord.student_id == student_user_id,
            WrongAnswerRecord.problem_id == problem_id,
        )
    )
    if is_wrong:
        if not record:
            record = WrongAnswerRecord(
                academy_id=academy_id,
                student_id=student_user_id,
                problem_id=problem_id,
                problem_version_id=problem_version_id,
                first_wrong_at=_now(),
                latest_wrong_at=_now(),
                wrong_count=1,
                resolved_status="unresolved",
                source_assignment_ids=[f"paper_session:{paper_session_id}"],
            )
            db.add(record)
        else:
            record.problem_version_id = problem_version_id
            record.latest_wrong_at = _now()
            if not was_wrong:
                record.wrong_count += 1
            record.resolved_status = "unresolved" if record.resolved_status in {"resolved", "mastered"} else record.resolved_status
            marker = f"paper_session:{paper_session_id}"
            source_ids = list(record.source_assignment_ids or [])
            if marker not in source_ids:
                source_ids.append(marker)
                record.source_assignment_ids = source_ids
            record.updated_at = _now()
        return
    if record and was_wrong and is_review_correct:
        record.retry_count += 1
        record.resolved_status = "resolved"
        record.updated_at = _now()


def _merge_row_time(*values: datetime | None) -> datetime:
    candidates = [value for value in values if value is not None]
    return max(candidates) if candidates else datetime.min


def _paper_result_time(row: PaperSessionResult) -> datetime:
    return _merge_row_time(row.updated_at, row.graded_at, row.created_at)


def _problem_result_time(row: ProblemResult) -> datetime:
    return _merge_row_time(row.updated_at, row.created_at)


def _merge_strings(left: str | None, right: str | None) -> str | None:
    left_text = (left or "").strip()
    right_text = (right or "").strip()
    if not left_text:
        return right_text or None
    if not right_text or right_text in left_text:
        return left_text
    return f"{left_text}\n\n--- 병합된 기록 ---\n{right_text}"


def _merge_unique_list(left: list | None, right: list | None) -> list:
    values: list = []
    for item in [*(left or []), *(right or [])]:
        if item not in values:
            values.append(item)
    return values


def _merged_wrong_status(left: str | None, right: str | None) -> str:
    priority = {"unresolved": 0, "reviewing": 1, "resolved": 2, "mastered": 3}
    candidates = [status for status in [left, right] if status]
    if not candidates:
        return "unresolved"
    return sorted(candidates, key=lambda status: priority.get(status, 99))[0]


def _merge_counseling_logs(primary_logs: list | None, secondary_logs: list | None) -> list:
    rows: dict[str, dict] = {}
    for row in [*(secondary_logs or []), *(primary_logs or [])]:
        if not isinstance(row, dict):
            continue
        key = str(row.get("id") or f"{row.get('counseling_date') or row.get('created_at')}-{row.get('title')}-{row.get('notes')}")
        rows[key] = row
    return sorted(rows.values(), key=lambda row: str(row.get("counseling_date") or row.get("created_at") or ""), reverse=True)[:200]


def _merge_membership_metadata(primary: StudentAcademyMembership, secondary: StudentAcademyMembership) -> None:
    now = _now().isoformat()
    primary_metadata = dict(primary.metadata_json or {})
    secondary_metadata = dict(secondary.metadata_json or {})
    for key in ["grade_level", "grade", "school", "memo"]:
        if not primary_metadata.get(key) and secondary_metadata.get(key):
            primary_metadata[key] = secondary_metadata.get(key)
    primary_metadata["counseling_logs"] = _merge_counseling_logs(
        primary_metadata.get("counseling_logs") if isinstance(primary_metadata.get("counseling_logs"), list) else [],
        secondary_metadata.get("counseling_logs") if isinstance(secondary_metadata.get("counseling_logs"), list) else [],
    )
    merged_from = list(primary_metadata.get("merged_from") or [])
    merged_from.append(
        {
            "id": str(secondary.id),
            "student_user_id": secondary.student_user_id,
            "name": _student_name(secondary),
            "merged_at": now,
        }
    )
    primary_metadata["merged_from"] = merged_from
    secondary_metadata["merged_into"] = str(primary.id)
    secondary_metadata["merged_at"] = now
    secondary_metadata["merged_into_name"] = _student_name(primary)
    if not primary.display_name_in_academy and secondary.display_name_in_academy:
        primary.display_name_in_academy = secondary.display_name_in_academy
    primary.metadata_json = primary_metadata
    secondary.metadata_json = secondary_metadata


def _merge_class_links(db: Session, primary: StudentAcademyMembership, secondary: StudentAcademyMembership) -> int:
    moved = 0
    source_links = db.scalars(
        select(ClassStudent).where(
            _id_equals(ClassStudent.student_membership_id, secondary.id),
            ClassStudent.left_at.is_(None),
        )
    ).all()
    for source_link in source_links:
        target_link = db.scalar(
            select(ClassStudent).where(
                _id_equals(ClassStudent.class_id, source_link.class_id),
                _id_equals(ClassStudent.student_membership_id, primary.id),
            )
        )
        if target_link:
            target_link.left_at = None
        else:
            db.add(ClassStudent(class_id=source_link.class_id, student_membership_id=primary.id, joined_at=source_link.joined_at))
        source_link.left_at = _now()
        moved += 1
    return moved


def _merge_problem_results(
    db: Session,
    *,
    target_result: PaperSessionResult,
    source_result: PaperSessionResult,
    primary: StudentAcademyMembership,
    prefer_source: bool,
) -> int:
    moved = 0
    target_rows = {
        row.problem_id: row
        for row in db.scalars(
            select(ProblemResult).where(
                _id_equals(ProblemResult.paper_session_result_id, target_result.id),
            )
        ).all()
    }
    source_rows = db.scalars(
        select(ProblemResult).where(
            _id_equals(ProblemResult.paper_session_result_id, source_result.id),
        )
    ).all()
    for source_row in source_rows:
        target_row = target_rows.get(source_row.problem_id)
        if target_row:
            if prefer_source or _problem_result_time(source_row) > _problem_result_time(target_row):
                target_row.problem_number = source_row.problem_number
                target_row.problem_version_id = source_row.problem_version_id
                target_row.result_status = source_row.result_status
                target_row.updated_at = _now()
            db.delete(source_row)
        else:
            source_row.paper_session_result_id = target_result.id
            source_row.student_membership_id = primary.id
            source_row.student_user_id = primary.student_user_id
            source_row.updated_at = _now()
        moved += 1
    return moved


def _merge_paper_session_results(db: Session, academy_ids: set[str], primary: StudentAcademyMembership, secondary: StudentAcademyMembership) -> int:
    moved = 0
    source_results = db.scalars(
        select(PaperSessionResult).where(
            PaperSessionResult.academy_id.in_(list(academy_ids)),
            _id_equals(PaperSessionResult.student_membership_id, secondary.id),
        )
    ).all()
    for source_result in source_results:
        target_result = db.scalar(
            select(PaperSessionResult).where(
                PaperSessionResult.academy_id.in_(list(academy_ids)),
                _id_equals(PaperSessionResult.paper_session_id, source_result.paper_session_id),
                _id_equals(PaperSessionResult.student_membership_id, primary.id),
            )
        )
        if target_result:
            prefer_source = _paper_result_time(source_result) > _paper_result_time(target_result)
            _merge_problem_results(db, target_result=target_result, source_result=source_result, primary=primary, prefer_source=prefer_source)
            if prefer_source:
                target_result.status = source_result.status
                target_result.score = source_result.score
                target_result.correct_count = source_result.correct_count
                target_result.wrong_count = source_result.wrong_count
                target_result.total_count = source_result.total_count
                target_result.graded_by = source_result.graded_by
                target_result.graded_at = source_result.graded_at
            target_result.student_user_id = primary.student_user_id
            target_result.updated_at = _now()
            db.delete(source_result)
        else:
            source_result.student_membership_id = primary.id
            source_result.student_user_id = primary.student_user_id
            source_result.updated_at = _now()
            for row in db.scalars(select(ProblemResult).where(_id_equals(ProblemResult.paper_session_result_id, source_result.id))).all():
                row.student_membership_id = primary.id
                row.student_user_id = primary.student_user_id
                row.updated_at = _now()
        moved += 1

    sessions = db.scalars(select(PaperSession).where(PaperSession.academy_id.in_(list(academy_ids)))).all()
    primary_id = str(primary.id)
    secondary_id = str(secondary.id)
    for session in sessions:
        ids = [str(value) for value in (session.student_membership_ids or [])]
        if secondary_id not in ids:
            continue
        next_ids: list[str] = []
        for value in ids:
            next_value = primary_id if value == secondary_id else value
            if next_value not in next_ids:
                next_ids.append(next_value)
        session.student_membership_ids = next_ids
        session.updated_at = _now()
    return moved


def _merge_wrong_answer_records(db: Session, academy_ids: set[str], primary: StudentAcademyMembership, secondary: StudentAcademyMembership) -> int:
    moved = 0
    source_rows = db.scalars(
        select(WrongAnswerRecord).where(
            WrongAnswerRecord.academy_id.in_(list(academy_ids)),
            WrongAnswerRecord.student_id == secondary.student_user_id,
        )
    ).all()
    for source_row in source_rows:
        target_row = db.scalar(
            select(WrongAnswerRecord).where(
                WrongAnswerRecord.academy_id == source_row.academy_id,
                WrongAnswerRecord.student_id == primary.student_user_id,
                _id_equals(WrongAnswerRecord.problem_id, source_row.problem_id),
            )
        )
        if target_row:
            source_latest = source_row.latest_wrong_at or source_row.updated_at or source_row.created_at
            target_latest = target_row.latest_wrong_at or target_row.updated_at or target_row.created_at
            target_row.problem_version_id = source_row.problem_version_id if source_latest and (not target_latest or source_latest >= target_latest) else target_row.problem_version_id
            target_row.first_wrong_at = min([value for value in [target_row.first_wrong_at, source_row.first_wrong_at] if value] or [_now()])
            target_row.latest_wrong_at = max([value for value in [target_row.latest_wrong_at, source_row.latest_wrong_at] if value] or [_now()])
            target_row.wrong_count = (target_row.wrong_count or 0) + (source_row.wrong_count or 0)
            target_row.retry_count = (target_row.retry_count or 0) + (source_row.retry_count or 0)
            target_row.resolved_status = _merged_wrong_status(target_row.resolved_status, source_row.resolved_status)
            target_row.source_assignment_ids = _merge_unique_list(target_row.source_assignment_ids, source_row.source_assignment_ids)
            target_row.student_memo = _merge_strings(target_row.student_memo, source_row.student_memo)
            target_row.teacher_memo = _merge_strings(target_row.teacher_memo, source_row.teacher_memo)
            if source_latest and (not target_latest or source_latest >= target_latest):
                target_row.last_attempt_id = source_row.last_attempt_id or target_row.last_attempt_id
            target_row.updated_at = _now()
            db.delete(source_row)
        else:
            source_row.student_id = primary.student_user_id
            source_row.updated_at = _now()
        moved += 1
    return moved


def _merge_daily_quota_usage(db: Session, primary: StudentAcademyMembership, secondary: StudentAcademyMembership) -> int:
    moved = 0
    rows = db.scalars(select(DailyStudentQuotaUsage).where(DailyStudentQuotaUsage.student_user_id == secondary.student_user_id)).all()
    for row in rows:
        target = db.scalar(
            select(DailyStudentQuotaUsage).where(
                DailyStudentQuotaUsage.student_user_id == primary.student_user_id,
                DailyStudentQuotaUsage.date == row.date,
                DailyStudentQuotaUsage.source == row.source,
            )
        )
        if target:
            target.upload_count += row.upload_count or 0
            target.extraction_count += row.extraction_count or 0
            target.export_count += row.export_count or 0
            target.updated_at = _now()
            db.delete(row)
        else:
            row.student_user_id = primary.student_user_id
            row.updated_at = _now()
        moved += 1
    return moved


def _merge_direct_student_user_rows(db: Session, academy_ids: set[str], primary: StudentAcademyMembership, secondary: StudentAcademyMembership) -> int:
    moved = 0
    source_user = secondary.student_user_id
    target_user = primary.student_user_id
    for model, column_name in [
        (ArchiveAccessGrant, "student_id"),
        (LearningSubmission, "student_id"),
        (ProblemAttempt, "student_id"),
        (StudentPersonalSet, "student_id"),
        (StudentPersonalSetItem, "student_id"),
        (StudentNotification, "student_user_id"),
        (MaterialDeliveryLog, "student_user_id"),
        (WatermarkedExport, "student_user_id"),
        (WrongAnswerItem, "student_user_id"),
        (WrongAnswerReview, "student_user_id"),
        (WrongAnswerAttempt, "student_user_id"),
    ]:
        column = getattr(model, column_name)
        stmt = select(model).where(column == source_user)
        if hasattr(model, "academy_id"):
            academy_column = getattr(model, "academy_id")
            stmt = stmt.where((academy_column.is_(None)) | (academy_column.in_(list(academy_ids))))
        rows = db.scalars(stmt).all()
        for row in rows:
            setattr(row, column_name, target_user)
            if hasattr(row, "student_membership_id"):
                setattr(row, "student_membership_id", primary.id)
            if hasattr(row, "updated_at"):
                row.updated_at = _now()
            moved += 1

    for row in db.scalars(
        select(LearningAssignmentTarget).where(
            LearningAssignmentTarget.academy_id.in_(list(academy_ids)),
            LearningAssignmentTarget.student_id == source_user,
        )
    ).all():
        target = db.scalar(
            select(LearningAssignmentTarget).where(
                _id_equals(LearningAssignmentTarget.assignment_id, row.assignment_id),
                LearningAssignmentTarget.academy_id == row.academy_id,
                LearningAssignmentTarget.student_id == target_user,
            )
        )
        if target:
            db.delete(row)
        else:
            row.student_id = target_user
        moved += 1

    for row in db.scalars(
        select(AcademyMaterialAssignment).where(
            AcademyMaterialAssignment.target_type == "student",
            AcademyMaterialAssignment.target_id == source_user,
        )
    ).all():
        row.target_id = target_user
        moved += 1
    return moved


def _merge_membership_rows(db: Session, academy_ids: set[str], primary: StudentAcademyMembership, secondary: StudentAcademyMembership) -> int:
    moved = 0
    for model, column_name in [
        (AssignmentSubmission, "student_membership_id"),
        (TestSession, "student_membership_id"),
        (CalendarEvent, "student_membership_id"),
        (WatermarkedExport, "student_membership_id"),
        (WrongAnswerItem, "student_membership_id"),
    ]:
        column = getattr(model, column_name)
        stmt = select(model).where(_id_equals(column, secondary.id))
        if hasattr(model, "academy_id"):
            academy_column = getattr(model, "academy_id")
            stmt = stmt.where((academy_column.is_(None)) | (academy_column.in_(list(academy_ids))))
        rows = db.scalars(stmt).all()
        for row in rows:
            setattr(row, column_name, primary.id)
            if hasattr(row, "student_user_id"):
                row.student_user_id = primary.student_user_id
            if hasattr(row, "updated_at"):
                row.updated_at = _now()
            moved += 1
    return moved


def _merge_seats(db: Session, primary: StudentAcademyMembership, secondary: StudentAcademyMembership) -> None:
    primary_seat = db.get(AcademySeat, primary.academy_seat_id) if primary.academy_seat_id else None
    secondary_seat = db.get(AcademySeat, secondary.academy_seat_id) if secondary.academy_seat_id else None
    if secondary_seat and not primary_seat:
        primary.academy_seat_id = secondary_seat.id
        secondary_seat.current_student_membership_id = primary.id
        secondary_seat.released_at = None
        secondary.academy_seat_id = None
        return
    if secondary_seat and secondary_seat.current_student_membership_id == secondary.id:
        secondary_seat.current_student_membership_id = None
        secondary_seat.released_at = _now()
        rotate_seat_code(db, secondary_seat)
    history = db.scalar(
        select(SeatAssignmentHistory)
        .where(_id_equals(SeatAssignmentHistory.membership_id, secondary.id), SeatAssignmentHistory.released_at.is_(None))
        .order_by(SeatAssignmentHistory.assigned_at.desc())
    )
    if history:
        history.released_at = _now()
        history.released_by = "student_merge"
        history.reason = "merged_into_primary_student"


class ClassPayload(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None


class StudentProfileFieldSetting(BaseModel):
    key: str
    enabled: bool = False
    required: bool = False
    real_name: bool = False


class StudentProfileCollectionPayload(BaseModel):
    fields: list[StudentProfileFieldSetting] = Field(default_factory=list)


class ClassUpdatePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    is_active: bool | None = None


class ClassOrderPayload(BaseModel):
    class_ids: list[UUID]


class StudentPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    grade_level: str | None = None
    school: str | None = None
    memo: str | None = None
    status: str = "active"
    class_ids: list[UUID] = []
    guardian_name: str | None = None
    guardian_phone: str | None = None
    tuition_enabled: bool = False
    tuition_cycle_sessions: int | None = Field(default=None, ge=1, le=120)
    tuition_amount: int | None = Field(default=None, ge=0)


class StudentUpdatePayload(BaseModel):
    name: str | None = None
    grade_level: str | None = None
    school: str | None = None
    memo: str | None = None
    status: str | None = None
    class_ids: list[UUID] | None = None
    guardian_name: str | None = None
    guardian_phone: str | None = None
    tuition_enabled: bool | None = None
    tuition_cycle_sessions: int | None = Field(default=None, ge=1, le=120)
    tuition_amount: int | None = Field(default=None, ge=0)


class ClassStudentPayload(BaseModel):
    student_membership_id: UUID


class StudentMergePayload(BaseModel):
    other_student_id: UUID


class PaperSessionPayload(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    source_problem_set_id: UUID | None = None
    source_batch_id: UUID | None = None
    problem_ids: list[UUID] = []
    session_type: str = "test"
    target_type: str | None = None
    class_ids: list[UUID] = []
    student_membership_ids: list[UUID] = []
    scheduled_at: datetime | None = None
    due_at: datetime | None = None
    status: str = "scheduled"
    create_calendar_events: bool = True


class ProblemStatusPayload(BaseModel):
    problem_id: UUID | None = None
    problem_number: int
    result_status: str


class GradePayload(BaseModel):
    student_membership_id: UUID
    statuses: list[ProblemStatusPayload] = []
    wrong_numbers: str | None = None
    mark_unlisted_correct: bool = True


class ScheduleEventPayload(BaseModel):
    class_id: UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    event_type: str = "class"
    starts_at: datetime
    ends_at: datetime | None = None
    linked_paper_session_id: UUID | None = None
    counts_for_tuition: bool = True
    series_id: str | None = Field(default=None, max_length=80)
    series_position: int | None = None
    series_size: int | None = None


class ScheduleEventUpdatePayload(BaseModel):
    class_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    event_type: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    linked_paper_session_id: UUID | None = None
    counts_for_tuition: bool | None = None
    update_scope: str | None = "single"


class TuitionEventCountPayload(BaseModel):
    counts_for_tuition: bool


class TuitionSessionAdjustmentPayload(BaseModel):
    counts_for_tuition: bool
    reason: str | None = Field(default=None, max_length=80)
    note: str | None = None


class CounselingFormatFieldPayload(BaseModel):
    id: str | None = None
    label: str = Field(min_length=1, max_length=80)
    placeholder: str | None = None
    include_in_report: bool = True


class CounselingFormatPayload(BaseModel):
    fields: list[CounselingFormatFieldPayload] = []


class CounselingPresetPayload(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    subject: str | None = Field(default=None, max_length=80)
    fields: list[CounselingFormatFieldPayload] = []


class CounselingLogSectionPayload(BaseModel):
    field_id: str | None = None
    label: str = Field(min_length=1, max_length=80)
    value: str | None = None
    include_in_report: bool = True


class CounselingLogPayload(BaseModel):
    counseling_date: datetime | None = None
    title: str = Field(default="학습 상담", max_length=255)
    class_id: UUID | None = None
    notes: str | None = None
    weekly_report: str | None = None
    next_plan: str | None = None
    sections: list[CounselingLogSectionPayload] = []


class CounselingExportPayload(BaseModel):
    log_ids: list[str] = []
    hub_template_id: UUID
    title: str | None = Field(default=None, max_length=255)


class CounselingCleanPreviewPayload(CounselingLogPayload):
    pass


class CounselingCleanPreviewSection(BaseModel):
    field_id: str
    label: str
    value: str
    include_in_report: bool = True


class CounselingCleanPreviewResponse(BaseModel):
    sections: list[CounselingCleanPreviewSection]


class CounselingTranscriptionResponse(BaseModel):
    text: str
    model: str


class CounselingIntakePayload(BaseModel):
    mode: str = Field(default="new", max_length=20)
    transcript: str = Field(min_length=1, max_length=30000)
    student_id: UUID | None = None
    student_name: str | None = Field(default=None, max_length=120)


class CounselingIntakeProfile(BaseModel):
    name: str = ""
    school: str = ""
    grade_level: str = ""
    guardian_name: str = ""
    guardian_phone: str = ""
    memo: str = ""
    recommended_class: str = ""
    pending_reason: str = ""


class CounselingIntakeResponse(BaseModel):
    title: str
    summary: str
    student_profile: CounselingIntakeProfile
    sections: list[CounselingCleanPreviewSection]


class RoutineMessagePatchPayload(BaseModel):
    message_body: str | None = Field(default=None, max_length=4000)
    status: str | None = Field(default=None, max_length=40)


def _resolve_counseling_class(db: Session, academy_id: str, membership: StudentAcademyMembership, class_id: UUID | None) -> AcademyClass | None:
    if not class_id:
        return None
    class_row = _get_class(db, academy_id, class_id)
    link = db.scalar(
        select(ClassStudent).where(
            ClassStudent.class_id == class_id,
            ClassStudent.student_membership_id == membership.id,
            ClassStudent.left_at.is_(None),
        )
    )
    if not link:
        raise HTTPException(status_code=400, detail="Student is not active in this class.")
    return class_row


def _counseling_log_row(
    payload: CounselingLogPayload,
    request: Request,
    membership: StudentAcademyMembership,
    class_row: AcademyClass | None,
    existing: dict | None = None,
) -> dict:
    now = _now()
    existing = existing or {}
    title = payload.title.strip() or "학습 상담"
    return {
        "id": str(existing.get("id") or uuid.uuid4()),
        "student_membership_id": str(membership.id),
        "class_id": str(class_row.id) if class_row else None,
        "class_name": class_row.name if class_row else None,
        "title": title,
        "counseling_date": (payload.counseling_date or now).isoformat(),
        "notes": payload.notes or "",
        "weekly_report": payload.weekly_report or "",
        "next_plan": payload.next_plan or "",
        "sections": _normalize_counseling_sections([section.model_dump() for section in payload.sections]),
        "created_by": existing.get("created_by") or current_user_id(request),
        "created_at": existing.get("created_at") or now.isoformat(),
        "updated_by": current_user_id(request),
        "updated_at": now.isoformat(),
    }


def _counseling_payload_sections(payload: CounselingLogPayload) -> list[dict]:
    sections = _normalize_counseling_sections([section.model_dump() for section in payload.sections])
    if sections:
        return sections
    fallback = [
        {"field_id": "notes", "label": "상담 내용", "value": payload.notes or "", "include_in_report": True},
        {"field_id": "weekly_report", "label": "주간 리포트", "value": payload.weekly_report or "", "include_in_report": False},
        {"field_id": "next_plan", "label": "다음 지도 계획", "value": payload.next_plan or "", "include_in_report": True},
    ]
    return _normalize_counseling_sections(fallback)


def _counseling_clean_prompt(membership: StudentAcademyMembership, class_row: AcademyClass | None, payload: CounselingLogPayload, sections: list[dict]) -> str:
    source = {
        "student_name": _student_name(membership),
        "class_name": class_row.name if class_row else "",
        "title": payload.title.strip() or "학습 상담",
        "counseling_date": payload.counseling_date.isoformat() if payload.counseling_date else "",
        "sections": [
            {
                "field_id": section["field_id"],
                "label": section["label"],
                "value": section.get("value") or "",
            }
            for section in sections
        ],
    }
    return f"""
You clean Korean teacher counseling notes before they are saved.

Return only a JSON object in this exact shape:
{{"sections":[{{"field_id":"same id","label":"same label","value":"cleaned Korean text"}}]}}

Rules:
- Preserve the section count, field_id, label, and order exactly.
- Rewrite values in polite Korean counseling-log style suitable for teachers, students, and parents.
- Improve grammar, spacing, clarity, and professional tone.
- You may lightly enrich sparse notes only when the added wording is directly supported by the original text.
- Do not invent scores, events, family details, medical information, emotions, diagnoses, quotes, attendance facts, or promises that are not present.
- Keep empty values empty.
- Soften negative wording into constructive professional language without changing the facts.
- Do not add Markdown, bullets, headings, or explanations outside the JSON.

Input:
{json.dumps(source, ensure_ascii=False)}
""".strip()


def _counseling_chat_completion_json(client: OpenAI, model_name: str, prompt: str, max_output_tokens: int = 2048) -> dict:
    messages = [{"role": "user", "content": prompt}]
    attempts = [
        {"response_format": {"type": "json_object"}, "max_tokens": max_output_tokens},
        {"response_format": {"type": "json_object"}, "extra_body": {"max_completion_tokens": max_output_tokens}},
        {"response_format": {"type": "json_object"}},
        {"max_tokens": max_output_tokens},
        {"extra_body": {"max_completion_tokens": max_output_tokens}},
        {},
    ]
    last_error: Exception | None = None
    for extra in attempts:
        try:
            response = client.chat.completions.create(model=model_name, messages=messages, **extra)
            content = response.choices[0].message.content or "{}"
            text = content.strip()
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
            if not text.startswith("{"):
                start = text.find("{")
                end = text.rfind("}")
                if start >= 0 and end > start:
                    text = text[start : end + 1]
            parsed = json.loads(text)
            if not isinstance(parsed, dict):
                raise ValueError("AI response was not a JSON object.")
            return parsed
        except Exception as exc:
            last_error = exc
            message = str(exc)
            if not any(token in message for token in ("max_tokens", "max_completion_tokens", "response_format")):
                raise
    raise last_error or ValueError("AI response parsing failed.")


def _audio_transcription_text(response: object) -> str:
    text = getattr(response, "text", None)
    if isinstance(text, str):
        return text.strip()
    if isinstance(response, dict):
        return str(response.get("text") or "").strip()
    return ""


def _transcribe_audio_bytes(client: OpenAI, filename: str, content: bytes) -> tuple[str, str]:
    last_error: Exception | None = None
    for model_name in ("gpt-4o-mini-transcribe", "whisper-1"):
        try:
            audio_stream = io.BytesIO(content)
            audio_stream.name = filename or "counseling-audio.webm"
            response = client.audio.transcriptions.create(
                model=model_name,
                file=audio_stream,
                language="ko",
            )
            text = _audio_transcription_text(response)
            if not text:
                raise ValueError("Transcription response did not include text.")
            return text, model_name
        except Exception as exc:
            last_error = exc
            continue
    raise last_error or ValueError("Audio transcription failed.")


def _counseling_intake_prompt(
    payload: CounselingIntakePayload,
    membership: StudentAcademyMembership | None,
    class_names: list[str],
) -> str:
    mode = "existing" if payload.mode == "existing" else "new"
    source = {
        "mode": mode,
        "student": {
            "name": _student_name(membership) if membership else (payload.student_name or ""),
            "school": (membership.metadata_json or {}).get("school") if membership and isinstance(membership.metadata_json, dict) else "",
            "grade_level": (membership.metadata_json or {}).get("grade_level") if membership and isinstance(membership.metadata_json, dict) else "",
            "classes": class_names,
        },
        "transcript": payload.transcript.strip(),
    }
    return f"""
You are Tena Forge's Korean academy counseling intake assistant.

Return only a JSON object in this exact shape:
{{
  "title": "short Korean counseling title",
  "summary": "concise Korean summary for the teacher",
  "student_profile": {{
    "name": "",
    "school": "",
    "grade_level": "",
    "guardian_name": "",
    "guardian_phone": "",
    "memo": "",
    "recommended_class": "",
    "pending_reason": ""
  }},
  "sections": [
    {{"field_id":"notes","label":"상담 내용","value":"..."}},
    {{"field_id":"learning_status","label":"학습 상태","value":"..."}},
    {{"field_id":"next_plan","label":"다음 지도 계획","value":"..."}}
  ]
}}

Rules:
- Use Korean.
- Use only facts explicitly present in the transcript or student context.
- For new-student intake, fill student_profile fields from the transcript and set pending_reason to a short reason why this should stay as a pending candidate until registration is confirmed.
- For existing-student counseling, keep student_profile mostly empty except useful memo/recommended_class facts; focus on sections that can be saved to the student's counseling log.
- Do not invent phone numbers, schools, scores, diagnoses, family details, promises, or payment facts.
- If a field is unknown, return an empty string.
- Keep sections concise, factual, and suitable for a teacher's record.
- No Markdown and no text outside JSON.

Input:
{json.dumps(source, ensure_ascii=False)}
""".strip()


def _fallback_counseling_intake(payload: CounselingIntakePayload) -> dict:
    transcript = payload.transcript.strip()
    first_line = next((line.strip() for line in transcript.splitlines() if line.strip()), "")
    return {
        "title": "신입 상담" if payload.mode != "existing" else "학습 상담",
        "summary": first_line[:240] or transcript[:240],
        "student_profile": {
            "name": payload.student_name or "",
            "school": "",
            "grade_level": "",
            "guardian_name": "",
            "guardian_phone": "",
            "memo": transcript[:1200],
            "recommended_class": "",
            "pending_reason": "등록 여부가 확정되기 전까지 대기 후보로 보관합니다." if payload.mode != "existing" else "",
        },
        "sections": [
            {"field_id": "notes", "label": "상담 내용", "value": transcript, "include_in_report": True},
            {"field_id": "learning_status", "label": "학습 상태", "value": "", "include_in_report": True},
            {"field_id": "next_plan", "label": "다음 지도 계획", "value": "", "include_in_report": True},
        ],
    }


def _coerce_counseling_intake_response(parsed: dict, payload: CounselingIntakePayload) -> dict:
    fallback = _fallback_counseling_intake(payload)
    profile = parsed.get("student_profile") if isinstance(parsed.get("student_profile"), dict) else {}
    sections = _normalize_counseling_sections(parsed.get("sections") if isinstance(parsed.get("sections"), list) else fallback["sections"])
    return {
        "title": str(parsed.get("title") or fallback["title"]).strip()[:255] or fallback["title"],
        "summary": str(parsed.get("summary") or fallback["summary"]).strip(),
        "student_profile": {
            "name": str(profile.get("name") or fallback["student_profile"]["name"]).strip()[:120],
            "school": str(profile.get("school") or "").strip()[:120],
            "grade_level": str(profile.get("grade_level") or "").strip()[:80],
            "guardian_name": str(profile.get("guardian_name") or "").strip()[:120],
            "guardian_phone": str(profile.get("guardian_phone") or "").strip()[:80],
            "memo": str(profile.get("memo") or fallback["student_profile"]["memo"]).strip()[:2000],
            "recommended_class": str(profile.get("recommended_class") or "").strip()[:160],
            "pending_reason": str(profile.get("pending_reason") or fallback["student_profile"]["pending_reason"]).strip()[:240],
        },
        "sections": sections or fallback["sections"],
    }


def _align_cleaned_counseling_sections(original_sections: list[dict], ai_sections: object) -> list[dict]:
    rows = ai_sections if isinstance(ai_sections, list) else []
    rows_by_id = {
        str(row.get("field_id") or ""): row
        for row in rows
        if isinstance(row, dict) and str(row.get("field_id") or "")
    }
    cleaned: list[dict] = []
    for index, original in enumerate(original_sections):
        candidate = rows_by_id.get(str(original["field_id"]))
        if not candidate and index < len(rows) and isinstance(rows[index], dict):
            candidate = rows[index]
        cleaned_value = candidate.get("value") if isinstance(candidate, dict) else original.get("value")
        cleaned.append(
            {
                "field_id": original["field_id"],
                "label": original["label"],
                "value": str(cleaned_value or ""),
                "include_in_report": True,
            }
        )
    return cleaned


def _parse_routine_datetime(value: object) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        if value.tzinfo and value.utcoffset() is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.replace(tzinfo=None)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo and parsed.utcoffset() is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed.replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def _routine_date_label(value: datetime | str | None) -> str:
    parsed = _parse_routine_datetime(value)
    return parsed.strftime("%Y.%m.%d") if parsed else str(value or "")[:10]


def _routine_message_payload(message: RoutineMessage) -> dict:
    return {
        "id": str(message.id),
        "action_id": str(message.action_id),
        "student_membership_id": str(message.student_membership_id) if message.student_membership_id else None,
        "student_user_id": message.student_user_id,
        "student_name": message.student_name,
        "class_id": str(message.class_id) if message.class_id else None,
        "class_name": message.class_name,
        "message_body": message.message_body,
        "status": message.status,
        "channel": message.channel,
        "delivery_status": message.delivery_status,
        "notification_id": str(message.notification_id) if message.notification_id else None,
        "sent_at": message.sent_at.isoformat() if message.sent_at else None,
        "metadata": message.metadata_json or {},
        "updated_at": message.updated_at.isoformat() if message.updated_at else None,
    }


def _routine_action_payload(action: RoutineAction) -> dict:
    messages = sorted(action.messages or [], key=lambda item: (item.created_at or datetime.min, str(item.id)))
    return {
        "id": str(action.id),
        "academy_id": action.academy_id,
        "routine_type": action.routine_type,
        "source_type": action.source_type,
        "source_id": action.source_id,
        "class_id": str(action.class_id) if action.class_id else None,
        "status": action.status,
        "title": action.title,
        "summary": action.summary,
        "channel": action.channel,
        "message_count": len(messages),
        "sendable_count": len([message for message in messages if message.status != "excluded"]),
        "sent_count": len([message for message in messages if message.delivery_status == "sent"]),
        "created_at": action.created_at.isoformat() if action.created_at else None,
        "updated_at": action.updated_at.isoformat() if action.updated_at else None,
        "approved_at": action.approved_at.isoformat() if action.approved_at else None,
        "sent_at": action.sent_at.isoformat() if action.sent_at else None,
        "ai_payload": action.ai_payload or {},
        "messages": [_routine_message_payload(message) for message in messages],
    }


def _routine_ai_prompt(action: RoutineAction, context: dict) -> str:
    payload = {
        "routine_type": action.routine_type,
        "title": action.title,
        "summary": action.summary,
        "source": context.get("source") if isinstance(context, dict) else {},
        "messages": [
            {
                "student_user_id": message.student_user_id,
                "student_name": message.student_name,
                "message_body": message.message_body,
                "metadata": message.metadata_json or {},
            }
            for message in sorted(action.messages or [], key=lambda item: (item.created_at or datetime.min, str(item.id)))
            if message.status != "excluded"
        ],
    }
    return f"""
You are Tena Forge's routine assistant for Korean academies.

Return only JSON:
{{"title":"short Korean title","summary":"question-style Korean approval prompt","messages":[{{"student_user_id":"same id","message_body":"polite Korean message"}}]}}

Rules:
- The summary must ask the teacher whether to send the prepared messages.
- Use polite, professional Korean suitable for students and parents.
- Use only facts present in the input: titles, dates, scores, correct/wrong counts, schedules, counseling notes.
- Do not invent attendance, attitude, parent reactions, Kakao/SMS delivery, health, family details, promises, or exact comments that are not present.
- Keep each student message concise but useful.
- Preserve student_user_id values exactly.
- Do not include Markdown or explanations outside JSON.

Input:
{json.dumps(payload, ensure_ascii=False)}
""".strip()


def _apply_routine_ai(action: RoutineAction, context: dict) -> None:
    stored_context = dict(context or {})
    settings = get_settings()
    if not settings.openai_api_key:
        action.ai_payload = {**stored_context, "ai_status": "fallback_no_key"}
        return

    try:
        client = OpenAI(api_key=settings.openai_api_key, timeout=settings.ai_request_timeout_seconds)
        parsed = _counseling_chat_completion_json(client, settings.ai_model, _routine_ai_prompt(action, stored_context), max_output_tokens=4096)
        title = str(parsed.get("title") or "").strip()
        summary = str(parsed.get("summary") or "").strip()
        if title:
            action.title = title[:255]
        if summary:
            action.summary = summary
        rows = parsed.get("messages") if isinstance(parsed.get("messages"), list) else []
        by_student = {
            str(row.get("student_user_id") or ""): row
            for row in rows
            if isinstance(row, dict) and str(row.get("student_user_id") or "")
        }
        for index, message in enumerate(sorted(action.messages or [], key=lambda item: (item.created_at or datetime.min, str(item.id)))):
            row = by_student.get(message.student_user_id)
            if not row and index < len(rows) and isinstance(rows[index], dict):
                row = rows[index]
            body = str((row or {}).get("message_body") or "").strip() if isinstance(row, dict) else ""
            if body and message.status != "excluded":
                message.message_body = body
        action.ai_payload = {**stored_context, "ai_status": "applied", "ai_response": parsed}
    except Exception as exc:
        action.ai_payload = {**stored_context, "ai_status": "fallback_error", "ai_error": str(exc)}
    action.updated_at = _now()


def _routine_active_memberships_for_class(db: Session, academy_ids: set[str], class_id: UUID) -> list[StudentAcademyMembership]:
    return db.scalars(
        select(StudentAcademyMembership)
        .join(ClassStudent, ClassStudent.student_membership_id == StudentAcademyMembership.id)
        .join(AcademyClass, AcademyClass.id == ClassStudent.class_id)
        .where(
            AcademyClass.academy_id.in_(list(academy_ids)),
            ClassStudent.class_id == class_id,
            ClassStudent.left_at.is_(None),
            StudentAcademyMembership.status == "active",
        )
        .order_by(StudentAcademyMembership.display_name_in_academy.asc().nullslast(), StudentAcademyMembership.created_at.asc())
    ).all()


def _routine_existing_keys(db: Session, academy_id: str) -> set[tuple[str, str, str]]:
    rows = db.scalars(select(RoutineAction).where(RoutineAction.academy_id == academy_id)).all()
    return {(row.routine_type, row.source_type, row.source_id) for row in rows}


def _add_routine_action(
    db: Session,
    academy_id: str,
    actor_id: str,
    routine_type: str,
    source_type: str,
    source_id: str,
    class_id: UUID | None,
    title: str,
    summary: str,
    messages: list[dict],
    source_context: dict,
) -> RoutineAction | None:
    if not messages:
        return None
    existing = db.scalar(
        select(RoutineAction).where(
            RoutineAction.academy_id == academy_id,
            RoutineAction.routine_type == routine_type,
            RoutineAction.source_type == source_type,
            RoutineAction.source_id == source_id,
        )
    )
    if existing:
        return None
    action = RoutineAction(
        academy_id=academy_id,
        routine_type=routine_type,
        source_type=source_type,
        source_id=source_id,
        class_id=class_id,
        status="suggested",
        title=title[:255],
        summary=summary,
        ai_payload={"source": source_context, "ai_status": "fallback"},
        channel=ROUTINE_CHANNEL,
        created_by=actor_id,
    )
    db.add(action)
    db.flush()
    for message in messages:
        db.add(
            RoutineMessage(
                action_id=action.id,
                student_membership_id=message.get("student_membership_id"),
                student_user_id=message["student_user_id"],
                student_name=message["student_name"],
                class_id=message.get("class_id") or class_id,
                class_name=message.get("class_name"),
                message_body=message["message_body"],
                status="pending",
                channel=ROUTINE_CHANNEL,
                delivery_status="draft",
                metadata_json=message.get("metadata") or {},
            )
        )
    db.flush()
    db.refresh(action)
    _apply_routine_ai(action, {"source": source_context})
    return action


def _grade_routine_for_session(db: Session, academy_id: str, visible_academy_ids: set[str], actor_id: str, session: PaperSession, summary: dict) -> RoutineAction | None:
    detail = _paper_session_detail(db, academy_id, session)
    students = [student for student in detail.get("students", []) if student.get("result", {}).get("status") == "graded"]
    if not students:
        return None
    class_id = UUID(str(session.class_ids[0])) if len(session.class_ids or []) == 1 else None
    class_name = ""
    if class_id:
        class_row = db.get(AcademyClass, class_id)
        class_name = class_row.name if class_row else ""
    title = f"{session.title} 리포트"
    average = summary.get("average_score")
    date_label = _routine_date_label(session.scheduled_at or session.created_at)
    prompt_summary = f"{class_name or '대상 학생'}의 {date_label} {session.title} 리포트가 준비되었습니다. 학생별 피드백 {len(students)}건을 전송할까요?"
    messages = []
    for student in students:
        result = student.get("result") or {}
        score = result.get("score")
        body = (
            f"{student.get('name') or '학생'} 학생의 {session.title} 결과를 안내드립니다. "
            f"점수는 {score if score is not None else '-'}점이며, 정답 {result.get('correct_count', 0)}개, "
            f"오답/미풀이 {result.get('wrong_count', 0)}개로 확인되었습니다."
        )
        messages.append(
            {
                "student_membership_id": UUID(str(student["id"])) if student.get("id") else None,
                "student_user_id": student.get("student_user_id") or "",
                "student_name": student.get("name") or "학생",
                "class_id": class_id,
                "class_name": class_name,
                "message_body": body,
                "metadata": {
                    "score": score,
                    "correct_count": result.get("correct_count", 0),
                    "wrong_count": result.get("wrong_count", 0),
                    "total_count": result.get("total_count", 0),
                },
            }
        )
    messages = [message for message in messages if message["student_user_id"]]
    context = {
        "kind": "grade_report",
        "session_title": session.title,
        "class_name": class_name,
        "date": date_label,
        "average_score": average,
        "graded_count": len(students),
        "assigned_count": summary.get("assigned_count"),
    }
    return _add_routine_action(db, academy_id, actor_id, "grade_report", "paper_session", str(session.id), class_id, title, prompt_summary, messages, context)


def _schedule_routine_for_event(db: Session, academy_id: str, visible_academy_ids: set[str], actor_id: str, event: ClassScheduleEvent) -> RoutineAction | None:
    class_row = db.get(AcademyClass, event.class_id)
    class_name = class_row.name if class_row else ""
    memberships = _routine_active_memberships_for_class(db, visible_academy_ids, event.class_id)
    if not memberships:
        return None
    date_label = _routine_date_label(event.starts_at)
    title = f"{event.title} 수업 피드백"
    summary = f"{class_name or '클래스'}의 {date_label} {event.title} 수업 피드백 {len(memberships)}건을 전송할까요?"
    messages = [
        {
            "student_membership_id": membership.id,
            "student_user_id": membership.student_user_id,
            "student_name": _student_name(membership),
            "class_id": event.class_id,
            "class_name": class_name,
            "message_body": f"{_student_name(membership)} 학생의 {date_label} {event.title} 수업 안내입니다. 수업 내용과 다음 학습 계획을 확인해 주세요.",
            "metadata": {"event_title": event.title, "event_type": event.event_type, "date": date_label},
        }
        for membership in memberships
    ]
    context = {"kind": "class_feedback", "event_title": event.title, "class_name": class_name, "date": date_label, "description": event.description or ""}
    return _add_routine_action(db, academy_id, actor_id, "class_feedback", "schedule_event", str(event.id), event.class_id, title, summary, messages, context)


def _counseling_routine_for_log(db: Session, academy_id: str, actor_id: str, membership: StudentAcademyMembership, log: dict) -> RoutineAction | None:
    log_id = str(log.get("id") or "")
    if not log_id:
        return None
    date_label = _routine_date_label(str(log.get("counseling_date") or ""))
    title = f"{_student_name(membership)} 상담 공유"
    sections = _counseling_export_sections([log])
    section_text = "\n".join([f"{section.get('label')}: {section.get('value')}" for section in sections[:4] if section.get("value")])
    body = f"{_student_name(membership)} 학생의 {date_label} 상담 내용을 공유드립니다.\n{section_text}".strip()
    summary = f"{_student_name(membership)} 학생의 {date_label} 상담 기록을 공유할까요?"
    class_id = UUID(str(log["class_id"])) if log.get("class_id") else None
    message = {
        "student_membership_id": membership.id,
        "student_user_id": membership.student_user_id,
        "student_name": _student_name(membership),
        "class_id": class_id,
        "class_name": str(log.get("class_name") or ""),
        "message_body": body,
        "metadata": {"counseling_title": log.get("title"), "date": date_label},
    }
    context = {"kind": "counseling_share", "student_name": _student_name(membership), "date": date_label, "sections": sections}
    return _add_routine_action(db, academy_id, actor_id, "counseling_share", "counseling_log", log_id, class_id, title, summary, [message], context)


def _ensure_routine_candidates(db: Session, academy_id: str, visible_academy_ids: set[str], actor_id: str) -> int:
    created = 0
    existing = _routine_existing_keys(db, academy_id)
    now = _parse_routine_datetime(_now()) or _now()
    recent_start = now - timedelta(days=ROUTINE_RECENT_DAYS)

    sessions = db.scalars(
        select(PaperSession)
        .where(PaperSession.academy_id.in_(list(visible_academy_ids)))
        .options(joinedload(PaperSession.content_version))
        .order_by(PaperSession.scheduled_at.desc().nullslast(), PaperSession.created_at.desc())
        .limit(30)
    ).all()
    for session in sessions:
        if created >= ROUTINE_MAX_NEW_PER_REFRESH:
            break
        session_id = str(session.id)
        key = ("grade_report", "paper_session", session_id)
        if key in existing:
            continue
        try:
            summary = _session_summary(db, academy_id, session) or {}
            if not summary.get("graded_count") or summary.get("graded_count") != summary.get("assigned_count"):
                continue
            event_time = _parse_routine_datetime(session.scheduled_at or session.created_at)
            if event_time and event_time < recent_start:
                continue
            if _grade_routine_for_session(db, academy_id, visible_academy_ids, actor_id, session, summary):
                db.commit()
                existing.add(key)
                created += 1
        except Exception:
            db.rollback()
            logger.exception("Skipping routine grade_report candidate for session %s", session_id)

    events = db.scalars(
        select(ClassScheduleEvent)
        .where(
            ClassScheduleEvent.academy_id.in_(list(visible_academy_ids)),
            ClassScheduleEvent.starts_at >= recent_start,
            ClassScheduleEvent.starts_at <= now + timedelta(hours=1),
        )
        .order_by(ClassScheduleEvent.starts_at.desc())
        .limit(30)
    ).all()
    for event in events:
        if created >= ROUTINE_MAX_NEW_PER_REFRESH:
            break
        event_id = str(event.id)
        key = ("class_feedback", "schedule_event", event_id)
        if key in existing:
            continue
        try:
            if _schedule_routine_for_event(db, academy_id, visible_academy_ids, actor_id, event):
                db.commit()
                existing.add(key)
                created += 1
        except Exception:
            db.rollback()
            logger.exception("Skipping routine class_feedback candidate for event %s", event_id)

    memberships = _visible_student_memberships(db, visible_academy_ids)
    for membership in memberships:
        if created >= ROUTINE_MAX_NEW_PER_REFRESH:
            break
        membership_id = str(membership.id)
        for log in _counseling_logs(membership):
            if created >= ROUTINE_MAX_NEW_PER_REFRESH:
                break
            key = ("counseling_share", "counseling_log", str(log.get("id") or ""))
            if not key[2] or key in existing:
                continue
            try:
                event_time = _parse_routine_datetime(log.get("updated_at") or log.get("counseling_date"))
                if event_time and event_time < recent_start:
                    continue
                if _counseling_routine_for_log(db, academy_id, actor_id, membership, log):
                    db.commit()
                    existing.add(key)
                    created += 1
            except Exception:
                db.rollback()
                logger.exception("Skipping routine counseling_share candidate for membership %s log %s", membership_id, log.get("id"))
    return created


def _tuition_amount_text(amount: int | None) -> str:
    return f"{amount:,}원" if isinstance(amount, int) and amount > 0 else "수강료"


def _tuition_reminder_body(payment: StudentTuitionPayment, membership: StudentAcademyMembership, class_row: AcademyClass | None, event: ClassScheduleEvent | None) -> str:
    settings = _tuition_settings_from_metadata(membership.metadata_json)
    guardian_name = settings.get("guardian_name")
    student_name = _student_name(membership)
    class_name = class_row.name if class_row else str((payment.metadata_json or {}).get("class_name") or "")
    amount = payment.amount if payment.amount is not None else settings.get("amount")
    due_label = event.starts_at.strftime("%Y.%m.%d") if event and event.starts_at else payment.due_at.strftime("%Y.%m.%d")
    greeting = f"{guardian_name} 보호자님" if guardian_name else "보호자님"
    class_part = f" {class_name}" if class_name else ""
    return f"{greeting}, {student_name} 학생{class_part} 수강료({_tuition_amount_text(amount)}) 납부 확인 부탁드립니다. 기준일: {due_label}"


def _tuition_payment_payload(db: Session, payment: StudentTuitionPayment) -> dict:
    membership = db.get(StudentAcademyMembership, payment.student_membership_id)
    class_row = db.get(AcademyClass, payment.class_id) if payment.class_id else None
    event = db.get(ClassScheduleEvent, payment.due_event_id) if payment.due_event_id else None
    metadata = payment.metadata_json or {}
    settings = _tuition_settings_from_metadata(membership.metadata_json if membership else metadata)
    student_name = _student_name(membership) if membership else str(metadata.get("student_name") or "")
    message_body = _tuition_reminder_body(payment, membership, class_row, event) if membership else str(payment.reminder_message or "")
    return {
        "id": str(payment.id),
        "academy_id": payment.academy_id,
        "student_membership_id": str(payment.student_membership_id),
        "student_user_id": payment.student_user_id,
        "student_name": student_name,
        "class_id": str(payment.class_id) if payment.class_id else None,
        "class_name": class_row.name if class_row else metadata.get("class_name"),
        "due_event_id": str(payment.due_event_id) if payment.due_event_id else None,
        "event_title": event.title if event else metadata.get("event_title"),
        "due_at": payment.due_at.isoformat(),
        "cycle_number": payment.cycle_number,
        "cycle_start_session": payment.cycle_start_session,
        "cycle_end_session": payment.cycle_end_session,
        "cycle_sessions": payment.cycle_sessions,
        "amount": payment.amount,
        "status": payment.status,
        "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
        "reminder_count": payment.reminder_count,
        "reminder_sent_at": payment.reminder_sent_at.isoformat() if payment.reminder_sent_at else None,
        "guardian_name": settings.get("guardian_name"),
        "guardian_phone": settings.get("guardian_phone"),
        "message_body": message_body,
        "counts_for_tuition": bool(event.counts_for_tuition) if event else True,
    }


def _ensure_tuition_payment_candidates(db: Session, academy_id: str, visible_academy_ids: set[str], days_ahead: int = TUITION_LOOKAHEAD_DAYS) -> int:
    now = _now()
    horizon = now + timedelta(days=max(1, min(days_ahead, 90)))
    due_window_start = now - timedelta(days=TUITION_OVERDUE_DAYS)
    memberships = [
        membership
        for membership in _visible_student_memberships(db, visible_academy_ids)
        if (membership.status or "active") == "active"
    ]
    created = 0
    changed = False

    def stale_payment_stmt(membership_id: UUID, expected_due_event_ids: set[UUID]):
        stmt = select(StudentTuitionPayment).where(
            StudentTuitionPayment.academy_id == academy_id,
            StudentTuitionPayment.student_membership_id == membership_id,
            StudentTuitionPayment.due_at <= horizon,
            StudentTuitionPayment.status.in_(["pending", "reminded"]),
        )
        if expected_due_event_ids:
            stmt = stmt.where(
                or_(
                    StudentTuitionPayment.due_event_id.is_(None),
                    StudentTuitionPayment.due_event_id.not_in(list(expected_due_event_ids)),
                )
            )
        return stmt

    for membership in memberships:
        settings = _tuition_settings_from_metadata(membership.metadata_json)
        cycle_sessions = int(settings.get("cycle_sessions") or 0)
        expected_due_event_ids: set[UUID] = set()
        if not settings.get("enabled") or cycle_sessions <= 0:
            stale_payments = db.scalars(stale_payment_stmt(membership.id, expected_due_event_ids)).all()
            for payment in stale_payments:
                payment.status = "excluded"
                payment.updated_at = now
                changed = True
            continue
        class_ids = db.scalars(
            select(ClassStudent.class_id).where(
                ClassStudent.student_membership_id == membership.id,
                ClassStudent.left_at.is_(None),
            )
        ).all()
        events = []
        if class_ids:
            events = db.scalars(
                select(ClassScheduleEvent)
                .where(
                    ClassScheduleEvent.academy_id.in_(list(visible_academy_ids)),
                    ClassScheduleEvent.class_id.in_(class_ids),
                    ClassScheduleEvent.starts_at <= horizon,
                )
                .order_by(ClassScheduleEvent.starts_at.asc(), ClassScheduleEvent.created_at.asc())
            ).all()
            adjustments = {
                adjustment.event_id: adjustment
                for adjustment in db.scalars(
                    select(StudentTuitionSessionAdjustment).where(
                        StudentTuitionSessionAdjustment.academy_id.in_(list(visible_academy_ids)),
                        StudentTuitionSessionAdjustment.student_membership_id == membership.id,
                    )
                ).all()
            }
        else:
            adjustments = {}
        billable_count = 0
        for event in events:
            if event.starts_at < membership.joined_at or event.event_type != "class" or not event.counts_for_tuition:
                continue
            adjustment = adjustments.get(event.id)
            if adjustment and not adjustment.counts_for_tuition:
                continue
            billable_count += 1
            if (billable_count - 1) % cycle_sessions != 0 or event.starts_at < due_window_start:
                continue
            expected_due_event_ids.add(event.id)
            existing = db.scalar(
                select(StudentTuitionPayment).where(
                    StudentTuitionPayment.academy_id == academy_id,
                    StudentTuitionPayment.student_membership_id == membership.id,
                    StudentTuitionPayment.due_event_id == event.id,
                )
            )
            class_row = db.get(AcademyClass, event.class_id)
            cycle_number = ((billable_count - 1) // cycle_sessions) + 1
            metadata = {
                "student_name": _student_name(membership),
                "class_name": class_row.name if class_row else "",
                "event_title": event.title,
            }
            if existing:
                if existing.status != "paid":
                    existing.class_id = event.class_id
                    existing.cycle_number = cycle_number
                    existing.cycle_start_session = billable_count
                    existing.cycle_end_session = billable_count + cycle_sessions - 1
                    existing.cycle_sessions = cycle_sessions
                    existing.amount = settings.get("amount")
                    if existing.status == "excluded":
                        existing.status = "pending"
                    existing.due_at = event.starts_at
                    existing.metadata_json = {**(existing.metadata_json or {}), **metadata}
                    existing.updated_at = now
                    changed = True
                continue
            db.add(
                StudentTuitionPayment(
                    academy_id=academy_id,
                    student_membership_id=membership.id,
                    student_user_id=membership.student_user_id,
                    class_id=event.class_id,
                    due_event_id=event.id,
                    cycle_number=cycle_number,
                    cycle_start_session=billable_count,
                    cycle_end_session=billable_count + cycle_sessions - 1,
                    cycle_sessions=cycle_sessions,
                    amount=settings.get("amount"),
                    status="pending",
                    due_at=event.starts_at,
                    metadata_json=metadata,
                )
            )
            created += 1
            changed = True
        stale_payments = db.scalars(stale_payment_stmt(membership.id, expected_due_event_ids)).all()
        for payment in stale_payments:
            payment.status = "excluded"
            payment.updated_at = now
            changed = True
    if changed:
        db.commit()
    return created


class ReviewSetPayload(BaseModel):
    title: str = "오답 복습 세트"
    wrong_answer_ids: list[UUID] = []
    class_id: UUID | None = None
    student_membership_id: UUID | None = None
    unresolved_only: bool = True


@router.get("/student-profile-settings")
def get_student_profile_settings(request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    return student_profile_collection_settings(db, academy_id)


@router.put("/student-profile-settings")
def update_student_profile_settings(payload: StudentProfileCollectionPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    settings = save_student_profile_collection_settings(db, academy_id, payload.model_dump())
    db.commit()
    return settings


@router.get("/dashboard")
def dashboard(request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    _normalize_legacy_student_keys(db, academy_id, visible_academy_ids, current_user_id(request))
    classes = _ordered_classes_for_academies(db, visible_academy_ids, academy_id)
    sessions = db.scalars(
        select(PaperSession)
        .where(PaperSession.academy_id.in_(list(visible_academy_ids)))
        .options(joinedload(PaperSession.content_version))
        .order_by(PaperSession.created_at.desc())
        .limit(8)
    ).all()
    unresolved = db.scalar(
        select(func.count(WrongAnswerRecord.id)).where(
            WrongAnswerRecord.academy_id.in_(list(visible_academy_ids)),
            WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]),
        )
    ) or 0
    students = db.scalar(
        select(func.count(StudentAcademyMembership.id)).where(
            StudentAcademyMembership.academy_id.in_(list(visible_academy_ids)),
            StudentAcademyMembership.status == "active",
        )
    ) or 0
    class_payloads = [_safe_class_payload(db, academy_id, row, include_students=True) for row in classes]
    return {
        "summary": {
            "class_count": len(classes),
            "student_count": students,
            "active_session_count": len([session for session in sessions if session.status in {"scheduled", "exported", "grading"}]),
            "unresolved_wrong_count": unresolved,
        },
        "classes": class_payloads,
        "recent_sessions": [summary for summary in (_safe_session_summary(db, academy_id, session) for session in sessions) if summary],
    }


@router.get("/classes")
def list_classes(request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    _normalize_legacy_student_keys(db, academy_id, visible_academy_ids, current_user_id(request))
    rows = _ordered_classes_for_academies(db, visible_academy_ids, academy_id)
    return [_safe_class_payload(db, academy_id, row, include_students=True) for row in rows]


@router.post("/classes")
def create_class(payload: ClassPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Class name is required.")
    row = AcademyClass(
        academy_id=academy_id,
        name=name,
        description=_clean_optional_text(payload.description),
        subject=_clean_optional_text(payload.subject),
        grade_level=_clean_optional_text(payload.grade_level),
    )
    db.add(row)
    db.flush()
    existing_order = [class_id for class_id in _stored_class_order(db, academy_id) if class_id != str(row.id)]
    _save_class_order(db, academy_id, [str(row.id), *existing_order])
    db.commit()
    db.refresh(row)
    return _class_payload(db, academy_id, row, include_students=True)


@router.put("/classes/order")
def update_class_order(payload: ClassOrderPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    requested_ids = _uuid_list(payload.class_ids)
    rows = db.scalars(select(AcademyClass).where(AcademyClass.academy_id == academy_id)).all()
    valid_ids = {str(row.id) for row in rows}
    invalid_ids = [class_id for class_id in requested_ids if class_id not in valid_ids]
    if invalid_ids:
        raise HTTPException(status_code=400, detail="Class order contains classes outside this academy.")
    remaining_ids = [str(row.id) for row in _sort_class_rows(rows, requested_ids) if str(row.id) not in requested_ids]
    stored_order = [*requested_ids, *remaining_ids]
    _save_class_order(db, academy_id, stored_order)
    db.commit()
    ordered_rows = _sort_class_rows(rows, stored_order)
    return [_class_payload(db, academy_id, row, include_students=True) for row in ordered_rows]


@router.get("/classes/{class_id}")
def get_class(class_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    academy_ids = _student_management_academy_ids(request, db, academy_id)
    row = db.get(AcademyClass, class_id)
    if not row or row.academy_id not in academy_ids:
        raise HTTPException(status_code=404, detail="Class not found.")
    sessions = db.scalars(
        select(PaperSession)
        .where(PaperSession.academy_id.in_(list(academy_ids)))
        .options(joinedload(PaperSession.content_version))
        .order_by(PaperSession.scheduled_at.desc().nullslast(), PaperSession.created_at.desc())
    ).all()
    events = db.scalars(
        select(ClassScheduleEvent)
        .where(ClassScheduleEvent.academy_id.in_(list(academy_ids)), ClassScheduleEvent.class_id == class_id)
        .order_by(ClassScheduleEvent.starts_at.asc())
        .limit(500)
    ).all()
    payload = _class_payload(db, academy_id, row, include_students=True)
    memberships = _active_memberships_for_class(db, academy_id, row.id)
    payload["paper_sessions"] = [_session_summary(db, academy_id, session) for session in sessions if _session_belongs_to_class(session, row, memberships)]
    payload["schedule_events"] = [_schedule_event_payload(event) for event in events]
    return payload


@router.patch("/classes/{class_id}")
def update_class(class_id: UUID, payload: ClassUpdatePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    row = _get_class(db, academy_id, class_id, visible_academy_ids)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "name" and value is not None:
            value = value.strip()
            if not value:
                raise HTTPException(status_code=400, detail="Class name is required.")
        setattr(row, key, value)
    row.updated_at = _now()
    db.commit()
    db.refresh(row)
    return _class_payload(db, academy_id, row, include_students=True)


@router.put("/classes/{class_id}/counseling-format")
def update_class_counseling_format(class_id: UUID, payload: CounselingFormatPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    _get_class(db, academy_id, class_id, visible_academy_ids)
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = dict(subscription.billing_metadata or {})
    formats = metadata.get(COUNSELING_FORMATS_METADATA_KEY)
    if not isinstance(formats, dict):
        formats = {}
    row = {
        "class_id": str(class_id),
        "fields": _normalize_counseling_fields([field.model_dump() for field in payload.fields]),
        "updated_by": current_user_id(request),
        "updated_at": _now().isoformat(),
    }
    formats[str(class_id)] = row
    metadata[COUNSELING_FORMATS_METADATA_KEY] = formats
    subscription.billing_metadata = metadata
    db.commit()
    return row


@router.put("/counseling-presets/{slot}")
def save_counseling_preset(slot: int, payload: CounselingPresetPayload, request: Request, db: Session = Depends(get_db)):
    if slot < 1 or slot > 4:
        raise HTTPException(status_code=400, detail="Preset slot must be between 1 and 4.")
    academy_id = _student_management_academy_id(request, db)
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = dict(subscription.billing_metadata or {})
    rows = metadata.get(COUNSELING_PRESETS_METADATA_KEY)
    existing = [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
    row = {
        "slot": slot,
        "name": (payload.name or f"프리셋 {slot}").strip() or f"프리셋 {slot}",
        "subject": _clean_optional_text(payload.subject),
        "fields": _normalize_counseling_fields([field.model_dump() for field in payload.fields]),
        "updated_by": current_user_id(request),
        "updated_at": _now().isoformat(),
    }
    next_rows = []
    for item in existing:
        try:
            existing_slot = int(item.get("slot") or 0)
        except (TypeError, ValueError):
            existing_slot = 0
        if existing_slot != slot:
            next_rows.append(item)
    next_rows.append(row)
    metadata[COUNSELING_PRESETS_METADATA_KEY] = sorted(next_rows, key=lambda item: int(item.get("slot") or 0) if str(item.get("slot") or "").isdigit() else 0)
    subscription.billing_metadata = metadata
    db.commit()
    return row


@router.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    row = _get_class(db, academy_id, class_id, visible_academy_ids)
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.post("/classes/{class_id}/students")
def add_student_to_class(class_id: UUID, payload: ClassStudentPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    actor_id = current_user_id(request)
    class_row = _get_class(db, academy_id, class_id, visible_academy_ids)
    membership = _get_membership(db, academy_id, payload.student_membership_id, visible_academy_ids)

    for candidate in _related_student_key_memberships(db, visible_academy_ids, membership):
        link = db.scalar(
            select(ClassStudent).where(
                _id_equals(ClassStudent.class_id, class_id),
                _id_equals(ClassStudent.student_membership_id, candidate.id),
            )
        )
        if link:
            link.left_at = None
            db.commit()
            return _class_payload(db, academy_id, class_row, include_students=True)

    seat = db.get(AcademySeat, membership.academy_seat_id) if membership.academy_seat_id else None
    if seat and not seat.class_id:
        seat.class_id = class_row.id
        metadata = dict(membership.metadata_json or {})
        metadata[STUDENT_PERSON_METADATA_KEY] = metadata.get(STUDENT_PERSON_METADATA_KEY) or _student_person_id(membership)
        membership.metadata_json = metadata
        db.add(ClassStudent(class_id=class_row.id, student_membership_id=membership.id))
    elif seat and str(seat.class_id) == str(class_row.id):
        metadata = dict(membership.metadata_json or {})
        metadata[STUDENT_PERSON_METADATA_KEY] = metadata.get(STUDENT_PERSON_METADATA_KEY) or _student_person_id(membership)
        membership.metadata_json = metadata
        db.add(ClassStudent(class_id=class_row.id, student_membership_id=membership.id))
    else:
        _create_class_membership_for_existing_student(db, academy_id, membership, class_row, actor_id)
    db.commit()
    return _class_payload(db, academy_id, class_row, include_students=True)


@router.delete("/classes/{class_id}/students/{student_id}", status_code=204)
def remove_student_from_class(class_id: UUID, student_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    _get_class(db, academy_id, class_id, visible_academy_ids)
    _get_membership(db, academy_id, student_id, visible_academy_ids)
    link = db.scalar(select(ClassStudent).where(ClassStudent.class_id == class_id, ClassStudent.student_membership_id == student_id))
    if link:
        link.left_at = _now()
        db.commit()
    return Response(status_code=204)


@router.get("/tuition")
def list_tuition_payments(request: Request, days_ahead: int = 14, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    _ensure_tuition_payment_candidates(db, academy_id, visible_academy_ids, days_ahead)
    now = _now()
    horizon = now + timedelta(days=max(1, min(days_ahead, 90)))
    recent_paid_start = now - timedelta(days=14)
    rows = db.scalars(
        select(StudentTuitionPayment)
        .where(
            StudentTuitionPayment.academy_id == academy_id,
            StudentTuitionPayment.due_at <= horizon,
        )
        .order_by(StudentTuitionPayment.due_at.asc(), StudentTuitionPayment.created_at.asc())
        .limit(200)
    ).all()
    visible = [
        row
        for row in rows
        if row.status in {"pending", "reminded"}
        or (row.status == "paid" and (row.paid_at or row.updated_at or row.created_at) >= recent_paid_start)
    ]
    pending = [row for row in visible if row.status in {"pending", "reminded"}]
    return {
        "summary": {
            "pending_count": len(pending),
            "overdue_count": len([row for row in pending if row.due_at < now]),
            "reminded_count": len([row for row in pending if row.reminder_count > 0]),
        },
        "payments": [_tuition_payment_payload(db, row) for row in visible],
    }


def _get_tuition_payment(db: Session, academy_id: str, payment_id: UUID) -> StudentTuitionPayment:
    payment = db.get(StudentTuitionPayment, payment_id)
    if not payment or payment.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="수강료 알림을 찾을 수 없습니다.")
    return payment


@router.post("/tuition/{payment_id}/paid")
def confirm_tuition_paid(payment_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    payment = _get_tuition_payment(db, academy_id, payment_id)
    now = _now()
    payment.status = "paid"
    payment.paid_at = now
    payment.confirmed_by = current_user_id(request)
    payment.updated_at = now
    db.commit()
    db.refresh(payment)
    return _tuition_payment_payload(db, payment)


@router.post("/tuition/{payment_id}/remind")
def send_tuition_reminder(payment_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    payment = _get_tuition_payment(db, academy_id, payment_id)
    membership = db.get(StudentAcademyMembership, payment.student_membership_id)
    if not membership:
        raise HTTPException(status_code=404, detail="학생 정보를 찾을 수 없습니다.")
    settings = _tuition_settings_from_metadata(membership.metadata_json)
    guardian_phone = settings.get("guardian_phone")
    if not guardian_phone:
        raise HTTPException(status_code=400, detail="보호자 연락처가 없습니다.")
    class_row = db.get(AcademyClass, payment.class_id) if payment.class_id else None
    event = db.get(ClassScheduleEvent, payment.due_event_id) if payment.due_event_id else None
    body = _tuition_reminder_body(payment, membership, class_row, event)
    now = _now()
    payment.reminder_count += 1
    payment.reminder_sent_at = now
    payment.reminder_message = body
    if payment.status == "pending":
        payment.status = "reminded"
    payment.updated_at = now
    db.commit()
    db.refresh(payment)
    return {
        "payment": _tuition_payment_payload(db, payment),
        "guardian_phone": guardian_phone,
        "message_body": body,
        "sms_url": f"sms:{guardian_phone}?body={quote(body, safe='')}",
    }


@router.patch("/tuition/events/{event_id}")
def update_tuition_event_count(event_id: UUID, payload: TuitionEventCountPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    event = db.get(ClassScheduleEvent, event_id)
    if not event or event.academy_id not in visible_academy_ids:
        raise HTTPException(status_code=404, detail="수업 일정을 찾을 수 없습니다.")
    event.counts_for_tuition = payload.counts_for_tuition
    event.updated_at = _now()
    if not payload.counts_for_tuition:
        rows = db.scalars(
            select(StudentTuitionPayment).where(
                StudentTuitionPayment.academy_id == academy_id,
                StudentTuitionPayment.due_event_id == event.id,
                StudentTuitionPayment.status.in_(["pending", "reminded"]),
            )
        ).all()
        for row in rows:
            row.status = "excluded"
            row.updated_at = _now()
    db.commit()
    return _schedule_event_payload(event)


@router.put("/tuition/events/{event_id}/students/{student_id}/adjustment")
def update_tuition_session_adjustment(event_id: UUID, student_id: UUID, payload: TuitionSessionAdjustmentPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    event = db.get(ClassScheduleEvent, event_id)
    if not event or event.academy_id not in visible_academy_ids:
        raise HTTPException(status_code=404, detail="수업 일정을 찾을 수 없습니다.")
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    adjustment = db.scalar(
        select(StudentTuitionSessionAdjustment).where(
            StudentTuitionSessionAdjustment.event_id == event.id,
            StudentTuitionSessionAdjustment.student_membership_id == membership.id,
        )
    )
    if not adjustment:
        adjustment = StudentTuitionSessionAdjustment(
            academy_id=academy_id,
            event_id=event.id,
            student_membership_id=membership.id,
        )
        db.add(adjustment)
    adjustment.counts_for_tuition = payload.counts_for_tuition
    adjustment.reason = _clean_optional_text(payload.reason)
    adjustment.note = _clean_optional_text(payload.note)
    adjustment.updated_by = current_user_id(request)
    adjustment.updated_at = _now()
    payment = db.scalar(
        select(StudentTuitionPayment).where(
            StudentTuitionPayment.academy_id == academy_id,
            StudentTuitionPayment.student_membership_id == membership.id,
            StudentTuitionPayment.due_event_id == event.id,
        )
    )
    if payment and payment.status in {"pending", "reminded", "excluded"}:
        payment.status = "pending" if payload.counts_for_tuition else "excluded"
        payment.updated_at = _now()
    db.commit()
    return {
        "event": _schedule_event_payload(event),
        "student_membership_id": str(membership.id),
        "counts_for_tuition": adjustment.counts_for_tuition,
        "reason": adjustment.reason,
        "note": adjustment.note,
    }


@router.get("/routines")
def list_routines(request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    actor_id = current_user_id(request)
    try:
        _ensure_routine_candidates(db, academy_id, visible_academy_ids, actor_id)
    except Exception:
        db.rollback()
        logger.exception("Routine candidate generation failed for academy %s", academy_id)
    recent_start = (_parse_routine_datetime(_now()) or _now()) - timedelta(days=ROUTINE_RECENT_DAYS)
    actions = db.scalars(
        select(RoutineAction)
        .where(RoutineAction.academy_id == academy_id)
        .order_by(RoutineAction.updated_at.desc(), RoutineAction.created_at.desc())
        .limit(80)
    ).all()
    visible = [
        action
        for action in actions
        if action.status in ROUTINE_ACTIVE_STATUSES or not action.sent_at or (_parse_routine_datetime(action.sent_at) or datetime.min) >= recent_start
    ]
    payloads = []
    for action in visible[:50]:
        action_id = str(action.id)
        try:
            payloads.append(_routine_action_payload(action))
        except Exception:
            db.rollback()
            logger.exception("Skipping routine action payload %s", action_id)
    return payloads


def _get_routine_action(db: Session, academy_id: str, routine_id: UUID) -> RoutineAction:
    action = db.get(RoutineAction, routine_id)
    if not action or action.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="Routine action not found.")
    return action


@router.post("/routines/{routine_id}/refresh-ai")
def refresh_routine_ai(routine_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    action = _get_routine_action(db, academy_id, routine_id)
    if action.status == "sent":
        raise HTTPException(status_code=400, detail="이미 전송된 루틴은 다시 생성할 수 없습니다.")
    source_context = (action.ai_payload or {}).get("source") if isinstance(action.ai_payload, dict) else {}
    _apply_routine_ai(action, {"source": source_context or {}})
    action.status = "reviewing"
    action.updated_at = _now()
    db.commit()
    db.refresh(action)
    return _routine_action_payload(action)


@router.patch("/routines/{routine_id}/messages/{message_id}")
def update_routine_message(routine_id: UUID, message_id: UUID, payload: RoutineMessagePatchPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    action = _get_routine_action(db, academy_id, routine_id)
    if action.status == "sent":
        raise HTTPException(status_code=400, detail="이미 전송된 루틴 메시지는 수정할 수 없습니다.")
    message = db.get(RoutineMessage, message_id)
    if not message or message.action_id != action.id:
        raise HTTPException(status_code=404, detail="Routine message not found.")
    if payload.message_body is not None:
        body = payload.message_body.strip()
        if not body:
            raise HTTPException(status_code=400, detail="메시지 내용을 입력해 주세요.")
        message.message_body = body
    if payload.status is not None:
        if payload.status not in {"pending", "excluded"}:
            raise HTTPException(status_code=400, detail="Routine message status must be pending or excluded.")
        message.status = payload.status
        message.delivery_status = "skipped" if payload.status == "excluded" else "draft"
    message.updated_at = _now()
    action.status = "reviewing"
    action.updated_at = _now()
    db.commit()
    db.refresh(action)
    return _routine_action_payload(action)


@router.post("/routines/{routine_id}/send")
def send_routine_action(routine_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    actor_id = current_user_id(request)
    action = _get_routine_action(db, academy_id, routine_id)
    messages = [message for message in action.messages if message.status != "excluded"]
    if not messages:
        raise HTTPException(status_code=400, detail="전송할 메시지가 없습니다.")
    now = _now()
    for message in messages:
        if message.delivery_status == "sent" and message.notification_id:
            continue
        notification = StudentNotification(
            student_user_id=message.student_user_id,
            academy_id=academy_id,
            notification_type="routine_message",
            title=action.title,
            body=message.message_body,
            metadata_json={
                "routine_action_id": str(action.id),
                "routine_message_id": str(message.id),
                "routine_type": action.routine_type,
                "source_type": action.source_type,
                "source_id": action.source_id,
                "channel": ROUTINE_CHANNEL,
            },
        )
        db.add(notification)
        db.flush()
        message.notification_id = notification.id
        message.status = "sent"
        message.delivery_status = "sent"
        message.sent_at = now
        message.updated_at = now
    for message in action.messages:
        if message.status == "excluded":
            message.delivery_status = "skipped"
            message.updated_at = now
    action.status = "sent"
    action.approved_by = actor_id
    action.approved_at = action.approved_at or now
    action.sent_at = now
    action.updated_at = now
    db.commit()
    db.refresh(action)
    return _routine_action_payload(action)


@router.get("/students")
def list_students(request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    _normalize_legacy_student_keys(db, academy_id, visible_academy_ids, current_user_id(request))
    linked_student_ids = db.scalars(
        select(ClassStudent.student_membership_id)
        .join(AcademyClass, AcademyClass.id == ClassStudent.class_id)
        .where(
            AcademyClass.academy_id.in_(list(visible_academy_ids)),
            ClassStudent.left_at.is_(None),
        )
    ).all()
    rows = _visible_student_memberships(db, visible_academy_ids, linked_student_ids)
    return [_safe_student_payload(db, academy_id, row) for row in rows]

@router.post("/students")
def create_student(payload: StudentPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    actor_id = current_user_id(request)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Student name is required.")
    student_user_id = f"manual-{uuid.uuid4().hex[:24]}"
    person_id = str(uuid.uuid4())
    class_rows: list[AcademyClass | None] = []
    seen_class_ids: set[str] = set()
    for class_id in payload.class_ids:
        class_row = _get_class(db, academy_id, class_id)
        if str(class_row.id) in seen_class_ids:
            continue
        seen_class_ids.add(str(class_row.id))
        class_rows.append(class_row)
    if not class_rows:
        class_rows.append(None)

    created: list[tuple[StudentAcademyMembership, AcademySeat, str]] = []
    for class_row in class_rows:
        seat, invite_code = create_seat(db, academy_id, name, class_id=class_row.id if class_row else None)
        metadata = {
            "grade_level": _clean_optional_text(payload.grade_level),
            "school": _clean_optional_text(payload.school),
            "memo": _clean_optional_text(payload.memo),
            "invite_code": invite_code,
            STUDENT_PERSON_METADATA_KEY: person_id,
        }
        metadata = _set_tuition_metadata(
            metadata,
            guardian_name=payload.guardian_name,
            guardian_phone=payload.guardian_phone,
            enabled=payload.tuition_enabled,
            cycle_sessions=payload.tuition_cycle_sessions,
            amount=payload.tuition_amount,
        )
        membership = StudentAcademyMembership(
            student_user_id=student_user_id,
            academy_id=academy_id,
            academy_seat_id=seat.id,
            display_name_in_academy=name,
            status=payload.status,
            created_by=actor_id,
            metadata_json=metadata,
        )
        db.add(membership)
        db.flush()
        seat.current_student_membership_id = membership.id
        db.add(SeatAssignmentHistory(academy_seat_id=seat.id, academy_id=academy_id, student_user_id=student_user_id, membership_id=membership.id))
        if class_row:
            db.add(ClassStudent(class_id=class_row.id, student_membership_id=membership.id))
        created.append((membership, seat, invite_code))
    db.commit()
    membership, _, invite_code = created[0]
    data = _student_payload(db, academy_id, membership)
    data["invite_code"] = invite_code
    data["invite_codes"] = [
        entry
        for entry in (
            _invite_code_entry(db, created_membership, created_seat, created_code)
            for created_membership, created_seat, created_code in created
        )
        if entry
    ]
    return data


@router.post("/students/{student_id}/invite-code")
def ensure_student_invite_code(student_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    _normalize_legacy_student_keys(db, academy_id, visible_academy_ids, current_user_id(request))
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    entries = [
        entry
        for entry in (_ensure_membership_invite_code(db, visible_academy_ids, row) for row in _related_student_key_memberships(db, visible_academy_ids, membership))
        if entry
    ]
    if not entries:
        raise HTTPException(status_code=404, detail="Student key seat not found.")
    db.commit()
    first = entries[0]
    return {
        "invite_code": first.get("invite_code"),
        "invite_code_preview": first.get("invite_code_preview"),
        "invite_codes": entries,
    }


@router.get("/students/{student_id}")
def get_student(student_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    _ensure_exported_review_session_assigned(db, academy_id)
    try:
        membership = _visible_membership_by_id(db, visible_academy_ids, student_id)
    except SQLAlchemyError:
        db.rollback()
        membership = next((row for row in _visible_student_memberships(db, visible_academy_ids) if str(row.id) == str(student_id)), None)
        if not membership:
            raise HTTPException(status_code=404, detail="Student not found.")

    try:
        data = _student_payload(db, academy_id, membership)
    except Exception:
        db.rollback()
        metadata = membership.metadata_json or {}
        data = {
            "id": str(membership.id),
            "student_user_id": membership.student_user_id,
            "student_person_id": _student_person_id(membership),
            "academy_seat_id": str(membership.academy_seat_id),
            "invite_code": metadata.get("invite_code"),
            "invite_code_preview": None,
            "invite_codes": [],
            "name": _student_name(membership),
            "grade_level": metadata.get("grade_level") or metadata.get("grade"),
            "school": metadata.get("school"),
            "status": membership.status or "active",
            "status_chip": "Active",
            "memo": metadata.get("memo"),
            "tuition": _tuition_settings_from_metadata(metadata),
            "class_ids": [],
            "class_names": [],
            "class_subjects": [],
            "recent_score": None,
            "recent_completion_status": "not_started",
            "unresolved_wrong_count": 0,
            "recent_weakness_label": None,
            "joined_at": membership.joined_at.isoformat() if membership.joined_at else None,
        }

    results: list[PaperSessionResult] = []
    sessions: dict[UUID, PaperSession] = {}
    try:
        results = _safe_scalars(
            db,
            select(PaperSessionResult)
            .where(PaperSessionResult.academy_id.in_(list(visible_academy_ids)))
            .order_by(PaperSessionResult.created_at.desc()),
        )
        results = [result for result in results if str(result.student_membership_id) == str(student_id)]
        result_session_ids = {str(result.paper_session_id) for result in results}
        sessions = {
            row.id: row
            for row in _safe_scalars(
                db,
                select(PaperSession)
                .where(PaperSession.academy_id.in_(list(visible_academy_ids)))
                .options(joinedload(PaperSession.content_version)),
            )
            if str(row.id) in result_session_ids
        }
    except Exception:
        db.rollback()
        results = []
        sessions = {}

    try:
        wrongs = _wrong_answer_rows(db, academy_id, student_user_ids=[membership.student_user_id], academy_ids=visible_academy_ids)
    except Exception:
        db.rollback()
        wrongs = []

    history = []
    for result in results:
        session = sessions.get(result.paper_session_id)
        session_payload = _safe_session_summary(db, session.academy_id, session) if session else None
        if session_payload and session:
            session_payload["problems"] = _session_problems_for_response(db, session)
        history.append(
            {
                **_result_payload(result),
                "session": session_payload,
                "problem_results": [],
            }
        )
    data["paper_session_history"] = history
    result_ids = [result.id for result in results]
    result_id_set = {str(result_id) for result_id in result_ids}
    if result_ids:
        problem_results = _safe_scalars(
            db,
            select(ProblemResult)
            .where(
                ProblemResult.academy_id.in_(list(visible_academy_ids)),
            )
            .order_by(ProblemResult.problem_number),
        )
        problem_results = [row for row in problem_results if str(row.paper_session_result_id) in result_id_set]
        by_result: dict[str, list[dict]] = {}
        for row in problem_results:
            by_result.setdefault(str(row.paper_session_result_id), []).append(
                {
                    "id": str(row.id),
                    "problem_id": str(row.problem_id),
                    "problem_number": row.problem_number,
                    "result_status": row.result_status,
                }
            )
        for item in data["paper_session_history"]:
            item["problem_results"] = by_result.get(item["id"], [])

    class_ids = []
    for value in data.get("class_ids", []):
        try:
            class_ids.append(UUID(str(value)))
        except (TypeError, ValueError):
            continue
    class_id_set = {str(value) for value in class_ids}
    if class_ids:
        events = _safe_scalars(
            db,
            select(ClassScheduleEvent)
            .where(ClassScheduleEvent.academy_id.in_(list(visible_academy_ids)))
            .order_by(ClassScheduleEvent.starts_at.asc())
            .limit(500),
        )
        events = [event for event in events if str(event.class_id) in class_id_set]
        data["schedule_events"] = [_schedule_event_payload(event) for event in events]
    else:
        data["schedule_events"] = []

    try:
        data["counseling_formats"] = [_counseling_format_for_class(db, academy_id, class_id) for class_id in class_ids]
    except Exception:
        db.rollback()
        data["counseling_formats"] = []
    try:
        data["counseling_presets"] = _counseling_presets(db, academy_id)
    except Exception:
        db.rollback()
        data["counseling_presets"] = []
    data["counseling_logs"] = _counseling_logs(membership)
    data["wrong_answers"] = wrongs
    data["analytics"] = {
        "graded_count": len([result for result in results if result.status == "graded"]),
        "average_score": (
            sum(float(result.score or 0) for result in results if result.score is not None) / len([result for result in results if result.score is not None])
            if any(result.score is not None for result in results)
            else None
        ),
        "unresolved_wrong_count": len([row for row in wrongs if row["resolved_status"] in {"unresolved", "reviewing"}]),
    }
    return data


@router.post("/students/{student_id}/merge")
def merge_student(student_id: UUID, payload: StudentMergePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    left = _get_membership(db, academy_id, student_id, visible_academy_ids)
    right = _get_membership(db, academy_id, payload.other_student_id, visible_academy_ids)
    if str(left.id) == str(right.id):
        raise HTTPException(status_code=400, detail="Select a different student to merge.")
    if left.academy_id != right.academy_id:
        raise HTTPException(status_code=400, detail="Students from different academy contexts cannot be merged.")

    primary, secondary = sorted(
        [left, right],
        key=lambda membership: (membership.joined_at or datetime.min, str(membership.id)),
    )
    counts = {
        "class_links": 0,
        "paper_session_results": 0,
        "wrong_answers": 0,
        "membership_rows": 0,
        "student_user_rows": 0,
        "usage_rows": 0,
    }
    try:
        _merge_membership_metadata(primary, secondary)
        _merge_seats(db, primary, secondary)
        counts["class_links"] = _merge_class_links(db, primary, secondary)
        counts["paper_session_results"] = _merge_paper_session_results(db, visible_academy_ids, primary, secondary)
        counts["wrong_answers"] = _merge_wrong_answer_records(db, visible_academy_ids, primary, secondary)
        counts["membership_rows"] = _merge_membership_rows(db, visible_academy_ids, primary, secondary)
        counts["student_user_rows"] = _merge_direct_student_user_rows(db, visible_academy_ids, primary, secondary)
        counts["usage_rows"] = _merge_daily_quota_usage(db, primary, secondary)

        for event in db.scalars(
            select(CalendarEvent).where(
                CalendarEvent.owner_type == "student",
                CalendarEvent.owner_id == secondary.student_user_id,
                (CalendarEvent.academy_id.is_(None)) | (CalendarEvent.academy_id.in_(list(visible_academy_ids))),
            )
        ).all():
            event.owner_id = primary.student_user_id
            event.updated_at = _now()

        secondary.status = "merged"
        secondary.ended_at = _now()
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Student merge failed. Please try again.") from exc

    return {
        "primary_student_id": str(primary.id),
        "merged_student_id": str(secondary.id),
        "primary_student": _student_payload(db, academy_id, primary),
        "counts": counts,
    }


@router.get("/students/{student_id}/exam-stats-series")
def student_exam_stats_series(student_id: UUID, request: Request, start_date: str | None = None, end_date: str | None = None, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    start = _date_boundary(start_date)
    end = _date_boundary(end_date, end=True)
    rows = db.execute(
        select(PaperSessionResult, PaperSession)
        .join(PaperSession, _id_columns_equal(PaperSession.id, PaperSessionResult.paper_session_id))
        .where(
            PaperSessionResult.academy_id.in_(list(visible_academy_ids)),
            PaperSessionResult.student_membership_id == membership.id,
            PaperSessionResult.status == "graded",
            PaperSessionResult.score.is_not(None),
        )
        .order_by(PaperSession.scheduled_at.asc().nullslast(), PaperSessionResult.graded_at.asc().nullslast(), PaperSessionResult.updated_at.asc())
    ).all()
    points: list[dict] = []
    for result, session in rows:
        event_at = session.scheduled_at or result.graded_at or result.updated_at or result.created_at
        if not event_at:
            continue
        if start and event_at < start:
            continue
        if end and event_at > end:
            continue
        session_results = db.scalars(
            select(PaperSessionResult).where(
                PaperSessionResult.academy_id.in_(list(visible_academy_ids)),
                PaperSessionResult.paper_session_id == session.id,
            )
        ).all()
        stats = _score_distribution(session_results)
        points.append(
            {
                "id": str(session.id),
                "title": session.title,
                "date": event_at.date().isoformat(),
                "student_score": _decimal_float(result.score),
                "average": stats["average_score"],
                "highest": stats["highest_score"],
                "lowest": stats["lowest_score"],
                "q1": stats["q1_score"],
                "q2": stats["q2_score"],
                "q3": stats["q3_score"],
                "stddev": stats["score_standard_deviation"],
                "respondents": stats["respondent_count"],
            }
        )
    return points[:200]


@router.post("/counseling/transcribe", response_model=CounselingTranscriptionResponse)
async def transcribe_counseling_audio(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    _student_management_academy_id(request, db)
    content_type = (file.content_type or "").lower()
    if content_type and not (content_type.startswith("audio/") or content_type in {"video/webm", "application/octet-stream"}):
        raise HTTPException(status_code=400, detail="상담 녹음 파일만 전사할 수 있습니다.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="전사할 녹음 파일이 없습니다.")
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="녹음 파일은 50MB 이하만 전사할 수 있습니다.")

    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="AI 음성 전사를 위한 OPENAI_API_KEY가 설정되어 있지 않습니다.")

    client = OpenAI(api_key=settings.openai_api_key, timeout=max(settings.ai_request_timeout_seconds, 120))
    try:
        text, model_name = _transcribe_audio_bytes(client, file.filename or "counseling-audio.webm", content)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI 음성 전사에 실패했습니다: {exc}") from exc
    return {"text": text, "model": model_name}


@router.post("/counseling/intake-preview", response_model=CounselingIntakeResponse)
def preview_counseling_intake(payload: CounselingIntakePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership: StudentAcademyMembership | None = None
    class_names: list[str] = []
    if payload.student_id:
        membership = _get_membership(db, academy_id, payload.student_id, visible_academy_ids)
        class_names = [
            row.name
            for row in db.scalars(
                select(AcademyClass)
                .join(ClassStudent, _id_columns_equal(ClassStudent.class_id, AcademyClass.id))
                .where(
                    _id_equals(ClassStudent.student_membership_id, membership.id),
                    ClassStudent.left_at.is_(None),
                    AcademyClass.academy_id.in_(list(visible_academy_ids)),
                )
                .order_by(AcademyClass.name)
            ).all()
        ]

    settings = get_settings()
    if not settings.openai_api_key:
        return _coerce_counseling_intake_response(_fallback_counseling_intake(payload), payload)

    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.ai_request_timeout_seconds)
    try:
        parsed = _counseling_chat_completion_json(client, settings.ai_model, _counseling_intake_prompt(payload, membership, class_names), max_output_tokens=2048)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI 상담 정보 추출에 실패했습니다: {exc}") from exc
    return _coerce_counseling_intake_response(parsed, payload)


@router.post("/students/{student_id}/counseling-logs/clean-preview", response_model=CounselingCleanPreviewResponse)
def clean_counseling_log_preview(student_id: UUID, payload: CounselingCleanPreviewPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    class_row = _resolve_counseling_class(db, academy_id, membership, payload.class_id)
    sections = [section for section in _counseling_payload_sections(payload) if section.get("include_in_report") is not False]
    if not any(str(section.get("value") or "").strip() for section in sections):
        raise HTTPException(status_code=400, detail="AI로 정리할 상담 내용이 없습니다.")

    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="AI 상담일지 정리를 위한 OPENAI_API_KEY가 설정되어 있지 않습니다.")

    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.ai_request_timeout_seconds)
    prompt = _counseling_clean_prompt(membership, class_row, payload, sections)
    try:
        ai_payload = _counseling_chat_completion_json(client, settings.ai_model, prompt)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI 상담일지 정리에 실패했습니다: {exc}") from exc

    return {"sections": _align_cleaned_counseling_sections(sections, ai_payload.get("sections"))}


@router.post("/students/{student_id}/counseling-logs")
def create_counseling_log(student_id: UUID, payload: CounselingLogPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    class_row = _resolve_counseling_class(db, academy_id, membership, payload.class_id)
    row = _counseling_log_row(payload, request, membership, class_row)
    metadata = dict(membership.metadata_json or {})
    logs = _counseling_logs(membership)
    metadata["counseling_logs"] = [row, *logs][:200]
    membership.metadata_json = metadata
    db.commit()
    return row


@router.put("/students/{student_id}/counseling-logs/{log_id}")
def update_counseling_log(student_id: UUID, log_id: str, payload: CounselingLogPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    logs = _counseling_logs(membership)
    existing = next((row for row in logs if str(row.get("id")) == log_id), None)
    if not existing:
        raise HTTPException(status_code=404, detail="Counseling log not found.")
    class_row = _resolve_counseling_class(db, academy_id, membership, payload.class_id)
    row = _counseling_log_row(payload, request, membership, class_row, existing=existing)
    metadata = dict(membership.metadata_json or {})
    metadata["counseling_logs"] = [row if str(item.get("id")) == log_id else item for item in logs][:200]
    membership.metadata_json = metadata
    db.commit()
    return row


@router.delete("/students/{student_id}/counseling-logs/{log_id}", status_code=204)
def delete_counseling_log(student_id: UUID, log_id: str, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    logs = _counseling_logs(membership)
    if not any(str(row.get("id")) == log_id for row in logs):
        raise HTTPException(status_code=404, detail="Counseling log not found.")
    metadata = dict(membership.metadata_json or {})
    metadata["counseling_logs"] = [row for row in logs if str(row.get("id")) != log_id][:200]
    membership.metadata_json = metadata
    db.commit()
    return Response(status_code=204)


def _safe_export_filename(value: str) -> str:
    return re.sub(r"[\\/:*?\"<>|]+", "_", value).strip() or "counseling-log"


def _short_export_date(value: str | None) -> str:
    if not value:
        return ""
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%Y.%m.%d")
    except ValueError:
        return str(value)[:10]


def _counseling_export_sections(logs: list[dict]) -> list[dict]:
    sections: list[dict] = []
    multiple = len(logs) > 1
    for log_index, log in enumerate(logs, start=1):
        title = str(log.get("title") or "학습 상담")
        date = _short_export_date(str(log.get("counseling_date") or ""))
        if multiple:
            sections.append({"label": f"{log_index}. {date} {title}".strip(), "value": str(log.get("class_name") or "")})
        raw_sections = _normalize_counseling_sections(log.get("sections") if isinstance(log.get("sections"), list) else None)
        if not raw_sections:
            raw_sections = [
                {"field_id": "notes", "label": "상담 내용", "value": str(log.get("notes") or ""), "include_in_report": True},
                {"field_id": "weekly_report", "label": "주간 리포트", "value": str(log.get("weekly_report") or ""), "include_in_report": False},
                {"field_id": "next_plan", "label": "다음 지도 계획", "value": str(log.get("next_plan") or ""), "include_in_report": True},
            ]
        sections.extend([section for section in raw_sections if str(section.get("value") or "").strip()])
    return sections


def _counseling_export_values(membership: StudentAcademyMembership, logs: list[dict], title: str) -> dict:
    first = logs[0]
    sections = _counseling_export_sections(logs)
    values = {
        "exam_title": title,
        "test_title": title,
        "counseling_title": str(first.get("title") or title),
        "counseling_date": _short_export_date(str(first.get("counseling_date") or "")),
        "date": str(first.get("counseling_date") or "")[:10],
        "student_name": _student_name(membership),
        "class_name": str(first.get("class_name") or ""),
        "counseling_notes": str(first.get("notes") or ""),
        "counseling_weekly_report": str(first.get("weekly_report") or ""),
        "counseling_next_plan": str(first.get("next_plan") or ""),
        "counseling_sections": sections,
        "printed_at": datetime.now().strftime("%Y.%m.%d %H:%M"),
        "include_solution": False,
    }
    for section in _normalize_counseling_sections(first.get("sections") if isinstance(first.get("sections"), list) else None):
        key = str(section.get("field_id") or "").strip()
        if key:
            values[f"counseling_{key}"] = str(section.get("value") or "")
    return values


@router.post("/students/{student_id}/counseling-logs/export")
def export_counseling_logs(student_id: UUID, payload: CounselingExportPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    logs = _counseling_logs(membership)
    if payload.log_ids:
        selected_ids = {str(item) for item in payload.log_ids}
        selected_logs = [row for row in logs if str(row.get("id")) in selected_ids]
        missing = selected_ids - {str(row.get("id")) for row in selected_logs}
        if missing:
            raise HTTPException(status_code=404, detail="Counseling log not found.")
    else:
        selected_logs = logs
    if not selected_logs:
        raise HTTPException(status_code=400, detail="No counseling logs selected.")

    template = db.get(HubTemplate, payload.hub_template_id)
    owner_id = current_workspace_id(request, db, permission="can_manage_materials")
    if not template or (template.visibility == "private" and template.owner_id != owner_id):
        raise HTTPException(status_code=404, detail="Counseling template not found.")
    if template.category != "counseling_log":
        raise HTTPException(status_code=400, detail="상담일지 템플릿만 선택할 수 있습니다.")

    title = (payload.title or selected_logs[0].get("title") or "상담일지").strip()
    values = _counseling_export_values(membership, selected_logs, title)
    template.use_count += 1
    db.commit()

    filename = f"{_safe_export_filename(_student_name(membership))}_{_safe_export_filename(title)}"
    encoded_pdf = quote(f"{filename}.pdf", safe="")
    if isinstance(template.schema_json, dict) and isinstance(template.schema_json.get("visualTemplateSet"), dict):
        buffer = generate_hub_context_pdf(template, values)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=counseling.pdf; filename*=UTF-8''{encoded_pdf}"},
        )

    html = render_hub_template_for_context(template, values)
    encoded_html = quote(f"{filename}.html", safe="")
    return StreamingResponse(
        iter([html.encode("utf-8")]),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=counseling.html; filename*=UTF-8''{encoded_html}"},
    )


@router.patch("/students/{student_id}")
def update_student(student_id: UUID, payload: StudentUpdatePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    changes = payload.model_dump(exclude_unset=True)
    metadata = dict(membership.metadata_json or {})
    if "name" in changes and changes["name"] is not None:
        name = changes.pop("name").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Student name is required.")
        membership.display_name_in_academy = name
    if "status" in changes and changes["status"] is not None:
        membership.status = changes.pop("status")
        if membership.status != "active":
            membership.ended_at = _now()
    class_ids = changes.pop("class_ids", None)
    tuition_kwargs = {}
    for source_key, target_key in (
        ("guardian_name", "guardian_name"),
        ("guardian_phone", "guardian_phone"),
        ("tuition_enabled", "enabled"),
        ("tuition_cycle_sessions", "cycle_sessions"),
        ("tuition_amount", "amount"),
    ):
        if source_key in changes:
            tuition_kwargs[target_key] = changes.pop(source_key)
    if tuition_kwargs:
        metadata = _set_tuition_metadata(metadata, **tuition_kwargs)
    for key, value in changes.items():
        metadata[key] = value
    membership.metadata_json = metadata
    if class_ids is not None:
        db.execute(delete(ClassStudent).where(ClassStudent.student_membership_id == membership.id))
        for class_id in class_ids:
            _get_class(db, academy_id, class_id, visible_academy_ids)
            db.add(ClassStudent(class_id=class_id, student_membership_id=membership.id))
    db.commit()
    return _student_payload(db, academy_id, membership)


@router.delete("/students/{student_id}", status_code=204)
def delete_student(student_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    membership = _get_membership(db, academy_id, student_id, visible_academy_ids)
    membership.status = "inactive"
    membership.ended_at = _now()
    seat = db.get(AcademySeat, membership.academy_seat_id)
    if seat and seat.current_student_membership_id == membership.id:
        seat.current_student_membership_id = None
        seat.released_at = _now()
    db.commit()
    return Response(status_code=204)


@router.get("/paper-sessions")
def list_paper_sessions(request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    sessions = db.scalars(
        select(PaperSession)
        .where(PaperSession.academy_id.in_(list(visible_academy_ids)))
        .options(joinedload(PaperSession.content_version))
        .order_by(PaperSession.scheduled_at.desc().nullslast(), PaperSession.created_at.desc())
    ).all()
    return [_session_summary(db, session.academy_id, session) for session in sessions]


@router.post("/paper-sessions")
def create_paper_session(payload: PaperSessionPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    owner_id = current_workspace_id(request, db, permission="can_manage_materials")
    if payload.source_problem_set_id:
        version = _problem_set_snapshot(db, owner_id, academy_id, payload.source_problem_set_id, owner_id)
    elif payload.source_batch_id:
        version = _batch_snapshot(db, owner_id, academy_id, payload.source_batch_id, owner_id)
    elif payload.problem_ids:
        version = _problem_selection_snapshot(db, owner_id, academy_id, payload.problem_ids, payload.title.strip(), owner_id)
    else:
        raise HTTPException(status_code=400, detail="Select a problem set, batch, or at least one problem.")
    targets = _target_memberships(db, academy_id, payload.class_ids, payload.student_membership_ids)
    if not targets:
        raise HTTPException(status_code=400, detail="Select at least one class or student with active students.")
    class_ids = _uuid_list(payload.class_ids)
    direct_student_ids = _uuid_list(payload.student_membership_ids)
    if class_ids and direct_student_ids:
        target_type = "mixed"
    elif class_ids:
        target_type = "class"
    else:
        target_type = "students"
    session = PaperSession(
        academy_id=academy_id,
        title=payload.title.strip(),
        description=payload.description,
        source_problem_set_id=payload.source_problem_set_id,
        source_archive_id=str(payload.source_batch_id) if payload.source_batch_id else None,
        content_version_id=version.id,
        content_version=version,
        session_type=payload.session_type,
        target_type=payload.target_type or target_type,
        class_ids=class_ids,
        student_membership_ids=[str(target.id) for target in targets],
        scheduled_at=payload.scheduled_at,
        due_at=payload.due_at,
        status=payload.status,
        created_by=owner_id,
    )
    db.add(session)
    db.flush()
    total_count = len(_session_problems(session))
    for target in targets:
        db.add(
            PaperSessionResult(
                academy_id=academy_id,
                paper_session_id=session.id,
                student_membership_id=target.id,
                student_user_id=target.student_user_id,
                status="pending_grading",
                total_count=total_count,
            )
        )
    if payload.create_calendar_events and payload.scheduled_at and payload.class_ids:
        for class_id in payload.class_ids:
            db.add(
                ClassScheduleEvent(
                    academy_id=academy_id,
                    class_id=class_id,
                    title=payload.title.strip(),
                    description=payload.description,
                    event_type=payload.session_type,
                    starts_at=payload.scheduled_at,
                    ends_at=payload.due_at,
                    linked_paper_session_id=session.id,
                )
            )
    db.commit()
    return _session_summary(db, academy_id, _get_session(db, academy_id, session.id))


@router.get("/paper-sessions/{session_id}")
def get_paper_session(session_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    session = _get_visible_session(db, _student_management_academy_ids(request, db, academy_id), session_id)
    return _paper_session_detail(db, academy_id, session)


@router.get("/paper-sessions/{session_id}/grading")
def get_grading_state(session_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    session = _get_visible_session(db, _student_management_academy_ids(request, db, academy_id), session_id)
    return _paper_session_detail(db, academy_id, session)


def _result_payload(result: PaperSessionResult) -> dict:
    return {
        "id": str(result.id),
        "paper_session_id": str(result.paper_session_id),
        "student_membership_id": str(result.student_membership_id),
        "student_user_id": result.student_user_id,
        "status": result.status,
        "score": _decimal_float(result.score),
        "correct_count": result.correct_count,
        "wrong_count": result.wrong_count,
        "total_count": result.total_count,
        "graded_by": result.graded_by,
        "graded_at": result.graded_at.isoformat() if result.graded_at else None,
        "updated_at": result.updated_at.isoformat() if result.updated_at else None,
    }


def _paper_session_detail(db: Session, academy_id: str, session: PaperSession) -> dict:
    session_academy_id = session.academy_id or academy_id
    results = _safe_scalars(
        db,
        select(PaperSessionResult)
        .where(PaperSessionResult.academy_id == session_academy_id, PaperSessionResult.paper_session_id == session.id)
        .order_by(PaperSessionResult.created_at)
    )
    memberships = {
        row.id: row
        for row in _safe_scalars(
            db,
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.id.in_([result.student_membership_id for result in results] or [uuid.uuid4()]),
            )
        )
    }
    problem_results = _safe_scalars(
        db,
        select(ProblemResult).where(ProblemResult.academy_id == session_academy_id, ProblemResult.paper_session_id == session.id),
    )
    by_result: dict[str, list[dict]] = {}
    for row in problem_results:
        by_result.setdefault(str(row.paper_session_result_id), []).append(
            {
                "id": str(row.id),
                "problem_id": str(row.problem_id),
                "problem_number": row.problem_number,
                "result_status": row.result_status,
            }
        )
    students = []
    for result in results:
        base = _safe_student_payload(db, academy_id, memberships[result.student_membership_id]) if result.student_membership_id in memberships else {}
        students.append(
            {
                **base,
                "result": _result_payload(result),
                "problem_results": sorted(by_result.get(str(result.id), []), key=lambda item: item["problem_number"]),
            }
        )
    return {
        **(_session_summary(db, academy_id, session) or {}),
        "problems": _session_problems_for_response(db, session),
        "students": students,
    }


@router.delete("/paper-session-results/{result_id}", status_code=204)
def delete_paper_session_result(result_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    result = db.scalar(
        select(PaperSessionResult).where(
            PaperSessionResult.academy_id == academy_id,
            PaperSessionResult.id == result_id,
        )
    )
    if not result:
        raise HTTPException(status_code=404, detail="Paper session result not found.")

    session = _get_session(db, academy_id, result.paper_session_id)
    marker = f"paper_session:{result.paper_session_id}"
    wrong_rows = db.scalars(
        select(ProblemResult).where(
            ProblemResult.academy_id == academy_id,
            ProblemResult.paper_session_result_id == result.id,
            ProblemResult.result_status.in_(["wrong", "unanswered"]),
        )
    ).all()
    for row in wrong_rows:
        record = db.scalar(
            select(WrongAnswerRecord).where(
                WrongAnswerRecord.academy_id == academy_id,
                WrongAnswerRecord.student_id == result.student_user_id,
                WrongAnswerRecord.problem_id == row.problem_id,
            )
        )
        if not record:
            continue
        source_ids = [source for source in (record.source_assignment_ids or []) if source != marker]
        if source_ids:
            record.source_assignment_ids = source_ids
            record.wrong_count = max(1, record.wrong_count - 1)
            record.updated_at = _now()
        else:
            db.delete(record)

    db.execute(delete(ProblemResult).where(ProblemResult.academy_id == academy_id, ProblemResult.paper_session_result_id == result.id))
    db.delete(result)
    remaining_results = db.scalars(
        select(PaperSessionResult).where(
            PaperSessionResult.academy_id == academy_id,
            PaperSessionResult.paper_session_id == session.id,
            PaperSessionResult.id != result.id,
        )
    ).all()
    if not remaining_results and session.status in {"grading", "completed"}:
        session.status = "exported" if session.exported_file_url else "scheduled"
    elif session.status == "completed" and any(row.status != "graded" for row in remaining_results):
        session.status = "grading"
    session.updated_at = _now()
    db.commit()
    return Response(status_code=204)


@router.post("/paper-sessions/{session_id}/grade")
def save_grade(session_id: UUID, payload: GradePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    actor_id = current_user_id(request)
    session = _get_visible_session(db, visible_academy_ids, session_id)
    membership = _get_membership(db, academy_id, payload.student_membership_id, visible_academy_ids)
    result = db.scalar(
        select(PaperSessionResult).where(
            PaperSessionResult.academy_id.in_(list(visible_academy_ids)),
            PaperSessionResult.paper_session_id == session.id,
            PaperSessionResult.student_membership_id == membership.id,
        )
    )
    if not result:
        result = PaperSessionResult(
            academy_id=session.academy_id,
            paper_session_id=session.id,
            student_membership_id=membership.id,
            student_user_id=membership.student_user_id,
            status="pending_grading",
        )
        db.add(result)
        db.flush()
    problems = _session_problems(session)
    if not problems:
        raise HTTPException(status_code=400, detail="Paper session has no versioned problems.")
    status_by_problem_id: dict[UUID, str] = {}
    status_by_number: dict[int, str] = {}
    wrong_numbers = _parse_wrong_numbers(payload.wrong_numbers)
    if payload.wrong_numbers is not None:
        valid_numbers = {int(problem["problem_number"]) for problem in problems}
        unknown = sorted(wrong_numbers - valid_numbers)
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown problem numbers: {', '.join(map(str, unknown))}")
        status_by_number = {number: ("wrong" if number in wrong_numbers else "correct") for number in valid_numbers}
    for item in payload.statuses:
        status = item.result_status
        if status not in {"correct", "wrong", "unanswered", "unmarked"}:
            raise HTTPException(status_code=400, detail="Result status must be correct, wrong, unanswered, or unmarked.")
        if item.problem_id:
            status_by_problem_id[item.problem_id] = status
        else:
            status_by_number[item.problem_number] = status
    existing = {
        row.problem_id: row
        for row in db.scalars(
            select(ProblemResult).where(
                ProblemResult.academy_id.in_(list(visible_academy_ids)),
                ProblemResult.paper_session_result_id == result.id,
            )
        ).all()
    }
    correct_count = wrong_count = unmarked_count = 0
    for problem in problems:
        problem_id = UUID(problem["problem_id"])
        number = int(problem["problem_number"])
        status = status_by_problem_id.get(problem_id) or status_by_number.get(number)
        if status is None:
            status = "correct" if payload.mark_unlisted_correct else "unmarked"
        row = existing.get(problem_id)
        was_wrong = bool(row and _is_wrong_result_status(row.result_status))
        if not row:
            row = ProblemResult(
                academy_id=session.academy_id,
                paper_session_id=session.id,
                paper_session_result_id=result.id,
                student_membership_id=membership.id,
                student_user_id=membership.student_user_id,
                problem_id=problem_id,
                problem_version_id=session.content_version_id,
                problem_number=number,
                result_status=status,
            )
            db.add(row)
        else:
            row.result_status = status
            row.problem_number = number
            row.problem_version_id = session.content_version_id
            row.updated_at = _now()
        if status == "correct":
            correct_count += 1
        elif _is_wrong_result_status(status):
            wrong_count += 1
        else:
            unmarked_count += 1
        _sync_wrong_answer(
            db,
            academy_id=session.academy_id,
            student_user_id=membership.student_user_id,
            problem_id=problem_id,
            problem_version_id=session.content_version_id,
            paper_session_id=session.id,
            was_wrong=was_wrong,
            is_wrong=_is_wrong_result_status(status),
            is_review_correct=session.session_type == "review" and status == "correct",
        )
    total_count = len(problems)
    graded_count = correct_count + wrong_count
    result.correct_count = correct_count
    result.wrong_count = wrong_count
    result.total_count = total_count
    result.score = round((correct_count / total_count) * 100, 2) if total_count else None
    result.status = "graded" if unmarked_count == 0 else "pending_grading"
    result.graded_by = actor_id
    result.graded_at = _now()
    result.updated_at = _now()
    session.status = "grading" if session.status in {"draft", "scheduled", "exported"} else session.status
    if graded_count == total_count:
        all_results = db.scalars(
            select(PaperSessionResult).where(
                PaperSessionResult.academy_id.in_(list(visible_academy_ids)),
                PaperSessionResult.paper_session_id == session.id,
            )
        ).all()
        if all(row.id == result.id or row.status == "graded" for row in all_results):
            session.status = "completed"
    session.updated_at = _now()
    db.commit()
    return _paper_session_detail(db, session.academy_id, _get_visible_session(db, visible_academy_ids, session.id))


def _wrong_answer_rows(
    db: Session,
    academy_id: str,
    student_user_ids: list[str] | None = None,
    academy_ids: set[str] | None = None,
) -> list[dict]:
    visible_academy_ids = set(academy_ids or {academy_id})
    visible_academy_ids.add(academy_id)
    stmt = (
        select(WrongAnswerRecord, Problem)
        .join(Problem, Problem.id == WrongAnswerRecord.problem_id)
        .where(WrongAnswerRecord.academy_id.in_(list(visible_academy_ids)))
        .order_by(WrongAnswerRecord.latest_wrong_at.desc())
    )
    if student_user_ids:
        stmt = stmt.where(WrongAnswerRecord.student_id.in_(student_user_ids))
    try:
        rows = db.execute(stmt).all()
    except SQLAlchemyError:
        db.rollback()
        return []
    membership_by_user = {
        row.student_user_id: row
        for row in _safe_scalars(
            db,
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.academy_id.in_(list(visible_academy_ids)),
                StudentAcademyMembership.student_user_id.in_([record.student_id for record, _ in rows] or [""]),
            ),
        )
    }
    result = []
    for record, problem in rows:
        membership = membership_by_user.get(record.student_id)
        tags = problem.tags
        result.append(
            {
                "id": str(record.id),
                "student_id": record.student_id,
                "student_membership_id": str(membership.id) if membership else None,
                "student_name": _student_name(membership) if membership else record.student_id,
                "problem_id": str(record.problem_id),
                "problem_number": problem.problem_number,
                "problem_text": problem.problem_text,
                "source_assignment_ids": record.source_assignment_ids or [],
                "subject": tags.subject if tags else None,
                "unit": tags.unit if tags else None,
                "first_wrong_at": record.first_wrong_at.isoformat() if record.first_wrong_at else None,
                "latest_wrong_at": record.latest_wrong_at.isoformat() if record.latest_wrong_at else None,
                "wrong_count": record.wrong_count,
                "retry_count": record.retry_count,
                "resolved_status": record.resolved_status,
                "teacher_memo": record.teacher_memo,
                "student_memo": record.student_memo,
            }
        )
    return result


@router.get("/wrong-answers")
def list_wrong_answers(
    request: Request,
    class_id: UUID | None = None,
    student_membership_id: UUID | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    student_user_ids: list[str] | None = None
    if student_membership_id:
        student_user_ids = [_get_membership(db, academy_id, student_membership_id, visible_academy_ids).student_user_id]
    elif class_id:
        _get_class(db, academy_id, class_id, visible_academy_ids)
        student_user_ids = [membership.student_user_id for membership in _active_memberships_for_class(db, academy_id, class_id)]
    rows = _wrong_answer_rows(db, academy_id, student_user_ids=student_user_ids, academy_ids=visible_academy_ids)
    if status:
        rows = [row for row in rows if row["resolved_status"] == status]
    return rows


@router.delete("/wrong-answers/{wrong_answer_id}", status_code=204)
def delete_wrong_answer(wrong_answer_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    row = db.scalar(
        select(WrongAnswerRecord).where(
            WrongAnswerRecord.id == wrong_answer_id,
            WrongAnswerRecord.academy_id.in_(list(visible_academy_ids)),
        )
    )
    if not row:
        raise HTTPException(status_code=404, detail="Wrong answer record not found.")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.post("/wrong-answers/review-set")
def create_review_set(payload: ReviewSetPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    owner_id = current_workspace_id(request, db, permission="can_manage_materials")
    stmt = select(WrongAnswerRecord).where(WrongAnswerRecord.academy_id.in_(list(visible_academy_ids)))
    if payload.wrong_answer_ids:
        stmt = stmt.where(WrongAnswerRecord.id.in_(payload.wrong_answer_ids))
    if payload.unresolved_only:
        stmt = stmt.where(WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]))
    if payload.student_membership_id:
        membership = _get_membership(db, academy_id, payload.student_membership_id, visible_academy_ids)
        stmt = stmt.where(WrongAnswerRecord.student_id == membership.student_user_id)
    if payload.class_id:
        _get_class(db, academy_id, payload.class_id, visible_academy_ids)
        user_ids = [membership.student_user_id for membership in _active_memberships_for_class(db, academy_id, payload.class_id)]
        stmt = stmt.where(WrongAnswerRecord.student_id.in_(user_ids or [""]))
    records = db.scalars(stmt.order_by(WrongAnswerRecord.latest_wrong_at.desc())).all()
    problem_ids = []
    seen = set()
    for record in records:
        if record.problem_id not in seen:
            problem_ids.append(record.problem_id)
            seen.add(record.problem_id)
    if not problem_ids:
        raise HTTPException(status_code=400, detail="No wrong-answer problems matched the selected filters.")
    problem_set = ProblemSet(
        name=payload.title.strip() or "오답 복습 세트",
        owner_id=owner_id,
        academy_id=academy_id,
        description="Student Management에서 생성한 오답 복습 세트입니다.",
        source_type="self_created",
        rights_confirmed=True,
        problem_count=len(problem_ids),
    )
    db.add(problem_set)
    db.flush()
    for index, problem_id in enumerate(problem_ids):
        db.add(ProblemSetItem(problem_set_id=problem_set.id, problem_id=problem_id, order_index=index))
    record_problem_set_usage(db, problem_set=problem_set, problem_ids=problem_ids, owner_id=owner_id)
    db.commit()
    return {
        "id": str(problem_set.id),
        "name": problem_set.name,
        "problem_count": len(problem_ids),
        "href": f"/problem-sets/{problem_set.id}",
    }


@router.get("/schedule-events")
def list_schedule_events(
    request: Request,
    class_id: UUID | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    db: Session = Depends(get_db),
):
    academy_id = _student_management_academy_id(request, db)
    academy_ids = _student_management_academy_ids(request, db, academy_id)
    stmt = select(ClassScheduleEvent).where(ClassScheduleEvent.academy_id.in_(list(academy_ids)))
    if class_id:
        class_row = db.get(AcademyClass, class_id)
        if not class_row or class_row.academy_id not in academy_ids:
            raise HTTPException(status_code=404, detail="Class not found.")
        stmt = stmt.where(ClassScheduleEvent.class_id == class_id)
    start_bound = _date_boundary(start_date)
    end_bound = _date_boundary(end_date, end=True)
    if start_bound:
        stmt = stmt.where(func.coalesce(ClassScheduleEvent.ends_at, ClassScheduleEvent.starts_at) >= start_bound)
    if end_bound:
        stmt = stmt.where(ClassScheduleEvent.starts_at <= end_bound)
    rows = db.scalars(stmt.order_by(ClassScheduleEvent.starts_at.asc()).limit(500)).all()
    return [_schedule_event_payload(row) for row in rows]


@router.post("/schedule-events")
def create_schedule_event(payload: ScheduleEventPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    class_row = _get_class(db, academy_id, payload.class_id, visible_academy_ids)
    if payload.linked_paper_session_id:
        _get_visible_session(db, visible_academy_ids, payload.linked_paper_session_id)
    metadata: dict = {}
    if payload.series_id:
        metadata[SCHEDULE_SERIES_METADATA_KEY] = payload.series_id.strip()
        if payload.series_position is not None:
            metadata[SCHEDULE_SERIES_POSITION_METADATA_KEY] = payload.series_position
        if payload.series_size is not None:
            metadata[SCHEDULE_SERIES_SIZE_METADATA_KEY] = payload.series_size
    row = ClassScheduleEvent(
        academy_id=class_row.academy_id,
        class_id=payload.class_id,
        title=payload.title.strip(),
        description=payload.description,
        event_type=payload.event_type,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        linked_paper_session_id=payload.linked_paper_session_id,
        counts_for_tuition=payload.counts_for_tuition,
        metadata_json=metadata,
    )
    db.add(row)
    db.commit()
    return _schedule_event_payload(row)


@router.patch("/schedule-events/{event_id}")
def update_schedule_event(event_id: UUID, payload: ScheduleEventUpdatePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    row = db.get(ClassScheduleEvent, event_id)
    if not row or row.academy_id not in visible_academy_ids:
        raise HTTPException(status_code=404, detail="Schedule event not found.")

    update_scope = payload.update_scope or "single"
    if update_scope not in {"single", "future"}:
        raise HTTPException(status_code=400, detail="Invalid schedule update scope.")
    original_starts_at = row.starts_at
    original_ends_at = row.ends_at
    next_selected_start = payload.starts_at or original_starts_at
    if "ends_at" in payload.model_fields_set and payload.ends_at and payload.ends_at <= next_selected_start:
        raise HTTPException(status_code=400, detail="Schedule event end time must be after start time.")

    target_class_row = None
    if payload.class_id is not None:
        target_class_row = _get_class(db, academy_id, payload.class_id, visible_academy_ids)
    if payload.linked_paper_session_id is not None:
        _get_visible_session(db, visible_academy_ids, payload.linked_paper_session_id)

    targets = [row]
    if update_scope == "future":
        series_id = _schedule_event_series_id(row)
        if series_id:
            candidates = db.scalars(
                select(ClassScheduleEvent)
                .where(
                    ClassScheduleEvent.academy_id.in_(list(visible_academy_ids)),
                    ClassScheduleEvent.starts_at >= original_starts_at,
                )
                .order_by(ClassScheduleEvent.starts_at.asc())
            ).all()
            targets = [candidate for candidate in candidates if _schedule_event_series_id(candidate) == series_id]
        else:
            created_floor = row.created_at - timedelta(minutes=5)
            created_ceiling = row.created_at + timedelta(minutes=5)
            targets = db.scalars(
                select(ClassScheduleEvent)
                .where(
                    ClassScheduleEvent.academy_id.in_(list(visible_academy_ids)),
                    ClassScheduleEvent.class_id == row.class_id,
                    ClassScheduleEvent.title == row.title,
                    ClassScheduleEvent.event_type == row.event_type,
                    ClassScheduleEvent.starts_at >= original_starts_at,
                    ClassScheduleEvent.created_at >= created_floor,
                    ClassScheduleEvent.created_at <= created_ceiling,
                )
                .order_by(ClassScheduleEvent.starts_at.asc())
            ).all()
            targets = [target for target in targets if target.description == row.description]
        if not targets:
            targets = [row]

    start_delta = payload.starts_at - original_starts_at if payload.starts_at is not None else None
    next_duration = None
    if "ends_at" in payload.model_fields_set and payload.ends_at is not None:
        next_duration = payload.ends_at - next_selected_start

    for target in targets:
        if target_class_row is not None:
            target.academy_id = target_class_row.academy_id
            target.class_id = payload.class_id
        if payload.linked_paper_session_id is not None and target.id == row.id:
            target.linked_paper_session_id = payload.linked_paper_session_id
        if payload.title is not None:
            target.title = payload.title.strip()
        if "description" in payload.model_fields_set:
            target.description = payload.description
        if payload.event_type is not None:
            target.event_type = payload.event_type
        if start_delta is not None:
            target.starts_at = payload.starts_at if target.id == row.id else target.starts_at + start_delta
        if "ends_at" in payload.model_fields_set:
            if payload.ends_at is None:
                target.ends_at = None
            elif next_duration is not None:
                target.ends_at = target.starts_at + next_duration
        elif start_delta is not None and target.ends_at is not None:
            target.ends_at = target.ends_at + start_delta
        if payload.counts_for_tuition is not None:
            target.counts_for_tuition = payload.counts_for_tuition
        if target.ends_at and target.ends_at <= target.starts_at:
            raise HTTPException(status_code=400, detail="Schedule event end time must be after start time.")
        if target.linked_paper_session_id:
            session = db.get(PaperSession, target.linked_paper_session_id)
            if session and session.academy_id in visible_academy_ids:
                session.scheduled_at = target.starts_at
                if target.ends_at:
                    session.due_at = target.ends_at
                session.updated_at = _now()
        target.updated_at = _now()

    db.commit()
    db.refresh(row)
    return _schedule_event_payload(row)


@router.delete("/schedule-events/{event_id}", status_code=204)
def delete_schedule_event(event_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _student_management_academy_id(request, db)
    visible_academy_ids = _student_management_academy_ids(request, db, academy_id)
    row = db.get(ClassScheduleEvent, event_id)
    if not row or row.academy_id not in visible_academy_ids:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    linked_session_id = row.linked_paper_session_id
    starts_at = row.starts_at
    ends_at = row.ends_at
    db.delete(row)
    if linked_session_id:
        session = db.get(PaperSession, linked_session_id)
        if session and session.academy_id in visible_academy_ids:
            if session.scheduled_at == starts_at:
                session.scheduled_at = None
            if ends_at and session.due_at == ends_at:
                session.due_at = None
            session.updated_at = _now()
    db.commit()
    return Response(status_code=204)
