import uuid

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_settings
from models import Academy, AcademyStaffMembership, ArchiveFolder, Batch, HubTemplate, Problem, ProblemSet, UserRole

LOCAL_OWNER_ID = "local_user"
WORKSPACE_HEADER = "x-tena-workspace-id"
ADMIN_ROLES = {"admin", "super_admin"}
BUILTIN_ADMIN_EMAILS = {"admin@tenaforge.com", "admin@tena-forge.com", "admin2@tena-forge.com", "admin@tena.local"}
LEGACY_ARCHIVE_GUARD_MODELS = (ArchiveFolder, Batch, Problem, ProblemSet)
LEGACY_ARCHIVE_CLAIM_MODELS = (ArchiveFolder, Batch, Problem, ProblemSet, HubTemplate)
STAFF_PERMISSION_FIELDS = {
    "can_manage_seats",
    "can_manage_materials",
    "can_manage_assignments",
    "can_manage_students",
    "can_manage_schedule",
    "can_manage_coagent",
}


def current_user_id(request: Request) -> str:
    return str(getattr(request.state, "academy_id", None) or LOCAL_OWNER_ID)


def current_owner_id(request: Request) -> str:
    return current_user_id(request)


def current_academy_id(request: Request, db: Session | None = None) -> str | None:
    owner_id = current_workspace_id(request, db) if db is not None else current_owner_id(request)
    return None if owner_id == LOCAL_OWNER_ID else owner_id


def _admin_email_set() -> set[str]:
    return BUILTIN_ADMIN_EMAILS | {email.strip().lower() for email in get_settings().admin_emails.split(",") if email.strip()}


def _is_admin_user(db: Session, user_id: str) -> bool:
    if user_id == LOCAL_OWNER_ID:
        return False
    roles = set(db.scalars(select(UserRole.role).where(UserRole.user_id == user_id)).all())
    academy = _academy_for_owner(db, user_id)
    return bool(roles & ADMIN_ROLES or (academy and academy.email.lower() in _admin_email_set()))


def requested_workspace_id(request: Request) -> str | None:
    value = request.headers.get(WORKSPACE_HEADER) or request.headers.get("X-Tena-Workspace-Id")
    clean = str(value or "").strip()
    if not clean or clean.lower() == "student":
        return None
    return clean[:64]


def staff_membership_for_workspace(db: Session, user_id: str, workspace_id: str) -> AcademyStaffMembership | None:
    return db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.user_id == user_id,
            AcademyStaffMembership.academy_id == workspace_id,
            AcademyStaffMembership.is_active.is_(True),
        )
    )


def current_workspace_id(request: Request, db: Session | None, *, permission: str | None = None) -> str:
    user_id = current_user_id(request)
    workspace_id = requested_workspace_id(request) or user_id
    if workspace_id == LOCAL_OWNER_ID or not db:
        return workspace_id

    if permission and permission not in STAFF_PERMISSION_FIELDS:
        raise HTTPException(status_code=500, detail="Unknown workspace permission.")

    if workspace_id == user_id:
        return workspace_id

    staff = staff_membership_for_workspace(db, user_id, workspace_id)
    if staff:
        if permission and not bool(getattr(staff, permission, False)):
            raise HTTPException(status_code=403, detail="This workspace action is not allowed for your role.")
        return workspace_id

    if _is_admin_user(db, user_id):
        return workspace_id

    raise HTTPException(status_code=403, detail="This workspace is not available to your account.")


def require_workspace_owner(request: Request, db: Session, workspace_id: str | None = None) -> str:
    user_id = current_user_id(request)
    target = str(workspace_id or requested_workspace_id(request) or user_id)
    if target == user_id or _is_admin_user(db, user_id):
        return user_id
    raise HTTPException(status_code=403, detail="Workspace owner permission is required.")


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
    owner_id = current_workspace_id(request, db)
    ensure_legacy_archive_claimed_for_request(request, db)
    owner_ids = {owner_id}
    if not include_legacy_for_admin or owner_id == LOCAL_OWNER_ID:
        return owner_ids

    user_id = current_user_id(request)
    admin_emails = _admin_email_set()
    if _is_admin_user(db, user_id):
        owner_ids.add(LOCAL_OWNER_ID)
        owner_ids.update(
            str(academy_id)
            for academy_id in db.scalars(select(Academy.id).where(Academy.email.in_(admin_emails))).all()
        )
    return owner_ids
