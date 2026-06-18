import hashlib
import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from models import Academy, AcademyStaffInviteCode, AcademyStaffMembership
from services.academy_student_access import ensure_academy_subscription
from services.ownership import current_user_id, current_workspace_id, require_workspace_owner, requested_workspace_id
from services.subscription_pricing import STAFF_SEAT_MONTHLY_ADDON_KRW

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

STAFF_ROLES = {"admin", "teacher", "assistant"}


class StaffPermissions(BaseModel):
    can_manage_seats: bool = False
    can_manage_materials: bool = True
    can_manage_assignments: bool = True
    can_manage_students: bool = True
    can_manage_schedule: bool = True
    can_manage_coagent: bool = False


class StaffInviteCreate(StaffPermissions):
    role: str = "teacher"
    expires_in_days: int = Field(default=7, ge=1, le=30)


class StaffUpdate(BaseModel):
    role: str | None = None
    can_manage_seats: bool | None = None
    can_manage_materials: bool | None = None
    can_manage_assignments: bool | None = None
    can_manage_students: bool | None = None
    can_manage_schedule: bool | None = None
    can_manage_coagent: bool | None = None
    is_active: bool | None = None


class StaffInviteClaim(BaseModel):
    code: str = Field(min_length=6, max_length=80)


def _hash_code(code: str) -> str:
    compact = "".join(ch for ch in code.strip().upper() if ch.isalnum())
    return hashlib.sha256(compact.encode("utf-8")).hexdigest()


def _generate_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    first = "".join(secrets.choice(alphabet) for _ in range(4))
    second = "".join(secrets.choice(alphabet) for _ in range(4))
    third = "".join(secrets.choice(alphabet) for _ in range(4))
    return f"TF-{first}-{second}-{third}"


def _permission_payload(row: AcademyStaffMembership | AcademyStaffInviteCode | None = None, *, owner: bool = False) -> dict:
    if owner:
        return {
            "can_manage_billing": True,
            "can_manage_seats": True,
            "can_manage_materials": True,
            "can_manage_assignments": True,
            "can_manage_students": True,
            "can_manage_schedule": True,
            "can_manage_coagent": True,
        }
    return {
        "can_manage_billing": False,
        "can_manage_seats": bool(getattr(row, "can_manage_seats", False)),
        "can_manage_materials": bool(getattr(row, "can_manage_materials", False)),
        "can_manage_assignments": bool(getattr(row, "can_manage_assignments", False)),
        "can_manage_students": bool(getattr(row, "can_manage_students", False)),
        "can_manage_schedule": bool(getattr(row, "can_manage_schedule", False)),
        "can_manage_coagent": bool(getattr(row, "can_manage_coagent", False)),
    }


def _seat_status(db: Session, academy_id: str) -> dict:
    subscription = ensure_academy_subscription(db, academy_id)
    now = datetime.utcnow()
    active_staff = db.scalar(
        select(func.count(AcademyStaffMembership.id)).where(
            AcademyStaffMembership.academy_id == academy_id,
            AcademyStaffMembership.is_active.is_(True),
        )
    ) or 0
    pending_codes = db.scalar(
        select(func.count(AcademyStaffInviteCode.id)).where(
            AcademyStaffInviteCode.academy_id == academy_id,
            AcademyStaffInviteCode.claimed_at.is_(None),
            AcademyStaffInviteCode.revoked_at.is_(None),
            AcademyStaffInviteCode.expires_at > now,
        )
    ) or 0
    purchased = int(subscription.purchased_staff_seats or 0)
    return {
        "purchased_staff_seats": purchased,
        "active_staff": int(active_staff),
        "pending_invites": int(pending_codes),
        "available_staff_seats": max(purchased - int(active_staff) - int(pending_codes), 0),
        "staff_seat_monthly_addon_krw": STAFF_SEAT_MONTHLY_ADDON_KRW,
    }


def _ensure_staff_capacity(db: Session, academy_id: str, *, include_pending: bool = True) -> None:
    status = _seat_status(db, academy_id)
    available = status["available_staff_seats"] if include_pending else max(status["purchased_staff_seats"] - status["active_staff"], 0)
    if available <= 0:
        raise HTTPException(status_code=402, detail="Purchased staff seat limit reached. Add Staff Seat Pack before inviting instructors.")


def _academy_payload(academy: Academy) -> dict:
    return {
        "id": str(academy.id),
        "name": academy.academy_name,
        "email": academy.email,
        "account_type": academy.account_type,
        "plan": academy.plan.value if hasattr(academy.plan, "value") else str(academy.plan),
    }


def _staff_payload(db: Session, row: AcademyStaffMembership) -> dict:
    account = db.get(Academy, UUID(row.user_id)) if row.user_id else None
    return {
        "id": str(row.id),
        "academy_id": row.academy_id,
        "user_id": row.user_id,
        "role": row.role,
        "is_active": row.is_active,
        "permissions": _permission_payload(row),
        "user": _academy_payload(account) if account else None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _invite_payload(row: AcademyStaffInviteCode) -> dict:
    return {
        "id": str(row.id),
        "academy_id": row.academy_id,
        "code_preview": row.code_preview,
        "role": row.role,
        "permissions": _permission_payload(row),
        "created_by": row.created_by,
        "claimed_by": row.claimed_by,
        "expires_at": row.expires_at,
        "claimed_at": row.claimed_at,
        "revoked_at": row.revoked_at,
        "created_at": row.created_at,
    }


@router.get("")
def list_workspaces(request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    account = db.get(Academy, UUID(user_id)) if user_id != "local_user" else None
    items: list[dict] = []

    if account and account.account_type == "student":
        items.append(
            {
                "id": "student",
                "type": "student",
                "name": "Student App",
                "role": "student",
                "permissions": {},
                "account": _academy_payload(account),
            }
        )

    if account and account.account_type == "academy":
        items.append(
            {
                "id": str(account.id),
                "type": "academy",
                "name": account.academy_name,
                "role": "owner",
                "permissions": _permission_payload(owner=True),
                "account": _academy_payload(account),
                "seat_status": _seat_status(db, str(account.id)),
            }
        )

    memberships = db.scalars(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.user_id == user_id,
            AcademyStaffMembership.is_active.is_(True),
        )
    ).all()
    for membership in memberships:
        academy = db.get(Academy, UUID(membership.academy_id)) if membership.academy_id else None
        if not academy:
            continue
        items.append(
            {
                "id": membership.academy_id,
                "type": "academy",
                "name": academy.academy_name,
                "role": membership.role,
                "permissions": _permission_payload(membership),
                "account": _academy_payload(academy),
            }
        )

    active = requested_workspace_id(request)
    if active:
        current_workspace_id(request, db)
    elif account and account.account_type == "student":
        active = "student"
    elif account and account.account_type == "academy":
        active = str(account.id)

    return {"active_workspace_id": active, "items": items}


@router.get("/{academy_id}/staff")
def list_staff(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_workspace_owner(request, db, academy_id)
    rows = db.scalars(
        select(AcademyStaffMembership).where(AcademyStaffMembership.academy_id == academy_id).order_by(AcademyStaffMembership.created_at.desc())
    ).all()
    return {"seat_status": _seat_status(db, academy_id), "staff": [_staff_payload(db, row) for row in rows]}


@router.patch("/{academy_id}/staff/{user_id}")
def update_staff(academy_id: str, user_id: str, payload: StaffUpdate, request: Request, db: Session = Depends(get_db)):
    require_workspace_owner(request, db, academy_id)
    row = db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.academy_id == academy_id,
            AcademyStaffMembership.user_id == user_id,
        )
    )
    if not row:
        raise HTTPException(status_code=404, detail="Staff membership not found.")
    if payload.role is not None:
        if payload.role not in STAFF_ROLES:
            raise HTTPException(status_code=400, detail="Invalid staff role.")
        row.role = payload.role
    for field in StaffPermissions.model_fields:
        value = getattr(payload, field)
        if value is not None:
            setattr(row, field, value)
    row.can_manage_billing = False
    if payload.is_active is not None:
        if payload.is_active and not row.is_active:
            _ensure_staff_capacity(db, academy_id)
        row.is_active = payload.is_active
    row.updated_at = datetime.utcnow()
    db.commit()
    return _staff_payload(db, row)


@router.delete("/{academy_id}/staff/{user_id}", status_code=204)
def deactivate_staff(academy_id: str, user_id: str, request: Request, db: Session = Depends(get_db)):
    require_workspace_owner(request, db, academy_id)
    row = db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.academy_id == academy_id,
            AcademyStaffMembership.user_id == user_id,
        )
    )
    if not row:
        raise HTTPException(status_code=404, detail="Staff membership not found.")
    row.is_active = False
    row.updated_at = datetime.utcnow()
    db.commit()
    return Response(status_code=204)


@router.get("/{academy_id}/staff/invite-codes")
def list_staff_invite_codes(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_workspace_owner(request, db, academy_id)
    rows = db.scalars(
        select(AcademyStaffInviteCode).where(AcademyStaffInviteCode.academy_id == academy_id).order_by(AcademyStaffInviteCode.created_at.desc())
    ).all()
    return {"seat_status": _seat_status(db, academy_id), "invite_codes": [_invite_payload(row) for row in rows]}


@router.post("/{academy_id}/staff/invite-codes")
def create_staff_invite_code(academy_id: str, payload: StaffInviteCreate, request: Request, db: Session = Depends(get_db)):
    actor = require_workspace_owner(request, db, academy_id)
    if payload.role not in STAFF_ROLES:
        raise HTTPException(status_code=400, detail="Invalid staff role.")
    _ensure_staff_capacity(db, academy_id)
    code = _generate_code()
    code_hash = _hash_code(code)
    while db.scalar(select(AcademyStaffInviteCode.id).where(AcademyStaffInviteCode.code_hash == code_hash)):
        code = _generate_code()
        code_hash = _hash_code(code)
    row = AcademyStaffInviteCode(
        academy_id=academy_id,
        code_hash=code_hash,
        code_preview=code[-4:],
        role=payload.role,
        can_manage_seats=payload.can_manage_seats,
        can_manage_materials=payload.can_manage_materials,
        can_manage_assignments=payload.can_manage_assignments,
        can_manage_students=payload.can_manage_students,
        can_manage_schedule=payload.can_manage_schedule,
        can_manage_coagent=payload.can_manage_coagent,
        created_by=actor,
        expires_at=datetime.utcnow() + timedelta(days=payload.expires_in_days),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {**_invite_payload(row), "code": code, "seat_status": _seat_status(db, academy_id)}


@router.delete("/{academy_id}/staff/invite-codes/{code_id}", status_code=204)
def revoke_staff_invite_code(academy_id: str, code_id: UUID, request: Request, db: Session = Depends(get_db)):
    actor = require_workspace_owner(request, db, academy_id)
    row = db.scalar(select(AcademyStaffInviteCode).where(AcademyStaffInviteCode.id == code_id, AcademyStaffInviteCode.academy_id == academy_id))
    if not row:
        raise HTTPException(status_code=404, detail="Invite code not found.")
    row.revoked_at = datetime.utcnow()
    row.updated_at = datetime.utcnow()
    row.created_by = row.created_by or actor
    db.commit()
    return Response(status_code=204)


@router.post("/staff-invite-codes/claim")
def claim_staff_invite_code(payload: StaffInviteClaim, request: Request, db: Session = Depends(get_db)):
    user_id = current_user_id(request)
    now = datetime.utcnow()
    row = db.scalar(select(AcademyStaffInviteCode).where(AcademyStaffInviteCode.code_hash == _hash_code(payload.code)))
    if not row or row.revoked_at or row.claimed_at or row.expires_at <= now:
        raise HTTPException(status_code=404, detail="Invalid or expired staff invite code.")
    if row.academy_id == user_id:
        raise HTTPException(status_code=400, detail="Workspace owners do not need to claim their own staff invite code.")
    membership = db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.academy_id == row.academy_id,
            AcademyStaffMembership.user_id == user_id,
        )
    )
    if not membership or not membership.is_active:
        _ensure_staff_capacity(db, row.academy_id, include_pending=False)
    if not membership:
        membership = AcademyStaffMembership(academy_id=row.academy_id, user_id=user_id)
        db.add(membership)
    membership.role = row.role
    membership.can_manage_billing = False
    membership.can_manage_seats = row.can_manage_seats
    membership.can_manage_materials = row.can_manage_materials
    membership.can_manage_assignments = row.can_manage_assignments
    membership.can_manage_students = row.can_manage_students
    membership.can_manage_schedule = row.can_manage_schedule
    membership.can_manage_coagent = row.can_manage_coagent
    membership.is_active = True
    membership.updated_at = now
    row.claimed_by = user_id
    row.claimed_at = now
    row.updated_at = now
    db.commit()
    academy = db.get(Academy, UUID(row.academy_id))
    return {
        "ok": True,
        "workspace": {
            "id": row.academy_id,
            "type": "academy",
            "name": academy.academy_name if academy else "Academy",
            "role": membership.role,
            "permissions": _permission_payload(membership),
        },
    }
