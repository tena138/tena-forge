import re
import uuid
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    AcademyClass,
    AcademySeat,
    ClassScheduleEvent,
    ClassStudent,
    ContentVersion,
    PaperSession,
    PaperSessionResult,
    Problem,
    ProblemResult,
    ProblemSet,
    ProblemSetItem,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    WrongAnswerRecord,
)
from services.academy_student_access import create_seat
from services.ownership import current_owner_id

router = APIRouter(prefix="/api/student-management", tags=["student management"])


def _academy_id(request: Request) -> str:
    return current_owner_id(request)


def _now() -> datetime:
    return datetime.utcnow()


def _uuid_list(values: list[UUID | str] | None) -> list[str]:
    return [str(value) for value in values or [] if value]


def _decimal_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return value


def _student_name(membership: StudentAcademyMembership) -> str:
    metadata = membership.metadata_json or {}
    return membership.display_name_in_academy or metadata.get("name") or metadata.get("display_name") or "Unnamed student"


def _student_payload(db: Session, academy_id: str, membership: StudentAcademyMembership, class_rows: list[AcademyClass] | None = None) -> dict:
    classes = class_rows
    if classes is None:
        classes = db.scalars(
            select(AcademyClass)
            .join(ClassStudent, ClassStudent.class_id == AcademyClass.id)
            .where(
                AcademyClass.academy_id == academy_id,
                ClassStudent.student_membership_id == membership.id,
                ClassStudent.left_at.is_(None),
            )
            .order_by(AcademyClass.name)
        ).all()
    metadata = membership.metadata_json or {}
    latest_result = db.scalar(
        select(PaperSessionResult)
        .where(
            PaperSessionResult.academy_id == academy_id,
            PaperSessionResult.student_membership_id == membership.id,
            PaperSessionResult.status == "graded",
        )
        .order_by(PaperSessionResult.graded_at.desc().nullslast(), PaperSessionResult.updated_at.desc())
        .limit(1)
    )
    unresolved = db.scalar(
        select(func.count(WrongAnswerRecord.id)).where(
            WrongAnswerRecord.academy_id == academy_id,
            WrongAnswerRecord.student_id == membership.student_user_id,
            WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]),
        )
    ) or 0
    status = membership.status or "active"
    if unresolved >= 10:
        status_chip = "Needs Review"
    elif status != "active":
        status_chip = "Inactive"
    else:
        status_chip = "Active"
    return {
        "id": str(membership.id),
        "student_user_id": membership.student_user_id,
        "name": _student_name(membership),
        "grade_level": metadata.get("grade_level") or metadata.get("grade"),
        "school": metadata.get("school"),
        "status": status,
        "status_chip": status_chip,
        "memo": metadata.get("memo"),
        "class_ids": [str(row.id) for row in classes],
        "class_names": [row.name for row in classes],
        "recent_score": _decimal_float(latest_result.score) if latest_result else None,
        "recent_completion_status": latest_result.status if latest_result else "not_started",
        "unresolved_wrong_count": unresolved,
        "recent_weakness_label": None,
        "joined_at": membership.joined_at.isoformat() if membership.joined_at else None,
    }


def _active_memberships_for_class(db: Session, academy_id: str, class_id: UUID) -> list[StudentAcademyMembership]:
    return db.scalars(
        select(StudentAcademyMembership)
        .join(ClassStudent, ClassStudent.student_membership_id == StudentAcademyMembership.id)
        .where(
            StudentAcademyMembership.academy_id == academy_id,
            ClassStudent.class_id == class_id,
            ClassStudent.left_at.is_(None),
            StudentAcademyMembership.status == "active",
        )
        .order_by(StudentAcademyMembership.display_name_in_academy)
    ).all()


def _class_payload(db: Session, academy_id: str, row: AcademyClass, include_students: bool = True) -> dict:
    memberships = _active_memberships_for_class(db, academy_id, row.id)
    student_ids = [membership.student_user_id for membership in memberships]
    student_membership_ids = {str(membership.id) for membership in memberships}
    unresolved = 0
    avg_score = None
    if student_ids:
        unresolved = db.scalar(
            select(func.count(WrongAnswerRecord.id)).where(
                WrongAnswerRecord.academy_id == academy_id,
                WrongAnswerRecord.student_id.in_(student_ids),
                WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]),
            )
        ) or 0
        avg_score = db.scalar(
            select(func.avg(PaperSessionResult.score)).where(
                PaperSessionResult.academy_id == academy_id,
                PaperSessionResult.student_membership_id.in_([membership.id for membership in memberships]),
                PaperSessionResult.status == "graded",
                PaperSessionResult.score.is_not(None),
            )
        )
    sessions = db.scalars(
        select(PaperSession).where(PaperSession.academy_id == academy_id).order_by(PaperSession.created_at.desc())
    ).all()
    now = _now()
    class_sessions = [session for session in sessions if str(row.id) in (session.class_ids or [])]
    upcoming_count = sum(
        1
        for session in class_sessions
        if session.status in {"draft", "scheduled", "exported", "grading"}
        and ((session.scheduled_at and session.scheduled_at >= now) or (session.due_at and session.due_at >= now))
    )
    recent_session = class_sessions[0] if class_sessions else None
    students = [_student_payload(db, academy_id, membership, [row]) for membership in memberships] if include_students else []
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description,
        "subject": row.subject,
        "grade_level": row.grade_level,
        "is_active": row.is_active,
        "student_count": len(memberships),
        "upcoming_count": upcoming_count,
        "recent_session": _session_summary(db, academy_id, recent_session) if recent_session else None,
        "average_recent_score": _decimal_float(avg_score),
        "unresolved_wrong_count": unresolved,
        "students": students,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "student_membership_ids": list(student_membership_ids),
    }


def _get_class(db: Session, academy_id: str, class_id: UUID) -> AcademyClass:
    row = db.get(AcademyClass, class_id)
    if not row or row.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="Class not found.")
    return row


def _get_membership(db: Session, academy_id: str, student_id: UUID) -> StudentAcademyMembership:
    row = db.get(StudentAcademyMembership, student_id)
    if not row or row.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="Student not found.")
    return row


def _problem_set_snapshot(db: Session, owner_id: str, academy_id: str, problem_set_id: UUID, created_by: str | None) -> ContentVersion:
    problem_set = db.scalars(
        select(ProblemSet)
        .where(ProblemSet.id == problem_set_id, ProblemSet.owner_id == owner_id)
        .options(joinedload(ProblemSet.items).joinedload(ProblemSetItem.problem).joinedload(Problem.tags))
    ).unique().first()
    if not problem_set:
        raise HTTPException(status_code=404, detail="Problem set not found.")
    items = sorted(problem_set.items, key=lambda item: item.order_index)
    if not items:
        raise HTTPException(status_code=400, detail="PaperSession requires at least one problem.")
    problems = []
    for index, item in enumerate(items, start=1):
        problem = item.problem
        tags = problem.tags
        problems.append(
            {
                "problem_id": str(problem.id),
                "problem_number": index,
                "original_problem_number": problem.problem_number,
                "problem_text": problem.problem_text,
                "answer": problem.answer,
                "solution_steps": problem.solution_steps,
                "source_label": problem.source_label,
                "subject": tags.subject if tags else None,
                "unit": tags.unit if tags else None,
                "difficulty": tags.difficulty if tags else None,
            }
        )
    version = ContentVersion(
        academy_id=academy_id,
        source_type="paper_session_problem_set",
        source_id=str(problem_set.id),
        title=problem_set.name,
        version_label=f"paper-session-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        snapshot={
            "source_type": "problem_set",
            "problem_set_id": str(problem_set.id),
            "title": problem_set.name,
            "subtitle": problem_set.subtitle,
            "subject": problem_set.subject,
            "grade": problem_set.grade,
            "unit": problem_set.unit,
            "problem_count": len(problems),
            "problems": problems,
        },
        created_by=created_by,
    )
    db.add(version)
    db.flush()
    return version


def _session_problems(session: PaperSession) -> list[dict]:
    snapshot = session.content_version.snapshot if session.content_version else {}
    return list((snapshot or {}).get("problems") or [])


def _session_summary(db: Session, academy_id: str, session: PaperSession | None) -> dict | None:
    if not session:
        return None
    results = db.scalars(
        select(PaperSessionResult).where(
            PaperSessionResult.academy_id == academy_id,
            PaperSessionResult.paper_session_id == session.id,
        )
    ).all()
    graded = [row for row in results if row.status == "graded"]
    avg_score = None
    if graded:
        avg_score = sum(float(row.score or 0) for row in graded) / len(graded)
    return {
        "id": str(session.id),
        "title": session.title,
        "description": session.description,
        "source_problem_set_id": str(session.source_problem_set_id) if session.source_problem_set_id else None,
        "content_version_id": str(session.content_version_id),
        "session_type": session.session_type,
        "target_type": session.target_type,
        "class_ids": [str(value) for value in session.class_ids or []],
        "student_membership_ids": [str(value) for value in session.student_membership_ids or []],
        "scheduled_at": session.scheduled_at.isoformat() if session.scheduled_at else None,
        "due_at": session.due_at.isoformat() if session.due_at else None,
        "status": session.status,
        "problem_count": len(_session_problems(session)),
        "assigned_count": len(results),
        "graded_count": len(graded),
        "average_score": avg_score,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }


def _get_session(db: Session, academy_id: str, session_id: UUID) -> PaperSession:
    row = db.scalars(
        select(PaperSession)
        .where(PaperSession.id == session_id, PaperSession.academy_id == academy_id)
        .options(joinedload(PaperSession.content_version))
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Paper session not found.")
    return row


def _target_memberships(db: Session, academy_id: str, class_ids: list[UUID], student_ids: list[UUID]) -> list[StudentAcademyMembership]:
    rows: dict[UUID, StudentAcademyMembership] = {}
    if class_ids:
        valid_classes = db.scalars(
            select(AcademyClass.id).where(AcademyClass.academy_id == academy_id, AcademyClass.id.in_(class_ids))
        ).all()
        if len(valid_classes) != len(set(class_ids)):
            raise HTTPException(status_code=404, detail="One or more classes were not found.")
        for membership in db.scalars(
            select(StudentAcademyMembership)
            .join(ClassStudent, ClassStudent.student_membership_id == StudentAcademyMembership.id)
            .where(
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.status == "active",
                ClassStudent.class_id.in_(class_ids),
                ClassStudent.left_at.is_(None),
            )
        ).all():
            rows[membership.id] = membership
    if student_ids:
        for membership in db.scalars(
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.id.in_(student_ids),
            )
        ).all():
            rows[membership.id] = membership
        if len(rows) < len(set(student_ids)):
            missing = [str(student_id) for student_id in student_ids if student_id not in rows]
            if missing:
                raise HTTPException(status_code=404, detail=f"Students not found: {', '.join(missing)}")
    return sorted(rows.values(), key=_student_name)


def _parse_wrong_numbers(value: str | None) -> set[int]:
    if not value:
        return set()
    numbers: set[int] = set()
    for token in re.split(r"[\s,;/]+", value.strip()):
        if not token:
            continue
        if "-" in token or "~" in token:
            parts = re.split(r"[-~]", token, maxsplit=1)
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                start, end = int(parts[0]), int(parts[1])
                if start <= end:
                    numbers.update(range(start, end + 1))
                continue
        if not token.isdigit():
            raise HTTPException(status_code=400, detail=f"Invalid problem number: {token}")
        numbers.add(int(token))
    return numbers


def _sync_wrong_answer(
    db: Session,
    *,
    academy_id: str,
    student_user_id: str,
    problem_id: UUID,
    problem_version_id: UUID,
    paper_session_id: UUID,
    was_wrong: bool,
    is_wrong: bool,
    is_review_correct: bool,
) -> None:
    record = db.scalar(
        select(WrongAnswerRecord).where(
            WrongAnswerRecord.academy_id == academy_id,
            WrongAnswerRecord.student_id == student_user_id,
            WrongAnswerRecord.problem_id == problem_id,
        )
    )
    if is_wrong:
        if not record:
            record = WrongAnswerRecord(
                academy_id=academy_id,
                student_id=student_user_id,
                problem_id=problem_id,
                problem_version_id=problem_version_id,
                first_wrong_at=_now(),
                latest_wrong_at=_now(),
                wrong_count=1,
                resolved_status="unresolved",
                source_assignment_ids=[f"paper_session:{paper_session_id}"],
            )
            db.add(record)
        else:
            record.problem_version_id = problem_version_id
            record.latest_wrong_at = _now()
            if not was_wrong:
                record.wrong_count += 1
            record.resolved_status = "unresolved" if record.resolved_status in {"resolved", "mastered"} else record.resolved_status
            marker = f"paper_session:{paper_session_id}"
            source_ids = list(record.source_assignment_ids or [])
            if marker not in source_ids:
                source_ids.append(marker)
                record.source_assignment_ids = source_ids
            record.updated_at = _now()
        return
    if record and was_wrong and is_review_correct:
        record.retry_count += 1
        record.resolved_status = "resolved"
        record.updated_at = _now()


class ClassPayload(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None


class ClassUpdatePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    subject: str | None = None
    grade_level: str | None = None
    is_active: bool | None = None


class StudentPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    grade_level: str | None = None
    school: str | None = None
    memo: str | None = None
    status: str = "active"
    class_ids: list[UUID] = []


class StudentUpdatePayload(BaseModel):
    name: str | None = None
    grade_level: str | None = None
    school: str | None = None
    memo: str | None = None
    status: str | None = None
    class_ids: list[UUID] | None = None


class ClassStudentPayload(BaseModel):
    student_membership_id: UUID


class PaperSessionPayload(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    source_problem_set_id: UUID
    session_type: str = "test"
    target_type: str = "class"
    class_ids: list[UUID] = []
    student_membership_ids: list[UUID] = []
    scheduled_at: datetime | None = None
    due_at: datetime | None = None
    status: str = "scheduled"
    create_calendar_events: bool = True


class ProblemStatusPayload(BaseModel):
    problem_id: UUID | None = None
    problem_number: int
    result_status: str


class GradePayload(BaseModel):
    student_membership_id: UUID
    statuses: list[ProblemStatusPayload] = []
    wrong_numbers: str | None = None
    mark_unlisted_correct: bool = True


class ScheduleEventPayload(BaseModel):
    class_id: UUID
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    event_type: str = "class"
    starts_at: datetime
    ends_at: datetime | None = None
    linked_paper_session_id: UUID | None = None


class ReviewSetPayload(BaseModel):
    title: str = "오답 복습 세트"
    wrong_answer_ids: list[UUID] = []
    class_id: UUID | None = None
    student_membership_id: UUID | None = None
    unresolved_only: bool = True


@router.get("/dashboard")
def dashboard(request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    classes = db.scalars(
        select(AcademyClass).where(AcademyClass.academy_id == academy_id).order_by(AcademyClass.is_active.desc(), AcademyClass.name)
    ).all()
    sessions = db.scalars(
        select(PaperSession)
        .where(PaperSession.academy_id == academy_id)
        .options(joinedload(PaperSession.content_version))
        .order_by(PaperSession.created_at.desc())
        .limit(8)
    ).all()
    unresolved = db.scalar(
        select(func.count(WrongAnswerRecord.id)).where(
            WrongAnswerRecord.academy_id == academy_id,
            WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]),
        )
    ) or 0
    students = db.scalar(
        select(func.count(StudentAcademyMembership.id)).where(
            StudentAcademyMembership.academy_id == academy_id,
            StudentAcademyMembership.status == "active",
        )
    ) or 0
    return {
        "summary": {
            "class_count": len(classes),
            "student_count": students,
            "active_session_count": len([session for session in sessions if session.status in {"scheduled", "exported", "grading"}]),
            "unresolved_wrong_count": unresolved,
        },
        "classes": [_class_payload(db, academy_id, row, include_students=True) for row in classes],
        "recent_sessions": [_session_summary(db, academy_id, session) for session in sessions],
    }


@router.get("/classes")
def list_classes(request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    rows = db.scalars(select(AcademyClass).where(AcademyClass.academy_id == academy_id).order_by(AcademyClass.name)).all()
    return [_class_payload(db, academy_id, row, include_students=True) for row in rows]


@router.post("/classes")
def create_class(payload: ClassPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    row = AcademyClass(
        academy_id=academy_id,
        name=payload.name.strip(),
        description=payload.description,
        subject=payload.subject,
        grade_level=payload.grade_level,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _class_payload(db, academy_id, row, include_students=True)


@router.get("/classes/{class_id}")
def get_class(class_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    row = _get_class(db, academy_id, class_id)
    sessions = db.scalars(
        select(PaperSession)
        .where(PaperSession.academy_id == academy_id)
        .options(joinedload(PaperSession.content_version))
        .order_by(PaperSession.scheduled_at.desc().nullslast(), PaperSession.created_at.desc())
    ).all()
    events = db.scalars(
        select(ClassScheduleEvent)
        .where(ClassScheduleEvent.academy_id == academy_id, ClassScheduleEvent.class_id == class_id)
        .order_by(ClassScheduleEvent.starts_at.desc())
        .limit(40)
    ).all()
    payload = _class_payload(db, academy_id, row, include_students=True)
    payload["paper_sessions"] = [_session_summary(db, academy_id, session) for session in sessions if str(class_id) in (session.class_ids or [])]
    payload["schedule_events"] = [
        {
            "id": str(event.id),
            "title": event.title,
            "description": event.description,
            "event_type": event.event_type,
            "starts_at": event.starts_at.isoformat(),
            "ends_at": event.ends_at.isoformat() if event.ends_at else None,
            "linked_paper_session_id": str(event.linked_paper_session_id) if event.linked_paper_session_id else None,
        }
        for event in events
    ]
    return payload


@router.patch("/classes/{class_id}")
def update_class(class_id: UUID, payload: ClassUpdatePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    row = _get_class(db, academy_id, class_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "name" and value is not None:
            value = value.strip()
            if not value:
                raise HTTPException(status_code=400, detail="Class name is required.")
        setattr(row, key, value)
    row.updated_at = _now()
    db.commit()
    db.refresh(row)
    return _class_payload(db, academy_id, row, include_students=True)


@router.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    row = _get_class(db, academy_id, class_id)
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.post("/classes/{class_id}/students")
def add_student_to_class(class_id: UUID, payload: ClassStudentPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    class_row = _get_class(db, academy_id, class_id)
    membership = _get_membership(db, academy_id, payload.student_membership_id)
    link = db.scalar(
        select(ClassStudent).where(
            ClassStudent.class_id == class_id,
            ClassStudent.student_membership_id == membership.id,
        )
    )
    if link:
        link.left_at = None
    else:
        db.add(ClassStudent(class_id=class_id, student_membership_id=membership.id))
    db.commit()
    return _class_payload(db, academy_id, class_row, include_students=True)


@router.delete("/classes/{class_id}/students/{student_id}", status_code=204)
def remove_student_from_class(class_id: UUID, student_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    _get_class(db, academy_id, class_id)
    _get_membership(db, academy_id, student_id)
    link = db.scalar(select(ClassStudent).where(ClassStudent.class_id == class_id, ClassStudent.student_membership_id == student_id))
    if link:
        link.left_at = _now()
        db.commit()
    return Response(status_code=204)


@router.get("/students")
def list_students(request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    rows = db.scalars(
        select(StudentAcademyMembership)
        .where(StudentAcademyMembership.academy_id == academy_id)
        .order_by(StudentAcademyMembership.status, StudentAcademyMembership.display_name_in_academy)
    ).all()
    return [_student_payload(db, academy_id, row) for row in rows]


@router.post("/students")
def create_student(payload: StudentPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    actor_id = current_owner_id(request)
    seat, invite_code = create_seat(db, academy_id, payload.name.strip())
    student_user_id = f"manual-{uuid.uuid4().hex[:24]}"
    metadata = {"grade_level": payload.grade_level, "school": payload.school, "memo": payload.memo}
    membership = StudentAcademyMembership(
        student_user_id=student_user_id,
        academy_id=academy_id,
        academy_seat_id=seat.id,
        display_name_in_academy=payload.name.strip(),
        status=payload.status,
        created_by=actor_id,
        metadata_json=metadata,
    )
    db.add(membership)
    db.flush()
    seat.current_student_membership_id = membership.id
    db.add(SeatAssignmentHistory(academy_seat_id=seat.id, academy_id=academy_id, student_user_id=student_user_id, membership_id=membership.id))
    for class_id in payload.class_ids:
        _get_class(db, academy_id, class_id)
        db.add(ClassStudent(class_id=class_id, student_membership_id=membership.id))
    db.commit()
    data = _student_payload(db, academy_id, membership)
    data["invite_code"] = invite_code
    return data


@router.get("/students/{student_id}")
def get_student(student_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    membership = _get_membership(db, academy_id, student_id)
    data = _student_payload(db, academy_id, membership)
    results = db.scalars(
        select(PaperSessionResult)
        .where(PaperSessionResult.academy_id == academy_id, PaperSessionResult.student_membership_id == student_id)
        .order_by(PaperSessionResult.created_at.desc())
    ).all()
    sessions = {
        row.id: row
        for row in db.scalars(
            select(PaperSession)
            .where(PaperSession.academy_id == academy_id, PaperSession.id.in_([result.paper_session_id for result in results] or [uuid.uuid4()]))
            .options(joinedload(PaperSession.content_version))
        ).all()
    }
    wrongs = _wrong_answer_rows(db, academy_id, student_user_ids=[membership.student_user_id])
    data["paper_session_history"] = [
        {
            **_result_payload(result),
            "session": _session_summary(db, academy_id, sessions.get(result.paper_session_id)),
        }
        for result in results
    ]
    data["wrong_answers"] = wrongs
    data["analytics"] = {
        "graded_count": len([result for result in results if result.status == "graded"]),
        "average_score": (
            sum(float(result.score or 0) for result in results if result.score is not None) / len([result for result in results if result.score is not None])
            if any(result.score is not None for result in results)
            else None
        ),
        "unresolved_wrong_count": len([row for row in wrongs if row["resolved_status"] in {"unresolved", "reviewing"}]),
    }
    return data


@router.patch("/students/{student_id}")
def update_student(student_id: UUID, payload: StudentUpdatePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    membership = _get_membership(db, academy_id, student_id)
    changes = payload.model_dump(exclude_unset=True)
    metadata = dict(membership.metadata_json or {})
    if "name" in changes and changes["name"] is not None:
        name = changes.pop("name").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Student name is required.")
        membership.display_name_in_academy = name
    if "status" in changes and changes["status"] is not None:
        membership.status = changes.pop("status")
        if membership.status != "active":
            membership.ended_at = _now()
    class_ids = changes.pop("class_ids", None)
    for key, value in changes.items():
        metadata[key] = value
    membership.metadata_json = metadata
    if class_ids is not None:
        db.execute(delete(ClassStudent).where(ClassStudent.student_membership_id == membership.id))
        for class_id in class_ids:
            _get_class(db, academy_id, class_id)
            db.add(ClassStudent(class_id=class_id, student_membership_id=membership.id))
    db.commit()
    return _student_payload(db, academy_id, membership)


@router.delete("/students/{student_id}", status_code=204)
def delete_student(student_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    membership = _get_membership(db, academy_id, student_id)
    membership.status = "inactive"
    membership.ended_at = _now()
    seat = db.get(AcademySeat, membership.academy_seat_id)
    if seat and seat.current_student_membership_id == membership.id:
        seat.current_student_membership_id = None
        seat.released_at = _now()
    db.commit()
    return Response(status_code=204)


@router.get("/paper-sessions")
def list_paper_sessions(request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    sessions = db.scalars(
        select(PaperSession)
        .where(PaperSession.academy_id == academy_id)
        .options(joinedload(PaperSession.content_version))
        .order_by(PaperSession.scheduled_at.desc().nullslast(), PaperSession.created_at.desc())
    ).all()
    return [_session_summary(db, academy_id, session) for session in sessions]


@router.post("/paper-sessions")
def create_paper_session(payload: PaperSessionPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    owner_id = current_owner_id(request)
    version = _problem_set_snapshot(db, owner_id, academy_id, payload.source_problem_set_id, owner_id)
    targets = _target_memberships(db, academy_id, payload.class_ids, payload.student_membership_ids)
    if not targets:
        raise HTTPException(status_code=400, detail="Select at least one class or student with active students.")
    class_ids = _uuid_list(payload.class_ids)
    direct_student_ids = _uuid_list(payload.student_membership_ids)
    if class_ids and direct_student_ids:
        target_type = "mixed"
    elif class_ids:
        target_type = "class"
    else:
        target_type = "students"
    session = PaperSession(
        academy_id=academy_id,
        title=payload.title.strip(),
        description=payload.description,
        source_problem_set_id=payload.source_problem_set_id,
        content_version_id=version.id,
        content_version=version,
        session_type=payload.session_type,
        target_type=payload.target_type or target_type,
        class_ids=class_ids,
        student_membership_ids=[str(target.id) for target in targets],
        scheduled_at=payload.scheduled_at,
        due_at=payload.due_at,
        status=payload.status,
        created_by=owner_id,
    )
    db.add(session)
    db.flush()
    total_count = len(_session_problems(session))
    for target in targets:
        db.add(
            PaperSessionResult(
                academy_id=academy_id,
                paper_session_id=session.id,
                student_membership_id=target.id,
                student_user_id=target.student_user_id,
                status="pending_grading",
                total_count=total_count,
            )
        )
    if payload.create_calendar_events and payload.scheduled_at and payload.class_ids:
        for class_id in payload.class_ids:
            db.add(
                ClassScheduleEvent(
                    academy_id=academy_id,
                    class_id=class_id,
                    title=payload.title.strip(),
                    description=payload.description,
                    event_type=payload.session_type,
                    starts_at=payload.scheduled_at,
                    ends_at=payload.due_at,
                    linked_paper_session_id=session.id,
                )
            )
    db.commit()
    return _session_summary(db, academy_id, _get_session(db, academy_id, session.id))


@router.get("/paper-sessions/{session_id}")
def get_paper_session(session_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    session = _get_session(db, academy_id, session_id)
    return _paper_session_detail(db, academy_id, session)


@router.get("/paper-sessions/{session_id}/grading")
def get_grading_state(session_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    session = _get_session(db, academy_id, session_id)
    return _paper_session_detail(db, academy_id, session)


def _result_payload(result: PaperSessionResult) -> dict:
    return {
        "id": str(result.id),
        "paper_session_id": str(result.paper_session_id),
        "student_membership_id": str(result.student_membership_id),
        "student_user_id": result.student_user_id,
        "status": result.status,
        "score": _decimal_float(result.score),
        "correct_count": result.correct_count,
        "wrong_count": result.wrong_count,
        "total_count": result.total_count,
        "graded_by": result.graded_by,
        "graded_at": result.graded_at.isoformat() if result.graded_at else None,
        "updated_at": result.updated_at.isoformat() if result.updated_at else None,
    }


def _paper_session_detail(db: Session, academy_id: str, session: PaperSession) -> dict:
    results = db.scalars(
        select(PaperSessionResult)
        .where(PaperSessionResult.academy_id == academy_id, PaperSessionResult.paper_session_id == session.id)
        .order_by(PaperSessionResult.created_at)
    ).all()
    memberships = {
        row.id: row
        for row in db.scalars(
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.id.in_([result.student_membership_id for result in results] or [uuid.uuid4()]),
            )
        ).all()
    }
    problem_results = db.scalars(
        select(ProblemResult).where(ProblemResult.academy_id == academy_id, ProblemResult.paper_session_id == session.id)
    ).all()
    by_result: dict[str, list[dict]] = {}
    for row in problem_results:
        by_result.setdefault(str(row.paper_session_result_id), []).append(
            {
                "id": str(row.id),
                "problem_id": str(row.problem_id),
                "problem_number": row.problem_number,
                "result_status": row.result_status,
            }
        )
    students = []
    for result in results:
        base = _student_payload(db, academy_id, memberships[result.student_membership_id]) if result.student_membership_id in memberships else {}
        students.append(
            {
                **base,
                "result": _result_payload(result),
                "problem_results": sorted(by_result.get(str(result.id), []), key=lambda item: item["problem_number"]),
            }
        )
    return {
        **(_session_summary(db, academy_id, session) or {}),
        "problems": _session_problems(session),
        "students": students,
    }


@router.post("/paper-sessions/{session_id}/grade")
def save_grade(session_id: UUID, payload: GradePayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    actor_id = current_owner_id(request)
    session = _get_session(db, academy_id, session_id)
    membership = _get_membership(db, academy_id, payload.student_membership_id)
    result = db.scalar(
        select(PaperSessionResult).where(
            PaperSessionResult.academy_id == academy_id,
            PaperSessionResult.paper_session_id == session.id,
            PaperSessionResult.student_membership_id == membership.id,
        )
    )
    if not result:
        result = PaperSessionResult(
            academy_id=academy_id,
            paper_session_id=session.id,
            student_membership_id=membership.id,
            student_user_id=membership.student_user_id,
            status="pending_grading",
        )
        db.add(result)
        db.flush()
    problems = _session_problems(session)
    if not problems:
        raise HTTPException(status_code=400, detail="Paper session has no versioned problems.")
    status_by_number: dict[int, str] = {}
    wrong_numbers = _parse_wrong_numbers(payload.wrong_numbers)
    if payload.wrong_numbers is not None:
        valid_numbers = {int(problem["problem_number"]) for problem in problems}
        unknown = sorted(wrong_numbers - valid_numbers)
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown problem numbers: {', '.join(map(str, unknown))}")
        status_by_number = {number: ("wrong" if number in wrong_numbers else "correct") for number in valid_numbers}
    for item in payload.statuses:
        status = item.result_status
        if status not in {"correct", "wrong", "unmarked"}:
            raise HTTPException(status_code=400, detail="Result status must be correct, wrong, or unmarked.")
        status_by_number[item.problem_number] = status
    existing = {
        row.problem_id: row
        for row in db.scalars(
            select(ProblemResult).where(
                ProblemResult.academy_id == academy_id,
                ProblemResult.paper_session_result_id == result.id,
            )
        ).all()
    }
    correct_count = wrong_count = unmarked_count = 0
    for problem in problems:
        problem_id = UUID(problem["problem_id"])
        number = int(problem["problem_number"])
        status = status_by_number.get(number)
        if status is None:
            status = "correct" if payload.mark_unlisted_correct else "unmarked"
        row = existing.get(problem_id)
        was_wrong = bool(row and row.result_status == "wrong")
        if not row:
            row = ProblemResult(
                academy_id=academy_id,
                paper_session_id=session.id,
                paper_session_result_id=result.id,
                student_membership_id=membership.id,
                student_user_id=membership.student_user_id,
                problem_id=problem_id,
                problem_version_id=session.content_version_id,
                problem_number=number,
                result_status=status,
            )
            db.add(row)
        else:
            row.result_status = status
            row.problem_number = number
            row.problem_version_id = session.content_version_id
            row.updated_at = _now()
        if status == "correct":
            correct_count += 1
        elif status == "wrong":
            wrong_count += 1
        else:
            unmarked_count += 1
        _sync_wrong_answer(
            db,
            academy_id=academy_id,
            student_user_id=membership.student_user_id,
            problem_id=problem_id,
            problem_version_id=session.content_version_id,
            paper_session_id=session.id,
            was_wrong=was_wrong,
            is_wrong=status == "wrong",
            is_review_correct=session.session_type == "review" and status == "correct",
        )
    total_count = len(problems)
    graded_count = correct_count + wrong_count
    result.correct_count = correct_count
    result.wrong_count = wrong_count
    result.total_count = total_count
    result.score = round((correct_count / total_count) * 100, 2) if total_count else None
    result.status = "graded" if unmarked_count == 0 else "pending_grading"
    result.graded_by = actor_id
    result.graded_at = _now()
    result.updated_at = _now()
    session.status = "grading" if session.status in {"draft", "scheduled", "exported"} else session.status
    if graded_count == total_count:
        all_results = db.scalars(
            select(PaperSessionResult).where(
                PaperSessionResult.academy_id == academy_id,
                PaperSessionResult.paper_session_id == session.id,
            )
        ).all()
        if all(row.id == result.id or row.status == "graded" for row in all_results):
            session.status = "completed"
    session.updated_at = _now()
    db.commit()
    return _paper_session_detail(db, academy_id, _get_session(db, academy_id, session.id))


def _wrong_answer_rows(db: Session, academy_id: str, student_user_ids: list[str] | None = None) -> list[dict]:
    stmt = (
        select(WrongAnswerRecord, Problem)
        .join(Problem, Problem.id == WrongAnswerRecord.problem_id)
        .where(WrongAnswerRecord.academy_id == academy_id)
        .order_by(WrongAnswerRecord.latest_wrong_at.desc())
    )
    if student_user_ids:
        stmt = stmt.where(WrongAnswerRecord.student_id.in_(student_user_ids))
    rows = db.execute(stmt).all()
    membership_by_user = {
        row.student_user_id: row
        for row in db.scalars(
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.student_user_id.in_([record.student_id for record, _ in rows] or [""]),
            )
        ).all()
    }
    result = []
    for record, problem in rows:
        membership = membership_by_user.get(record.student_id)
        tags = problem.tags
        result.append(
            {
                "id": str(record.id),
                "student_id": record.student_id,
                "student_membership_id": str(membership.id) if membership else None,
                "student_name": _student_name(membership) if membership else record.student_id,
                "problem_id": str(record.problem_id),
                "problem_number": problem.problem_number,
                "problem_text": problem.problem_text,
                "source_assignment_ids": record.source_assignment_ids or [],
                "subject": tags.subject if tags else None,
                "unit": tags.unit if tags else None,
                "first_wrong_at": record.first_wrong_at.isoformat() if record.first_wrong_at else None,
                "latest_wrong_at": record.latest_wrong_at.isoformat() if record.latest_wrong_at else None,
                "wrong_count": record.wrong_count,
                "retry_count": record.retry_count,
                "resolved_status": record.resolved_status,
                "teacher_memo": record.teacher_memo,
                "student_memo": record.student_memo,
            }
        )
    return result


@router.get("/wrong-answers")
def list_wrong_answers(
    request: Request,
    class_id: UUID | None = None,
    student_membership_id: UUID | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    academy_id = _academy_id(request)
    student_user_ids: list[str] | None = None
    if student_membership_id:
        student_user_ids = [_get_membership(db, academy_id, student_membership_id).student_user_id]
    elif class_id:
        _get_class(db, academy_id, class_id)
        student_user_ids = [membership.student_user_id for membership in _active_memberships_for_class(db, academy_id, class_id)]
    rows = _wrong_answer_rows(db, academy_id, student_user_ids=student_user_ids)
    if status:
        rows = [row for row in rows if row["resolved_status"] == status]
    return rows


@router.post("/wrong-answers/review-set")
def create_review_set(payload: ReviewSetPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    owner_id = current_owner_id(request)
    stmt = select(WrongAnswerRecord).where(WrongAnswerRecord.academy_id == academy_id)
    if payload.wrong_answer_ids:
        stmt = stmt.where(WrongAnswerRecord.id.in_(payload.wrong_answer_ids))
    if payload.unresolved_only:
        stmt = stmt.where(WrongAnswerRecord.resolved_status.in_(["unresolved", "reviewing"]))
    if payload.student_membership_id:
        membership = _get_membership(db, academy_id, payload.student_membership_id)
        stmt = stmt.where(WrongAnswerRecord.student_id == membership.student_user_id)
    if payload.class_id:
        _get_class(db, academy_id, payload.class_id)
        user_ids = [membership.student_user_id for membership in _active_memberships_for_class(db, academy_id, payload.class_id)]
        stmt = stmt.where(WrongAnswerRecord.student_id.in_(user_ids or [""]))
    records = db.scalars(stmt.order_by(WrongAnswerRecord.latest_wrong_at.desc())).all()
    problem_ids = []
    seen = set()
    for record in records:
        if record.problem_id not in seen:
            problem_ids.append(record.problem_id)
            seen.add(record.problem_id)
    if not problem_ids:
        raise HTTPException(status_code=400, detail="No wrong-answer problems matched the selected filters.")
    problem_set = ProblemSet(
        name=payload.title.strip() or "오답 복습 세트",
        owner_id=owner_id,
        academy_id=academy_id,
        description="Student Management에서 생성한 오답 복습 세트입니다.",
        source_type="self_created",
        rights_confirmed=True,
        problem_count=len(problem_ids),
    )
    db.add(problem_set)
    db.flush()
    for index, problem_id in enumerate(problem_ids):
        db.add(ProblemSetItem(problem_set_id=problem_set.id, problem_id=problem_id, order_index=index))
    db.commit()
    return {
        "id": str(problem_set.id),
        "name": problem_set.name,
        "problem_count": len(problem_ids),
        "href": f"/problem-sets/{problem_set.id}",
    }


@router.get("/schedule-events")
def list_schedule_events(request: Request, class_id: UUID | None = None, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    stmt = select(ClassScheduleEvent).where(ClassScheduleEvent.academy_id == academy_id)
    if class_id:
        _get_class(db, academy_id, class_id)
        stmt = stmt.where(ClassScheduleEvent.class_id == class_id)
    rows = db.scalars(stmt.order_by(ClassScheduleEvent.starts_at.desc()).limit(100)).all()
    return [
        {
            "id": str(row.id),
            "class_id": str(row.class_id),
            "title": row.title,
            "description": row.description,
            "event_type": row.event_type,
            "starts_at": row.starts_at.isoformat(),
            "ends_at": row.ends_at.isoformat() if row.ends_at else None,
            "linked_paper_session_id": str(row.linked_paper_session_id) if row.linked_paper_session_id else None,
        }
        for row in rows
    ]


@router.post("/schedule-events")
def create_schedule_event(payload: ScheduleEventPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    _get_class(db, academy_id, payload.class_id)
    if payload.linked_paper_session_id:
        _get_session(db, academy_id, payload.linked_paper_session_id)
    row = ClassScheduleEvent(
        academy_id=academy_id,
        class_id=payload.class_id,
        title=payload.title.strip(),
        description=payload.description,
        event_type=payload.event_type,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        linked_paper_session_id=payload.linked_paper_session_id,
    )
    db.add(row)
    db.commit()
    return {
        "id": str(row.id),
        "class_id": str(row.class_id),
        "title": row.title,
        "description": row.description,
        "event_type": row.event_type,
        "starts_at": row.starts_at.isoformat(),
        "ends_at": row.ends_at.isoformat() if row.ends_at else None,
        "linked_paper_session_id": str(row.linked_paper_session_id) if row.linked_paper_session_id else None,
    }
