from __future__ import annotations

import re
from collections import Counter
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload

from models import Batch, Problem, ProblemUsageHistory, Tag
from services.point_difficulty import difficulty_for_request_label, normalize_point_difficulty
from services.subject_engines import ENGLISH_ENGINE, KOREAN_ENGINE, MATH_ENGINE, normalize_subject_engine


DIFFICULTY_LABELS = ("2점", "3점", "4점")


def looks_like_exam_paper_request(message: str) -> bool:
    text = str(message or "")
    if not text.strip():
        return False
    has_exam_word = any(token in text for token in ("시험지", "테스트", "모의고사", "문항", "문제"))
    has_action_word = any(token in text for token in ("제작", "만들", "출제", "추출", "골라", "뽑", "낼"))
    return has_exam_word and has_action_word


def _subject_engine_from_message(message: str) -> str:
    compact = str(message or "").replace(" ", "").lower()
    if "영어" in compact or "english" in compact:
        return ENGLISH_ENGINE
    if "국어" in compact or "korean" in compact:
        return KOREAN_ENGINE
    return MATH_ENGINE


def _subject_terms(engine: str) -> list[str]:
    if engine == ENGLISH_ENGINE:
        return ["영어", "english"]
    if engine == KOREAN_ENGINE:
        return ["국어", "korean"]
    return ["수학", "math"]


def _grade_keyword(message: str) -> str | None:
    match = re.search(r"고\s*([123])", str(message or ""))
    if match:
        return f"고{match.group(1)}"
    return None


def _requested_count(message: str) -> int:
    text = str(message or "")
    ranges = [int(match.group(2)) for match in re.finditer(r"(\d{1,3})\s*[-~]\s*(\d{1,3})", text)]
    if ranges:
        return max(1, min(max(ranges), 100))
    explicit = re.search(r"(?<!고)(\d{1,3})\s*(?:문항|문제|개)", text)
    if explicit:
        return max(1, min(int(explicit.group(1)), 100))
    return 25


def _difficulty_from_phrase(phrase: str, engine: str) -> str | None:
    normalized = normalize_point_difficulty(phrase)
    if normalized:
        return normalized
    return difficulty_for_request_label(phrase, engine)


def _default_slots(count: int, engine: str) -> list[str]:
    if engine == MATH_ENGINE:
        easy = min(10, count)
        medium = min(10, max(count - easy, 0))
        hard = max(count - easy - medium, 0)
        return ["2점"] * easy + ["3점"] * medium + ["4점"] * hard
    easy = count // 2
    return ["2점"] * easy + ["3점"] * (count - easy)


def _difficulty_slots(message: str, count: int, engine: str) -> list[str]:
    slots = _default_slots(count, engine)
    text = str(message or "")
    for match in re.finditer(r"(\d{1,3})\s*[-~]\s*(\d{1,3})([^.,;\n]*)", text):
        start = max(1, int(match.group(1)))
        end = min(count, int(match.group(2)))
        if start > end:
            start, end = end, start
        difficulty = _difficulty_from_phrase(match.group(3), engine)
        if not difficulty:
            continue
        for position in range(start, end + 1):
            slots[position - 1] = difficulty
    return slots[:count]


def _problem_unit(problem: Problem) -> str:
    tag = problem.tags
    unit = str(tag.unit).strip() if tag and tag.unit else ""
    return unit or "미분류"


def _problem_difficulty(problem: Problem) -> str | None:
    tag = problem.tags
    return normalize_point_difficulty(tag.difficulty if tag else None)


def _problem_subject_filter(engine: str):
    terms = _subject_terms(engine)
    return or_(
        Batch.subject_engine == engine,
        *[Tag.subject.ilike(f"%{term}%") for term in terms],
        *[Problem.source_label.ilike(f"%{term}%") for term in terms],
        *[Tag.source.ilike(f"%{term}%") for term in terms],
    )


def _grade_filter(keyword: str):
    return or_(
        Problem.source_label.ilike(f"%{keyword}%"),
        Tag.source.ilike(f"%{keyword}%"),
        Tag.unit.ilike(f"%{keyword}%"),
        Batch.name.ilike(f"%{keyword}%"),
        Problem.problem_text.ilike(f"%{keyword}%"),
    )


def _candidate_query(owner_ids: set[str], engine: str, grade_keyword: str | None):
    filters = [
        Problem.deleted_at.is_(None),
        Problem.owner_id.in_(list(owner_ids)),
        _problem_subject_filter(engine),
    ]
    if grade_keyword:
        filters.append(_grade_filter(grade_keyword))
    return (
        select(Problem)
        .outerjoin(Tag)
        .outerjoin(Batch, Problem.source_batch_id == Batch.id)
        .options(joinedload(Problem.tags), joinedload(Problem.batch))
        .where(and_(*filters))
        .order_by(Problem.review_page_number.asc().nullslast(), Problem.problem_number.asc(), Problem.created_at.asc())
    )


def _usage_history_counts(db: Session, owner_ids: set[str], problem_ids: list[Any]) -> dict[str, int]:
    if not problem_ids:
        return {}
    rows = db.execute(
        select(ProblemUsageHistory.problem_id, ProblemUsageHistory.id)
        .where(
            ProblemUsageHistory.owner_id.in_(list(owner_ids)),
            ProblemUsageHistory.problem_id.in_(problem_ids),
        )
    ).all()
    counts: Counter[str] = Counter()
    for problem_id, _history_id in rows:
        counts[str(problem_id)] += 1
    return dict(counts)


def _serialize_problem(problem: Problem, position: int | None = None) -> dict[str, Any]:
    tag = problem.tags
    payload = {
        "id": str(problem.id),
        "problem_number": problem.problem_number,
        "position": position,
        "source_label": tag.source if tag and tag.source else problem.source_label,
        "subject": tag.subject if tag else None,
        "unit": tag.unit if tag else None,
        "difficulty": tag.difficulty if tag else None,
        "review_page_number": problem.review_page_number,
    }
    return payload


def _select_balanced(candidates: list[Problem], slots: list[str]) -> tuple[list[Problem], list[dict[str, Any]]]:
    remaining_by_difficulty: dict[str, list[Problem]] = {label: [] for label in DIFFICULTY_LABELS}
    for problem in candidates:
        difficulty = _problem_difficulty(problem)
        if difficulty in remaining_by_difficulty:
            remaining_by_difficulty[difficulty].append(problem)

    selected: list[Problem] = []
    selected_ids: set[str] = set()
    unit_counts: Counter[str] = Counter()
    missing: list[dict[str, Any]] = []

    for position, difficulty in enumerate(slots, start=1):
        pool = [
            problem
            for problem in remaining_by_difficulty.get(difficulty, [])
            if str(problem.id) not in selected_ids
        ]
        if not pool:
            missing.append({"position": position, "difficulty": difficulty})
            continue
        pool.sort(
            key=lambda problem: (
                unit_counts[_problem_unit(problem)],
                _problem_unit(problem),
                problem.review_page_number or 10**9,
                problem.problem_number,
                str(problem.id),
            )
        )
        picked = pool[0]
        selected.append(picked)
        selected_ids.add(str(picked.id))
        unit_counts[_problem_unit(picked)] += 1

    return selected, missing


def _relaxed_candidates(candidates: list[Problem], selected: list[Problem], limit: int = 10) -> list[dict[str, Any]]:
    selected_ids = {str(problem.id) for problem in selected}
    relaxed = [problem for problem in candidates if str(problem.id) not in selected_ids]
    relaxed.sort(
        key=lambda problem: (
            _problem_unit(problem),
            _problem_difficulty(problem) or "",
            problem.review_page_number or 10**9,
            problem.problem_number,
        )
    )
    return [_serialize_problem(problem) for problem in relaxed[:limit]]


def build_exam_paper_draft(db: Session, *, message: str, owner_ids: set[str]) -> dict[str, Any]:
    engine = _subject_engine_from_message(message)
    count = _requested_count(message)
    grade = _grade_keyword(message)
    slots = _difficulty_slots(message, count, engine)

    candidates = db.scalars(_candidate_query(owner_ids, engine, grade)).unique().all()
    usage_counts = _usage_history_counts(db, owner_ids, [problem.id for problem in candidates])
    unused_candidates = [problem for problem in candidates if usage_counts.get(str(problem.id), 0) == 0]
    selected, missing = _select_balanced(unused_candidates, slots)

    difficulty_distribution = Counter(_problem_difficulty(problem) or "미지정" for problem in selected)
    unit_distribution = Counter(_problem_unit(problem) for problem in selected)
    target_student = None
    student_match = re.search(r"([A-Za-z가-힣0-9]+)\s*학생", str(message or ""))
    if student_match:
        target_student = f"{student_match.group(1)} 학생"

    warnings: list[str] = []
    if grade and not candidates:
        warnings.append(f"{grade} 조건에 맞는 문항 후보가 없습니다.")
    if missing:
        warnings.append("요청한 배점 구간을 채울 문항이 부족합니다.")
    if len(selected) < count:
        warnings.append(f"{count}문항 중 {len(selected)}문항만 초안에 배치했습니다.")

    return {
        "type": "exam_paper_creation",
        "status": "draft",
        "title": "시험지 제작 초안",
        "subject_engine": engine,
        "grade": grade,
        "requested_count": count,
        "selected_count": len(selected),
        "target_student_label": target_student,
        "difficulty_slots": [{"position": index + 1, "difficulty": value} for index, value in enumerate(slots)],
        "difficulty_distribution": dict(difficulty_distribution),
        "unit_distribution": dict(unit_distribution),
        "missing_difficulty_slots": missing,
        "relaxed_difficulty_candidates": _relaxed_candidates(unused_candidates, selected),
        "used_exclusion": {
            "scope": "workspace_usage_history",
            "excluded_count": len(candidates) - len(unused_candidates),
        },
        "problems": [_serialize_problem(problem, position=index + 1) for index, problem in enumerate(selected)],
        "warnings": warnings,
    }


def format_exam_paper_draft_answer(draft: dict[str, Any]) -> str:
    selected = int(draft.get("selected_count") or 0)
    requested = int(draft.get("requested_count") or 0)
    distribution = draft.get("difficulty_distribution") or {}
    units = draft.get("unit_distribution") or {}
    missing = draft.get("missing_difficulty_slots") or []
    parts = [
        f"시험지 제작 초안을 만들었습니다. 현재 {requested}문항 중 {selected}문항을 배치했습니다.",
        f"배점 분포는 {distribution or '없음'}이고, 단원 분포는 {units or '없음'}입니다.",
    ]
    if draft.get("target_student_label"):
        parts.append(f"대상은 {draft['target_student_label']}으로 해석했습니다.")
    if missing:
        parts.append("일부 배점 구간은 후보가 부족해서 확인이 필요합니다. 승인 전 조건을 완화하거나 문항을 추가 추출해야 합니다.")
    else:
        parts.append("승인 전까지 실제 문제세트나 배정은 생성하지 않습니다.")
    return " ".join(parts)
