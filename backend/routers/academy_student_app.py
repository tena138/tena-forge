from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from database import get_db
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
    ClassTeacher,
    DailyStudentQuotaUsage,
    MaterialDeliveryLog,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    StudentNotification,
    TestSession,
    TestSessionEvent,
    WrongAnswerAttempt,
    WrongAnswerExport,
    WrongAnswerItem,
    WrongAnswerReview,
)
from services.academy_student_access import (
    audit,
    can_student_access_academy,
    consume_student_quota,
    create_seat,
    create_watermark_export_record,
    ensure_academy_subscription,
    ensure_default_academy_plans,
    get_academy_name,
    has_unlimited_seats,
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
)
from services.ownership import current_owner_id

router = APIRouter(prefix="/api", tags=["academy-student-app"])


class SeatCreate(BaseModel):
    count: int = Field(default=1, ge=1, le=200)
    display_name_prefix: str | None = None


class SeatReleaseRequest(BaseModel):
    reason: str | None = None
    rotate_code: bool = True


class InviteCodeRequest(BaseModel):
    invite_code: str


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


def serialize(obj: Any) -> dict:
    data = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.key)
        if isinstance(value, UUID):
            value = str(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        data[column.key] = value
    return data


def seat_payload(db: Session, seat: AcademySeat) -> dict:
    membership = db.get(StudentAcademyMembership, seat.current_student_membership_id) if seat.current_student_membership_id else None
    return {
        **serialize(seat),
        "assigned": bool(membership and membership.status == "active"),
        "assigned_student_user_id": membership.student_user_id if membership else None,
        "assigned_membership_id": str(membership.id) if membership else None,
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
    created = []
    for index in range(payload.count):
        display = f"{payload.display_name_prefix} {index + 1}" if payload.display_name_prefix else None
        seat, code = create_seat(db, academy_id, display)
        created.append({**seat_payload(db, seat), "invite_code": code})
    audit(db, request, actor, "academy.seats_created", "academy", academy_id, {"count": payload.count})
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
    return {**seat_payload(db, seat), "invite_code": code}


@router.post("/academy/{academy_id}/seats/{seat_id}/release")
def release_student_seat(academy_id: str, seat_id: UUID, payload: SeatReleaseRequest, request: Request, db: Session = Depends(get_db)):
    require_manage_seats(db, request, academy_id)
    seat = db.scalar(select(AcademySeat).where(AcademySeat.id == seat_id, AcademySeat.academy_id == academy_id))
    if not seat:
        raise HTTPException(status_code=404, detail="Seat not found.")
    new_code = release_seat(db, request, seat, reason=payload.reason, rotate_code=payload.rotate_code)
    db.commit()
    return {**seat_payload(db, seat), "invite_code": new_code}


@router.get("/academy/{academy_id}/seats/{seat_id}/history")
def seat_history(academy_id: str, seat_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_manage_seats(db, request, academy_id)
    rows = db.scalars(select(SeatAssignmentHistory).where(SeatAssignmentHistory.academy_seat_id == seat_id, SeatAssignmentHistory.academy_id == academy_id).order_by(SeatAssignmentHistory.assigned_at.desc())).all()
    return [serialize(row) for row in rows]


@router.post("/student/academy-keys/claim")
def claim_academy_key(payload: InviteCodeRequest, request: Request, db: Session = Depends(get_db)):
    membership = claim_invite_code(db, request, payload.invite_code)
    db.commit()
    return {**serialize(membership), "academy_name": get_academy_name(db, membership.academy_id)}


@router.get("/student/academies")
def connected_academies(request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    memberships = student_memberships(db, user_id)
    return [{**serialize(m), "academy_name": get_academy_name(db, m.academy_id)} for m in memberships]


@router.get("/student/quotas")
def get_student_quotas(request: Request, db: Session = Depends(get_db)):
    return student_quota(db, current_owner_id(request))


@router.post("/academy/{academy_id}/staff")
def upsert_staff(academy_id: str, payload: StaffCreate, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin"})
    if payload.role not in {"admin", "teacher", "assistant"}:
        raise HTTPException(status_code=400, detail="Invalid staff role.")
    staff = db.scalar(select(AcademyStaffMembership).where(AcademyStaffMembership.academy_id == academy_id, AcademyStaffMembership.user_id == payload.user_id))
    if not staff:
        staff = AcademyStaffMembership(academy_id=academy_id, user_id=payload.user_id)
        db.add(staff)
    for key, value in payload.model_dump().items():
        if key != "user_id":
            setattr(staff, key, value)
    audit(db, request, actor, "academy.staff_upserted", "academy_staff", payload.user_id, {"academy_id": academy_id, "role": payload.role})
    db.commit()
    return serialize(staff)


@router.get("/academy/{academy_id}/classes")
def list_classes(academy_id: str, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id)
    visible = visible_class_ids_for_staff(db, actor, academy_id)
    query = select(AcademyClass).where(AcademyClass.academy_id == academy_id)
    if visible is not None:
        query = query.where(AcademyClass.id.in_(visible))
    return [serialize(row) for row in db.scalars(query.order_by(AcademyClass.created_at.desc())).all()]


@router.post("/academy/{academy_id}/classes")
def create_class(academy_id: str, payload: ClassPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher"})
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
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
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
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
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
    actor = require_staff(db, request, academy_id)
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
        class_ids = db.scalars(select(ClassStudent.class_id).where(ClassStudent.student_membership_id == membership.id, ClassStudent.left_at.is_(None))).all()
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
    membership = can_student_access_academy(db, student_id, assignment.academy_id)
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
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
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
    membership = can_student_access_academy(db, student_id, assignment.academy_id)
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
        require_staff(db, request, payload.academy_id)
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
    class_ids = db.scalars(select(ClassStudent.class_id).where(ClassStudent.student_membership_id.in_(membership_ids), ClassStudent.left_at.is_(None))).all() if membership_ids else []
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
    assignments = []
    ids = student_assignment_ids(db, student_id)
    if ids:
        assignments = db.scalars(select(Assignment).where(Assignment.id.in_(ids), Assignment.due_at.is_not(None))).all()
    return {
        "events": [serialize(row) for row in events],
        "assignment_due_dates": [{"id": str(a.id), "title": a.title, "due_at": a.due_at.isoformat() if a.due_at else None, "academy_id": a.academy_id} for a in assignments],
    }


@router.post("/academy/{academy_id}/materials")
def create_material(academy_id: str, payload: MaterialPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
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
        class_ids = db.scalars(select(ClassStudent.class_id).where(ClassStudent.student_membership_id == membership.id, ClassStudent.left_at.is_(None))).all()
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
    return [serialize(row) for row in materials]


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
        query = query.where(WrongAnswerItem.academy_id == academy_id)
    return [serialize(row) for row in db.scalars(query.order_by(WrongAnswerItem.created_at.desc())).all()]


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
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
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
