import base64
import binascii
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from database import get_db, get_settings
from models import (
    AcademyClass,
    AcademyMaterial,
    AcademyMaterialAssignment,
    AcademySeat,
    AcademyStaffMembership,
    AcademyStudentPlan,
    AcademyStudentSubscription,
    Assignment,
    AssignmentAnswer,
    AssignmentContent,
    AssignmentSubmission,
    AssignmentTarget,
    CalendarEvent,
    ClassStudent,
    ClassScheduleEvent,
    ClassTeacher,
    DailyStudentQuotaUsage,
    LearningAssignment,
    LearningAssignmentTarget,
    MaterialDeliveryLog,
    PaperSession,
    Problem,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    StudentNotification,
    TestSession,
    TestSessionEvent,
    WrongAnswerAttempt,
    WrongAnswerExport,
    WrongAnswerItem,
    WrongAnswerRecord,
    WrongAnswerReview,
)
from services.academy_student_access import (
    academy_seat_key_status,
    apply_student_profile_values,
    audit,
    build_student_invite_link,
    build_student_key_invite_message,
    build_student_key_sms_url,
    can_student_access_academy,
    consume_student_quota,
    create_student_key_app_notification,
    create_seat,
    create_unlinked_academy_student_for_seat,
    create_watermark_export_record,
    ensure_student_seat_capacity,
    ensure_academy_subscription,
    ensure_default_academy_plans,
    get_academy_name,
    hash_invite_code,
    has_unlimited_seats,
    normalize_invite_phone,
    real_ip,
    release_seat,
    require_manage_billing,
    require_manage_seats,
    require_staff,
    rotate_seat_code,
    staff_role,
    student_memberships,
    student_quota,
    teacher_can_access_class,
    visible_class_ids_for_staff,
    claim_invite_code,
    student_profile_collection_settings,
    validate_student_profile_values,
)
from services.ownership import current_owner_id
from services.pipeline import vision_json

router = APIRouter(prefix="/api", tags=["academy-student-app"])


class SeatInviteRecipient(BaseModel):
    name: str | None = None
    phone: str | None = None
    account_user_id: str | None = None
    memo: str | None = None


class SeatCreate(BaseModel):
    count: int = Field(default=1, ge=1, le=200)
    display_name_prefix: str | None = None
    class_id: UUID | None = None
    delivery_channel: str = Field(default="manual", pattern="^(manual|sms|student_app)$")
    message_template: str | None = None
    recipients: list[SeatInviteRecipient] = Field(default_factory=list, max_length=200)


class SeatReleaseRequest(BaseModel):
    reason: str | None = None
    rotate_code: bool = True


class InviteCodeRequest(BaseModel):
    invite_code: str
    student_profile: dict[str, Any] = Field(default_factory=dict)


class StudentInviteClaimRequest(BaseModel):
    student_profile: dict[str, Any] = Field(default_factory=dict)


class SubscriptionUpdate(BaseModel):
    plan_code: str | None = None
    purchased_additional_seats: int | None = Field(default=None, ge=0)
    overage_policy: str | None = None


class StaffCreate(BaseModel):
    user_id: str
    role: str = "teacher"
    can_manage_billing: bool = False
    can_manage_seats: bool = False
    can_manage_materials: bool = True
    can_manage_assignments: bool = True
    can_manage_students: bool = True
    can_manage_schedule: bool = True
    can_manage_coagent: bool = False
    is_active: bool = True


class ClassPayload(BaseModel):
    name: str
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None


class ClassStudentPayload(BaseModel):
    student_membership_id: UUID


class ClassTeacherPayload(BaseModel):
    academy_staff_user_id: str
    role_in_class: str = "teacher"


class AssignmentPayload(BaseModel):
    title: str
    description: str | None = None
    assignment_type: str = "homework"
    submission_mode: str = "completion"
    target_type: str = "class"
    targets: list[dict[str, str]] = Field(default_factory=list)
    contents: list[dict[str, Any]] = Field(default_factory=list)
    open_at: datetime | None = None
    due_at: datetime | None = None
    close_at: datetime | None = None
    allow_late_submission: bool = False
    late_submission_policy: str | None = None
    result_release_policy: str = "manual"
    time_limit_minutes: int | None = None
    max_attempts: int = 1


class AssignmentSubmitPayload(BaseModel):
    answers: list[dict[str, Any]] = Field(default_factory=list)
    status: str = "submitted"


class ReviewSubmissionPayload(BaseModel):
    score: float | None = None
    feedback: str | None = None
    status: str = "reviewed"


class CalendarEventPayload(BaseModel):
    owner_type: str = "student"
    owner_id: str | None = None
    academy_id: str | None = None
    class_id: UUID | None = None
    student_membership_id: UUID | None = None
    title: str
    description: str | None = None
    event_type: str = "custom"
    starts_at: datetime
    ends_at: datetime
    visibility: str = "personal_private"
    recurrence_rule: str | None = None


class MaterialPayload(BaseModel):
    title: str
    material_type: str = "pdf"
    storage_path: str | None = None
    external_url: str | None = None
    permissions: dict[str, Any] = Field(default_factory=lambda: {"view": True, "download": False, "print": False, "export": False, "add_to_wrong_answer": False})
    expires_at: datetime | None = None
    assignments: list[dict[str, str]] = Field(default_factory=list)


class WrongAnswerPayload(BaseModel):
    academy_id: str | None = None
    source_type: str = "manual_entry"
    source_ref_id: str | None = None
    original_image_asset_id: str | None = None
    extracted_problem_text: str | None = None
    extracted_choices: list[Any] = Field(default_factory=list)
    extracted_answer: str | None = None
    extracted_explanation: str | None = None
    subject: str | None = None
    unit: str | None = None
    difficulty: str | None = None
    tags: list[str] = Field(default_factory=list)
    visibility: str = "private"
    memo: str | None = None


class WrongAnswerAttemptPayload(BaseModel):
    result: str
    answer_text: str | None = None
    time_spent_seconds: int | None = None
    memo: str | None = None


class WrongAnswerExportPayload(BaseModel):
    item_ids: list[UUID]
    academy_id: str | None = None


class NoteTextExtractionPayload(BaseModel):
    image_base64: str = Field(min_length=32, max_length=8_000_000)
    image_mime: str = "image/png"


class NoteTextExtractionResponse(BaseModel):
    text: str


def serialize(obj: Any) -> dict:
    data = {}
    for column in obj.__table__.columns:
        attr_name = "metadata_json" if column.name == "metadata" else column.key
        value = getattr(obj, attr_name)
        if isinstance(value, UUID):
            value = str(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        data[column.name] = value
    return data


def seat_payload(db: Session, seat: AcademySeat) -> dict:
    membership = db.get(StudentAcademyMembership, seat.current_student_membership_id) if seat.current_student_membership_id else None
    class_row = db.get(AcademyClass, seat.class_id) if seat.class_id else None
    key_status = academy_seat_key_status(db, seat)
    is_claimed = bool(membership and membership.status == "active" and key_status == "claimed")
    return {
        **serialize(seat),
        "class_name": class_row.name if class_row else None,
        "assigned": is_claimed,
        "academy_student_id": str(membership.id) if membership else None,
        "linked_user_id": membership.student_user_id if is_claimed else None,
        "assigned_student_user_id": membership.student_user_id if is_claimed else None,
        "assigned_membership_id": str(membership.id) if membership else None,
        "key_status": key_status,
    }


def _class_id_for_seat(db: Session, academy_id: str, class_id: UUID | None) -> UUID | None:
    if not class_id:
        return None
    class_row = db.scalar(select(AcademyClass).where(AcademyClass.id == class_id, AcademyClass.academy_id == academy_id, AcademyClass.is_active.is_(True)))
    if not class_row:
        raise HTTPException(status_code=404, detail="Class not found.")
    return class_row.id


def _seat_invite_recipients(payload: SeatCreate) -> list[SeatInviteRecipient]:
    if payload.recipients:
        return payload.recipients
    return [SeatInviteRecipient(name=(f"{payload.display_name_prefix} {index + 1}" if payload.display_name_prefix else None)) for index in range(payload.count)]


def _create_invited_student_seats(
    db: Session,
    academy_id: str,
    class_row: AcademyClass,
    payload: SeatCreate,
    actor_id: str | None = None,
) -> list[dict]:
    recipients = _seat_invite_recipients(payload)
    ensure_student_seat_capacity(db, academy_id, len(recipients))
    academy_name = get_academy_name(db, academy_id)
    created: list[dict] = []
    for index, recipient in enumerate(recipients):
        recipient_name = (recipient.name or "").strip() or None
        recipient_phone = normalize_invite_phone(recipient.phone)
        account_user_id = (recipient.account_user_id or "").strip() or None
        if payload.delivery_channel == "sms" and not recipient_phone:
            raise HTTPException(status_code=422, detail={"code": "RECIPIENT_PHONE_REQUIRED", "message": f"{index + 1}번째 학생의 SMS 연락처가 필요합니다."})
        if payload.delivery_channel == "student_app" and not account_user_id:
            raise HTTPException(status_code=422, detail={"code": "RECIPIENT_ACCOUNT_REQUIRED", "message": f"{index + 1}번째 학생의 Tena 계정 ID가 필요합니다."})

        display_name = recipient_name or recipient_phone or (f"{payload.display_name_prefix} {index + 1}" if payload.display_name_prefix else None)
        seat, code = create_seat(db, academy_id, display_name, class_id=class_row.id)
        invite_url = build_student_invite_link(code)
        message_body = build_student_key_invite_message(academy_name, class_row.name, code, payload.message_template, invite_url)
        sms_url = build_student_key_sms_url(recipient_phone, message_body) if payload.delivery_channel == "sms" and recipient_phone else None
        notification_id = None
        delivery_status = "manual_copy_ready"
        if payload.delivery_channel == "sms":
            delivery_status = "sms_link_ready"
        elif payload.delivery_channel == "student_app" and account_user_id:
            notification = create_student_key_app_notification(db, account_user_id, academy_id, academy_name, class_row.name, seat.id, invite_url)
            notification_id = str(notification.id)
            delivery_status = "app_notification_created"

        seat.invite_metadata = {
            "source": "bulk_student_key_invite" if payload.recipients else "single_student_key_invite",
            "channel": payload.delivery_channel,
            "recipient_name": recipient_name,
            "recipient_phone": recipient_phone,
            "recipient_account_user_id": account_user_id,
            "recipient_memo": (recipient.memo or "").strip() or None,
            "message_body": message_body,
            "invite_url": invite_url,
            "sms_url": sms_url,
            "notification_id": notification_id,
            "delivery_status": delivery_status,
            "prepared_at": datetime.utcnow().isoformat(),
        }
        create_unlinked_academy_student_for_seat(
            db,
            seat,
            class_id=class_row.id,
            display_name=display_name,
            actor_id=actor_id,
        )
        created.append(
            {
                **seat_payload(db, seat),
                "invite_code": code,
                "key_code": code,
                "invite_url": invite_url,
                "message_body": message_body,
                "sms_url": sms_url,
                "notification_id": notification_id,
                "delivery_status": delivery_status,
            }
        )
    return created


def _student_membership_for_assignment(db: Session, student_id: str, assignment: Assignment) -> StudentAcademyMembership:
    memberships = [membership for membership in student_memberships(db, student_id) if membership.academy_id == assignment.academy_id]
    if not memberships:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    by_id = {str(membership.id): membership for membership in memberships}
    targets = db.scalars(select(AssignmentTarget).where(AssignmentTarget.assignment_id == assignment.id)).all()
    for target in targets:
        if target.target_type == "student" and target.target_id in by_id:
            return by_id[target.target_id]
    class_targets = [UUID(target.target_id) for target in targets if target.target_type == "class"]
    if class_targets:
        row = db.scalar(
            select(ClassStudent)
            .where(
                ClassStudent.class_id.in_(class_targets),
                ClassStudent.student_membership_id.in_([membership.id for membership in memberships]),
                ClassStudent.left_at.is_(None),
            )
        )
        if row:
            return by_id[str(row.student_membership_id)]
    for target in targets:
        if target.target_type == "academy" and target.target_id == assignment.academy_id:
            return memberships[0]
    return memberships[0]


def _student_class_ids_for_membership(db: Session, membership: StudentAcademyMembership) -> list[UUID]:
    class_ids: set[UUID] = set(
        db.scalars(
            select(ClassStudent.class_id).where(
                ClassStudent.student_membership_id == membership.id,
                ClassStudent.left_at.is_(None),
            )
        ).all()
    )
    seat = db.get(AcademySeat, membership.academy_seat_id)
    if seat and seat.class_id:
        class_ids.add(seat.class_id)
    return list(class_ids)


def _student_class_ids(db: Session, memberships: list[StudentAcademyMembership]) -> list[UUID]:
    class_ids: set[UUID] = set()
    for membership in memberships:
        class_ids.update(_student_class_ids_for_membership(db, membership))
    return list(class_ids)


def _student_membership_payload(db: Session, membership: StudentAcademyMembership) -> dict[str, Any]:
    class_ids = _student_class_ids_for_membership(db, membership)
    class_rows = db.scalars(select(AcademyClass).where(AcademyClass.id.in_(class_ids))).all() if class_ids else []
    class_by_id = {str(row.id): row for row in class_rows}
    ordered_classes = [class_by_id[str(class_id)] for class_id in class_ids if str(class_id) in class_by_id]
    first_class = ordered_classes[0] if ordered_classes else None
    return {
        **serialize(membership),
        "academy_student_id": str(membership.id),
        "academy_name": get_academy_name(db, membership.academy_id),
        "class_id": str(first_class.id) if first_class else None,
        "class_name": first_class.name if first_class else None,
        "class_ids": [str(row.id) for row in ordered_classes],
        "class_names": [row.name for row in ordered_classes],
    }


def _student_invite_payload(db: Session, seat: AcademySeat) -> dict[str, Any]:
    membership = db.get(StudentAcademyMembership, seat.current_student_membership_id) if seat.current_student_membership_id else None
    class_row = db.get(AcademyClass, seat.class_id) if seat.class_id else None
    key_status = academy_seat_key_status(db, seat)
    invitation = dict(seat.invite_metadata or {})
    metadata = dict(membership.metadata_json or {}) if membership else {}
    student_name = (
        (membership.display_name_in_academy if membership else None)
        or metadata.get("display_name")
        or metadata.get("name")
        or invitation.get("recipient_name")
        or seat.display_name
    )
    status = {
        "unclaimed": "pending",
        "claimed": "claimed",
        "revoked": "revoked",
        "legacy_unassigned": "invalid",
    }.get(key_status, key_status)
    return {
        "invite_id": str(seat.id),
        "academy_id": seat.academy_id,
        "academy_name": get_academy_name(db, seat.academy_id),
        "academy_student_id": str(membership.id) if membership else None,
        "student_name": student_name,
        "class_id": str(class_row.id) if class_row else None,
        "class_name": class_row.name if class_row else None,
        "status": status,
        "key_status": key_status,
        "invite_code_preview": seat.invite_code_preview,
        "linked_user_id": membership.student_user_id if key_status == "claimed" and membership else None,
        "claimed_at": invitation.get("claimed_at"),
        "expires_at": None,
    }


def student_learning_assignment_ids(db: Session, student_id: str, academy_id: str | None = None) -> list[UUID]:
    ids: set[UUID] = set()
    for membership in student_memberships(db, student_id):
        if academy_id and membership.academy_id != academy_id:
            continue
        class_ids = _student_class_ids_for_membership(db, membership)
        targets = [LearningAssignmentTarget.student_id == student_id]
        if class_ids:
            targets.append(LearningAssignmentTarget.group_id.in_(class_ids))
        ids.update(
            db.scalars(
                select(LearningAssignmentTarget.assignment_id).where(
                    LearningAssignmentTarget.academy_id == membership.academy_id,
                    or_(*targets),
                )
            ).all()
        )
    return list(ids)


def _class_schedule_calendar_payload(event: ClassScheduleEvent, class_names: dict[UUID, str]) -> dict[str, Any]:
    class_name = class_names.get(event.class_id)
    title = event.title or class_name or "Class"
    return {
        "id": str(event.id),
        "title": title,
        "description": event.description,
        "event_type": "class_schedule",
        "starts_at": event.starts_at.isoformat(),
        "ends_at": event.ends_at.isoformat() if event.ends_at else None,
        "visibility": "class_members",
        "academy_id": event.academy_id,
        "class_id": str(event.class_id),
        "class_name": class_name,
        "source_type": "forge_class_schedule",
    }


def _wrong_answer_note_payload(db: Session, record: WrongAnswerRecord, membership_by_academy: dict[str, StudentAcademyMembership]) -> dict[str, Any]:
    problem = db.scalar(select(Problem).where(Problem.id == record.problem_id))
    tags = problem.tags if problem else None
    membership = membership_by_academy.get(record.academy_id)
    status = record.resolved_status or "unresolved"
    return {
        "id": str(record.id),
        "student_user_id": record.student_id,
        "academy_id": record.academy_id,
        "student_membership_id": str(membership.id) if membership else None,
        "source_type": "forge_wrong_answer",
        "source_ref_id": str(record.problem_id),
        "original_image_asset_id": None,
        "original_pdf_page_asset_id": None,
        "extracted_problem_text": problem.problem_text if problem else None,
        "extracted_choices": problem.choices if problem else [],
        "extracted_answer": problem.answer if problem else None,
        "extracted_explanation": problem.solution_steps if problem else None,
        "subject": tags.subject if tags else None,
        "unit": tags.unit if tags else None,
        "difficulty": tags.difficulty if tags else None,
        "tags": ["forge", status],
        "visibility": "academy_linked",
        "memo": record.student_memo or record.teacher_memo,
        "created_at": record.latest_wrong_at.isoformat() if record.latest_wrong_at else record.created_at.isoformat(),
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        "archived_at": None,
        "wrong_count": record.wrong_count,
        "retry_count": record.retry_count,
        "resolved_status": status,
    }


def _wrong_answer_calendar_payloads(records: list[WrongAnswerRecord]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for record in records:
        if record.resolved_status not in {"unresolved", "reviewing"}:
            continue
        base_time = record.latest_wrong_at or record.created_at
        day_key = base_time.date().isoformat()
        key = (record.academy_id, day_key)
        entry = grouped.setdefault(
            key,
            {
                "id": f"wrong-answers:{record.academy_id}:{day_key}",
                "title": "Wrong answers",
                "description": None,
                "event_type": "wrong_answer_review",
                "starts_at": base_time.replace(hour=20, minute=0, second=0, microsecond=0).isoformat(),
                "ends_at": None,
                "visibility": "academy_linked",
                "academy_id": record.academy_id,
                "source_type": "forge_wrong_answer_archive",
                "count": 0,
            },
        )
        entry["count"] += 1
    payloads = []
    for entry in grouped.values():
        count = int(entry.pop("count"))
        entry["title"] = f"Wrong answers {count}" if count > 1 else "Wrong answer"
        payloads.append(entry)
    return payloads


def _paper_session_visible_to_student(session: PaperSession, class_ids: list[UUID], membership_ids: list[UUID]) -> bool:
    session_class_ids = {str(value) for value in (session.class_ids or []) if value}
    session_membership_ids = {str(value) for value in (session.student_membership_ids or []) if value}
    return bool(
        session_class_ids.intersection({str(value) for value in class_ids})
        or session_membership_ids.intersection({str(value) for value in membership_ids})
    )


def _paper_session_event_payload(session: PaperSession) -> dict[str, Any] | None:
    if not session.scheduled_at:
        return None
    return {
        "id": f"paper-session:{session.id}",
        "title": session.title,
        "description": session.description,
        "event_type": "paper_session",
        "starts_at": session.scheduled_at.isoformat(),
        "ends_at": session.due_at.isoformat() if session.due_at else None,
        "visibility": "class_members",
        "academy_id": session.academy_id,
        "source_type": "forge_paper_session",
    }


@router.get("/academy/plans")
def list_academy_plans(db: Session = Depends(get_db)):
    ensure_default_academy_plans(db)
    db.commit()
    return [serialize(plan) for plan in db.scalars(select(AcademyStudentPlan).order_by(AcademyStudentPlan.monthly_price)).all()]


@router.get("/academy/{academy_id}/billing")
def academy_billing(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_manage_billing(db, request, academy_id)
    sub = ensure_academy_subscription(db, academy_id)
    plan = db.scalar(select(AcademyStudentPlan).where(AcademyStudentPlan.code == sub.plan_code))
    active_seats = db.scalar(select(func.count(AcademySeat.id)).where(AcademySeat.academy_id == academy_id, AcademySeat.is_active.is_(True))) or 0
    assigned = db.scalar(select(func.count(AcademySeat.id)).where(AcademySeat.academy_id == academy_id, AcademySeat.current_student_membership_id.is_not(None), AcademySeat.is_active.is_(True))) or 0
    unlimited_seats = has_unlimited_seats(db, academy_id)
    included = max(int(active_seats), plan.included_seats if plan else 0) if unlimited_seats else plan.included_seats if plan else 0
    billable_extra = 0 if unlimited_seats else max(int(active_seats) - included, 0)
    estimated_bill = (plan.monthly_price if plan else 0) + billable_extra * (plan.additional_seat_price if plan else 0)
    return {
        "subscription": serialize(sub),
        "plan": serialize(plan) if plan else None,
        "unlimited_seats": unlimited_seats,
        "included_seats": included,
        "purchased_additional_seats": sub.purchased_additional_seats,
        "active_seats": int(active_seats),
        "assigned_seats": int(assigned),
        "unassigned_seats": max(int(active_seats) - int(assigned), 0),
        "estimated_monthly_bill": estimated_bill,
    }


@router.patch("/academy/{academy_id}/billing")
def update_academy_billing(academy_id: str, payload: SubscriptionUpdate, request: Request, db: Session = Depends(get_db)):
    actor = require_manage_billing(db, request, academy_id)
    sub = ensure_academy_subscription(db, academy_id)
    if payload.plan_code:
        plan = db.scalar(select(AcademyStudentPlan).where(AcademyStudentPlan.code == payload.plan_code))
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found.")
        sub.plan_code = payload.plan_code
    if payload.purchased_additional_seats is not None:
        sub.purchased_additional_seats = payload.purchased_additional_seats
    if payload.overage_policy:
        if payload.overage_policy not in {"AUTO_BILL_OVERAGE", "BLOCK_AT_LIMIT"}:
            raise HTTPException(status_code=400, detail="Invalid overage policy.")
        sub.overage_policy = payload.overage_policy
    audit(db, request, actor, "academy.billing_updated", "academy", academy_id, payload.model_dump(exclude_none=True))
    db.commit()
    return {"ok": True}


@router.get("/academy/{academy_id}/seats")
def list_seats(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_manage_seats(db, request, academy_id)
    seats = db.scalars(select(AcademySeat).where(AcademySeat.academy_id == academy_id).order_by(AcademySeat.created_at)).all()
    return [seat_payload(db, seat) for seat in seats]


@router.post("/academy/{academy_id}/seats")
def create_seats(academy_id: str, payload: SeatCreate, request: Request, db: Session = Depends(get_db)):
    actor = require_manage_seats(db, request, academy_id)
    if not payload.class_id:
        raise HTTPException(status_code=422, detail={"code": "CLASS_REQUIRED", "message": "학생 앱용 키는 반드시 클래스를 선택해서 발급해야 합니다."})
    class_id = _class_id_for_seat(db, academy_id, payload.class_id)
    class_row = db.get(AcademyClass, class_id)
    if not class_row:
        raise HTTPException(status_code=404, detail="Class not found.")
    created = _create_invited_student_seats(db, academy_id, class_row, payload, actor_id=actor)
    audit(
        db,
        request,
        actor,
        "academy.seats_created",
        "academy",
        academy_id,
        {"count": len(created), "class_id": str(class_id) if class_id else None, "delivery_channel": payload.delivery_channel},
    )
    db.commit()
    return created


@router.post("/academy/{academy_id}/seats/{seat_id}/rotate-code")
def rotate_code(academy_id: str, seat_id: UUID, request: Request, db: Session = Depends(get_db)):
    actor = require_manage_seats(db, request, academy_id)
    seat = db.scalar(select(AcademySeat).where(AcademySeat.id == seat_id, AcademySeat.academy_id == academy_id))
    if not seat:
        raise HTTPException(status_code=404, detail="Seat not found.")
    code = rotate_seat_code(db, seat)
    audit(db, request, actor, "academy.seat_code_rotated", "academy_seat", str(seat.id))
    db.commit()
    return {**seat_payload(db, seat), "invite_code": code, "invite_url": build_student_invite_link(code)}


@router.post("/academy/{academy_id}/seats/{seat_id}/release")
def release_student_seat(academy_id: str, seat_id: UUID, payload: SeatReleaseRequest, request: Request, db: Session = Depends(get_db)):
    require_manage_seats(db, request, academy_id)
    seat = db.scalar(select(AcademySeat).where(AcademySeat.id == seat_id, AcademySeat.academy_id == academy_id))
    if not seat:
        raise HTTPException(status_code=404, detail="Seat not found.")
    new_code = release_seat(db, request, seat, reason=payload.reason, rotate_code=payload.rotate_code)
    db.commit()
    return {**seat_payload(db, seat), "invite_code": new_code, "invite_url": build_student_invite_link(new_code) if new_code else None}


@router.get("/academy/{academy_id}/seats/{seat_id}/history")
def seat_history(academy_id: str, seat_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_manage_seats(db, request, academy_id)
    rows = db.scalars(select(SeatAssignmentHistory).where(SeatAssignmentHistory.academy_seat_id == seat_id, SeatAssignmentHistory.academy_id == academy_id).order_by(SeatAssignmentHistory.assigned_at.desc())).all()
    return [serialize(row) for row in rows]


@router.get("/student/invites/{invite_token}")
def student_invite_preview(invite_token: str, request: Request, db: Session = Depends(get_db)):
    current_owner_id(request)
    seat = db.scalar(select(AcademySeat).where(AcademySeat.invite_code_hash == hash_invite_code(invite_token)))
    if not seat:
        raise HTTPException(status_code=404, detail={"code": "INVITE_NOT_FOUND", "message": "Invite link was not found."})
    if not seat.is_active:
        raise HTTPException(status_code=410, detail={"code": "INVITE_REVOKED", "message": "Invite link is no longer active."})
    return _student_invite_payload(db, seat)


@router.post("/student/invites/{invite_token}/claim")
def claim_student_invite(invite_token: str, payload: StudentInviteClaimRequest, request: Request, db: Session = Depends(get_db)):
    seat = db.scalar(select(AcademySeat).where(AcademySeat.invite_code_hash == hash_invite_code(invite_token)))
    if seat:
        profile_values = validate_student_profile_values(student_profile_collection_settings(db, seat.academy_id), payload.student_profile)
    else:
        profile_values = {}
    membership = claim_invite_code(db, request, invite_token)
    apply_student_profile_values(membership, profile_values)
    db.commit()
    return _student_membership_payload(db, membership)


@router.get("/student/academy-keys/requirements")
def academy_key_requirements(invite_code: str, request: Request, db: Session = Depends(get_db)):
    seat = db.scalar(select(AcademySeat).where(AcademySeat.invite_code_hash == hash_invite_code(invite_code)))
    if not seat:
        raise HTTPException(status_code=404, detail={"code": "KEY_NOT_FOUND", "message": "존재하지 않는 학원 키입니다."})
    if not seat.is_active:
        raise HTTPException(status_code=410, detail={"code": "KEY_INACTIVE", "message": "비활성화되었거나 해제된 학원 키입니다."})
    if not seat.class_id:
        raise HTTPException(status_code=422, detail={"code": "KEY_MISSING_CLASS", "message": "클래스가 배정되지 않은 학원 키입니다. 학원에서 클래스 키를 다시 발급해야 합니다."})
    class_row = db.get(AcademyClass, seat.class_id)
    return {
        "academy_id": seat.academy_id,
        "academy_name": get_academy_name(db, seat.academy_id),
        "class_id": str(class_row.id) if class_row else None,
        "class_name": class_row.name if class_row else None,
        **student_profile_collection_settings(db, seat.academy_id),
    }


@router.post("/student/academy-keys/claim")
def claim_academy_key(payload: InviteCodeRequest, request: Request, db: Session = Depends(get_db)):
    seat = db.scalar(select(AcademySeat).where(AcademySeat.invite_code_hash == hash_invite_code(payload.invite_code)))
    if seat:
        profile_values = validate_student_profile_values(student_profile_collection_settings(db, seat.academy_id), payload.student_profile)
    else:
        profile_values = {}
    membership = claim_invite_code(db, request, payload.invite_code)
    apply_student_profile_values(membership, profile_values)
    db.commit()
    return _student_membership_payload(db, membership)


@router.get("/student/academies")
def connected_academies(request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    memberships = student_memberships(db, user_id)
    rows = []
    for membership in memberships:
        rows.append(_student_membership_payload(db, membership))
    return rows


@router.get("/student/quotas")
def get_student_quotas(request: Request, db: Session = Depends(get_db)):
    return student_quota(db, current_owner_id(request))


@router.post("/academy/{academy_id}/staff")
def upsert_staff(academy_id: str, payload: StaffCreate, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin"})
    if payload.role not in {"admin", "teacher", "assistant"}:
        raise HTTPException(status_code=400, detail="Invalid staff role.")
    staff = db.scalar(select(AcademyStaffMembership).where(AcademyStaffMembership.academy_id == academy_id, AcademyStaffMembership.user_id == payload.user_id))
    if (not staff or not staff.is_active) and payload.is_active:
        subscription = ensure_academy_subscription(db, academy_id)
        active_staff = db.scalar(
            select(func.count(AcademyStaffMembership.id)).where(
                AcademyStaffMembership.academy_id == academy_id,
                AcademyStaffMembership.is_active.is_(True),
            )
        ) or 0
        if active_staff >= int(subscription.purchased_staff_seats or 0):
            raise HTTPException(status_code=402, detail="Purchased staff seat limit reached. Add Staff Seat Pack before inviting instructors.")
    if not staff:
        staff = AcademyStaffMembership(academy_id=academy_id, user_id=payload.user_id)
        db.add(staff)
    for key, value in payload.model_dump().items():
        if key != "user_id":
            setattr(staff, key, value)
    staff.can_manage_billing = False
    audit(db, request, actor, "academy.staff_upserted", "academy_staff", payload.user_id, {"academy_id": academy_id, "role": payload.role})
    db.commit()
    return serialize(staff)


@router.get("/academy/{academy_id}/classes")
def list_classes(academy_id: str, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, permission="can_manage_students")
    visible = visible_class_ids_for_staff(db, actor, academy_id)
    query = select(AcademyClass).where(AcademyClass.academy_id == academy_id)
    if visible is not None:
        query = query.where(AcademyClass.id.in_(visible))
    return [serialize(row) for row in db.scalars(query.order_by(AcademyClass.created_at.desc())).all()]


@router.post("/academy/{academy_id}/classes")
def create_class(academy_id: str, payload: ClassPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher"}, permission="can_manage_students")
    academy_class = AcademyClass(academy_id=academy_id, **payload.model_dump())
    db.add(academy_class)
    db.flush()
    if staff_role(db, actor, academy_id) == "teacher":
        db.add(ClassTeacher(class_id=academy_class.id, academy_staff_user_id=actor))
    audit(db, request, actor, "academy.class_created", "academy_class", str(academy_class.id), {"academy_id": academy_id})
    db.commit()
    return serialize(academy_class)


@router.post("/academy/{academy_id}/classes/{class_id}/students")
def add_class_student(academy_id: str, class_id: UUID, payload: ClassStudentPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"}, permission="can_manage_students")
    if not teacher_can_access_class(db, actor, academy_id, class_id):
        raise HTTPException(status_code=403, detail="You can manage only assigned classes.")
    membership = db.scalar(select(StudentAcademyMembership).where(StudentAcademyMembership.id == payload.student_membership_id, StudentAcademyMembership.academy_id == academy_id, StudentAcademyMembership.status == "active"))
    if not membership:
        raise HTTPException(status_code=404, detail="Active student membership not found.")
    row = db.scalar(select(ClassStudent).where(ClassStudent.class_id == class_id, ClassStudent.student_membership_id == payload.student_membership_id))
    if not row:
        row = ClassStudent(class_id=class_id, student_membership_id=payload.student_membership_id)
        db.add(row)
    row.left_at = None
    audit(db, request, actor, "academy.class_student_added", "academy_class", str(class_id), {"membership_id": str(payload.student_membership_id)})
    db.commit()
    return serialize(row)


@router.post("/academy/{academy_id}/classes/{class_id}/teachers")
def add_class_teacher(academy_id: str, class_id: UUID, payload: ClassTeacherPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin"})
    row = db.scalar(select(ClassTeacher).where(ClassTeacher.class_id == class_id, ClassTeacher.academy_staff_user_id == payload.academy_staff_user_id))
    if not row:
        row = ClassTeacher(class_id=class_id, academy_staff_user_id=payload.academy_staff_user_id, role_in_class=payload.role_in_class)
        db.add(row)
    row.role_in_class = payload.role_in_class
    audit(db, request, actor, "academy.class_teacher_added", "academy_class", str(class_id), {"teacher_id": payload.academy_staff_user_id})
    db.commit()
    return serialize(row)


@router.post("/academy/{academy_id}/assignments")
def create_assignment(academy_id: str, payload: AssignmentPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"}, permission="can_manage_assignments")
    for target in payload.targets:
        if target.get("target_type") == "class" and not teacher_can_access_class(db, actor, academy_id, UUID(target["target_id"])):
            raise HTTPException(status_code=403, detail="Cannot assign to unrelated class.")
        if target.get("target_type") == "academy" and staff_role(db, actor, academy_id) not in {"owner", "admin"}:
            raise HTTPException(status_code=403, detail="Only owner/admin can assign to whole academy.")
    assignment = Assignment(
        academy_id=academy_id,
        created_by_user_id=actor,
        title=payload.title,
        description=payload.description,
        assignment_type=payload.assignment_type,
        submission_mode=payload.submission_mode,
        target_type=payload.target_type,
        open_at=payload.open_at,
        due_at=payload.due_at,
        close_at=payload.close_at,
        allow_late_submission=payload.allow_late_submission,
        late_submission_policy=payload.late_submission_policy,
        result_release_policy=payload.result_release_policy,
        time_limit_minutes=payload.time_limit_minutes,
        max_attempts=payload.max_attempts,
    )
    db.add(assignment)
    db.flush()
    for target in payload.targets:
        db.add(AssignmentTarget(assignment_id=assignment.id, target_type=target["target_type"], target_id=target["target_id"]))
    for index, content in enumerate(payload.contents):
        db.add(AssignmentContent(assignment_id=assignment.id, order_index=index, **content))
    audit(db, request, actor, "academy.assignment_created", "assignment", str(assignment.id), {"academy_id": academy_id})
    db.commit()
    return serialize(assignment)


@router.get("/academy/{academy_id}/assignments")
def list_academy_assignments(academy_id: str, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, permission="can_manage_assignments")
    visible_classes = visible_class_ids_for_staff(db, actor, academy_id)
    query = select(Assignment).where(Assignment.academy_id == academy_id, Assignment.archived_at.is_(None))
    if visible_classes is not None:
        class_target_ids = [str(item) for item in visible_classes]
        assignment_ids = select(AssignmentTarget.assignment_id).where(AssignmentTarget.target_type == "class", AssignmentTarget.target_id.in_(class_target_ids))
        query = query.where(or_(Assignment.created_by_user_id == actor, Assignment.id.in_(assignment_ids)))
    return [serialize(row) for row in db.scalars(query.order_by(Assignment.created_at.desc())).all()]


def student_assignment_ids(db: Session, student_id: str, academy_id: str | None = None) -> list[UUID]:
    memberships = student_memberships(db, student_id)
    if academy_id:
        memberships = [m for m in memberships if m.academy_id == academy_id]
    ids: set[UUID] = set()
    for membership in memberships:
        class_ids = _student_class_ids_for_membership(db, membership)
        targets = [
            and_(AssignmentTarget.target_type == "student", AssignmentTarget.target_id == str(membership.id)),
            and_(AssignmentTarget.target_type == "academy", AssignmentTarget.target_id == membership.academy_id),
        ]
        if class_ids:
            targets.append(and_(AssignmentTarget.target_type == "class", AssignmentTarget.target_id.in_([str(c) for c in class_ids])))
        ids.update(db.scalars(select(AssignmentTarget.assignment_id).where(or_(*targets))).all())
    return list(ids)


@router.get("/student/assignments")
def list_student_assignments(request: Request, academy_id: str | None = None, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    ids = student_assignment_ids(db, student_id, academy_id)
    if not ids:
        return []
    assignments = db.scalars(select(Assignment).where(Assignment.id.in_(ids), Assignment.archived_at.is_(None)).order_by(Assignment.due_at.is_(None), Assignment.due_at)).all()
    return [serialize(row) for row in assignments]


@router.post("/student/assignments/{assignment_id}/submit")
def submit_assignment(assignment_id: UUID, payload: AssignmentSubmitPayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    assignment = db.get(Assignment, assignment_id)
    if not assignment or assignment_id not in student_assignment_ids(db, student_id, assignment.academy_id):
        raise HTTPException(status_code=404, detail="Assignment not found.")
    membership = _student_membership_for_assignment(db, student_id, assignment)
    now = datetime.utcnow()
    if assignment.close_at and now > assignment.close_at and not assignment.allow_late_submission:
        raise HTTPException(status_code=403, detail="Assignment is closed.")
    status = "late_submitted" if assignment.due_at and now > assignment.due_at else payload.status
    submission = db.scalar(select(AssignmentSubmission).where(AssignmentSubmission.assignment_id == assignment_id, AssignmentSubmission.student_membership_id == membership.id))
    if not submission:
        submission = AssignmentSubmission(assignment_id=assignment_id, student_membership_id=membership.id, student_user_id=student_id)
        db.add(submission)
        db.flush()
    submission.status = status
    submission.submitted_at = now
    for answer in payload.answers:
        db.add(
            AssignmentAnswer(
                submission_id=submission.id,
                question_id=answer.get("question_id"),
                item_index=answer.get("item_index"),
                answer_text=answer.get("answer_text"),
                answer_choice=answer.get("answer_choice"),
                solution_image_asset_id=answer.get("solution_image_asset_id"),
                time_spent_seconds=answer.get("time_spent_seconds"),
            )
        )
    audit(db, request, student_id, "student.assignment_submitted", "assignment", str(assignment_id))
    db.commit()
    return serialize(submission)


@router.patch("/academy/{academy_id}/submissions/{submission_id}/review")
def review_submission(academy_id: str, submission_id: UUID, payload: ReviewSubmissionPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"}, permission="can_manage_assignments")
    submission = db.get(AssignmentSubmission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")
    assignment = db.get(Assignment, submission.assignment_id)
    if not assignment or assignment.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="Submission not found.")
    submission.score = payload.score
    submission.feedback = payload.feedback
    submission.status = payload.status
    submission.teacher_reviewed_by = actor
    submission.reviewed_at = datetime.utcnow()
    db.add(StudentNotification(student_user_id=submission.student_user_id, academy_id=academy_id, notification_type="assignment_feedback", title="Assignment feedback posted", body=assignment.title))
    audit(db, request, actor, "academy.submission_reviewed", "assignment_submission", str(submission.id))
    db.commit()
    return serialize(submission)


@router.post("/student/tests/{assignment_id}/start")
def start_test(assignment_id: UUID, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    assignment = db.get(Assignment, assignment_id)
    if not assignment or assignment.assignment_type != "test" or assignment_id not in student_assignment_ids(db, student_id, assignment.academy_id):
        raise HTTPException(status_code=404, detail="Test not found.")
    now = datetime.utcnow()
    if assignment.open_at and now < assignment.open_at:
        raise HTTPException(status_code=403, detail="Test has not opened yet.")
    if assignment.close_at and now > assignment.close_at:
        raise HTTPException(status_code=403, detail="Test is closed.")
    membership = _student_membership_for_assignment(db, student_id, assignment)
    attempts = db.scalar(select(func.count(TestSession.id)).where(TestSession.assignment_id == assignment_id, TestSession.student_membership_id == membership.id)) or 0
    if attempts >= assignment.max_attempts:
        raise HTTPException(status_code=403, detail="Attempt limit reached.")
    expires_at = now + timedelta(minutes=assignment.time_limit_minutes) if assignment.time_limit_minutes else assignment.close_at
    session = TestSession(assignment_id=assignment_id, student_membership_id=membership.id, expires_at=expires_at)
    db.add(session)
    db.flush()
    db.add(TestSessionEvent(test_session_id=session.id, event_type="started", metadata_json={}))
    audit(db, request, student_id, "student.test_started", "test_session", str(session.id))
    db.commit()
    return serialize(session)


@router.post("/student/tests/{session_id}/submit")
def submit_test(session_id: UUID, payload: AssignmentSubmitPayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    session = db.get(TestSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Test session not found.")
    membership = db.get(StudentAcademyMembership, session.student_membership_id)
    if not membership or membership.student_user_id != student_id or membership.status != "active":
        raise HTTPException(status_code=403, detail="This test session is not yours.")
    now = datetime.utcnow()
    session.status = "auto_submitted" if session.expires_at and now > session.expires_at else "submitted"
    session.submitted_at = now
    db.add(TestSessionEvent(test_session_id=session.id, event_type=session.status, metadata_json={"answer_count": len(payload.answers)}))
    audit(db, request, student_id, "student.test_submitted", "test_session", str(session.id))
    db.commit()
    return serialize(session)


@router.post("/calendar/events")
def create_calendar_event(payload: CalendarEventPayload, request: Request, db: Session = Depends(get_db)):
    actor = current_owner_id(request)
    owner_id = payload.owner_id or actor
    if payload.visibility == "personal_private":
        owner_type = "student"
        owner_id = actor
        academy_id = None
    else:
        if not payload.academy_id:
            raise HTTPException(status_code=400, detail="Academy event requires academy_id.")
        require_staff(db, request, payload.academy_id, permission="can_manage_schedule")
        owner_type = payload.owner_type
        academy_id = payload.academy_id
    event = CalendarEvent(
        owner_type=owner_type,
        owner_id=owner_id,
        academy_id=academy_id,
        class_id=payload.class_id,
        student_membership_id=payload.student_membership_id,
        created_by_user_id=actor,
        title=payload.title,
        description=payload.description,
        event_type=payload.event_type,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        visibility=payload.visibility,
        recurrence_rule=payload.recurrence_rule,
    )
    db.add(event)
    audit(db, request, actor, "calendar.event_created", "calendar_event", None, {"visibility": payload.visibility})
    db.commit()
    return serialize(event)


@router.get("/student/calendar")
def student_calendar(request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    memberships = student_memberships(db, student_id)
    membership_ids = [m.id for m in memberships]
    academy_ids = [m.academy_id for m in memberships]
    class_ids = _student_class_ids(db, memberships)
    academy_names = {academy_id: get_academy_name(db, academy_id) for academy_id in academy_ids}
    events = db.scalars(
        select(CalendarEvent).where(
            or_(
                and_(CalendarEvent.owner_type == "student", CalendarEvent.owner_id == student_id, CalendarEvent.visibility == "personal_private"),
                and_(CalendarEvent.academy_id.in_(academy_ids), CalendarEvent.visibility == "academy_staff"),
                and_(CalendarEvent.class_id.in_(class_ids), CalendarEvent.visibility == "class_members"),
                and_(CalendarEvent.student_membership_id.in_(membership_ids), CalendarEvent.visibility == "specific_students"),
            )
        ).order_by(CalendarEvent.starts_at)
    ).all()
    schedule_events: list[ClassScheduleEvent] = []
    class_names: dict[UUID, str] = {}
    if class_ids:
        class_rows = db.scalars(select(AcademyClass).where(AcademyClass.id.in_(class_ids))).all()
        class_names = {row.id: row.name for row in class_rows}
        schedule_events = db.scalars(
            select(ClassScheduleEvent)
            .where(
                ClassScheduleEvent.class_id.in_(class_ids),
                ClassScheduleEvent.academy_id.in_(academy_ids),
            )
            .order_by(ClassScheduleEvent.starts_at)
        ).all()
    assignments = []
    ids = student_assignment_ids(db, student_id)
    if ids:
        assignments = db.scalars(select(Assignment).where(Assignment.id.in_(ids), Assignment.due_at.is_not(None))).all()
    learning_assignments = []
    learning_ids = student_learning_assignment_ids(db, student_id)
    if learning_ids:
        learning_assignments = db.scalars(
            select(LearningAssignment)
            .where(
                LearningAssignment.id.in_(learning_ids),
                LearningAssignment.status.in_(["published", "closed"]),
                LearningAssignment.due_at.is_not(None),
            )
            .order_by(LearningAssignment.due_at)
        ).all()
    paper_sessions = []
    if academy_ids:
        paper_session_rows = db.scalars(
            select(PaperSession)
            .where(
                PaperSession.academy_id.in_(academy_ids),
                PaperSession.status != "draft",
            )
            .order_by(PaperSession.scheduled_at, PaperSession.due_at)
        ).all()
        paper_sessions = [
            row
            for row in paper_session_rows
            if _paper_session_visible_to_student(row, class_ids, membership_ids)
        ]
    wrong_answer_records = db.scalars(
        select(WrongAnswerRecord).where(
            WrongAnswerRecord.student_id == student_id,
            WrongAnswerRecord.academy_id.in_(academy_ids),
        )
    ).all() if academy_ids else []
    event_payloads = [serialize(row) for row in events]
    event_payloads.extend(_class_schedule_calendar_payload(row, class_names) for row in schedule_events)
    event_payloads.extend(payload for payload in (_paper_session_event_payload(row) for row in paper_sessions) if payload)
    event_payloads.extend(_wrong_answer_calendar_payloads(wrong_answer_records))
    for payload in event_payloads:
        academy_id = payload.get("academy_id")
        class_id = payload.get("class_id")
        if academy_id:
            payload.setdefault("academy_name", academy_names.get(str(academy_id)))
        if class_id:
            payload.setdefault("class_name", class_names.get(UUID(str(class_id))) if str(class_id) else None)
    event_payloads.sort(key=lambda row: str(row.get("starts_at") or ""))
    assignment_due_dates = [
        {"id": str(a.id), "title": a.title, "due_at": a.due_at.isoformat() if a.due_at else None, "academy_id": a.academy_id, "academy_name": academy_names.get(a.academy_id), "source_type": "academy_assignment"}
        for a in assignments
    ]
    assignment_due_dates.extend(
        {
            "id": f"learning:{a.id}",
            "title": a.title,
            "due_at": a.due_at.isoformat() if a.due_at else None,
            "academy_id": a.academy_id,
            "academy_name": academy_names.get(a.academy_id),
            "source_type": "learning_assignment",
        }
        for a in learning_assignments
    )
    assignment_due_dates.extend(
        {
            "id": f"paper-session:{session.id}",
            "title": session.title,
            "due_at": session.due_at.isoformat() if session.due_at else None,
            "academy_id": session.academy_id,
            "academy_name": academy_names.get(session.academy_id),
            "source_type": "paper_session_due",
        }
        for session in paper_sessions
        if session.due_at
    )
    assignment_due_dates.sort(key=lambda row: str(row.get("due_at") or ""))
    return {
        "events": event_payloads,
        "assignment_due_dates": assignment_due_dates,
    }


@router.post("/student/notes/extract-text", response_model=NoteTextExtractionResponse)
def extract_note_selection_text(payload: NoteTextExtractionPayload, request: Request):
    current_owner_id(request)
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY가 설정되어 있지 않습니다.")

    image_mime = payload.image_mime if payload.image_mime in {"image/png", "image/jpeg", "image/webp"} else "image/png"
    image_base64 = payload.image_base64.strip()
    if "," in image_base64[:128]:
        image_base64 = image_base64.split(",", 1)[1].strip()
    try:
        image_bytes = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="이미지 데이터가 올바르지 않습니다.")
    if len(image_bytes) < 80:
        raise HTTPException(status_code=400, detail="선택 영역 이미지가 너무 작습니다.")
    if len(image_bytes) > 6 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="선택 영역 이미지가 너무 큽니다.")

    prompt = (
        "You are an OCR engine for a note-taking app. Extract only the visible text inside this cropped image. "
        "Preserve Korean, English, numbers, math symbols, line breaks, punctuation, and spacing as accurately as possible. "
        "Do not explain. Do not infer text that is not visible. If no readable text exists, return an empty string. "
        "Return JSON only as an array with exactly one object: [{\"text\":\"...\"}]."
    )
    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.ai_request_timeout_seconds)
    try:
        result = vision_json(
            client,
            image_base64,
            prompt,
            model=settings.ai_reextract_model or settings.ai_model,
            image_mime=image_mime,
            max_output_tokens=2048,
            image_detail="high",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"텍스트 추출에 실패했습니다: {exc.__class__.__name__}")

    text = ""
    if result:
        first = result[0] if isinstance(result[0], dict) else {}
        text = str(first.get("text") or first.get("extracted_text") or "").strip()
    return {"text": text}


@router.post("/academy/{academy_id}/materials")
def create_material(academy_id: str, payload: MaterialPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"}, permission="can_manage_materials")
    material = AcademyMaterial(
        academy_id=academy_id,
        created_by_user_id=actor,
        title=payload.title,
        material_type=payload.material_type,
        storage_path=payload.storage_path,
        external_url=payload.external_url,
        permissions=payload.permissions,
        expires_at=payload.expires_at,
    )
    db.add(material)
    db.flush()
    for target in payload.assignments:
        db.add(AcademyMaterialAssignment(material_id=material.id, target_type=target["target_type"], target_id=target["target_id"]))
    audit(db, request, actor, "academy.material_created", "academy_material", str(material.id), {"academy_id": academy_id})
    db.commit()
    return serialize(material)


@router.get("/student/materials")
def list_student_materials(request: Request, academy_id: str | None = None, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    memberships = student_memberships(db, student_id)
    if academy_id:
        memberships = [m for m in memberships if m.academy_id == academy_id]
    material_ids: set[UUID] = set()
    now = datetime.utcnow()
    for membership in memberships:
        class_ids = _student_class_ids_for_membership(db, membership)
        filters = [
            and_(AcademyMaterialAssignment.target_type == "student", AcademyMaterialAssignment.target_id == str(membership.id)),
            and_(AcademyMaterialAssignment.target_type == "academy", AcademyMaterialAssignment.target_id == membership.academy_id),
        ]
        if class_ids:
            filters.append(and_(AcademyMaterialAssignment.target_type == "class", AcademyMaterialAssignment.target_id.in_([str(c) for c in class_ids])))
        material_ids.update(db.scalars(select(AcademyMaterialAssignment.material_id).where(or_(*filters))).all())
    if not material_ids:
        return []
    materials = db.scalars(select(AcademyMaterial).where(AcademyMaterial.id.in_(material_ids), or_(AcademyMaterial.expires_at.is_(None), AcademyMaterial.expires_at > now))).all()
    return [{**serialize(row), "academy_name": get_academy_name(db, row.academy_id)} for row in materials]


@router.post("/student/materials/{material_id}/download")
def student_material_download(material_id: UUID, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    material = db.get(AcademyMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found.")
    can_student_access_academy(db, student_id, material.academy_id)
    if not material.permissions.get("download", False):
        raise HTTPException(status_code=403, detail="Download is disabled for this material.")
    export_record = create_watermark_export_record(db, request, student_id, material.academy_id, "material_download", material.id)
    db.add(MaterialDeliveryLog(material_id=material.id, student_user_id=student_id, academy_id=material.academy_id, action="download", ip_address=real_ip(request), user_agent=request.headers.get("user-agent", "")))
    audit(db, request, student_id, "student.material_download_requested", "academy_material", str(material.id), {"export_hash": export_record.export_hash})
    db.commit()
    # Production should call WatermarkService and return a signed URL to the generated PDF.
    return {
        "download_url": material.external_url or material.storage_path,
        "watermark_export_id": str(export_record.id),
        "watermark_notice": "Student-specific forensic watermark must be applied before serving this file in production.",
    }


@router.post("/student/wrong-answers")
def create_wrong_answer(payload: WrongAnswerPayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    membership_id = None
    if payload.academy_id:
        membership = can_student_access_academy(db, student_id, payload.academy_id)
        membership_id = membership.id
        if payload.visibility == "private":
            payload.visibility = "academy_linked"
    item = WrongAnswerItem(student_user_id=student_id, student_membership_id=membership_id, **payload.model_dump())
    db.add(item)
    db.flush()
    db.add(WrongAnswerReview(wrong_answer_item_id=item.id, student_user_id=student_id, scheduled_for=datetime.utcnow()))
    audit(db, request, student_id, "student.wrong_answer_created", "wrong_answer_item", str(item.id), {"source_type": payload.source_type})
    db.commit()
    return serialize(item)


@router.get("/student/wrong-answers")
def list_wrong_answers(request: Request, academy_id: str | None = None, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    query = select(WrongAnswerItem).where(WrongAnswerItem.student_user_id == student_id, WrongAnswerItem.archived_at.is_(None))
    if academy_id:
        can_student_access_academy(db, student_id, academy_id)
        query = query.where(WrongAnswerItem.academy_id == academy_id)
    note_items = [serialize(row) for row in db.scalars(query.order_by(WrongAnswerItem.created_at.desc())).all()]
    memberships = student_memberships(db, student_id)
    if academy_id:
        memberships = [membership for membership in memberships if membership.academy_id == academy_id]
    membership_by_academy = {membership.academy_id: membership for membership in memberships}
    academy_ids = list(membership_by_academy)
    forge_records = []
    if academy_ids:
        forge_records = db.scalars(
            select(WrongAnswerRecord)
            .where(
                WrongAnswerRecord.student_id == student_id,
                WrongAnswerRecord.academy_id.in_(academy_ids),
            )
            .order_by(WrongAnswerRecord.latest_wrong_at.desc())
        ).all()
    forge_items = [_wrong_answer_note_payload(db, record, membership_by_academy) for record in forge_records]
    items = note_items + forge_items
    items.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
    return items


@router.post("/student/wrong-answers/{item_id}/attempts")
def record_wrong_answer_attempt(item_id: UUID, payload: WrongAnswerAttemptPayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    item = db.scalar(select(WrongAnswerItem).where(WrongAnswerItem.id == item_id, WrongAnswerItem.student_user_id == student_id))
    if not item:
        raise HTTPException(status_code=404, detail="Wrong-answer item not found.")
    attempt = WrongAnswerAttempt(wrong_answer_item_id=item.id, student_user_id=student_id, **payload.model_dump())
    db.add(attempt)
    next_days = {"correct": 3, "incorrect": 1, "needs_review": 1, "skipped": 1}.get(payload.result, 1)
    db.add(WrongAnswerReview(wrong_answer_item_id=item.id, student_user_id=student_id, scheduled_for=datetime.utcnow() + timedelta(days=next_days)))
    audit(db, request, student_id, "student.wrong_answer_attempt_recorded", "wrong_answer_item", str(item.id), {"result": payload.result})
    db.commit()
    return serialize(attempt)


@router.get("/student/wrong-answers/review-queue")
def wrong_answer_review_queue(request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    now = datetime.utcnow()
    rows = db.scalars(select(WrongAnswerReview).where(WrongAnswerReview.student_user_id == student_id, WrongAnswerReview.completed_at.is_(None), WrongAnswerReview.scheduled_for <= now).order_by(WrongAnswerReview.scheduled_for)).all()
    return [serialize(row) for row in rows]


@router.post("/student/wrong-answers/export")
def export_wrong_answers(payload: WrongAnswerExportPayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    consume_student_quota(db, student_id, "export", payload.academy_id or "personal")
    items = db.scalars(select(WrongAnswerItem).where(WrongAnswerItem.id.in_(payload.item_ids), WrongAnswerItem.student_user_id == student_id)).all()
    if len(items) != len(payload.item_ids):
        raise HTTPException(status_code=404, detail="Some wrong-answer items are not available.")
    export_id = f"WA-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{str(payload.item_ids[0])[:8] if payload.item_ids else 'EMPTY'}"
    export = WrongAnswerExport(student_user_id=student_id, academy_id=payload.academy_id, item_ids=[str(item.id) for item in items], export_id=export_id)
    db.add(export)
    create_watermark_export_record(db, request, student_id, payload.academy_id, "wrong_answer_export")
    audit(db, request, student_id, "student.wrong_answer_export_created", "wrong_answer_export", export_id, {"item_count": len(items)})
    db.commit()
    return {"export_id": export_id, "watermark_applied": True, "download_url": None, "message": "Watermarked learning-sheet export record created. PDF rendering adapter can attach the generated file."}


@router.get("/academy/{academy_id}/reports/usage")
def academy_usage_report(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"}, permission="can_manage_students")
    membership_ids = db.scalars(select(StudentAcademyMembership.id).where(StudentAcademyMembership.academy_id == academy_id, StudentAcademyMembership.status == "active")).all()
    student_ids = db.scalars(select(StudentAcademyMembership.student_user_id).where(StudentAcademyMembership.academy_id == academy_id, StudentAcademyMembership.status == "active")).all()
    today = datetime.utcnow().date().isoformat()
    usage = db.scalars(select(DailyStudentQuotaUsage).where(DailyStudentQuotaUsage.student_user_id.in_(student_ids), DailyStudentQuotaUsage.date == today)).all() if student_ids else []
    return {
        "active_students": len(membership_ids),
        "today_uploads": sum(row.upload_count for row in usage),
        "today_extractions": sum(row.extraction_count for row in usage),
        "today_exports": sum(row.export_count for row in usage),
    }
