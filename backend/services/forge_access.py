from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from database import get_settings
from models import Academy, Subscription, UserRole

FORGE_PAYMENT_REQUIRED_CODE = "FORGE_TRIAL_REQUIRES_PAYMENT_METHOD"
FORGE_PAYMENT_REQUIRED_MESSAGE = "Tena Forge 무료 체험은 결제수단 등록 후 시작됩니다."
FORGE_ACTIVE_STATUSES = {"trialing", "active"}
ADMIN_ROLES = {"admin", "super_admin"}


@dataclass(frozen=True)
class ForgeAccess:
    status: str
    subscription: Subscription | None
    can_access_forge: bool
    workspace_id: str | None
    trial_ends_at: datetime | None


def _academy_for_user(db: Session, user_id: str) -> Academy | None:
    try:
        return db.get(Academy, UUID(str(user_id)))
    except (TypeError, ValueError):
        return None


def is_forge_admin(db: Session, user_id: str) -> bool:
    roles = set(db.scalars(select(UserRole.role).where(UserRole.user_id == str(user_id))).all())
    if roles & ADMIN_ROLES:
        return True
    academy = _academy_for_user(db, user_id)
    admin_emails = {email.strip().lower() for email in get_settings().admin_emails.split(",") if email.strip()}
    return bool(academy and academy.email.strip().lower() in admin_emails)


def active_forge_subscription(db: Session, user_id: str, now: datetime | None = None) -> Subscription | None:
    timestamp = now or datetime.utcnow()
    return db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == str(user_id),
            Subscription.status.in_(sorted(FORGE_ACTIVE_STATUSES)),
            ((Subscription.current_period_end.is_(None)) | (Subscription.current_period_end > timestamp)),
        )
        .order_by(case((Subscription.status == "active", 0), else_=1), Subscription.created_at.desc())
    )


def latest_forge_subscription(db: Session, user_id: str) -> Subscription | None:
    return db.scalar(select(Subscription).where(Subscription.user_id == str(user_id)).order_by(Subscription.created_at.desc()))


def forge_access_for_user(db: Session, user_id: str) -> ForgeAccess:
    normalized_user_id = str(user_id)
    academy = _academy_for_user(db, normalized_user_id)
    if is_forge_admin(db, normalized_user_id):
        return ForgeAccess("active", None, True, normalized_user_id, None)

    subscription = active_forge_subscription(db, normalized_user_id)
    if subscription:
        trial_ends_at = subscription.current_period_end if subscription.status == "trialing" else None
        return ForgeAccess(subscription.status, subscription, True, normalized_user_id, trial_ends_at)

    latest = latest_forge_subscription(db, normalized_user_id)
    status = "expired" if latest and latest.status in FORGE_ACTIVE_STATUSES else "none"
    can_access_forge = bool(academy and academy.account_type == "academy")
    return ForgeAccess(status, None, can_access_forge, normalized_user_id if can_access_forge else None, None)


def student_has_own_forge_access(db: Session, user_id: str) -> bool:
    academy = _academy_for_user(db, user_id)
    if not academy or academy.account_type != "student":
        return True
    return forge_access_for_user(db, user_id).can_access_forge


def raise_forge_payment_required() -> None:
    raise HTTPException(
        status_code=402,
        detail={
            "code": FORGE_PAYMENT_REQUIRED_CODE,
            "message": FORGE_PAYMENT_REQUIRED_MESSAGE,
        },
    )


def require_student_own_forge_access(db: Session, user_id: str) -> None:
    if not student_has_own_forge_access(db, user_id):
        raise_forge_payment_required()
