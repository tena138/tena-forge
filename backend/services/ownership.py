import uuid

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_settings
from models import Academy, ArchiveFolder, Batch, HubTemplate, Problem, ProblemSet, UserRole

LOCAL_OWNER_ID = "local_user"
ADMIN_ROLES = {"admin", "super_admin"}
BUILTIN_ADMIN_EMAILS = {"admin@tenaforge.com", "admin@tena-forge.com", "admin@tena.local"}
LEGACY_ARCHIVE_GUARD_MODELS = (ArchiveFolder, Batch, Problem, ProblemSet)
LEGACY_ARCHIVE_CLAIM_MODELS = (ArchiveFolder, Batch, Problem, ProblemSet, HubTemplate)


def current_owner_id(request: Request) -> str:
    return str(getattr(request.state, "academy_id", None) or LOCAL_OWNER_ID)


def current_academy_id(request: Request) -> str | None:
    owner_id = current_owner_id(request)
    return None if owner_id == LOCAL_OWNER_ID else owner_id


def _academy_for_owner(db: Session, owner_id: str) -> Academy | None:
    try:
        return db.get(Academy, uuid.UUID(str(owner_id)))
    except (TypeError, ValueError):
        return None


def _model_has_owner_rows(db: Session, model, owner_id: str) -> bool:
    return db.scalar(select(model.id).where(model.owner_id == owner_id).limit(1)) is not None


def _archive_owners_except(db: Session, excluded_owner_ids: set[str]) -> set[str]:
    owners: set[str] = set()
    for model in LEGACY_ARCHIVE_GUARD_MODELS:
        owners.update(
            str(owner_id)
            for owner_id in db.scalars(select(model.owner_id).where(model.owner_id.not_in(excluded_owner_ids)).distinct()).all()
            if owner_id
        )
    return owners


def claim_legacy_archive_if_safe(db: Session, owner_id: str, academy_id: str | None = None) -> int:
    """Move pre-auth local archive rows to the current account when ownership is unambiguous."""
    owner_id = str(owner_id or LOCAL_OWNER_ID)
    if owner_id == LOCAL_OWNER_ID:
        return 0

    academy = _academy_for_owner(db, owner_id)
    if academy and academy.account_type == "student":
        return 0

    legacy_exists = any(_model_has_owner_rows(db, model, LOCAL_OWNER_ID) for model in LEGACY_ARCHIVE_GUARD_MODELS)
    if not legacy_exists:
        return 0

    other_real_owners = _archive_owners_except(db, {LOCAL_OWNER_ID, owner_id})
    if other_real_owners:
        return 0

    total = 0
    canonical_academy_id = academy_id or owner_id
    for model in LEGACY_ARCHIVE_CLAIM_MODELS:
        updates = {model.owner_id: owner_id}
        if hasattr(model, "academy_id"):
            updates[model.academy_id] = canonical_academy_id
        total += db.query(model).filter(model.owner_id == LOCAL_OWNER_ID).update(updates, synchronize_session=False)

    if total:
        db.commit()
    return total


def ensure_legacy_archive_claimed_for_request(request: Request, db: Session) -> int:
    return claim_legacy_archive_if_safe(db, current_owner_id(request), current_academy_id(request))


def current_owner_ids(request: Request, db: Session, *, include_legacy_for_admin: bool = True) -> set[str]:
    owner_id = current_owner_id(request)
    ensure_legacy_archive_claimed_for_request(request, db)
    owner_ids = {owner_id}
    if not include_legacy_for_admin or owner_id == LOCAL_OWNER_ID:
        return owner_ids

    roles = set(db.scalars(select(UserRole.role).where(UserRole.user_id == owner_id)).all())
    academy = db.get(Academy, owner_id)
    admin_emails = BUILTIN_ADMIN_EMAILS | {email.strip().lower() for email in get_settings().admin_emails.split(",") if email.strip()}
    if roles & ADMIN_ROLES or (academy and academy.email.lower() in admin_emails):
        owner_ids.add(LOCAL_OWNER_ID)
        owner_ids.update(
            str(academy_id)
            for academy_id in db.scalars(select(Academy.id).where(Academy.email.in_(admin_emails))).all()
        )
    return owner_ids
