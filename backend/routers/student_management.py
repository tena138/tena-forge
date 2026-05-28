import math
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
    AcademyStudentSubscription,
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
from services.academy_student_access import create_seat, ensure_academy_subscription
from services.ownership import current_owner_id

router = APIRouter(prefix="/api/student-management", tags=["student management"])
CLASS_ORDER_METADATA_KEY = "student_management_class_order"
COUNSELING_FORMATS_METADATA_KEY = "student_management_counseling_formats"
COUNSELING_PRESETS_METADATA_KEY = "student_management_counseling_presets"
DEFAULT_COUNSELING_FIELDS = [
    {"id": "notes", "label": "상담하면서 기록할 내용", "placeholder": "상담하면서 기록할 내용", "include_in_report": True},
    {"id": "weekly_report", "label": "주간 리포트 초안", "placeholder": "주간 리포트 초안", "include_in_report": False},
    {"id": "next_plan", "label": "다음 지도 계획", "placeholder": "다음 지도 계획 / 과제 제안", "include_in_report": True},
]


def _academy_id(request: Request) -> str:
    return current_owner_id(request)


def _now() -> datetime:
    return datetime.utcnow()


def _date_boundary(value: str | None, end: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None
    if end:
        return parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    return parsed.replace(hour=0, minute=0, second=0, microsecond=0)


def _uuid_list(values: list[UUID | str] | None) -> list[str]:
    return [str(value) for value in values or [] if value]


def _decimal_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return value


def _round_stat(value: float | None) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, 2)


def _quantile(sorted_values: list[float], fraction: float) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * fraction
    lower_index = math.floor(position)
    upper_index = math.ceil(position)
    if lower_index == upper_index:
        return sorted_values[lower_index]
    lower = sorted_values[lower_index]
    upper = sorted_values[upper_index]
    return lower + (upper - lower) * (position - lower_index)


def _score_distribution(results: list[PaperSessionResult]) -> dict:
    scores = sorted(
        float(row.score)
        for row in results
        if row.status == "graded" and row.score is not None and math.isfinite(float(row.score))
    )
    if not scores:
        return {
            "respondent_count": 0,
            "average_score": None,
            "highest_score": None,
            "lowest_score": None,
            "q1_score": None,
            "q2_score": None,
            "q3_score": None,
            "score_standard_deviation": None,
        }
    average_score = sum(scores) / len(scores)
    variance = sum((score - average_score) ** 2 for score in scores) / len(scores)
    return {
        "respondent_count": len(scores),
        "average_score": _round_stat(average_score),
        "highest_score": _round_stat(max(scores)),
        "lowest_score": _round_stat(min(scores)),
        "q1_score": _round_stat(_quantile(scores, 0.25)),
        "q2_score": _round_stat(_quantile(scores, 0.5)),
        "q3_score": _round_stat(_quantile(scores, 0.75)),
        "score_standard_deviation": _round_stat(math.sqrt(variance)),
    }


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _stored_class_order(db: Session, academy_id: str) -> list[str]:
    subscription = db.scalar(select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id == academy_id))
    if not subscription:
        return []
    metadata = subscription.billing_metadata or {}
    class_ids = metadata.get(CLASS_ORDER_METADATA_KEY)
    if not isinstance(class_ids, list):
        return []
    return [str(value) for value in class_ids if value]


def _save_class_order(db: Session, academy_id: str, class_ids: list[str]) -> None:
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = dict(subscription.billing_metadata or {})
    metadata[CLASS_ORDER_METADATA_KEY] = class_ids
    subscription.billing_metadata = metadata


def _billing_metadata(db: Session, academy_id: str) -> dict:
    subscription = db.scalar(select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id == academy_id))
    if not subscription:
        return {}
    return dict(subscription.billing_metadata or {})


def _field_id(value: str | None, fallback: str, used: set[str]) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", (value or "").strip()).strip("_")[:48] or fallback
    candidate = cleaned
    suffix = 2
    while candidate in used:
        candidate = f"{cleaned}_{suffix}"[:48]
        suffix += 1
    used.add(candidate)
    return candidate


def _normalize_counseling_fields(fields: list[dict] | None) -> list[dict]:
    source = fields if isinstance(fields, list) else DEFAULT_COUNSELING_FIELDS
    normalized: list[dict] = []
    used: set[str] = set()
    for index, field in enumerate(source[:12]):
        if not isinstance(field, dict):
            continue
        label = str(field.get("label") or "").strip()[:80]
        if not label:
            continue
        field_id = _field_id(str(field.get("id") or ""), f"field_{index + 1}", used)
        placeholder = str(field.get("placeholder") or label).strip()[:160]
        normalized.append(
            {
                "id": field_id,
                "label": label,
                "placeholder": placeholder,
                "include_in_report": bool(field.get("include_in_report", True)),
            }
        )
    return normalized or [dict(field) for field in DEFAULT_COUNSELING_FIELDS]


def _normalize_counseling_sections(sections: list[dict] | None) -> list[dict]:
    if not isinstance(sections, list):
        return []
    normalized: list[dict] = []
    used: set[str] = set()
    for index, section in enumerate(sections[:20]):
        if not isinstance(section, dict):
            continue
        label = str(section.get("label") or "").strip()[:80]
        if not label:
            continue
        field_id = _field_id(str(section.get("field_id") or section.get("id") or ""), f"field_{index + 1}", used)
        normalized.append(
            {
                "field_id": field_id,
                "label": label,
                "value": str(section.get("value") or ""),
                "include_in_report": bool(section.get("include_in_report", True)),
            }
        )
    return normalized


def _counseling_format_for_class(db: Session, academy_id: str, class_id: UUID | str) -> dict:
    metadata = _billing_metadata(db, academy_id)
    formats = metadata.get(COUNSELING_FORMATS_METADATA_KEY)
    row = formats.get(str(class_id)) if isinstance(formats, dict) else None
    row = row if isinstance(row, dict) else {}
    return {
        "class_id": str(class_id),
        "fields": _normalize_counseling_fields(row.get("fields") if isinstance(row, dict) else None),
        "updated_at": row.get("updated_at") if isinstance(row, dict) else None,
    }


def _counseling_presets(db: Session, academy_id: str) -> list[dict]:
    metadata = _billing_metadata(db, academy_id)
    rows = metadata.get(COUNSELING_PRESETS_METADATA_KEY)
    by_slot: dict[int, dict] = {}
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                slot = int(row.get("slot"))
            except (TypeError, ValueError):
                continue
            if 1 <= slot <= 4:
                by_slot[slot] = row
    presets: list[dict] = []
    for slot in range(1, 5):
        row = by_slot.get(slot, {})
        presets.append(
            {
                "slot": slot,
                "name": row.get("name") or f"프리셋 {slot}",
                "subject": row.get("subject"),
                "fields": _normalize_counseling_fields(row.get("fields")) if row.get("fields") else [],
                "updated_at": row.get("updated_at"),
            }
        )
    return presets


def _sort_class_rows(rows: list[AcademyClass], class_order: list[str]) -> list[AcademyClass]:
    order_index = {class_id: index for index, class_id in enumerate(class_order)}
    fallback_index = len(order_index)
    return sorted(
        rows,
        key=lambda row: (
            0 if row.is_active else 1,
            0 if str(row.id) in order_index else 1,
            order_index.get(str(row.id), fallback_index),
            row.name.lower(),
        ),
    )


def _ordered_classes(db: Session, academy_id: str) -> list[AcademyClass]:
    rows = db.scalars(select(AcademyClass).where(AcademyClass.academy_id == academy_id)).all()
    return _sort_class_rows(rows, _stored_class_order(db, academy_id))


def _schedule_event_payload(row: ClassScheduleEvent) -> dict:
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


def _counseling_logs(membership: StudentAcademyMembership) -> list[dict]:
    logs = (membership.metadata_json or {}).get("counseling_logs") or []
    if not isinstance(logs, list):
        return []
    rows = []
    for row in logs:
        if not isinstance(row, dict):
            continue
        next_row = dict(row)
        sections = _normalize_counseling_sections(next_row.get("sections"))
        if not sections:
            fallback_sections = [
                {"field_id": "notes", "label": "상담하면서 기록할 내용", "value": next_row.get("notes") or "", "include_in_report": True},
                {"field_id": "weekly_report", "label": "주간 리포트", "value": next_row.get("weekly_report") or "", "include_in_report": False},
                {"field_id": "next_plan", "label": "다음 지도 계획", "value": next_row.get("next_plan") or "", "include_in_report": True},
            ]
            sections = [section for section in fallback_sections if section["value"]]
        next_row["sections"] = sections
        rows.append(next_row)
    return sorted(rows, key=lambda row: str(row.get("counseling_date") or row.get("created_at") or ""), reverse=True)


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
        "class_subjects": [row.subject for row in classes],
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


def _session_belongs_to_class(session: PaperSession, class_row: AcademyClass, memberships: list[StudentAcademyMembership]) -> bool:
    if str(class_row.id) in {str(value) for value in (session.class_ids or [])}:
        return True
    student_membership_ids = {str(membership.id) for membership in memberships}
    return bool(student_membership_ids.intersection({str(value) for value in (session.student_membership_ids or [])}))


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
    class_sessions = [session for session in sessions if _session_belongs_to_class(session, row, memberships)]
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


def _snapshot_problem_rows(problems: list[Problem]) -> list[dict]:
    rows = []
    for index, problem in enumerate(problems, start=1):
        tags = problem.tags
        rows.append(
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
    return rows


def _problem_selection_snapshot(
    db: Session,
    owner_id: str,
    academy_id: str,
    problem_ids: list[UUID],
    title: str,
    created_by: str | None,
) -> ContentVersion:
    unique_ids: list[UUID] = []
    seen: set[UUID] = set()
    for problem_id in problem_ids:
        if problem_id not in seen:
            unique_ids.append(problem_id)
            seen.add(problem_id)
    if not unique_ids:
        raise HTTPException(status_code=400, detail="PaperSession requires at least one problem.")
    rows = db.scalars(
        select(Problem)
        .where(Problem.id.in_(unique_ids), Problem.owner_id == owner_id, Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags))
    ).unique().all()
    by_id = {problem.id: problem for problem in rows}
    missing = [str(problem_id) for problem_id in unique_ids if problem_id not in by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"Problems not found: {', '.join(missing)}")
    ordered = [by_id[problem_id] for problem_id in unique_ids]
    problems = _snapshot_problem_rows(ordered)
    source_id = f"selection-{uuid.uuid4().hex}"
    version = ContentVersion(
        academy_id=academy_id,
        source_type="paper_session_selection",
        source_id=source_id,
        title=title,
        version_label=f"paper-session-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        snapshot={
            "source_type": "selection",
            "problem_ids": [str(problem_id) for problem_id in unique_ids],
            "title": title,
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
    score_stats = _score_distribution(results)
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
        "respondent_count": score_stats["respondent_count"],
        "average_score": score_stats["average_score"],
        "highest_score": score_stats["highest_score"],
        "lowest_score": score_stats["lowest_score"],
        "q1_score": score_stats["q1_score"],
        "q2_score": score_stats["q2_score"],
        "q3_score": score_stats["q3_score"],
        "score_standard_deviation": score_stats["score_standard_deviation"],
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
        direct_rows = db.scalars(
            select(StudentAcademyMembership).where(
                StudentAcademyMembership.academy_id == academy_id,
                StudentAcademyMembership.status == "active",
                StudentAcademyMembership.id.in_(student_ids),
            )
        ).all()
        direct_found: set[UUID] = set()
        for membership in direct_rows:
            rows[membership.id] = membership
            direct_found.add(membership.id)
        missing = [str(student_id) for student_id in set(student_ids) if student_id not in direct_found]
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


def _is_wrong_result_status(status: str | None) -> bool:
    return status in {"wrong", "unanswered"}


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


class ClassOrderPayload(BaseModel):
    class_ids: list[UUID]


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
    source_problem_set_id: UUID | None = None
    problem_ids: list[UUID] = []
    session_type: str = "test"
    target_type: str | None = None
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


class CounselingFormatFieldPayload(BaseModel):
    id: str | None = None
    label: str = Field(min_length=1, max_length=80)
    placeholder: str | None = None
    include_in_report: bool = True


class CounselingFormatPayload(BaseModel):
    fields: list[CounselingFormatFieldPayload] = []


class CounselingPresetPayload(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    subject: str | None = Field(default=None, max_length=80)
    fields: list[CounselingFormatFieldPayload] = []


class CounselingLogSectionPayload(BaseModel):
    field_id: str | None = None
    label: str = Field(min_length=1, max_length=80)
    value: str | None = None
    include_in_report: bool = True


class CounselingLogPayload(BaseModel):
    counseling_date: datetime | None = None
    title: str = Field(default="학습 상담", max_length=255)
    class_id: UUID | None = None
    notes: str | None = None
    weekly_report: str | None = None
    next_plan: str | None = None
    sections: list[CounselingLogSectionPayload] = []


def _resolve_counseling_class(db: Session, academy_id: str, membership: StudentAcademyMembership, class_id: UUID | None) -> AcademyClass | None:
    if not class_id:
        return None
    class_row = _get_class(db, academy_id, class_id)
    link = db.scalar(
        select(ClassStudent).where(
            ClassStudent.class_id == class_id,
            ClassStudent.student_membership_id == membership.id,
            ClassStudent.left_at.is_(None),
        )
    )
    if not link:
        raise HTTPException(status_code=400, detail="Student is not active in this class.")
    return class_row


def _counseling_log_row(
    payload: CounselingLogPayload,
    request: Request,
    membership: StudentAcademyMembership,
    class_row: AcademyClass | None,
    existing: dict | None = None,
) -> dict:
    now = _now()
    existing = existing or {}
    title = payload.title.strip() or "학습 상담"
    return {
        "id": str(existing.get("id") or uuid.uuid4()),
        "student_membership_id": str(membership.id),
        "class_id": str(class_row.id) if class_row else None,
        "class_name": class_row.name if class_row else None,
        "title": title,
        "counseling_date": (payload.counseling_date or now).isoformat(),
        "notes": payload.notes or "",
        "weekly_report": payload.weekly_report or "",
        "next_plan": payload.next_plan or "",
        "sections": _normalize_counseling_sections([section.model_dump() for section in payload.sections]),
        "created_by": existing.get("created_by") or current_owner_id(request),
        "created_at": existing.get("created_at") or now.isoformat(),
        "updated_by": current_owner_id(request),
        "updated_at": now.isoformat(),
    }


class ReviewSetPayload(BaseModel):
    title: str = "오답 복습 세트"
    wrong_answer_ids: list[UUID] = []
    class_id: UUID | None = None
    student_membership_id: UUID | None = None
    unresolved_only: bool = True


@router.get("/dashboard")
def dashboard(request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    classes = _ordered_classes(db, academy_id)
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
    rows = _ordered_classes(db, academy_id)
    return [_class_payload(db, academy_id, row, include_students=True) for row in rows]


@router.post("/classes")
def create_class(payload: ClassPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Class name is required.")
    row = AcademyClass(
        academy_id=academy_id,
        name=name,
        description=_clean_optional_text(payload.description),
        subject=_clean_optional_text(payload.subject),
        grade_level=_clean_optional_text(payload.grade_level),
    )
    db.add(row)
    db.flush()
    existing_order = [class_id for class_id in _stored_class_order(db, academy_id) if class_id != str(row.id)]
    _save_class_order(db, academy_id, [str(row.id), *existing_order])
    db.commit()
    db.refresh(row)
    return _class_payload(db, academy_id, row, include_students=True)


@router.put("/classes/order")
def update_class_order(payload: ClassOrderPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    requested_ids = _uuid_list(payload.class_ids)
    rows = db.scalars(select(AcademyClass).where(AcademyClass.academy_id == academy_id)).all()
    valid_ids = {str(row.id) for row in rows}
    invalid_ids = [class_id for class_id in requested_ids if class_id not in valid_ids]
    if invalid_ids:
        raise HTTPException(status_code=400, detail="Class order contains classes outside this academy.")
    remaining_ids = [str(row.id) for row in _sort_class_rows(rows, requested_ids) if str(row.id) not in requested_ids]
    stored_order = [*requested_ids, *remaining_ids]
    _save_class_order(db, academy_id, stored_order)
    db.commit()
    ordered_rows = _sort_class_rows(rows, stored_order)
    return [_class_payload(db, academy_id, row, include_students=True) for row in ordered_rows]


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
        .order_by(ClassScheduleEvent.starts_at.asc())
        .limit(500)
    ).all()
    payload = _class_payload(db, academy_id, row, include_students=True)
    memberships = _active_memberships_for_class(db, academy_id, row.id)
    payload["paper_sessions"] = [_session_summary(db, academy_id, session) for session in sessions if _session_belongs_to_class(session, row, memberships)]
    payload["schedule_events"] = [_schedule_event_payload(event) for event in events]
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


@router.put("/classes/{class_id}/counseling-format")
def update_class_counseling_format(class_id: UUID, payload: CounselingFormatPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    _get_class(db, academy_id, class_id)
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = dict(subscription.billing_metadata or {})
    formats = metadata.get(COUNSELING_FORMATS_METADATA_KEY)
    if not isinstance(formats, dict):
        formats = {}
    row = {
        "class_id": str(class_id),
        "fields": _normalize_counseling_fields([field.model_dump() for field in payload.fields]),
        "updated_by": current_owner_id(request),
        "updated_at": _now().isoformat(),
    }
    formats[str(class_id)] = row
    metadata[COUNSELING_FORMATS_METADATA_KEY] = formats
    subscription.billing_metadata = metadata
    db.commit()
    return row


@router.put("/counseling-presets/{slot}")
def save_counseling_preset(slot: int, payload: CounselingPresetPayload, request: Request, db: Session = Depends(get_db)):
    if slot < 1 or slot > 4:
        raise HTTPException(status_code=400, detail="Preset slot must be between 1 and 4.")
    academy_id = _academy_id(request)
    subscription = ensure_academy_subscription(db, academy_id)
    metadata = dict(subscription.billing_metadata or {})
    rows = metadata.get(COUNSELING_PRESETS_METADATA_KEY)
    existing = [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
    row = {
        "slot": slot,
        "name": (payload.name or f"프리셋 {slot}").strip() or f"프리셋 {slot}",
        "subject": _clean_optional_text(payload.subject),
        "fields": _normalize_counseling_fields([field.model_dump() for field in payload.fields]),
        "updated_by": current_owner_id(request),
        "updated_at": _now().isoformat(),
    }
    next_rows = []
    for item in existing:
        try:
            existing_slot = int(item.get("slot") or 0)
        except (TypeError, ValueError):
            existing_slot = 0
        if existing_slot != slot:
            next_rows.append(item)
    next_rows.append(row)
    metadata[COUNSELING_PRESETS_METADATA_KEY] = sorted(next_rows, key=lambda item: int(item.get("slot") or 0) if str(item.get("slot") or "").isdigit() else 0)
    subscription.billing_metadata = metadata
    db.commit()
    return row


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
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Student name is required.")
    seat, invite_code = create_seat(db, academy_id, name)
    student_user_id = f"manual-{uuid.uuid4().hex[:24]}"
    metadata = {
        "grade_level": _clean_optional_text(payload.grade_level),
        "school": _clean_optional_text(payload.school),
        "memo": _clean_optional_text(payload.memo),
    }
    membership = StudentAcademyMembership(
        student_user_id=student_user_id,
        academy_id=academy_id,
        academy_seat_id=seat.id,
        display_name_in_academy=name,
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
            "problem_results": [],
        }
        for result in results
    ]
    result_ids = [result.id for result in results]
    if result_ids:
        problem_results = db.scalars(
            select(ProblemResult)
            .where(
                ProblemResult.academy_id == academy_id,
                ProblemResult.paper_session_result_id.in_(result_ids),
            )
            .order_by(ProblemResult.problem_number)
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
        for item in data["paper_session_history"]:
            item["problem_results"] = by_result.get(item["id"], [])
    class_ids = [UUID(value) for value in data.get("class_ids", [])]
    if class_ids:
        events = db.scalars(
            select(ClassScheduleEvent)
            .where(ClassScheduleEvent.academy_id == academy_id, ClassScheduleEvent.class_id.in_(class_ids))
            .order_by(ClassScheduleEvent.starts_at.asc())
            .limit(500)
        ).all()
        data["schedule_events"] = [_schedule_event_payload(event) for event in events]
    else:
        data["schedule_events"] = []
    data["counseling_formats"] = [_counseling_format_for_class(db, academy_id, class_id) for class_id in class_ids]
    data["counseling_presets"] = _counseling_presets(db, academy_id)
    data["counseling_logs"] = _counseling_logs(membership)
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


@router.get("/students/{student_id}/exam-stats-series")
def student_exam_stats_series(student_id: UUID, request: Request, start_date: str | None = None, end_date: str | None = None, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    membership = _get_membership(db, academy_id, student_id)
    start = _date_boundary(start_date)
    end = _date_boundary(end_date, end=True)
    rows = db.execute(
        select(PaperSessionResult, PaperSession)
        .join(PaperSession, PaperSession.id == PaperSessionResult.paper_session_id)
        .where(
            PaperSessionResult.academy_id == academy_id,
            PaperSessionResult.student_membership_id == membership.id,
            PaperSessionResult.status == "graded",
            PaperSessionResult.score.is_not(None),
        )
        .order_by(PaperSession.scheduled_at.asc().nullslast(), PaperSessionResult.graded_at.asc().nullslast(), PaperSessionResult.updated_at.asc())
    ).all()
    points: list[dict] = []
    for result, session in rows:
        event_at = session.scheduled_at or result.graded_at or result.updated_at or result.created_at
        if not event_at:
            continue
        if start and event_at < start:
            continue
        if end and event_at > end:
            continue
        session_results = db.scalars(
            select(PaperSessionResult).where(
                PaperSessionResult.academy_id == academy_id,
                PaperSessionResult.paper_session_id == session.id,
            )
        ).all()
        stats = _score_distribution(session_results)
        points.append(
            {
                "id": str(session.id),
                "title": session.title,
                "date": event_at.date().isoformat(),
                "student_score": _decimal_float(result.score),
                "average": stats["average_score"],
                "highest": stats["highest_score"],
                "lowest": stats["lowest_score"],
                "q1": stats["q1_score"],
                "q2": stats["q2_score"],
                "q3": stats["q3_score"],
                "stddev": stats["score_standard_deviation"],
                "respondents": stats["respondent_count"],
            }
        )
    return points[:200]


@router.post("/students/{student_id}/counseling-logs")
def create_counseling_log(student_id: UUID, payload: CounselingLogPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    membership = _get_membership(db, academy_id, student_id)
    class_row = _resolve_counseling_class(db, academy_id, membership, payload.class_id)
    row = _counseling_log_row(payload, request, membership, class_row)
    metadata = dict(membership.metadata_json or {})
    logs = _counseling_logs(membership)
    metadata["counseling_logs"] = [row, *logs][:200]
    membership.metadata_json = metadata
    db.commit()
    return row


@router.put("/students/{student_id}/counseling-logs/{log_id}")
def update_counseling_log(student_id: UUID, log_id: str, payload: CounselingLogPayload, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    membership = _get_membership(db, academy_id, student_id)
    logs = _counseling_logs(membership)
    existing = next((row for row in logs if str(row.get("id")) == log_id), None)
    if not existing:
        raise HTTPException(status_code=404, detail="Counseling log not found.")
    class_row = _resolve_counseling_class(db, academy_id, membership, payload.class_id)
    row = _counseling_log_row(payload, request, membership, class_row, existing=existing)
    metadata = dict(membership.metadata_json or {})
    metadata["counseling_logs"] = [row if str(item.get("id")) == log_id else item for item in logs][:200]
    membership.metadata_json = metadata
    db.commit()
    return row


@router.delete("/students/{student_id}/counseling-logs/{log_id}", status_code=204)
def delete_counseling_log(student_id: UUID, log_id: str, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    membership = _get_membership(db, academy_id, student_id)
    logs = _counseling_logs(membership)
    if not any(str(row.get("id")) == log_id for row in logs):
        raise HTTPException(status_code=404, detail="Counseling log not found.")
    metadata = dict(membership.metadata_json or {})
    metadata["counseling_logs"] = [row for row in logs if str(row.get("id")) != log_id][:200]
    membership.metadata_json = metadata
    db.commit()
    return Response(status_code=204)


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
    if payload.source_problem_set_id:
        version = _problem_set_snapshot(db, owner_id, academy_id, payload.source_problem_set_id, owner_id)
    elif payload.problem_ids:
        version = _problem_selection_snapshot(db, owner_id, academy_id, payload.problem_ids, payload.title.strip(), owner_id)
    else:
        raise HTTPException(status_code=400, detail="Select a problem set or at least one problem.")
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
        if status not in {"correct", "wrong", "unanswered", "unmarked"}:
            raise HTTPException(status_code=400, detail="Result status must be correct, wrong, unanswered, or unmarked.")
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
        was_wrong = bool(row and _is_wrong_result_status(row.result_status))
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
        elif _is_wrong_result_status(status):
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
            is_wrong=_is_wrong_result_status(status),
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


@router.delete("/wrong-answers/{wrong_answer_id}", status_code=204)
def delete_wrong_answer(wrong_answer_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    row = db.scalar(
        select(WrongAnswerRecord).where(
            WrongAnswerRecord.id == wrong_answer_id,
            WrongAnswerRecord.academy_id == academy_id,
        )
    )
    if not row:
        raise HTTPException(status_code=404, detail="Wrong answer record not found.")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


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
    rows = db.scalars(stmt.order_by(ClassScheduleEvent.starts_at.asc()).limit(500)).all()
    return [_schedule_event_payload(row) for row in rows]


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
    return _schedule_event_payload(row)


@router.delete("/schedule-events/{event_id}", status_code=204)
def delete_schedule_event(event_id: UUID, request: Request, db: Session = Depends(get_db)):
    academy_id = _academy_id(request)
    row = db.get(ClassScheduleEvent, event_id)
    if not row or row.academy_id != academy_id:
        raise HTTPException(status_code=404, detail="Schedule event not found.")
    db.delete(row)
    db.commit()
    return Response(status_code=204)
