from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_settings
from models import Academy, UserRole

LOCAL_OWNER_ID = "local_user"
ADMIN_ROLES = {"admin", "super_admin"}
BUILTIN_ADMIN_EMAILS = {"admin@tenaforge.com", "admin@tena-forge.com", "admin@tena.local"}


def current_owner_id(request: Request) -> str:
    return str(getattr(request.state, "academy_id", None) or LOCAL_OWNER_ID)


def current_academy_id(request: Request) -> str | None:
    owner_id = current_owner_id(request)
    return None if owner_id == LOCAL_OWNER_ID else owner_id


def current_owner_ids(request: Request, db: Session, *, include_legacy_for_admin: bool = True) -> set[str]:
    owner_id = current_owner_id(request)
    owner_ids = {owner_id}
    if not include_legacy_for_admin or owner_id == LOCAL_OWNER_ID:
        return owner_ids

    roles = set(db.scalars(select(UserRole.role).where(UserRole.user_id == owner_id)).all())
    academy = db.get(Academy, owner_id)
    admin_emails = BUILTIN_ADMIN_EMAILS | {email.strip().lower() for email in get_settings().admin_emails.split(",") if email.strip()}
    if roles & ADMIN_ROLES or (academy and academy.email.lower() in admin_emails):
        owner_ids.add(LOCAL_OWNER_ID)
    return owner_ids
