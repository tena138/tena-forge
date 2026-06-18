import math
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from database import get_db
from models import Academy, AcademyClass, AcademyStaffMembership, AcademyWorkspaceSettings, ClassScheduleEvent, ClassTeacher
from services.ownership import current_user_id, current_workspace_id, require_workspace_owner

router = APIRouter(prefix="/api/live-interactions", tags=["live-interactions"])


class LiveInteractionSettingsPayload(BaseModel):
    live_start_lead_minutes: int = Field(ge=0, le=240)


def _workspace_settings(db: Session, academy_id: str) -> AcademyWorkspaceSettings:
    row = db.get(AcademyWorkspaceSettings, academy_id)
    if not row:
        row = AcademyWorkspaceSettings(academy_id=academy_id, live_start_lead_minutes=10)
        db.add(row)
        db.flush()
    return row


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
        return {"settings": {"academy_id": academy_id, "live_start_lead_minutes": 10, "updated_at": None}, "events": []}
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
