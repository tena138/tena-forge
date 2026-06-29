import hashlib
import secrets
import uuid
from datetime import date, datetime, timedelta
from urllib.parse import quote
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from database import get_settings
from models import (
    AbuseSignal,
    Academy,
    AcademyClass,
    AcademySeat,
    AcademyStaffMembership,
    AcademyStudentPlan,
    AcademyStudentSubscription,
    AuditLog,
    ArchiveAccessGrant,
    ClassStudent,
    ClassTeacher,
    DailyStudentQuotaUsage,
    LearningAssignmentTarget,
    LearningSubmission,
    PaperSessionResult,
    ProblemAttempt,
    ProblemResult,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    StudentNotification,
    WatermarkedExport,
    WrongAnswerRecord,
)
from services.forge_access import active_forge_subscription
from services.ownership import current_owner_id

BASE_STUDENT_QUOTA = {"upload": 5, "extraction": 5, "export": 5}
ACADEMY_OWNER_ROLES = {"owner", "admin"}
STAFF_ROLES = {"owner", "admin", "teacher", "assistant"}
SYSTEM_STUDENT_PLAN_CODES = {"free", "basic", "pro", "enterprise", "tutor"}
STUDENT_PROFILE_COLLECTION_METADATA_KEY = "student_profile_collection"
STUDENT_PROFILE_FIELD_KEYS = {
    "name",
    "school",
    "grade_level",
    "student_phone",
    "guardian_name",
    "guardian_phone",
    "birthdate",
}
DEFAULT_STUDENT_PROFILE_FIELDS = [
    {"key": "name", "label": "학생 실명", "enabled": True, "required": False, "real_name": True},
    {"key": "school", "label": "학교", "enabled": True, "required": False, "real_name": False},
    {"key": "grade_level", "label": "학년", "enabled": True, "required": False, "real_name": False},
    {"key": "student_phone", "label": "학생 연락처", "enabled": False, "required": False, "real_name": False},
    {"key": "guardian_name", "label": "보호자 이름", "enabled": False, "required": False, "real_name": True},
    {"key": "guardian_phone", "label": "보호자 연락처", "enabled": False, "required": False, "real_name": False},
    {"key": "birthdate", "label": "생년월일", "enabled": False, "required": False, "real_name": False},
]
ACADEMY_PLAN_TO_STUDENT_PLAN = {
    "free": "free",
    "basic": "basic",
    "pro": "pro",
    "enterprise": "enterprise",
}

def _student_plan_from_forge_plan(plan_code: str | None) -> str:
    code = str(plan_code or "free").strip().lower()
    if code == "enterprise":
        return "enterprise"
    if code == "team" or code.startswith("pro"):
        return "pro"
    if code.startswith("basic"):
        return "basic"
    return ACADEMY_PLAN_TO_STUDENT_PLAN.get(code, "free")


def normalize_invite_code(code: str) -> str:
    return "".join(character for character in str(code or "").upper() if character.isalnum())


def _legacy_normalize_invite_code(code: str) -> str:
    return str(code or "").strip().upper()


def _hash_normalized_invite_code(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_invite_code(code: str) -> str:
    return _hash_normalized_invite_code(normalize_invite_code(code))


def invite_code_hash_candidates(code: str) -> list[str]:
    candidates: list[str] = []
    for normalized in (normalize_invite_code(code), _legacy_normalize_invite_code(code)):
        if normalized:
            hashed = _hash_normalized_invite_code(normalized)
            if hashed not in candidates:
                candidates.append(hashed)
    return candidates


def invite_code_matches(code: str | None, stored_hash: str | None) -> bool:
    if not code or not stored_hash:
        return False
    return stored_hash in invite_code_hash_candidates(code)


def seat_by_invite_code(db: Session, code: str, *, for_update: bool = False) -> AcademySeat | None:
    candidates = invite_code_hash_candidates(code)
    if not candidates:
        return None
    query = select(AcademySeat).where(AcademySeat.invite_code_hash.in_(candidates))
    if for_update:
        query = query.with_for_update()
    return db.scalar(query)


def generate_invite_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    chunks = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)]
    return "-".join(chunks)


def build_student_invite_link(invite_token: str) -> str:
    settings = get_settings()
    base_url = (settings.student_app_url or settings.frontend_url).strip().rstrip("/")
    encoded_token = quote(invite_token.strip(), safe="")
    if base_url.endswith("#") or "/#" in base_url:
        return f"{base_url}/invite/{encoded_token}"
    return f"{base_url}/student/invite/{encoded_token}"


def _clean_student_profile_value(value) -> str:
    return str(value or "").strip()[:160]


def normalize_student_profile_collection(value: dict | None = None) -> dict:
    source = value if isinstance(value, dict) else {}
    source_fields = source.get("fields") if isinstance(source.get("fields"), list) else []
    by_key = {str(item.get("key")): item for item in source_fields if isinstance(item, dict) and item.get("key") in STUDENT_PROFILE_FIELD_KEYS}
    fields = []
    for default in DEFAULT_STUDENT_PROFILE_FIELDS:
        override = by_key.get(default["key"], {})
        enabled = bool(override.get("enabled", default["enabled"]))
        required = bool(override.get("required", default["required"])) and enabled
        fields.append(
            {
                "key": default["key"],
                "label": default["label"],
                "enabled": enabled,
                "required": required,
                "real_name": bool(override.get("real_name", default["real_name"])) and enabled,
            }
        )
    return {"fields": fields}


def student_profile_collection_settings(db: Session, academy_id: str) -> dict:
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = dict(subscription.billing_metadata or {})
    return normalize_student_profile_collection(metadata.get(STUDENT_PROFILE_COLLECTION_METADATA_KEY))


def save_student_profile_collection_settings(db: Session, academy_id: str, settings: dict) -> dict:
    subscription = ensure_academy_subscription(db, academy_id)
    normalized = normalize_student_profile_collection(settings)
    metadata = dict(subscription.billing_metadata or {})
    metadata[STUDENT_PROFILE_COLLECTION_METADATA_KEY] = normalized
    subscription.billing_metadata = metadata
    subscription.updated_at = datetime.utcnow()
    return normalized


def normalize_student_profile_values(values: dict | None) -> dict[str, str]:
    source = values if isinstance(values, dict) else {}
    return {
        key: cleaned
        for key in STUDENT_PROFILE_FIELD_KEYS
        if (cleaned := _clean_student_profile_value(source.get(key)))
    }


def validate_student_profile_values(settings: dict, values: dict | None) -> dict[str, str]:
    normalized = normalize_student_profile_values(values)
    missing = [
        field
        for field in normalize_student_profile_collection(settings)["fields"]
        if field["enabled"] and field["required"] and not normalized.get(field["key"])
    ]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "STUDENT_PROFILE_REQUIRED",
                "message": "학원에서 요구한 학생 정보를 입력해야 합니다.",
                "missing_fields": [field["key"] for field in missing],
                "fields": missing,
            },
        )
    return normalized


def apply_student_profile_values(membership: StudentAcademyMembership, values: dict[str, str]) -> None:
    if not values:
        return
    metadata = dict(membership.metadata_json or {})
    student_profile = dict(metadata.get("student_profile") or {})
    student_profile.update(values)
    metadata["student_profile"] = student_profile
    for key in ("name", "school", "grade_level", "guardian_name", "guardian_phone"):
        if values.get(key):
            metadata[key] = values[key]
    if values.get("name"):
        metadata["display_name"] = values["name"]
        membership.display_name_in_academy = values["name"]
    membership.metadata_json = metadata


def _admin_email_set() -> set[str]:
    return {email.strip().lower() for email in get_settings().admin_emails.split(",") if email.strip()}


def has_unlimited_seats(db: Session, academy_id: str) -> bool:
    if academy_id == "local_user":
        return True
    try:
        academy = db.get(Academy, UUID(academy_id))
    except ValueError:
        return False
    return bool(academy and academy.email.strip().lower() in _admin_email_set())


def real_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else ""


def audit(db: Session, request: Request | None, actor_id: str | None, action: str, target_type: str | None = None, target_id: str | None = None, metadata: dict | None = None) -> None:
    data = metadata or {}
    if request:
        data = {**data, "ip_address": real_ip(request), "user_agent": request.headers.get("user-agent", "")}
    db.add(AuditLog(actor_id=actor_id, action=action, target_type=target_type, target_id=target_id, metadata_json=data))


def ensure_default_academy_plans(db: Session) -> None:
    defaults = [
        ("free", "Free", 0, 0, 0, 5, 5, 5),
        ("basic", "Basic", 5, 0, 8000, 10, 10, 10),
        ("pro", "Pro", 10, 0, 8000, 20, 20, 20),
        ("tutor", "Tutor / Private Tutor", 5, 29000, 6000, 10, 10, 10),
        ("studio", "Studio", 20, 99000, 5000, 20, 20, 20),
        ("academy", "Academy", 50, 249000, 4500, 30, 30, 30),
        ("enterprise", "Enterprise / Custom", 0, 0, 0, 50, 50, 50),
    ]
    for code, name, seats, price, seat_price, upload, extraction, export in defaults:
        plan = db.scalar(select(AcademyStudentPlan).where(AcademyStudentPlan.code == code))
        if not plan:
            db.add(
                AcademyStudentPlan(
                    code=code,
                    name=name,
                    included_seats=seats,
                    monthly_price=price,
                    additional_seat_price=seat_price,
                    daily_upload_quota_per_student=upload,
                    daily_extraction_quota_per_student=extraction,
                    daily_export_quota_per_student=export,
                )
            )
        elif code in {"free", "basic", "pro", "enterprise"}:
            plan.name = name
            plan.included_seats = seats
            plan.monthly_price = price
            plan.additional_seat_price = seat_price
            plan.daily_upload_quota_per_student = upload
            plan.daily_extraction_quota_per_student = extraction
            plan.daily_export_quota_per_student = export


def academy_student_plan_code(db: Session, academy_id: str) -> str:
    subscription = active_forge_subscription(db, academy_id)
    if subscription:
        return _student_plan_from_forge_plan(subscription.plan_code)
    try:
        academy = db.get(Academy, UUID(academy_id))
    except ValueError:
        return "free"
    if not academy or academy.account_type != "academy":
        return "free"
    return _student_plan_from_forge_plan(str(academy.plan.value if hasattr(academy.plan, "value") else academy.plan))


def ensure_academy_subscription(db: Session, academy_id: str) -> AcademyStudentSubscription:
    ensure_default_academy_plans(db)
    plan_code = academy_student_plan_code(db, academy_id)
    sub = db.scalar(select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id == academy_id))
    if not sub:
        now = datetime.utcnow()
        sub = AcademyStudentSubscription(
            academy_id=academy_id,
            plan_code=plan_code,
            current_period_start=now.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
            current_period_end=(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) + timedelta(days=32)).replace(day=1),
        )
        db.add(sub)
        db.flush()
    elif sub.plan_code in SYSTEM_STUDENT_PLAN_CODES and sub.plan_code != plan_code:
        sub.plan_code = plan_code
        sub.updated_at = datetime.utcnow()
    return sub


def get_academy_name(db: Session, academy_id: str) -> str:
    try:
        academy = db.get(Academy, UUID(academy_id))
        return academy.academy_name if academy else "Academy"
    except ValueError:
        return "Academy"


def normalize_invite_phone(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = "".join(ch for ch in str(value).strip() if ch.isdigit() or ch == "+")
    return cleaned or None


def academy_student_seat_capacity(db: Session, academy_id: str) -> dict:
    subscription = ensure_academy_subscription(db, academy_id)
    plan = db.scalar(select(AcademyStudentPlan).where(AcademyStudentPlan.code == subscription.plan_code))
    active_seats = db.scalar(select(func.count(AcademySeat.id)).where(AcademySeat.academy_id == academy_id, AcademySeat.is_active.is_(True))) or 0
    entitled = (plan.included_seats if plan else 0) + int(subscription.purchased_additional_seats or 0)
    unlimited = has_unlimited_seats(db, academy_id) or subscription.overage_policy != "BLOCK_AT_LIMIT"
    return {
        "plan_code": subscription.plan_code,
        "active_seats": int(active_seats),
        "entitled_seats": int(entitled),
        "remaining_seats": None if unlimited else max(int(entitled) - int(active_seats), 0),
        "unlimited": unlimited,
        "overage_policy": subscription.overage_policy,
    }


def ensure_student_seat_capacity(db: Session, academy_id: str, requested_count: int) -> dict:
    capacity = academy_student_seat_capacity(db, academy_id)
    remaining = capacity["remaining_seats"]
    if remaining is not None and requested_count > remaining:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "SEAT_LIMIT_EXCEEDED",
                "message": f"학생 키 {requested_count}개를 만들 수 없습니다. 남은 좌석은 {remaining}개입니다.",
                "remaining_seats": remaining,
                "requested_count": requested_count,
            },
        )
    return capacity


def build_student_key_invite_message(
    academy_name: str,
    class_name: str | None,
    key_code: str,
    template: str | None = None,
) -> str:
    base = template or "{academy_name} {class_name} 클래스 초대 키입니다.\nTena Note에서 학원 키 추가하기에 입력하세요: {key_code}"
    return (
        base.replace("{academy_name}", academy_name or "Tena Forge")
        .replace("{class_name}", class_name or "클래스")
        .replace("{key_code}", key_code)
    )


def build_student_key_sms_url(phone: str, message_body: str) -> str:
    return f"sms:{phone}?body={quote(message_body)}"


def create_student_key_app_notification(
    db: Session,
    student_user_id: str,
    academy_id: str,
    academy_name: str,
    class_name: str | None,
    seat_id: UUID,
) -> StudentNotification:
    row = StudentNotification(
        student_user_id=student_user_id,
        academy_id=academy_id,
        notification_type="academy_key_invite",
        title=f"{academy_name} 학원 초대",
        body=f"{class_name or '클래스'} 초대가 도착했습니다. Tena Note에서 수락해 주세요.",
        metadata_json={"academy_seat_id": str(seat_id), "class_name": class_name},
    )
    db.add(row)
    db.flush()
    return row


def build_student_key_invite_message(
    academy_name: str,
    class_name: str | None,
    key_code: str,
    template: str | None = None,
    invite_url: str | None = None,
) -> str:
    link = invite_url or build_student_invite_link(key_code)
    base = template or "{academy_name} {class_name} 초대 링크입니다.\nTena Note에서 아래 링크를 열어 학생 계정을 연결하세요: {invite_url}"
    return (
        base.replace("{academy_name}", academy_name or "Tena Forge")
        .replace("{class_name}", class_name or "Class")
        .replace("{key_code}", key_code)
        .replace("{invite_url}", link)
    )


def create_student_key_app_notification(
    db: Session,
    student_user_id: str,
    academy_id: str,
    academy_name: str,
    class_name: str | None,
    seat_id: UUID,
    invite_url: str | None = None,
) -> StudentNotification:
    row = StudentNotification(
        student_user_id=student_user_id,
        academy_id=academy_id,
        notification_type="academy_invite",
        title=f"{academy_name} 초대",
        body=f"{class_name or '클래스'} 초대가 도착했습니다. Tena Note에서 초대 링크를 열어 계정을 연결하세요.",
        metadata_json={"academy_seat_id": str(seat_id), "class_name": class_name, "invite_url": invite_url},
    )
    db.add(row)
    db.flush()
    return row


def staff_role(db: Session, user_id: str, academy_id: str) -> str | None:
    if user_id == academy_id:
        return "owner"
    staff = db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.user_id == user_id,
            AcademyStaffMembership.academy_id == academy_id,
            AcademyStaffMembership.is_active.is_(True),
        )
    )
    return staff.role if staff else None


def require_staff(db: Session, request: Request, academy_id: str, allowed: set[str] | None = None, permission: str | None = None) -> str:
    user_id = current_owner_id(request)
    if user_id == academy_id:
        return user_id
    staff = db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.user_id == user_id,
            AcademyStaffMembership.academy_id == academy_id,
            AcademyStaffMembership.is_active.is_(True),
        )
    )
    role = staff.role if staff else None
    if role not in (allowed or STAFF_ROLES):
        raise HTTPException(status_code=403, detail="This academy action is not allowed for your role.")
    if permission and not bool(getattr(staff, permission, False)):
        raise HTTPException(status_code=403, detail="This academy action is not allowed for your role.")
    return user_id


def require_manage_seats(db: Session, request: Request, academy_id: str) -> str:
    user_id = current_owner_id(request)
    if user_id == academy_id:
        return user_id
    staff = db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.user_id == user_id,
            AcademyStaffMembership.academy_id == academy_id,
            AcademyStaffMembership.is_active.is_(True),
        )
    )
    if not staff or (staff.role not in ACADEMY_OWNER_ROLES and not staff.can_manage_seats):
        raise HTTPException(status_code=403, detail="Seat management requires owner/admin permission.")
    return user_id


def require_manage_billing(db: Session, request: Request, academy_id: str) -> str:
    user_id = current_owner_id(request)
    if user_id == academy_id:
        return user_id
    raise HTTPException(status_code=403, detail="Billing requires owner permission.")


def teacher_can_access_class(db: Session, user_id: str, academy_id: str, class_id: UUID) -> bool:
    role = staff_role(db, user_id, academy_id)
    if role in ACADEMY_OWNER_ROLES:
        return True
    if role in {"teacher", "assistant"}:
        return bool(db.scalar(select(ClassTeacher).where(ClassTeacher.class_id == class_id, ClassTeacher.academy_staff_user_id == user_id)))
    return False


def create_seat(
    db: Session,
    academy_id: str,
    display_name: str | None = None,
    class_id: UUID | None = None,
    invite_metadata: dict | None = None,
) -> tuple[AcademySeat, str]:
    subscription = ensure_academy_subscription(db, academy_id)
    plan = db.scalar(select(AcademyStudentPlan).where(AcademyStudentPlan.code == subscription.plan_code))
    entitled = (plan.included_seats if plan else 0) + subscription.purchased_additional_seats
    active_seats = db.scalar(select(func.count(AcademySeat.id)).where(AcademySeat.academy_id == academy_id, AcademySeat.is_active.is_(True))) or 0
    if not has_unlimited_seats(db, academy_id) and subscription.overage_policy == "BLOCK_AT_LIMIT" and active_seats >= entitled:
        raise HTTPException(status_code=402, detail="Purchased seat limit reached. Increase seats or change overage policy.")
    code = generate_invite_code()
    seat = AcademySeat(
        academy_id=academy_id,
        class_id=class_id,
        seat_number=f"S-{active_seats + 1:03d}",
        display_name=display_name,
        invite_metadata=invite_metadata or {},
        invite_code_hash=hash_invite_code(code),
        invite_code_preview=code[-4:],
        last_rotated_at=datetime.utcnow(),
    )
    db.add(seat)
    db.flush()
    return seat, code


def is_unlinked_academy_student(membership: StudentAcademyMembership | None) -> bool:
    if not membership:
        return False
    return str(membership.student_user_id or "").startswith(("manual-", "pending-"))


def create_unlinked_academy_student_for_seat(
    db: Session,
    seat: AcademySeat,
    *,
    class_id: UUID | None = None,
    display_name: str | None = None,
    actor_id: str | None = None,
) -> StudentAcademyMembership:
    existing = db.get(StudentAcademyMembership, seat.current_student_membership_id) if seat.current_student_membership_id else None
    if existing:
        return existing

    invitation = dict(seat.invite_metadata or {})
    profile: dict[str, str] = {}
    metadata: dict = {
        "seat_invitation": invitation,
        "student_profile": profile,
        "invite_code_preview": seat.invite_code_preview,
        "invite_status": "pending",
    }
    recipient_name = str(invitation.get("recipient_name") or display_name or seat.display_name or "").strip()
    recipient_phone = normalize_invite_phone(invitation.get("recipient_phone"))
    if recipient_name:
        profile["name"] = recipient_name
        metadata["name"] = recipient_name
        metadata["display_name"] = recipient_name
    if recipient_phone:
        profile["guardian_phone"] = recipient_phone
        metadata["guardian_phone"] = recipient_phone

    membership = StudentAcademyMembership(
        student_user_id=f"manual-{uuid.uuid4().hex[:24]}",
        academy_id=seat.academy_id,
        academy_seat_id=seat.id,
        display_name_in_academy=recipient_name or display_name or seat.display_name,
        status="active",
        created_by=actor_id,
        metadata_json=metadata,
    )
    db.add(membership)
    db.flush()
    seat.current_student_membership_id = membership.id
    seat.updated_at = datetime.utcnow()

    if class_id:
        link = db.scalar(
            select(ClassStudent).where(
                ClassStudent.class_id == class_id,
                ClassStudent.student_membership_id == membership.id,
                ClassStudent.left_at.is_(None),
            )
        )
        if not link:
            db.add(ClassStudent(class_id=class_id, student_membership_id=membership.id))

    db.add(
        SeatAssignmentHistory(
            academy_seat_id=seat.id,
            academy_id=seat.academy_id,
            student_user_id=membership.student_user_id,
            membership_id=membership.id,
        )
    )
    return membership


def academy_seat_key_status(db: Session, seat: AcademySeat) -> str:
    if not seat.is_active:
        return "revoked"
    if not seat.class_id:
        return "legacy_unassigned"
    membership = db.get(StudentAcademyMembership, seat.current_student_membership_id) if seat.current_student_membership_id else None
    if membership and membership.status == "active":
        if is_unlinked_academy_student(membership):
            return "unclaimed"
        return "claimed"
    return "unclaimed"


def student_has_active_class(db: Session, student_id: str, academy_id: str, class_id: UUID) -> bool:
    membership_ids = list(
        db.scalars(
            select(StudentAcademyMembership.id).where(
                StudentAcademyMembership.student_user_id == student_id,
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.status == "active",
            )
        )
    )
    if not membership_ids:
        return False
    return bool(
        db.scalar(
            select(ClassStudent.id).where(
                ClassStudent.class_id == class_id,
                ClassStudent.left_at.is_(None),
                ClassStudent.student_membership_id.in_(membership_ids),
            )
        )
    )


def rotate_seat_code(db: Session, seat: AcademySeat) -> str:
    code = generate_invite_code()
    metadata = dict(seat.invite_metadata or {})
    metadata["key_code"] = code
    seat.invite_code_hash = hash_invite_code(code)
    seat.invite_code_preview = code[-4:]
    seat.invite_metadata = metadata
    seat.last_rotated_at = datetime.utcnow()
    seat.updated_at = datetime.utcnow()
    return code


def apply_seat_invitation_to_membership(membership: StudentAcademyMembership, seat: AcademySeat) -> None:
    invitation = dict(seat.invite_metadata or {})
    if not invitation:
        return
    metadata = dict(membership.metadata_json or {})
    metadata["seat_invitation"] = invitation
    student_profile = dict(metadata.get("student_profile") or {})
    recipient_name = str(invitation.get("recipient_name") or "").strip()
    recipient_phone = normalize_invite_phone(invitation.get("recipient_phone"))
    if recipient_name:
        student_profile.setdefault("name", recipient_name)
        metadata.setdefault("name", recipient_name)
        metadata.setdefault("display_name", recipient_name)
        if not membership.display_name_in_academy:
            membership.display_name_in_academy = recipient_name
    if recipient_phone:
        student_profile.setdefault("guardian_phone", recipient_phone)
        metadata.setdefault("guardian_phone", recipient_phone)
    metadata["student_profile"] = student_profile
    metadata["invite_status"] = "claimed"
    membership.metadata_json = metadata

    invitation["claimed_at"] = datetime.utcnow().isoformat()
    invitation["delivery_status"] = "claimed"
    seat.invite_metadata = invitation
    seat.updated_at = datetime.utcnow()


def claim_invite_code(db: Session, request: Request, code: str) -> StudentAcademyMembership:
    student_id = current_owner_id(request)
    seat = seat_by_invite_code(db, code, for_update=True)
    if not seat:
        raise HTTPException(status_code=404, detail={"code": "KEY_NOT_FOUND", "message": "존재하지 않는 학원 키입니다."})
    if not seat.is_active:
        raise HTTPException(status_code=410, detail={"code": "KEY_INACTIVE", "message": "비활성화되었거나 해제된 학원 키입니다."})
    if not seat.class_id:
        raise HTTPException(status_code=422, detail={"code": "KEY_MISSING_CLASS", "message": "클래스가 배정되지 않은 학원 키입니다. 학원에서 클래스 키를 다시 발급해야 합니다."})
    if seat.current_student_membership_id:
        assigned = db.get(StudentAcademyMembership, seat.current_student_membership_id)
        if assigned and assigned.status == "active":
            if is_unlinked_academy_student(assigned):
                if student_has_active_class(db, student_id, seat.academy_id, seat.class_id):
                    raise HTTPException(status_code=409, detail={"code": "CLASS_ALREADY_CONNECTED", "message": "이미 이 클래스가 계정에 연결되어 있습니다."})
                previous_student_id = assigned.student_user_id
                assigned.student_user_id = student_id
                assigned.claimed_by = student_id
                assigned.status = "active"
                apply_seat_invitation_to_membership(assigned, seat)
                if seat.class_id:
                    existing_link = db.scalar(
                        select(ClassStudent).where(
                            ClassStudent.class_id == seat.class_id,
                            ClassStudent.student_membership_id == assigned.id,
                            ClassStudent.left_at.is_(None),
                        )
                    )
                    if not existing_link:
                        db.add(ClassStudent(class_id=seat.class_id, student_membership_id=assigned.id))
                db.add(SeatAssignmentHistory(academy_seat_id=seat.id, academy_id=seat.academy_id, student_user_id=student_id, membership_id=assigned.id))
                db.execute(
                    update(WrongAnswerRecord)
                    .where(WrongAnswerRecord.academy_id == seat.academy_id, WrongAnswerRecord.student_id == previous_student_id)
                    .values(student_id=student_id, updated_at=datetime.utcnow())
                )
                db.execute(
                    update(ArchiveAccessGrant)
                    .where(ArchiveAccessGrant.academy_id == seat.academy_id, ArchiveAccessGrant.student_id == previous_student_id)
                    .values(student_id=student_id, updated_at=datetime.utcnow())
                )
                db.execute(
                    update(LearningAssignmentTarget)
                    .where(LearningAssignmentTarget.academy_id == seat.academy_id, LearningAssignmentTarget.student_id == previous_student_id)
                    .values(student_id=student_id)
                )
                db.execute(
                    update(LearningSubmission)
                    .where(LearningSubmission.academy_id == seat.academy_id, LearningSubmission.student_id == previous_student_id)
                    .values(student_id=student_id, updated_at=datetime.utcnow())
                )
                db.execute(
                    update(ProblemAttempt)
                    .where(ProblemAttempt.academy_id == seat.academy_id, ProblemAttempt.student_id == previous_student_id)
                    .values(student_id=student_id)
                )
                db.execute(
                    update(ProblemResult)
                    .where(ProblemResult.academy_id == seat.academy_id, ProblemResult.student_membership_id == assigned.id)
                    .values(student_user_id=student_id, updated_at=datetime.utcnow())
                )
                db.execute(
                    update(PaperSessionResult)
                    .where(PaperSessionResult.academy_id == seat.academy_id, PaperSessionResult.student_membership_id == assigned.id)
                    .values(student_user_id=student_id, updated_at=datetime.utcnow())
                )
                audit(db, request, student_id, "student.academy_key_claimed", "academy_seat", str(seat.id), {"academy_id": seat.academy_id, "manual_membership": True})
                return assigned
            raise HTTPException(status_code=409, detail={"code": "KEY_ALREADY_CLAIMED", "message": "이미 다른 학생 계정에 연결된 학원 키입니다."})
    if student_has_active_class(db, student_id, seat.academy_id, seat.class_id):
        raise HTTPException(status_code=409, detail={"code": "CLASS_ALREADY_CONNECTED", "message": "이미 이 클래스가 계정에 연결되어 있습니다."})
    membership = StudentAcademyMembership(
        student_user_id=student_id,
        academy_id=seat.academy_id,
        academy_seat_id=seat.id,
        claimed_by=student_id,
    )
    apply_seat_invitation_to_membership(membership, seat)
    db.add(membership)
    db.flush()
    seat.current_student_membership_id = membership.id
    seat.released_at = None
    if seat.class_id:
        db.add(ClassStudent(class_id=seat.class_id, student_membership_id=membership.id))
    db.add(SeatAssignmentHistory(academy_seat_id=seat.id, academy_id=seat.academy_id, student_user_id=student_id, membership_id=membership.id))
    db.add(
        StudentNotification(
            student_user_id=student_id,
            academy_id=seat.academy_id,
            notification_type="academy_connected",
            title="Academy connected",
            body=f"{get_academy_name(db, seat.academy_id)} is now available in your student app.",
        )
    )
    audit(db, request, student_id, "student.academy_key_claimed", "academy_seat", str(seat.id), {"academy_id": seat.academy_id})
    return membership


def release_seat(db: Session, request: Request, seat: AcademySeat, reason: str | None = None, rotate_code: bool = True) -> str | None:
    actor_id = current_owner_id(request)
    new_code = None
    if seat.current_student_membership_id:
        membership = db.get(StudentAcademyMembership, seat.current_student_membership_id)
        if membership and membership.status == "active":
            membership.status = "ended"
            membership.ended_at = datetime.utcnow()
            history = db.scalar(
                select(SeatAssignmentHistory)
                .where(SeatAssignmentHistory.membership_id == membership.id, SeatAssignmentHistory.released_at.is_(None))
                .order_by(SeatAssignmentHistory.assigned_at.desc())
            )
            if history:
                history.released_at = datetime.utcnow()
                history.released_by = actor_id
                history.reason = reason
    seat.current_student_membership_id = None
    seat.released_at = datetime.utcnow()
    if rotate_code:
        new_code = rotate_seat_code(db, seat)
    audit(db, request, actor_id, "academy.seat_released", "academy_seat", str(seat.id), {"reason": reason, "rotated": rotate_code})
    return new_code


def student_memberships(db: Session, student_user_id: str) -> list[StudentAcademyMembership]:
    return list(
        db.scalars(
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.student_user_id == student_user_id,
                StudentAcademyMembership.status == "active",
            )
        ).all()
    )


def student_quota(db: Session, student_user_id: str) -> dict:
    ensure_default_academy_plans(db)
    total = dict(BASE_STUDENT_QUOTA)
    contributions = [{"source": "personal", **BASE_STUDENT_QUOTA}]
    for membership in student_memberships(db, student_user_id):
        sub = ensure_academy_subscription(db, membership.academy_id)
        plan = db.scalar(select(AcademyStudentPlan).where(AcademyStudentPlan.code == sub.plan_code))
        if not plan:
            continue
        contribution = {
            "source": membership.academy_id,
            "academy_name": get_academy_name(db, membership.academy_id),
            "upload": plan.daily_upload_quota_per_student,
            "extraction": plan.daily_extraction_quota_per_student,
            "export": plan.daily_export_quota_per_student,
        }
        contributions.append(contribution)
        total["upload"] += contribution["upload"]
        total["extraction"] += contribution["extraction"]
        total["export"] += contribution["export"]
    today = date.today().isoformat()
    used_upload = db.scalar(select(func.coalesce(func.sum(DailyStudentQuotaUsage.upload_count), 0)).where(DailyStudentQuotaUsage.student_user_id == student_user_id, DailyStudentQuotaUsage.date == today)) or 0
    used_extraction = db.scalar(select(func.coalesce(func.sum(DailyStudentQuotaUsage.extraction_count), 0)).where(DailyStudentQuotaUsage.student_user_id == student_user_id, DailyStudentQuotaUsage.date == today)) or 0
    used_export = db.scalar(select(func.coalesce(func.sum(DailyStudentQuotaUsage.export_count), 0)).where(DailyStudentQuotaUsage.student_user_id == student_user_id, DailyStudentQuotaUsage.date == today)) or 0
    used = {"upload": int(used_upload), "extraction": int(used_extraction), "export": int(used_export)}
    return {
        "total": total,
        "used": used,
        "remaining": {key: max(total[key] - used[key], 0) for key in total},
        "contributions": contributions,
    }


def consume_student_quota(db: Session, student_user_id: str, usage_type: str, source: str = "personal", units: int = 1) -> None:
    quota = student_quota(db, student_user_id)
    if quota["remaining"].get(usage_type, 0) < units:
        db.add(AbuseSignal(user_id=student_user_id, academy_id=None if source == "personal" else source, signal_type=f"quota_exceeded_{usage_type}", severity="medium", metadata_json={"units": units}))
        raise HTTPException(status_code=402, detail=f"Daily {usage_type} quota exceeded.")
    today = date.today().isoformat()
    record = db.scalar(select(DailyStudentQuotaUsage).where(DailyStudentQuotaUsage.student_user_id == student_user_id, DailyStudentQuotaUsage.date == today, DailyStudentQuotaUsage.source == source))
    if not record:
        record = DailyStudentQuotaUsage(student_user_id=student_user_id, date=today, source=source)
        db.add(record)
    if usage_type == "upload":
        record.upload_count += units
    elif usage_type == "extraction":
        record.extraction_count += units
    elif usage_type == "export":
        record.export_count += units
    else:
        raise HTTPException(status_code=400, detail="Unknown quota type.")
    record.updated_at = datetime.utcnow()


def can_student_access_academy(db: Session, student_user_id: str, academy_id: str) -> StudentAcademyMembership:
    membership = db.scalar(
        select(StudentAcademyMembership).where(
            StudentAcademyMembership.student_user_id == student_user_id,
            StudentAcademyMembership.academy_id == academy_id,
            StudentAcademyMembership.status == "active",
        )
    )
    if not membership:
        raise HTTPException(status_code=403, detail="This academy context is not connected to your student account.")
    return membership


def visible_class_ids_for_staff(db: Session, user_id: str, academy_id: str) -> list[UUID] | None:
    role = staff_role(db, user_id, academy_id)
    if role in ACADEMY_OWNER_ROLES:
        return None
    if role in {"teacher", "assistant"}:
        return list(db.scalars(select(ClassTeacher.class_id).where(ClassTeacher.academy_staff_user_id == user_id)).all())
    raise HTTPException(status_code=403, detail="Academy staff access required.")


def create_watermark_export_record(
    db: Session,
    request: Request,
    student_user_id: str,
    academy_id: str | None,
    export_type: str,
    source_material_id: UUID | None = None,
) -> WatermarkedExport:
    export_hash = hashlib.sha256(f"{student_user_id}:{academy_id}:{export_type}:{datetime.utcnow().isoformat()}:{secrets.token_hex(8)}".encode()).hexdigest()
    record = WatermarkedExport(
        student_user_id=student_user_id,
        academy_id=academy_id,
        source_material_id=source_material_id,
        export_type=export_type,
        export_hash=export_hash,
        ip_address=real_ip(request),
        user_agent=request.headers.get("user-agent", ""),
    )
    db.add(record)
    return record
