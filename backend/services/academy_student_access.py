import hashlib
import secrets
from datetime import date, datetime, timedelta
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
    ClassStudent,
    ClassTeacher,
    DailyStudentQuotaUsage,
    PaperSessionResult,
    ProblemResult,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    StudentNotification,
    WatermarkedExport,
    WrongAnswerRecord,
)
from services.ownership import current_owner_id

BASE_STUDENT_QUOTA = {"upload": 5, "extraction": 5, "export": 5}
ACADEMY_OWNER_ROLES = {"owner", "admin"}
STAFF_ROLES = {"owner", "admin", "teacher", "assistant"}
SYSTEM_STUDENT_PLAN_CODES = {"free", "basic", "pro", "enterprise", "tutor"}
ACADEMY_PLAN_TO_STUDENT_PLAN = {
    "free": "free",
    "basic": "basic",
    "pro": "pro",
    "enterprise": "enterprise",
}


def hash_invite_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


def generate_invite_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    chunks = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)]
    return "-".join(chunks)


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
    try:
        academy = db.get(Academy, UUID(academy_id))
    except ValueError:
        return "free"
    if not academy or academy.account_type != "academy":
        return "free"
    return ACADEMY_PLAN_TO_STUDENT_PLAN.get(str(academy.plan.value if hasattr(academy.plan, "value") else academy.plan), "free")


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


def require_staff(db: Session, request: Request, academy_id: str, allowed: set[str] | None = None) -> str:
    user_id = current_owner_id(request)
    role = staff_role(db, user_id, academy_id)
    if role not in (allowed or STAFF_ROLES):
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
    staff = db.scalar(
        select(AcademyStaffMembership).where(
            AcademyStaffMembership.user_id == user_id,
            AcademyStaffMembership.academy_id == academy_id,
            AcademyStaffMembership.is_active.is_(True),
        )
    )
    if not staff or (staff.role != "owner" and not staff.can_manage_billing):
        raise HTTPException(status_code=403, detail="Billing requires owner permission.")
    return user_id


def teacher_can_access_class(db: Session, user_id: str, academy_id: str, class_id: UUID) -> bool:
    role = staff_role(db, user_id, academy_id)
    if role in ACADEMY_OWNER_ROLES:
        return True
    if role in {"teacher", "assistant"}:
        return bool(db.scalar(select(ClassTeacher).where(ClassTeacher.class_id == class_id, ClassTeacher.academy_staff_user_id == user_id)))
    return False


def create_seat(db: Session, academy_id: str, display_name: str | None = None, class_id: UUID | None = None) -> tuple[AcademySeat, str]:
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
        invite_code_hash=hash_invite_code(code),
        invite_code_preview=code[-4:],
        last_rotated_at=datetime.utcnow(),
    )
    db.add(seat)
    db.flush()
    return seat, code


def rotate_seat_code(db: Session, seat: AcademySeat) -> str:
    code = generate_invite_code()
    seat.invite_code_hash = hash_invite_code(code)
    seat.invite_code_preview = code[-4:]
    seat.last_rotated_at = datetime.utcnow()
    seat.updated_at = datetime.utcnow()
    return code


def claim_invite_code(db: Session, request: Request, code: str) -> StudentAcademyMembership:
    student_id = current_owner_id(request)
    seat = db.scalar(select(AcademySeat).where(AcademySeat.invite_code_hash == hash_invite_code(code), AcademySeat.is_active.is_(True)))
    if not seat:
        raise HTTPException(status_code=404, detail="Invalid or inactive academy key.")
    if seat.current_student_membership_id:
        assigned = db.get(StudentAcademyMembership, seat.current_student_membership_id)
        if assigned and assigned.status == "active":
            if assigned.student_user_id == student_id:
                return assigned
            if str(assigned.student_user_id).startswith("manual-"):
                previous_student_id = assigned.student_user_id
                assigned.student_user_id = student_id
                assigned.claimed_by = student_id
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
            raise HTTPException(status_code=409, detail="This academy key is already assigned to another student.")
    existing_same = list(
        db.scalars(
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.student_user_id == student_id,
                StudentAcademyMembership.academy_id == seat.academy_id,
                StudentAcademyMembership.status == "active",
            )
        )
    )
    if seat.class_id:
        already_in_class = db.scalar(
            select(ClassStudent)
            .where(
                ClassStudent.class_id == seat.class_id,
                ClassStudent.left_at.is_(None),
                ClassStudent.student_membership_id.in_([membership.id for membership in existing_same] or [UUID(int=0)]),
            )
        )
        if already_in_class:
            raise HTTPException(status_code=409, detail="This class is already connected to your account.")
    elif existing_same:
        raise HTTPException(status_code=409, detail="This academy is already connected to your account.")
    membership = StudentAcademyMembership(
        student_user_id=student_id,
        academy_id=seat.academy_id,
        academy_seat_id=seat.id,
        claimed_by=student_id,
    )
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
