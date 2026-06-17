import uuid
from collections.abc import Iterable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Problem, ProblemSet, ProblemSetItem, ProblemUsageHistory
from services.ownership import LOCAL_OWNER_ID

USAGE_TYPE_PROBLEM_SET = "problem_set"
USAGE_TYPE_EXPORT = "export"


def _unique_problem_ids(problem_ids: Iterable[uuid.UUID]) -> list[uuid.UUID]:
    unique: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    for problem_id in problem_ids:
        if problem_id not in seen:
            unique.append(problem_id)
            seen.add(problem_id)
    return unique


def _academy_id_for(owner_id: str, problem_set: ProblemSet | None = None, problems: list[Problem] | None = None) -> str | None:
    if problem_set and problem_set.academy_id:
        return problem_set.academy_id
    for problem in problems or []:
        if problem.academy_id:
            return problem.academy_id
    return None if owner_id == LOCAL_OWNER_ID else owner_id


def record_problem_set_usage(
    db: Session,
    *,
    problem_set: ProblemSet,
    problem_ids: Iterable[uuid.UUID],
    owner_id: str,
    created_by: str | None = None,
) -> None:
    unique_ids = _unique_problem_ids(problem_ids)
    if not unique_ids:
        return

    db.flush()
    existing = set(
        db.scalars(
            select(ProblemUsageHistory.problem_id).where(
                ProblemUsageHistory.owner_id == owner_id,
                ProblemUsageHistory.usage_type == USAGE_TYPE_PROBLEM_SET,
                ProblemUsageHistory.problem_set_id == problem_set.id,
                ProblemUsageHistory.problem_id.in_(unique_ids),
            )
        ).all()
    )
    academy_id = _academy_id_for(owner_id, problem_set=problem_set)
    for problem_id in unique_ids:
        if problem_id in existing:
            continue
        db.add(
            ProblemUsageHistory(
                owner_id=owner_id,
                academy_id=academy_id,
                problem_id=problem_id,
                usage_type=USAGE_TYPE_PROBLEM_SET,
                problem_set_id=problem_set.id,
                metadata_json={"problem_set_name": problem_set.name},
                created_by=created_by or owner_id,
            )
        )


def record_export_usage(
    db: Session,
    *,
    owner_id: str,
    problems: list[Problem],
    payload: Any,
    output_type: str,
    created_by: str | None = None,
) -> None:
    unique_ids = _unique_problem_ids(problem.id for problem in problems)
    if not unique_ids:
        return

    context_id = uuid.uuid4().hex
    academy_id = _academy_id_for(owner_id, problems=problems)
    metadata = {
        "source": getattr(payload, "source", None),
        "output_type": output_type,
        "problem_count": len(unique_ids),
        "include_solution": bool(getattr(payload, "include_solution", False)),
        "include_missing_solution_metadata": bool(getattr(payload, "include_missing_solution_metadata", False)),
    }
    for problem_id in unique_ids:
        db.add(
            ProblemUsageHistory(
                owner_id=owner_id,
                academy_id=academy_id,
                problem_id=problem_id,
                usage_type=USAGE_TYPE_EXPORT,
                problem_set_id=getattr(payload, "problem_set_id", None),
                export_title=getattr(payload, "exam_title", None),
                export_date=getattr(payload, "date", None),
                template_id=getattr(payload, "template_id", None),
                hub_template_id=getattr(payload, "hub_template_id", None),
                context_id=context_id,
                metadata_json=metadata,
                created_by=created_by or owner_id,
            )
        )


def backfill_problem_set_usage(
    db: Session,
    *,
    owner_id: str,
    problem_ids: Iterable[uuid.UUID] | None = None,
) -> int:
    unique_ids = _unique_problem_ids(problem_ids or [])
    statement = (
        select(ProblemSetItem.problem_id, ProblemSetItem.problem_set_id, ProblemSet.name, ProblemSet.academy_id)
        .join(ProblemSet, ProblemSetItem.problem_set_id == ProblemSet.id)
        .where(ProblemSet.owner_id == owner_id)
    )
    if unique_ids:
        statement = statement.where(ProblemSetItem.problem_id.in_(unique_ids))

    rows = db.execute(statement).all()
    if not rows:
        return 0

    existing_statement = select(ProblemUsageHistory.problem_id, ProblemUsageHistory.problem_set_id).where(
        ProblemUsageHistory.owner_id == owner_id,
        ProblemUsageHistory.usage_type == USAGE_TYPE_PROBLEM_SET,
        ProblemUsageHistory.problem_set_id.is_not(None),
    )
    if unique_ids:
        existing_statement = existing_statement.where(ProblemUsageHistory.problem_id.in_(unique_ids))
    existing_pairs = set(db.execute(existing_statement).all())
    added = 0
    for problem_id, problem_set_id, problem_set_name, academy_id in rows:
        if (problem_id, problem_set_id) in existing_pairs:
            continue
        db.add(
            ProblemUsageHistory(
                owner_id=owner_id,
                academy_id=academy_id or (None if owner_id == LOCAL_OWNER_ID else owner_id),
                problem_id=problem_id,
                usage_type=USAGE_TYPE_PROBLEM_SET,
                problem_set_id=problem_set_id,
                metadata_json={"problem_set_name": problem_set_name},
                created_by=owner_id,
            )
        )
        existing_pairs.add((problem_id, problem_set_id))
        added += 1
    return added


def load_problem_usage_history(
    db: Session,
    *,
    owner_id: str,
    problem_ids: Iterable[uuid.UUID],
    exclude_problem_set_id: uuid.UUID | None = None,
) -> dict[str, list[dict[str, Any]]]:
    unique_ids = _unique_problem_ids(problem_ids)
    if not unique_ids:
        return {}

    statement = (
        select(ProblemUsageHistory, ProblemSet.name)
        .outerjoin(ProblemSet, ProblemUsageHistory.problem_set_id == ProblemSet.id)
        .where(
            ProblemUsageHistory.owner_id == owner_id,
            ProblemUsageHistory.problem_id.in_(unique_ids),
        )
        .order_by(ProblemUsageHistory.created_at.desc())
    )
    if exclude_problem_set_id:
        statement = statement.where(
            ~(
                (ProblemUsageHistory.usage_type == USAGE_TYPE_PROBLEM_SET)
                & (ProblemUsageHistory.problem_set_id == exclude_problem_set_id)
            )
        )

    histories: dict[str, list[dict[str, Any]]] = {str(problem_id): [] for problem_id in unique_ids}
    for history, problem_set_name in db.execute(statement).all():
        histories.setdefault(str(history.problem_id), []).append(
            {
                "id": history.id,
                "problem_id": history.problem_id,
                "usage_type": history.usage_type,
                "problem_set_id": history.problem_set_id,
                "problem_set_name": problem_set_name or (history.metadata_json or {}).get("problem_set_name"),
                "export_title": history.export_title,
                "export_date": history.export_date,
                "template_id": history.template_id,
                "hub_template_id": history.hub_template_id,
                "context_id": history.context_id,
                "metadata": history.metadata_json or {},
                "created_at": history.created_at,
            }
        )
    return histories
