import re
import unicodedata
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    Academy,
    AcademyClass,
    AcademySeat,
    ArchiveAccessGrant,
    Batch,
    ClassStudent,
    ContentVersion,
    LearningAssignment,
    LearningAssignmentTarget,
    LearningSubmission,
    Problem,
    ProblemAttempt,
    ProblemSet,
    ProblemSetItem,
    StudentAcademyMembership,
    StudentPersonalSet,
    StudentPersonalSetItem,
    Tag,
    WrongAnswerRecord,
)
from services.academy_student_access import (
    can_student_access_academy,
    claim_invite_code,
    create_seat,
    get_academy_name,
    release_seat,
    require_manage_seats,
    require_staff,
    student_memberships,
)
from services.ownership import current_owner_id

router = APIRouter(prefix="/api/learning", tags=["learning-workspace"])

CHOICE_MAP = {
    "\u2460": "1",
    "\u2461": "2",
    "\u2462": "3",
    "\u2463": "4",
    "\u2464": "5",
    "\u2474": "1",
    "\u2475": "2",
    "\u2476": "3",
    "\u2477": "4",
    "\u2478": "5",
}


class StudentKeyCreate(BaseModel):
    count: int = Field(default=1, ge=1, le=200)
    display_name_prefix: str | None = None
    class_id: UUID | None = None


class AcademyKeyActivate(BaseModel):
    key_code: str


class GroupPayload(BaseModel):
    name: str
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None


class GroupMemberPayload(BaseModel):
    student_id: str


class LearningAssignmentCreate(BaseModel):
    title: str
    description: str | None = None
    source_type: str = "problemSet"
    source_id: str
    manual_material_title: str | None = None
    manual_material_scope: str | None = None
    student_ids: list[str] = Field(default_factory=list)
    group_ids: list[UUID] = Field(default_factory=list)
    start_at: datetime | None = None
    due_at: datetime | None = None
    schedule_type: str = "one_time"
    recurrence_rule: str | None = None
    grading_mode: str = "auto"
    show_score_policy: str = "immediately"
    show_answer_policy: str = "afterSubmit"
    show_solution_policy: str = "afterSubmit"
    retry_policy: str = "wrongOnly"
    time_limit_seconds: int | None = None
    shuffle_problems: bool = False
    shuffle_choices: bool = False
    status: str = "published"


class LearningAssignmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_at: datetime | None = None
    due_at: datetime | None = None
    schedule_type: str | None = None
    recurrence_rule: str | None = None
    grading_mode: str | None = None
    show_score_policy: str | None = None
    show_answer_policy: str | None = None
    show_solution_policy: str | None = None
    retry_policy: str | None = None
    time_limit_seconds: int | None = None
    shuffle_problems: bool | None = None
    shuffle_choices: bool | None = None
    status: str | None = None


class AccessGrantPayload(BaseModel):
    student_id: str | None = None
    group_id: UUID | None = None
    source_type: str = "problemSet"
    source_id: str
    access_scope: str = "problemSet"
    can_view_problems: bool = True
    can_solve_freely: bool = True
    can_save_to_my_archive: bool = False
    can_create_custom_sets: bool = False
    can_see_answer_immediately: bool = False
    can_see_solution: bool = False
    can_retry: bool = True
    timed_only: bool = False
    starts_at: datetime | None = None
    expires_at: datetime | None = None


class AssignmentStartPayload(BaseModel):
    source_context: str = "assignment"


class AnswerPayload(BaseModel):
    problem_id: UUID
    answer: str | None = None
    time_spent_seconds: int | None = None


class AssignmentSubmitPayload(BaseModel):
    answers: list[AnswerPayload] = Field(default_factory=list)
    time_spent_seconds: int | None = None


COMPLETED_SUBMISSION_STATUSES = {"submitted", "late", "completed"}
PENDING_CONFIRMATION_STATUS = "pending_confirmation"


class FreeSolvePayload(BaseModel):
    answer: str | None = None
    source_access_grant_id: UUID | None = None
    time_spent_seconds: int | None = None


class PersonalSetPayload(BaseModel):
    title: str
    description: str | None = None


class PersonalSetItemPayload(BaseModel):
    problem_id: UUID
    source_access_grant_id: UUID | None = None


def _serialize(obj: Any) -> dict:
    data: dict[str, Any] = {}
    for column in obj.__table__.columns:
        value = getattr(obj, column.key)
        if isinstance(value, UUID):
            value = str(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        elif isinstance(value, Decimal):
            value = float(value)
        data[column.key] = value
    return data


def _student_name(db: Session, student_id: str) -> str:
    try:
        academy = db.get(Academy, UUID(student_id))
        return academy.academy_name if academy else student_id
    except ValueError:
        return student_id


def _problem_tag(problem: Problem) -> dict[str, Any]:
    tag = problem.tags
    return {
        "subject": tag.subject if tag else None,
        "unit": tag.unit if tag else None,
        "difficulty": tag.difficulty if tag else None,
        "problem_type": tag.problem_type if tag else None,
        "source": tag.source if tag else None,
    }


def _problem_snapshot(problem: Problem) -> dict[str, Any]:
    return {
        "id": str(problem.id),
        "problem_number": problem.problem_number,
        "review_page_number": problem.review_page_number,
        "problem_text": problem.problem_text,
        "has_visual": problem.has_visual,
        "visual_url": problem.visual_url,
        "review_page_image_url": problem.review_page_image_url,
        "answer": problem.answer,
        "solution_steps": None,
        "key_concept": None,
        "tags": _problem_tag(problem),
        "source_batch_id": str(problem.source_batch_id),
        "source_label": problem.source_label,
    }


def _academy_content_filter(model, academy_id: str):
    return or_(model.academy_id == academy_id, model.owner_id == academy_id)


def _source_title_and_problems(db: Session, academy_id: str, source_type: str, source_id: str) -> tuple[str, list[Problem]]:
    source_type = source_type.strip()
    if source_type in {"problemSet", "customSet"}:
        problem_set = db.scalar(select(ProblemSet).where(ProblemSet.id == UUID(source_id), _academy_content_filter(ProblemSet, academy_id)))
        if not problem_set:
            raise HTTPException(status_code=404, detail="Problem set not found for this academy.")
        items = db.scalars(
            select(ProblemSetItem)
            .where(ProblemSetItem.problem_set_id == problem_set.id)
            .options(joinedload(ProblemSetItem.problem).joinedload(Problem.tags))
            .order_by(ProblemSetItem.order_index)
        ).all()
        problems = [item.problem for item in items if item.problem and not item.problem.deleted_at]
        return problem_set.name, problems
    if source_type in {"archive", "paper", "batch"}:
        batch = db.scalar(select(Batch).where(Batch.id == UUID(source_id), or_(Batch.academy_id == academy_id, Batch.owner_id == academy_id)))
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found for this academy.")
        problems = list(
            db.scalars(
                select(Problem)
                .where(Problem.source_batch_id == batch.id, Problem.deleted_at.is_(None))
                .options(joinedload(Problem.tags))
                .order_by(Problem.problem_number, Problem.created_at)
            ).all()
        )
        return batch.name, problems
    if source_type == "problem":
        problem = db.scalars(
            select(Problem)
            .where(Problem.id == UUID(source_id), _academy_content_filter(Problem, academy_id), Problem.deleted_at.is_(None))
            .options(joinedload(Problem.tags))
        ).first()
        if not problem:
            raise HTTPException(status_code=404, detail="Problem not found for this academy.")
        return f"Problem {problem.problem_number}", [problem]
    raise HTTPException(status_code=400, detail="Unsupported source type.")


def _create_content_version(
    db: Session,
    academy_id: str,
    actor_id: str,
    source_type: str,
    source_id: str,
    manual_material_title: str | None = None,
    manual_material_scope: str | None = None,
) -> ContentVersion:
    source_type = source_type.strip()
    if source_type == "manual":
        title = (manual_material_title or "").strip() or "직접 입력 숙제"
        scope = (manual_material_scope or "").strip()
        version = ContentVersion(
            academy_id=academy_id,
            source_type=source_type,
            source_id=source_id,
            title=title,
            version_label=datetime.utcnow().strftime("%Y%m%d%H%M%S"),
            snapshot={
                "title": title,
                "source_type": source_type,
                "source_id": source_id,
                "problem_count": 0,
                "problems": [],
                "material_title": title,
                "material_scope": scope,
            },
            created_by=actor_id,
        )
        db.add(version)
        db.flush()
        return version
    title, problems = _source_title_and_problems(db, academy_id, source_type, source_id)
    if not problems:
        raise HTTPException(status_code=400, detail="This source has no problems to assign.")
    version = ContentVersion(
        academy_id=academy_id,
        source_type=source_type,
        source_id=source_id,
        title=title,
        version_label=datetime.utcnow().strftime("%Y%m%d%H%M%S"),
        snapshot={
            "title": title,
            "source_type": source_type,
            "source_id": source_id,
            "problem_count": len(problems),
            "problems": [_problem_snapshot(problem) for problem in problems],
        },
        created_by=actor_id,
    )
    db.add(version)
    db.flush()
    return version


def _content_problem(version: ContentVersion, problem_id: UUID) -> dict[str, Any]:
    for problem in version.snapshot.get("problems", []):
        if problem.get("id") == str(problem_id):
            return problem
    raise HTTPException(status_code=404, detail="Problem is not part of this content version.")


def _membership_group_ids(db: Session, membership: StudentAcademyMembership) -> list[UUID]:
    group_ids = list(
        db.scalars(
            select(ClassStudent.class_id).where(
                ClassStudent.student_membership_id == membership.id,
                ClassStudent.left_at.is_(None),
            )
        ).all()
    )
    seat = db.get(AcademySeat, membership.academy_seat_id)
    if seat and seat.class_id and seat.class_id not in group_ids:
        group_ids.append(seat.class_id)
    return group_ids


def _student_group_ids(db: Session, membership: StudentAcademyMembership) -> list[UUID]:
    return _membership_group_ids(db, membership)


def _active_grant_filter(now: datetime):
    return and_(
        ArchiveAccessGrant.revoked_at.is_(None),
        or_(ArchiveAccessGrant.starts_at.is_(None), ArchiveAccessGrant.starts_at <= now),
        or_(ArchiveAccessGrant.expires_at.is_(None), ArchiveAccessGrant.expires_at > now),
    )


def _student_grants(db: Session, student_id: str, academy_id: str | None = None, include_inactive: bool = False) -> list[ArchiveAccessGrant]:
    now = datetime.utcnow()
    grants: list[ArchiveAccessGrant] = []
    for membership in student_memberships(db, student_id):
        if academy_id and membership.academy_id != academy_id:
            continue
        group_ids = _student_group_ids(db, membership)
        clauses = [ArchiveAccessGrant.student_id == student_id]
        if group_ids:
            clauses.append(ArchiveAccessGrant.group_id.in_(group_ids))
        query = select(ArchiveAccessGrant).where(
            ArchiveAccessGrant.academy_id == membership.academy_id,
            or_(*clauses),
        )
        if not include_inactive:
            query = query.where(_active_grant_filter(now))
        grants.extend(db.scalars(query.order_by(ArchiveAccessGrant.updated_at.desc())).all())
    return grants


def _grant_allows_problem(db: Session, grant: ArchiveAccessGrant, problem_id: UUID) -> bool:
    if grant.source_type == "problem":
        return grant.source_id == str(problem_id)
    try:
        _title, problems = _source_title_and_problems(db, grant.academy_id, grant.source_type, grant.source_id)
    except HTTPException:
        return False
    return any(problem.id == problem_id for problem in problems)


def _require_student_grant_for_problem(
    db: Session,
    student_id: str,
    problem_id: UUID,
    *,
    require_solve: bool = False,
    require_save: bool = False,
    grant_id: UUID | None = None,
) -> ArchiveAccessGrant:
    grants = _student_grants(db, student_id)
    if grant_id:
        grants = [grant for grant in grants if grant.id == grant_id]
    for grant in grants:
        if not grant.can_view_problems:
            continue
        if require_solve and not grant.can_solve_freely:
            continue
        if require_save and not grant.can_save_to_my_archive:
            continue
        if _grant_allows_problem(db, grant, problem_id):
            return grant
    raise HTTPException(status_code=403, detail="This problem is not available in your current academy permissions.")


def _student_assignment_ids(db: Session, student_id: str, academy_id: str | None = None) -> list[UUID]:
    ids: set[UUID] = set()
    for membership in student_memberships(db, student_id):
        if academy_id and membership.academy_id != academy_id:
            continue
        group_ids = _student_group_ids(db, membership)
        clauses = [LearningAssignmentTarget.student_id == student_id]
        if group_ids:
            clauses.append(LearningAssignmentTarget.group_id.in_(group_ids))
        ids.update(
            db.scalars(
                select(LearningAssignmentTarget.assignment_id).where(
                    LearningAssignmentTarget.academy_id == membership.academy_id,
                    or_(*clauses),
                )
            ).all()
        )
    return list(ids)


def _require_student_assignment(db: Session, student_id: str, assignment_id: UUID) -> LearningAssignment:
    assignment = db.get(LearningAssignment, assignment_id)
    if not assignment or assignment.status not in {"published", "closed"}:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if assignment.id not in _student_assignment_ids(db, student_id, assignment.academy_id):
        raise HTTPException(status_code=404, detail="Assignment not found.")
    can_student_access_academy(db, student_id, assignment.academy_id)
    return assignment


def _clean_answer(value: str | None) -> str | None:
    if value is None:
        return None
    text = unicodedata.normalize("NFKC", str(value)).strip()
    if text in CHOICE_MAP:
        text = CHOICE_MAP[text]
    for symbol, number in CHOICE_MAP.items():
        text = text.replace(symbol, number)
    text = re.sub(r"^(\uC815\uB2F5|\uB2F5|answer|ans)\s*[:\uFF1A]?", "", text, flags=re.IGNORECASE).strip()
    text = text.lower()
    text = re.sub(r"\s+", "", text)
    return text or None


def _grade_answer(student_answer: str | None, correct_answer: str | None) -> tuple[bool | None, str, str | None, str | None]:
    normalized_student = _clean_answer(student_answer)
    normalized_correct = _clean_answer(correct_answer)
    if not normalized_correct:
        return None, "needs_manual_review", normalized_student, normalized_correct
    if normalized_student == normalized_correct:
        return True, "auto_graded", normalized_student, normalized_correct
    if re.fullmatch(r"[1-5]", normalized_correct):
        return False, "auto_graded", normalized_student, normalized_correct
    if len(normalized_correct) <= 30 and "\n" not in str(correct_answer):
        return False, "auto_graded", normalized_student, normalized_correct
    return None, "needs_manual_review", normalized_student, normalized_correct


def _next_attempt_number(db: Session, student_id: str, academy_id: str, problem_id: UUID) -> int:
    count = db.scalar(
        select(func.count(ProblemAttempt.id)).where(
            ProblemAttempt.student_id == student_id,
            ProblemAttempt.academy_id == academy_id,
            ProblemAttempt.problem_id == problem_id,
        )
    ) or 0
    return int(count) + 1


def _touch_wrong_answer_record(
    db: Session,
    *,
    academy_id: str,
    student_id: str,
    problem_id: UUID,
    problem_version_id: UUID,
    attempt: ProblemAttempt,
    assignment_id: UUID | None,
) -> None:
    record = db.scalar(
        select(WrongAnswerRecord).where(
            WrongAnswerRecord.academy_id == academy_id,
            WrongAnswerRecord.student_id == student_id,
            WrongAnswerRecord.problem_id == problem_id,
        )
    )
    now = datetime.utcnow()
    if attempt.is_correct is False:
        if not record:
            record = WrongAnswerRecord(
                academy_id=academy_id,
                student_id=student_id,
                problem_id=problem_id,
                problem_version_id=problem_version_id,
                first_wrong_at=now,
                latest_wrong_at=now,
                wrong_count=0,
                source_assignment_ids=[],
            )
            db.add(record)
        record.problem_version_id = problem_version_id
        record.latest_wrong_at = now
        record.wrong_count += 1
        record.resolved_status = "unresolved"
        record.last_attempt_id = attempt.id
        if assignment_id:
            ids = list(record.source_assignment_ids or [])
            if str(assignment_id) not in ids:
                ids.append(str(assignment_id))
            record.source_assignment_ids = ids
    elif attempt.is_correct is True and record:
        record.retry_count += 1
        record.resolved_status = "mastered" if record.retry_count >= 2 else "resolved"
        record.last_attempt_id = attempt.id
        record.updated_at = now


def _record_attempt(
    db: Session,
    *,
    academy_id: str,
    student_id: str,
    problem_version_id: UUID,
    problem_snapshot: dict[str, Any],
    answer: str | None,
    submission_id: UUID | None,
    assignment_id: UUID | None,
    source_context: str,
    time_spent_seconds: int | None = None,
) -> ProblemAttempt:
    problem_id = UUID(problem_snapshot["id"])
    is_correct, grading_status, normalized_student, normalized_correct = _grade_answer(answer, problem_snapshot.get("answer"))
    attempt = ProblemAttempt(
        academy_id=academy_id,
        student_id=student_id,
        submission_id=submission_id,
        assignment_id=assignment_id,
        problem_id=problem_id,
        problem_version_id=problem_version_id,
        source_context=source_context,
        student_answer=answer,
        normalized_student_answer=normalized_student,
        correct_answer=problem_snapshot.get("answer"),
        normalized_correct_answer=normalized_correct,
        is_correct=is_correct,
        grading_status=grading_status,
        attempt_number=_next_attempt_number(db, student_id, academy_id, problem_id),
        time_spent_seconds=time_spent_seconds,
        submitted_at=datetime.utcnow(),
    )
    db.add(attempt)
    db.flush()
    _touch_wrong_answer_record(
        db,
        academy_id=academy_id,
        student_id=student_id,
        problem_id=problem_id,
        problem_version_id=problem_version_id,
        attempt=attempt,
        assignment_id=assignment_id,
    )
    return attempt


def _problem_for_student(problem: dict[str, Any], *, show_answer: bool, show_solution: bool) -> dict[str, Any]:
    payload = dict(problem)
    if not show_answer:
        payload.pop("answer", None)
    if not show_solution:
        payload.pop("solution_steps", None)
        payload.pop("key_concept", None)
    return payload


def _assignment_payload(db: Session, assignment: LearningAssignment, student_id: str | None = None) -> dict[str, Any]:
    content = assignment.content_version
    academy_name = get_academy_name(db, assignment.academy_id)
    submission = None
    if student_id:
        submission = db.scalar(
            select(LearningSubmission)
            .where(LearningSubmission.assignment_id == assignment.id, LearningSubmission.student_id == student_id)
            .order_by(LearningSubmission.created_at.desc())
        )
    submitted = bool(submission and submission.status in COMPLETED_SUBMISSION_STATUSES)
    show_answer = assignment.show_answer_policy == "immediately" or (submitted and assignment.show_answer_policy in {"afterSubmit", "immediately"})
    show_solution = assignment.show_solution_policy == "immediately" or (submitted and assignment.show_solution_policy in {"afterSubmit", "immediately"})
    return {
        **_serialize(assignment),
        "academy_name": academy_name,
        "content": {
            **_serialize(content),
            "snapshot": {
                **content.snapshot,
                "problems": [
                    _problem_for_student(problem, show_answer=show_answer, show_solution=show_solution)
                    for problem in content.snapshot.get("problems", [])
                ],
            },
        },
        "submission": _serialize(submission) if submission else None,
    }


@router.post("/student/academy-keys/activate")
def activate_academy_key(payload: AcademyKeyActivate, request: Request, db: Session = Depends(get_db)):
    membership = claim_invite_code(db, request, payload.key_code)
    db.commit()
    seat = db.get(AcademySeat, membership.academy_seat_id)
    class_row = db.get(AcademyClass, seat.class_id) if seat and seat.class_id else None
    return {**_serialize(membership), "academy_name": get_academy_name(db, membership.academy_id), "class_id": str(class_row.id) if class_row else None, "class_name": class_row.name if class_row else None}


@router.get("/student/academies")
def learning_connected_academies(request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    rows = student_memberships(db, student_id)
    result = []
    for row in rows:
        seat = db.get(AcademySeat, row.academy_seat_id)
        class_row = db.get(AcademyClass, seat.class_id) if seat and seat.class_id else None
        result.append({**_serialize(row), "academy_name": get_academy_name(db, row.academy_id), "class_id": str(class_row.id) if class_row else None, "class_name": class_row.name if class_row else None})
    return result


@router.get("/student/today")
def student_today(request: Request, academy_id: str | None = None, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    ids = _student_assignment_ids(db, student_id, academy_id)
    assignments = []
    if ids:
        assignments = db.scalars(
            select(LearningAssignment)
            .where(LearningAssignment.id.in_(ids), LearningAssignment.status.in_(["published", "closed"]))
            .options(joinedload(LearningAssignment.content_version))
            .order_by(LearningAssignment.due_at.is_(None), LearningAssignment.due_at, LearningAssignment.created_at.desc())
        ).all()
    return {
        "academies": learning_connected_academies(request, db),
        "assignments": [_assignment_payload(db, assignment, student_id) for assignment in assignments],
        "stats": _student_stats_payload(db, student_id, academy_id),
    }


@router.get("/student/assignments")
def student_assignments(request: Request, academy_id: str | None = None, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    ids = _student_assignment_ids(db, student_id, academy_id)
    if not ids:
        return []
    rows = db.scalars(
        select(LearningAssignment)
        .where(LearningAssignment.id.in_(ids), LearningAssignment.status.in_(["published", "closed"]))
        .options(joinedload(LearningAssignment.content_version))
        .order_by(LearningAssignment.due_at.is_(None), LearningAssignment.due_at)
    ).all()
    return [_assignment_payload(db, row, student_id) for row in rows]


@router.get("/student/assignments/{assignment_id}")
def read_student_assignment(assignment_id: UUID, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    assignment = _require_student_assignment(db, student_id, assignment_id)
    return _assignment_payload(db, assignment, student_id)


@router.post("/student/assignments/{assignment_id}/start")
def start_learning_assignment(assignment_id: UUID, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    assignment = _require_student_assignment(db, student_id, assignment_id)
    submission = db.scalar(
        select(LearningSubmission).where(
            LearningSubmission.assignment_id == assignment.id,
            LearningSubmission.student_id == student_id,
            LearningSubmission.status == "in_progress",
        )
    )
    if not submission:
        submission = LearningSubmission(
            academy_id=assignment.academy_id,
            student_id=student_id,
            assignment_id=assignment.id,
            source_context="assignment",
            source_id=str(assignment.id),
        )
        db.add(submission)
        db.flush()
    db.commit()
    return _serialize(submission)


@router.post("/student/assignments/{assignment_id}/submit")
def submit_learning_assignment(assignment_id: UUID, payload: AssignmentSubmitPayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    assignment = _require_student_assignment(db, student_id, assignment_id)
    version = assignment.content_version
    now = datetime.utcnow()
    submission = db.scalar(
        select(LearningSubmission)
        .where(LearningSubmission.assignment_id == assignment.id, LearningSubmission.student_id == student_id, LearningSubmission.status == "in_progress")
        .order_by(LearningSubmission.created_at.desc())
    )
    if not submission:
        submission = LearningSubmission(
            academy_id=assignment.academy_id,
            student_id=student_id,
            assignment_id=assignment.id,
            source_context="assignment",
            source_id=str(assignment.id),
        )
        db.add(submission)
        db.flush()
    answer_map = {str(answer.problem_id): answer for answer in payload.answers}
    correct_count = 0
    wrong_count = 0
    total_count = len(version.snapshot.get("problems", []))
    for problem in version.snapshot.get("problems", []):
        answer = answer_map.get(problem["id"])
        attempt = _record_attempt(
            db,
            academy_id=assignment.academy_id,
            student_id=student_id,
            problem_version_id=version.id,
            problem_snapshot=problem,
            answer=answer.answer if answer else None,
            submission_id=submission.id,
            assignment_id=assignment.id,
            source_context="assignment",
            time_spent_seconds=answer.time_spent_seconds if answer else None,
        )
        if attempt.is_correct is True:
            correct_count += 1
        elif attempt.is_correct is False:
            wrong_count += 1
    submission.submitted_at = now
    submission.status = "late" if assignment.due_at and now > assignment.due_at else "submitted"
    submission.total_count = total_count
    submission.correct_count = correct_count
    submission.wrong_count = wrong_count
    submission.score = round((correct_count / total_count) * 100, 2) if total_count else None
    submission.time_spent_seconds = payload.time_spent_seconds
    submission.updated_at = now
    db.commit()
    return _serialize(submission)


@router.post("/student/assignments/{assignment_id}/complete")
def complete_learning_assignment(assignment_id: UUID, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    assignment = _require_student_assignment(db, student_id, assignment_id)
    now = datetime.utcnow()
    submission = db.scalar(
        select(LearningSubmission)
        .where(LearningSubmission.assignment_id == assignment.id, LearningSubmission.student_id == student_id)
        .order_by(LearningSubmission.created_at.desc())
    )
    if not submission:
        submission = LearningSubmission(
            academy_id=assignment.academy_id,
            student_id=student_id,
            assignment_id=assignment.id,
            source_context="assignment",
            source_id=str(assignment.id),
        )
        db.add(submission)
        db.flush()
    if submission.status in COMPLETED_SUBMISSION_STATUSES:
        return _serialize(submission)
    submission.submitted_at = None
    submission.status = PENDING_CONFIRMATION_STATUS
    submission.total_count = len((assignment.content_version.snapshot or {}).get("problems", [])) if assignment.content_version else 0
    submission.updated_at = now
    db.commit()
    return _serialize(submission)


@router.get("/student/archives")
def student_archives(request: Request, academy_id: str | None = None, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    grants = _student_grants(db, student_id, academy_id=academy_id, include_inactive=True)
    now = datetime.utcnow()
    result = []
    for grant in grants:
        locked_reason = None
        if grant.revoked_at:
            locked_reason = "revoked"
        elif grant.starts_at and grant.starts_at > now:
            locked_reason = "not_started"
        elif grant.expires_at and grant.expires_at <= now:
            locked_reason = "expired"
        try:
            title, problems = _source_title_and_problems(db, grant.academy_id, grant.source_type, grant.source_id)
        except HTTPException:
            title, problems = "Unavailable content", []
            locked_reason = locked_reason or "source_missing"
        result.append(
            {
                **_serialize(grant),
                "academy_name": get_academy_name(db, grant.academy_id),
                "title": title,
                "problem_count": len(problems),
                "locked_reason": locked_reason,
            }
        )
    return result


@router.get("/student/archives/{grant_id}/problems")
def student_archive_problems(grant_id: UUID, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    grant = next((item for item in _student_grants(db, student_id) if item.id == grant_id), None)
    if not grant or not grant.can_view_problems:
        raise HTTPException(status_code=404, detail="Archive access not found.")
    title, problems = _source_title_and_problems(db, grant.academy_id, grant.source_type, grant.source_id)
    return {
        "grant": _serialize(grant),
        "academy_name": get_academy_name(db, grant.academy_id),
        "title": title,
        "problems": [
            _problem_for_student(
                _problem_snapshot(problem),
                show_answer=grant.can_see_answer_immediately,
                show_solution=grant.can_see_solution,
            )
            for problem in problems
        ],
    }


@router.post("/student/problems/{problem_id}/solve")
def solve_free_archive_problem(problem_id: UUID, payload: FreeSolvePayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    grant = _require_student_grant_for_problem(db, student_id, problem_id, require_solve=True, grant_id=payload.source_access_grant_id)
    problem = db.scalars(select(Problem).where(Problem.id == problem_id).options(joinedload(Problem.tags))).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found.")
    version = _create_content_version(db, grant.academy_id, student_id, "problem", str(problem.id))
    submission = LearningSubmission(
        academy_id=grant.academy_id,
        student_id=student_id,
        source_context="free_archive",
        source_id=str(grant.id),
        submitted_at=datetime.utcnow(),
        status="submitted",
        total_count=1,
    )
    db.add(submission)
    db.flush()
    attempt = _record_attempt(
        db,
        academy_id=grant.academy_id,
        student_id=student_id,
        problem_version_id=version.id,
        problem_snapshot=_problem_snapshot(problem),
        answer=payload.answer,
        submission_id=submission.id,
        assignment_id=None,
        source_context="free_archive",
        time_spent_seconds=payload.time_spent_seconds,
    )
    submission.correct_count = 1 if attempt.is_correct is True else 0
    submission.wrong_count = 1 if attempt.is_correct is False else 0
    submission.score = 100 if attempt.is_correct is True else 0 if attempt.is_correct is False else None
    db.commit()
    return {"submission": _serialize(submission), "attempt": _serialize(attempt)}


@router.get("/student/wrong-answers")
def learning_wrong_answers(request: Request, academy_id: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    query = select(WrongAnswerRecord).where(WrongAnswerRecord.student_id == student_id)
    if academy_id:
        can_student_access_academy(db, student_id, academy_id)
        query = query.where(WrongAnswerRecord.academy_id == academy_id)
    if status:
        query = query.where(WrongAnswerRecord.resolved_status == status)
    rows = db.scalars(query.order_by(WrongAnswerRecord.latest_wrong_at.desc())).all()
    return [_wrong_answer_payload(db, row) for row in rows]


def _wrong_answer_payload(db: Session, record: WrongAnswerRecord) -> dict[str, Any]:
    problem = db.scalars(select(Problem).where(Problem.id == record.problem_id).options(joinedload(Problem.tags))).first()
    return {
        **_serialize(record),
        "academy_name": get_academy_name(db, record.academy_id),
        "problem": _problem_snapshot(problem) if problem else None,
    }


@router.post("/student/wrong-answers/{record_id}/retry")
def retry_wrong_answer(record_id: UUID, payload: FreeSolvePayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    record = db.scalar(select(WrongAnswerRecord).where(WrongAnswerRecord.id == record_id, WrongAnswerRecord.student_id == student_id))
    if not record:
        raise HTTPException(status_code=404, detail="Wrong-answer record not found.")
    grant = _require_student_grant_for_problem(db, student_id, record.problem_id, require_solve=True, grant_id=payload.source_access_grant_id)
    if not grant.can_retry:
        raise HTTPException(status_code=403, detail="Retry is disabled for this archive.")
    problem = db.scalars(select(Problem).where(Problem.id == record.problem_id).options(joinedload(Problem.tags))).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found.")
    attempt = _record_attempt(
        db,
        academy_id=record.academy_id,
        student_id=student_id,
        problem_version_id=record.problem_version_id,
        problem_snapshot=_problem_snapshot(problem),
        answer=payload.answer,
        submission_id=None,
        assignment_id=None,
        source_context="personal_review",
        time_spent_seconds=payload.time_spent_seconds,
    )
    db.commit()
    return _serialize(attempt)


@router.get("/student/stats")
def student_stats(request: Request, academy_id: str | None = None, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    return _student_stats_payload(db, student_id, academy_id)


def _student_stats_payload(db: Session, student_id: str, academy_id: str | None = None) -> dict[str, Any]:
    attempt_query = select(ProblemAttempt).where(ProblemAttempt.student_id == student_id)
    submission_query = select(LearningSubmission).where(LearningSubmission.student_id == student_id)
    wrong_query = select(WrongAnswerRecord).where(WrongAnswerRecord.student_id == student_id)
    if academy_id:
        can_student_access_academy(db, student_id, academy_id)
        attempt_query = attempt_query.where(ProblemAttempt.academy_id == academy_id)
        submission_query = submission_query.where(LearningSubmission.academy_id == academy_id)
        wrong_query = wrong_query.where(WrongAnswerRecord.academy_id == academy_id)
    attempts = db.scalars(attempt_query).all()
    submissions = db.scalars(submission_query).all()
    wrong_records = db.scalars(wrong_query).all()
    graded = [attempt for attempt in attempts if attempt.is_correct is not None]
    correct = sum(1 for attempt in graded if attempt.is_correct)
    completed = sum(1 for submission in submissions if submission.status in COMPLETED_SUBMISSION_STATUSES)
    units: dict[str, dict[str, int]] = {}
    for attempt in attempts:
        problem = db.scalars(select(Problem).where(Problem.id == attempt.problem_id).options(joinedload(Problem.tags))).first()
        unit = problem.tags.unit if problem and problem.tags and problem.tags.unit else "미분류"
        bucket = units.setdefault(unit, {"total": 0, "wrong": 0})
        bucket["total"] += 1
        if attempt.is_correct is False:
            bucket["wrong"] += 1
    weak_units = [
        {"unit": unit, **data, "wrong_rate": data["wrong"] / data["total"] if data["total"] else 0}
        for unit, data in units.items()
    ]
    weak_units.sort(key=lambda item: item["wrong_rate"], reverse=True)
    return {
        "submission_count": len(submissions),
        "completion_rate": completed / len(submissions) if submissions else 0,
        "solved_problem_count": len(attempts),
        "correct_rate": correct / len(graded) if graded else 0,
        "unresolved_wrong_count": sum(1 for record in wrong_records if record.resolved_status in {"unresolved", "reviewing"}),
        "mastered_wrong_count": sum(1 for record in wrong_records if record.resolved_status == "mastered"),
        "weak_units": weak_units[:8],
    }


@router.get("/student/personal-sets")
def list_personal_sets(request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    sets = db.scalars(select(StudentPersonalSet).where(StudentPersonalSet.student_id == student_id).order_by(StudentPersonalSet.updated_at.desc())).all()
    return [_personal_set_payload(db, row) for row in sets]


@router.post("/student/personal-sets")
def create_personal_set(payload: PersonalSetPayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    item = StudentPersonalSet(student_id=student_id, title=payload.title, description=payload.description)
    db.add(item)
    db.commit()
    return _personal_set_payload(db, item)


@router.post("/student/personal-sets/{set_id}/items")
def add_personal_set_item(set_id: UUID, payload: PersonalSetItemPayload, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    personal_set = db.scalar(select(StudentPersonalSet).where(StudentPersonalSet.id == set_id, StudentPersonalSet.student_id == student_id))
    if not personal_set:
        raise HTTPException(status_code=404, detail="Personal set not found.")
    grant = _require_student_grant_for_problem(db, student_id, payload.problem_id, require_save=True, grant_id=payload.source_access_grant_id)
    problem = db.scalars(select(Problem).where(Problem.id == payload.problem_id).options(joinedload(Problem.tags))).first()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found.")
    version = _create_content_version(db, grant.academy_id, student_id, "problem", str(problem.id))
    next_index = db.scalar(select(func.count(StudentPersonalSetItem.id)).where(StudentPersonalSetItem.set_id == personal_set.id)) or 0
    row = db.scalar(select(StudentPersonalSetItem).where(StudentPersonalSetItem.set_id == personal_set.id, StudentPersonalSetItem.problem_id == problem.id))
    if not row:
        row = StudentPersonalSetItem(
            set_id=personal_set.id,
            student_id=student_id,
            academy_id=grant.academy_id,
            problem_id=problem.id,
            problem_version_id=version.id,
            source_access_grant_id=grant.id,
            order_index=int(next_index),
        )
        db.add(row)
    personal_set.updated_at = datetime.utcnow()
    db.commit()
    return _personal_set_payload(db, personal_set)


@router.delete("/student/personal-sets/{set_id}/items/{item_id}")
def remove_personal_set_item(set_id: UUID, item_id: UUID, request: Request, db: Session = Depends(get_db)):
    student_id = current_owner_id(request)
    row = db.scalar(
        select(StudentPersonalSetItem)
        .join(StudentPersonalSet, StudentPersonalSet.id == StudentPersonalSetItem.set_id)
        .where(StudentPersonalSet.id == set_id, StudentPersonalSet.student_id == student_id, StudentPersonalSetItem.id == item_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Set item not found.")
    db.delete(row)
    db.commit()
    return {"ok": True}


def _personal_set_payload(db: Session, personal_set: StudentPersonalSet) -> dict[str, Any]:
    student_id = personal_set.student_id
    rows = db.scalars(select(StudentPersonalSetItem).where(StudentPersonalSetItem.set_id == personal_set.id).order_by(StudentPersonalSetItem.order_index)).all()
    items = []
    for row in rows:
        problem = db.scalars(select(Problem).where(Problem.id == row.problem_id).options(joinedload(Problem.tags))).first()
        locked_reason = None
        try:
            _require_student_grant_for_problem(db, student_id, row.problem_id)
        except HTTPException as exc:
            locked_reason = "access_expired_or_revoked" if exc.status_code == 403 else "source_missing"
        items.append(
            {
                **_serialize(row),
                "academy_name": get_academy_name(db, row.academy_id),
                "locked_reason": locked_reason,
                "problem": None if locked_reason or not problem else _problem_for_student(_problem_snapshot(problem), show_answer=False, show_solution=False),
            }
        )
    return {**_serialize(personal_set), "items": items, "item_count": len(items)}


@router.get("/academy/{academy_id}/students")
def academy_students(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id)
    memberships = db.scalars(select(StudentAcademyMembership).where(StudentAcademyMembership.academy_id == academy_id).order_by(StudentAcademyMembership.joined_at.desc())).all()
    rows = []
    for membership in memberships:
        group_ids = _membership_group_ids(db, membership)
        group_rows = db.scalars(select(AcademyClass).where(AcademyClass.id.in_(group_ids), AcademyClass.academy_id == academy_id)).all() if group_ids else []
        attempts = db.scalars(select(ProblemAttempt).where(ProblemAttempt.academy_id == academy_id, ProblemAttempt.student_id == membership.student_user_id, ProblemAttempt.is_correct.is_not(None))).all()
        correct = sum(1 for attempt in attempts if attempt.is_correct)
        unresolved = db.scalar(
            select(func.count(WrongAnswerRecord.id)).where(
                WrongAnswerRecord.academy_id == academy_id,
                WrongAnswerRecord.student_id == membership.student_user_id,
                WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]),
            )
        ) or 0
        recent_submissions = db.scalar(
            select(func.count(LearningSubmission.id)).where(
                LearningSubmission.academy_id == academy_id,
                LearningSubmission.student_id == membership.student_user_id,
                LearningSubmission.submitted_at.is_not(None),
            )
        ) or 0
        seat = db.get(AcademySeat, membership.academy_seat_id)
        rows.append(
            {
                **_serialize(membership),
                "student_name": membership.display_name_in_academy or _student_name(db, membership.student_user_id),
                "groups": [_serialize(group) for group in group_rows],
                "key_status": "active" if seat and seat.is_active and seat.current_student_membership_id == membership.id else "inactive",
                "recent_assignment_completion": int(recent_submissions),
                "recent_correct_rate": correct / len(attempts) if attempts else None,
                "unresolved_wrong_answer_count": int(unresolved),
            }
        )
    return rows


@router.post("/academy/{academy_id}/student-keys")
def issue_student_keys(academy_id: str, payload: StudentKeyCreate, request: Request, db: Session = Depends(get_db)):
    actor = require_manage_seats(db, request, academy_id)
    class_id = None
    class_name = None
    if payload.class_id:
        class_row = db.scalar(select(AcademyClass).where(AcademyClass.id == payload.class_id, AcademyClass.academy_id == academy_id, AcademyClass.is_active.is_(True)))
        if not class_row:
            raise HTTPException(status_code=404, detail="Class not found.")
        class_id = class_row.id
        class_name = class_row.name
    created = []
    for index in range(payload.count):
        display = f"{payload.display_name_prefix} {index + 1}" if payload.display_name_prefix else None
        seat, code = create_seat(db, academy_id, display, class_id=class_id)
        created.append({**_serialize(seat), "class_name": class_name, "key_code": code, "status": "unused"})
    db.commit()
    return {"created_by": actor, "keys": created}


@router.post("/academy/{academy_id}/student-keys/{seat_id}/revoke")
def revoke_student_key(academy_id: str, seat_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_manage_seats(db, request, academy_id)
    seat = db.scalar(select(AcademySeat).where(AcademySeat.id == seat_id, AcademySeat.academy_id == academy_id))
    if not seat:
        raise HTTPException(status_code=404, detail="Student key not found.")
    new_code = release_seat(db, request, seat, reason="revoked_from_learning_workspace", rotate_code=True)
    db.commit()
    return {**_serialize(seat), "status": "revoked", "replacement_key_code": new_code}


@router.get("/academy/{academy_id}/groups")
def academy_groups(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id)
    rows = db.scalars(select(AcademyClass).where(AcademyClass.academy_id == academy_id, AcademyClass.is_active.is_(True)).order_by(AcademyClass.created_at.desc())).all()
    return [_serialize(row) for row in rows]


@router.post("/academy/{academy_id}/groups")
def create_group(academy_id: str, payload: GroupPayload, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    group = AcademyClass(academy_id=academy_id, name=payload.name, description=payload.description, subject=payload.subject, grade_level=payload.grade_level)
    db.add(group)
    db.commit()
    return _serialize(group)


@router.patch("/academy/{academy_id}/groups/{group_id}")
def update_group(academy_id: str, group_id: UUID, payload: GroupPayload, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    group = db.scalar(select(AcademyClass).where(AcademyClass.id == group_id, AcademyClass.academy_id == academy_id))
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")
    group.name = payload.name
    group.description = payload.description
    group.subject = payload.subject
    group.grade_level = payload.grade_level
    group.updated_at = datetime.utcnow()
    db.commit()
    return _serialize(group)


@router.delete("/academy/{academy_id}/groups/{group_id}")
def delete_group(academy_id: str, group_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    group = db.scalar(select(AcademyClass).where(AcademyClass.id == group_id, AcademyClass.academy_id == academy_id))
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")
    group.is_active = False
    group.updated_at = datetime.utcnow()
    db.execute(
        ClassStudent.__table__.update()
        .where(ClassStudent.class_id == group_id, ClassStudent.left_at.is_(None))
        .values(left_at=datetime.utcnow())
    )
    db.commit()
    return {"ok": True}


@router.post("/academy/{academy_id}/groups/{group_id}/students")
def add_group_student(academy_id: str, group_id: UUID, payload: GroupMemberPayload, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    group = db.scalar(select(AcademyClass).where(AcademyClass.id == group_id, AcademyClass.academy_id == academy_id))
    membership = db.scalar(
        select(StudentAcademyMembership).where(
            StudentAcademyMembership.academy_id == academy_id,
            StudentAcademyMembership.student_user_id == payload.student_id,
            StudentAcademyMembership.status == "active",
        )
    )
    if not group or not membership:
        raise HTTPException(status_code=404, detail="Group or student membership not found.")
    row = db.scalar(select(ClassStudent).where(ClassStudent.class_id == group_id, ClassStudent.student_membership_id == membership.id))
    if not row:
        row = ClassStudent(class_id=group_id, student_membership_id=membership.id)
        db.add(row)
    row.left_at = None
    db.commit()
    return _serialize(row)


@router.delete("/academy/{academy_id}/groups/{group_id}/students/{student_id}")
def remove_group_student(academy_id: str, group_id: UUID, student_id: str, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    membership = db.scalar(select(StudentAcademyMembership).where(StudentAcademyMembership.academy_id == academy_id, StudentAcademyMembership.student_user_id == student_id))
    if not membership:
        raise HTTPException(status_code=404, detail="Student membership not found.")
    row = db.scalar(select(ClassStudent).where(ClassStudent.class_id == group_id, ClassStudent.student_membership_id == membership.id, ClassStudent.left_at.is_(None)))
    if row:
        row.left_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


@router.post("/academy/{academy_id}/assignments")
def create_learning_assignment(academy_id: str, payload: LearningAssignmentCreate, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    version = _create_content_version(
        db,
        academy_id,
        actor,
        payload.source_type,
        payload.source_id,
        payload.manual_material_title,
        payload.manual_material_scope,
    )
    target_type = "mixed"
    if payload.student_ids and not payload.group_ids:
        target_type = "students"
    elif payload.group_ids and not payload.student_ids:
        target_type = "groups"
    assignment = LearningAssignment(
        academy_id=academy_id,
        title=payload.title,
        description=payload.description,
        source_type=payload.source_type,
        source_id=payload.source_id,
        content_version_id=version.id,
        assigned_by=actor,
        assigned_to_type=target_type,
        start_at=payload.start_at,
        due_at=payload.due_at,
        schedule_type=payload.schedule_type,
        recurrence_rule=payload.recurrence_rule,
        grading_mode=payload.grading_mode,
        show_score_policy=payload.show_score_policy,
        show_answer_policy=payload.show_answer_policy,
        show_solution_policy=payload.show_solution_policy,
        retry_policy=payload.retry_policy,
        time_limit_seconds=payload.time_limit_seconds,
        shuffle_problems=payload.shuffle_problems,
        shuffle_choices=payload.shuffle_choices,
        status=payload.status,
    )
    db.add(assignment)
    db.flush()
    for student_id in payload.student_ids:
        db.add(LearningAssignmentTarget(assignment_id=assignment.id, academy_id=academy_id, student_id=student_id))
    for group_id in payload.group_ids:
        group = db.scalar(select(AcademyClass).where(AcademyClass.id == group_id, AcademyClass.academy_id == academy_id))
        if not group:
            raise HTTPException(status_code=404, detail=f"Group not found: {group_id}")
        db.add(LearningAssignmentTarget(assignment_id=assignment.id, academy_id=academy_id, group_id=group_id))
    db.commit()
    db.refresh(assignment)
    return _assignment_payload(db, assignment)


@router.get("/academy/{academy_id}/assignments")
def list_learning_assignments(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id)
    rows = db.scalars(
        select(LearningAssignment)
        .where(LearningAssignment.academy_id == academy_id)
        .options(joinedload(LearningAssignment.content_version))
        .order_by(LearningAssignment.created_at.desc())
    ).all()
    return [_assignment_payload(db, row) for row in rows]


@router.patch("/academy/{academy_id}/assignments/{assignment_id}")
def update_learning_assignment(academy_id: str, assignment_id: UUID, payload: LearningAssignmentUpdate, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    assignment = db.scalar(select(LearningAssignment).where(LearningAssignment.id == assignment_id, LearningAssignment.academy_id == academy_id).options(joinedload(LearningAssignment.content_version)))
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    allowed_statuses = {"draft", "published", "closed", "archived"}
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "status" and value not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Invalid assignment status.")
        setattr(assignment, key, value)
    assignment.updated_at = datetime.utcnow()
    db.commit()
    return _assignment_payload(db, assignment)


@router.post("/academy/{academy_id}/assignments/{assignment_id}/publish")
def publish_learning_assignment(academy_id: str, assignment_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    assignment = db.scalar(select(LearningAssignment).where(LearningAssignment.id == assignment_id, LearningAssignment.academy_id == academy_id).options(joinedload(LearningAssignment.content_version)))
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    assignment.status = "published"
    assignment.updated_at = datetime.utcnow()
    db.commit()
    return _assignment_payload(db, assignment)


@router.delete("/academy/{academy_id}/assignments/{assignment_id}")
def archive_learning_assignment(academy_id: str, assignment_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    assignment = db.scalar(select(LearningAssignment).where(LearningAssignment.id == assignment_id, LearningAssignment.academy_id == academy_id).options(joinedload(LearningAssignment.content_version)))
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    assignment.status = "archived"
    assignment.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/academy/{academy_id}/assignments/{assignment_id}/report")
def learning_assignment_report(academy_id: str, assignment_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id)
    assignment = db.scalar(select(LearningAssignment).where(LearningAssignment.id == assignment_id, LearningAssignment.academy_id == academy_id).options(joinedload(LearningAssignment.content_version)))
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    student_ids = _assignment_student_ids(db, assignment)
    rows = []
    for student_id in sorted(student_ids):
        submission = db.scalar(
            select(LearningSubmission)
            .where(LearningSubmission.assignment_id == assignment.id, LearningSubmission.student_id == student_id)
            .order_by(LearningSubmission.created_at.desc())
        )
        status = "not_started"
        if submission:
            status = submission.status
        elif assignment.due_at and assignment.due_at < datetime.utcnow():
            status = "missing"
        rows.append(
            {
                "student_id": student_id,
                "student_name": _student_name(db, student_id),
                "status": status,
                "submission": _serialize(submission) if submission else None,
            }
        )
    completed = [row for row in rows if row["submission"] and row["submission"]["status"] in COMPLETED_SUBMISSION_STATUSES]
    pending = [row for row in rows if row["status"] == PENDING_CONFIRMATION_STATUS]
    scores = [row["submission"]["score"] for row in completed if row["submission"].get("score") is not None]
    return {
        "assignment": _assignment_payload(db, assignment),
        "students": rows,
        "summary": {
            "target_count": len(rows),
            "submitted_count": len(completed),
            "pending_confirmation_count": len(pending),
            "missing_count": sum(1 for row in rows if row["status"] == "missing"),
            "completion_rate": len(completed) / len(rows) if rows else 0,
            "average_score": sum(scores) / len(scores) if scores else None,
        },
    }


@router.post("/academy/{academy_id}/assignments/{assignment_id}/students/{student_id}/confirm")
def confirm_learning_assignment_completion(academy_id: str, assignment_id: UUID, student_id: str, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    assignment = db.scalar(select(LearningAssignment).where(LearningAssignment.id == assignment_id, LearningAssignment.academy_id == academy_id).options(joinedload(LearningAssignment.content_version)))
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if student_id not in _assignment_student_ids(db, assignment):
        raise HTTPException(status_code=404, detail="Student is not a target of this assignment.")
    submission = db.scalar(
        select(LearningSubmission)
        .where(LearningSubmission.assignment_id == assignment.id, LearningSubmission.student_id == student_id)
        .order_by(LearningSubmission.created_at.desc())
    )
    if not submission:
        raise HTTPException(status_code=404, detail="No completion request found for this student.")
    if submission.status in COMPLETED_SUBMISSION_STATUSES:
        return _serialize(submission)
    if submission.status != PENDING_CONFIRMATION_STATUS:
        raise HTTPException(status_code=400, detail="This assignment is not waiting for teacher confirmation.")
    now = datetime.utcnow()
    submission.submitted_at = now
    submission.status = "late" if assignment.due_at and now > assignment.due_at else "completed"
    submission.total_count = len((assignment.content_version.snapshot or {}).get("problems", [])) if assignment.content_version else submission.total_count
    submission.updated_at = now
    db.commit()
    return _serialize(submission)


def _assignment_student_ids(db: Session, assignment: LearningAssignment) -> set[str]:
    ids: set[str] = set()
    targets = db.scalars(select(LearningAssignmentTarget).where(LearningAssignmentTarget.assignment_id == assignment.id)).all()
    for target in targets:
        if target.student_id:
            ids.add(target.student_id)
        if target.group_id:
            memberships = db.scalars(
                select(StudentAcademyMembership)
                .join(ClassStudent, ClassStudent.student_membership_id == StudentAcademyMembership.id)
                .where(
                    ClassStudent.class_id == target.group_id,
                    ClassStudent.left_at.is_(None),
                    StudentAcademyMembership.academy_id == assignment.academy_id,
                    StudentAcademyMembership.status == "active",
                )
            ).all()
            ids.update(membership.student_user_id for membership in memberships)
            seat_memberships = db.scalars(
                select(StudentAcademyMembership)
                .join(AcademySeat, AcademySeat.id == StudentAcademyMembership.academy_seat_id)
                .where(
                    AcademySeat.class_id == target.group_id,
                    AcademySeat.current_student_membership_id == StudentAcademyMembership.id,
                    AcademySeat.is_active.is_(True),
                    StudentAcademyMembership.academy_id == assignment.academy_id,
                    StudentAcademyMembership.status == "active",
                )
            ).all()
            ids.update(membership.student_user_id for membership in seat_memberships)
    return ids


@router.post("/academy/{academy_id}/access-grants")
def create_access_grant(academy_id: str, payload: AccessGrantPayload, request: Request, db: Session = Depends(get_db)):
    actor = require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    if not payload.student_id and not payload.group_id:
        raise HTTPException(status_code=400, detail="Grant must target a student or group.")
    _source_title_and_problems(db, academy_id, payload.source_type, payload.source_id)
    if payload.group_id and not db.scalar(select(AcademyClass).where(AcademyClass.id == payload.group_id, AcademyClass.academy_id == academy_id)):
        raise HTTPException(status_code=404, detail="Group not found.")
    if payload.student_id and not db.scalar(select(StudentAcademyMembership).where(StudentAcademyMembership.academy_id == academy_id, StudentAcademyMembership.student_user_id == payload.student_id)):
        raise HTTPException(status_code=404, detail="Student membership not found.")
    grant = ArchiveAccessGrant(academy_id=academy_id, created_by=actor, **payload.model_dump())
    db.add(grant)
    db.commit()
    return _serialize(grant)


@router.get("/academy/{academy_id}/access-grants")
def list_access_grants(academy_id: str, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id)
    rows = db.scalars(select(ArchiveAccessGrant).where(ArchiveAccessGrant.academy_id == academy_id).order_by(ArchiveAccessGrant.created_at.desc())).all()
    return [_serialize(row) for row in rows]


@router.delete("/academy/{academy_id}/access-grants/{grant_id}")
def revoke_access_grant(academy_id: str, grant_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id, {"owner", "admin", "teacher", "assistant"})
    grant = db.scalar(select(ArchiveAccessGrant).where(ArchiveAccessGrant.id == grant_id, ArchiveAccessGrant.academy_id == academy_id))
    if not grant:
        raise HTTPException(status_code=404, detail="Access grant not found.")
    grant.revoked_at = datetime.utcnow()
    db.commit()
    return _serialize(grant)


@router.get("/academy/{academy_id}/wrong-answers")
def academy_wrong_answers(academy_id: str, request: Request, student_id: str | None = None, status: str | None = None, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id)
    query = select(WrongAnswerRecord).where(WrongAnswerRecord.academy_id == academy_id)
    if student_id:
        query = query.where(WrongAnswerRecord.student_id == student_id)
    if status:
        query = query.where(WrongAnswerRecord.resolved_status == status)
    rows = db.scalars(query.order_by(WrongAnswerRecord.latest_wrong_at.desc())).all()
    return [_wrong_answer_payload(db, row) for row in rows]


@router.get("/academy/{academy_id}/analytics/{source_type}/{source_id}")
def academy_source_analytics(academy_id: str, source_type: str, source_id: str, request: Request, db: Session = Depends(get_db)):
    require_staff(db, request, academy_id)
    title, problems = _source_title_and_problems(db, academy_id, source_type, source_id)
    problem_ids = [problem.id for problem in problems]
    attempts = db.scalars(select(ProblemAttempt).where(ProblemAttempt.academy_id == academy_id, ProblemAttempt.problem_id.in_(problem_ids))).all() if problem_ids else []
    by_problem: dict[str, dict[str, Any]] = {
        str(problem.id): {
            "problem_id": str(problem.id),
            "problem_number": problem.problem_number,
            "total_attempts": 0,
            "correct_attempts": 0,
            "wrong_attempts": 0,
            "correct_rate": None,
        }
        for problem in problems
    }
    for attempt in attempts:
        row = by_problem.get(str(attempt.problem_id))
        if not row:
            continue
        row["total_attempts"] += 1
        if attempt.is_correct is True:
            row["correct_attempts"] += 1
        elif attempt.is_correct is False:
            row["wrong_attempts"] += 1
    for row in by_problem.values():
        graded = row["correct_attempts"] + row["wrong_attempts"]
        row["correct_rate"] = row["correct_attempts"] / graded if graded else None
    graded_attempts = [attempt for attempt in attempts if attempt.is_correct is not None]
    correct = sum(1 for attempt in graded_attempts if attempt.is_correct)
    return {
        "title": title,
        "source_type": source_type,
        "source_id": source_id,
        "attempt_count": len(attempts),
        "average_correct_rate": correct / len(graded_attempts) if graded_attempts else None,
        "problem_results": list(by_problem.values()),
    }
