from __future__ import annotations

import re
from collections import Counter
from hashlib import sha256
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


def _has_subject(message: str) -> bool:
    compact = str(message or "").replace(" ", "").lower()
    return any(token in compact for token in ("수학", "math", "국어", "korean", "영어", "english"))


def _subject_terms(engine: str) -> list[str]:
    if engine == ENGLISH_ENGINE:
        return ["영어", "english"]
    if engine == KOREAN_ENGINE:
        return ["국어", "korean"]
    return ["수학", "math"]


def _subject_label(engine: str) -> str:
    if engine == ENGLISH_ENGINE:
        return "영어"
    if engine == KOREAN_ENGINE:
        return "국어"
    return "수학"


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


def _has_requested_count(message: str) -> bool:
    text = str(message or "")
    if re.search(r"\d{1,3}\s*[-~]\s*\d{1,3}", text):
        return True
    return bool(re.search(r"(?<!고)(\d{1,3})\s*(?:문항|문제|개)", text))


def _difficulty_from_phrase(phrase: str, engine: str) -> str | None:
    normalized = normalize_point_difficulty(phrase)
    if normalized:
        return normalized
    return difficulty_for_request_label(phrase, engine)


def _wants_random_without_difficulty(message: str) -> bool:
    compact = str(message or "").replace(" ", "").lower()
    if not compact:
        return False
    explicit_relax_tokens = (
        "난이도무관",
        "배점무관",
        "난이도상관없",
        "배점상관없",
        "난이도없이",
        "배점없이",
        "난이도제외",
        "배점제외",
        "난이도빼고",
        "배점빼고",
    )
    if any(token in compact for token in explicit_relax_tokens):
        return True
    random_tokens = ("랜덤", "무작위", "임의", "아무거나", "알아서", "섞어서", "상관없")
    if not any(token in compact for token in random_tokens):
        return False
    return any(token in compact for token in ("난이도", "배점", "배치", "문항", "문제", "시험지", "추출", "골라", "뽑"))


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


def _has_difficulty_plan(message: str) -> bool:
    if _wants_random_without_difficulty(message):
        return True
    text = str(message or "")
    compact = text.replace(" ", "").lower()
    if any(token in compact for token in ("2점", "3점", "4점", "쉬움", "쉬운", "중간", "어려움", "어려운", "난이도", "배점")):
        return True
    for match in re.finditer(r"(\d{1,3})\s*[-~]\s*(\d{1,3})([^.,;\n]*)", text):
        if _difficulty_from_phrase(match.group(3), MATH_ENGINE):
            return True
    return False


def _has_template(message: str) -> bool:
    compact = str(message or "").replace(" ", "")
    return any(token in compact for token in ("템플릿", "양식", "서식", "폼"))


def _has_delivery_intent(message: str) -> bool:
    compact = str(message or "").replace(" ", "")
    return any(token in compact for token in ("낼", "내야", "배정", "과제", "숙제", "수업전", "학생에게", "반에"))


def _has_target_recipient(message: str) -> bool:
    text = str(message or "")
    compact = text.replace(" ", "")
    return bool(re.search(r"[A-Za-z가-힣0-9]+\s*학생", text)) or any(token in compact for token in ("반에", "클래스", "수업반"))


def _has_due_or_schedule(message: str) -> bool:
    compact = str(message or "").replace(" ", "")
    return any(
        token in compact
        for token in (
            "오늘",
            "내일",
            "이번주",
            "다음주",
            "월요일",
            "화요일",
            "수요일",
            "목요일",
            "금요일",
            "토요일",
            "일요일",
            "수업전",
            "까지",
        )
    ) or bool(re.search(r"\d{1,2}[/:시]\d{0,2}", compact))


def _missing_required_fields(message: str) -> list[dict[str, str]]:
    missing: list[dict[str, str]] = []
    if not _has_subject(message):
        missing.append({"field": "subject", "question": "어느 과목 시험지인가요? 수학, 국어, 영어 중에서 알려주세요."})
    if not _grade_keyword(message):
        missing.append({"field": "grade", "question": "어느 학년 또는 범위의 문항을 쓸까요? 예: 고3, 고2, 중3."})
    if not _has_requested_count(message):
        missing.append({"field": "problem_count", "question": "총 몇 문항으로 만들까요?"})
    if not _has_difficulty_plan(message):
        missing.append({"field": "difficulty_plan", "question": "배점/난이도 배치는 어떻게 할까요? 예: 1-10 2점, 11-20 3점, 21-25 4점."})
    if not _has_template(message):
        missing.append({"field": "template", "question": "어떤 시험지 템플릿 또는 양식을 사용할까요?"})
    if _has_delivery_intent(message):
        if not _has_target_recipient(message):
            missing.append({"field": "recipient", "question": "누구에게 낼까요? 학생 이름이나 클래스명을 알려주세요."})
        if not _has_due_or_schedule(message):
            missing.append({"field": "due_at", "question": "언제까지 내면 될까요? 수업 전이면 요일/수업 시간을 알려주세요."})
    return missing


def _needs_input_draft(message: str, missing: list[dict[str, str]], engine: str, count: int | None, grade: str | None) -> dict[str, Any]:
    return {
        "type": "exam_paper_creation",
        "status": "needs_input",
        "title": "시험지 제작 정보 확인",
        "subject_engine": engine if _has_subject(message) else None,
        "grade": grade,
        "requested_count": count if _has_requested_count(message) else None,
        "selected_count": 0,
        "missing_required_fields": missing,
        "clarification_questions": [item["question"] for item in missing],
        "difficulty_distribution": {},
        "unit_distribution": {},
        "missing_difficulty_slots": [],
        "relaxed_difficulty_candidates": [],
        "used_exclusion": {"scope": "workspace_usage_history", "excluded_count": 0},
        "problems": [],
        "warnings": ["필수 정보가 부족해서 문항을 아직 선택하지 않았습니다."],
    }


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


def _candidate_pool(db: Session, owner_ids: set[str], engine: str, grade_keyword: str | None, count: int) -> tuple[list[Problem], bool]:
    candidates = db.scalars(_candidate_query(owner_ids, engine, grade_keyword)).unique().all()
    if not grade_keyword or len(candidates) >= count:
        return candidates, False

    broader_candidates = db.scalars(_candidate_query(owner_ids, engine, None)).unique().all()
    if len(broader_candidates) > len(candidates):
        return broader_candidates, True
    return candidates, False


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


def _fill_balanced_missing_slots(
    candidates: list[Problem],
    selected: list[Problem],
    missing_slots: list[dict[str, Any]],
) -> tuple[list[Problem], list[dict[str, Any]]]:
    remaining_by_difficulty: dict[str, list[Problem]] = {label: [] for label in DIFFICULTY_LABELS}
    selected_ids = {str(problem.id) for problem in selected}
    unit_counts: Counter[str] = Counter(_problem_unit(problem) for problem in selected)
    for problem in candidates:
        difficulty = _problem_difficulty(problem)
        if difficulty in remaining_by_difficulty and str(problem.id) not in selected_ids:
            remaining_by_difficulty[difficulty].append(problem)

    filled: list[Problem] = []
    still_missing: list[dict[str, Any]] = []
    for slot in missing_slots:
        difficulty = str(slot.get("difficulty") or "")
        pool = [
            problem
            for problem in remaining_by_difficulty.get(difficulty, [])
            if str(problem.id) not in selected_ids
        ]
        if not pool:
            still_missing.append(slot)
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
        filled.append(picked)
        selected_ids.add(str(picked.id))
        unit_counts[_problem_unit(picked)] += 1

    return filled, still_missing


def _point_difficulty_metadata_count(candidates: list[Problem]) -> int:
    return sum(1 for problem in candidates if _problem_difficulty(problem))


def _select_without_difficulty(candidates: list[Problem], count: int, seed: str) -> list[Problem]:
    ordered = sorted(
        candidates,
        key=lambda problem: (
            sha256(f"{seed}:{problem.id}".encode("utf-8")).hexdigest(),
            str(problem.id),
        ),
    )
    return ordered[:count]


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
    random_without_difficulty_requested = _wants_random_without_difficulty(message)
    missing_required = _missing_required_fields(message)
    blocking_missing = [item for item in missing_required if item.get("field") != "difficulty_plan"]
    if blocking_missing:
        return _needs_input_draft(message, missing_required, engine, count, grade)

    slots = [] if random_without_difficulty_requested else _difficulty_slots(message, count, engine)

    candidates, grade_filter_relaxed = _candidate_pool(db, owner_ids, engine, grade, count)
    usage_counts = _usage_history_counts(db, owner_ids, [problem.id for problem in candidates])
    unused_candidates = [problem for problem in candidates if usage_counts.get(str(problem.id), 0) == 0]
    used_candidates = [problem for problem in candidates if usage_counts.get(str(problem.id), 0) > 0]
    point_metadata_count = _point_difficulty_metadata_count(candidates)
    can_use_point_metadata = point_metadata_count >= count
    if missing_required and can_use_point_metadata:
        return _needs_input_draft(message, missing_required, engine, count, grade)

    selection_strategy = "point_difficulty"
    ignored_difficulty_plan = False
    if random_without_difficulty_requested:
        selected = _select_without_difficulty(unused_candidates, count, message)
        if len(selected) < count:
            selected.extend(_select_without_difficulty(used_candidates, count - len(selected), f"{message}:reuse"))
        missing = []
        selection_strategy = "random_without_difficulty"
        ignored_difficulty_plan = True
    elif can_use_point_metadata:
        selected, missing = _select_balanced(unused_candidates, slots)
        if missing:
            filled, missing = _fill_balanced_missing_slots(used_candidates, selected, missing)
            selected.extend(filled)
    else:
        selected = _select_without_difficulty(unused_candidates, count, message)
        if len(selected) < count:
            selected.extend(_select_without_difficulty(used_candidates, count - len(selected), f"{message}:reuse"))
        missing = []
        selection_strategy = "random_without_difficulty"
        ignored_difficulty_plan = True

    reused_problem_count = sum(1 for problem in selected if usage_counts.get(str(problem.id), 0) > 0)
    difficulty_distribution = Counter(_problem_difficulty(problem) or "미지정" for problem in selected)
    unit_distribution = Counter(_problem_unit(problem) for problem in selected)
    target_student = None
    student_match = re.search(r"([A-Za-z가-힣0-9]+)\s*학생", str(message or ""))
    if student_match:
        target_student = f"{student_match.group(1)} 학생"

    warnings: list[str] = []
    if grade and grade_filter_relaxed:
        warnings.append(f"{grade} 표기가 있는 문항만으로 부족해 화면에 보이는 {_subject_label(engine)} 보관 범위로 넓혀 구성했습니다.")
    elif grade and not candidates:
        warnings.append(f"{grade} 조건에 맞는 문항 후보가 없습니다.")
    if missing:
        warnings.append("요청한 배점 구간을 채울 문항이 부족합니다.")
    if random_without_difficulty_requested:
        warnings.append("요청대로 배점/난이도 조건을 쓰지 않고 랜덤 추출했습니다.")
    elif ignored_difficulty_plan:
        warnings.append("배점 메타데이터가 없어 배점 조건을 제외하고 랜덤 추출했습니다.")
    if reused_problem_count:
        warnings.append(f"새 후보만으로 수량을 채우기 어려워 사용 이력이 있는 문항 {reused_problem_count}개를 포함했습니다.")
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
        "missing_required_fields": [],
        "clarification_questions": [],
        "target_student_label": target_student,
        "difficulty_slots": [{"position": index + 1, "difficulty": value} for index, value in enumerate(slots)],
        "difficulty_distribution": dict(difficulty_distribution),
        "unit_distribution": dict(unit_distribution),
        "missing_difficulty_slots": missing,
        "difficulty_plan_mode": "random_without_difficulty" if random_without_difficulty_requested else "slot_distribution",
        "selection_strategy": selection_strategy,
        "ignored_difficulty_plan": ignored_difficulty_plan,
        "point_difficulty_metadata_count": point_metadata_count,
        "grade_filter_relaxed": grade_filter_relaxed,
        "relaxed_difficulty_candidates": _relaxed_candidates(unused_candidates, selected),
        "used_exclusion": {
            "scope": "workspace_usage_history",
            "excluded_count": max(0, len(used_candidates) - reused_problem_count),
            "reused_count": reused_problem_count,
        },
        "candidate_shortfall": max(0, count - len(selected)),
        "problems": [_serialize_problem(problem, position=index + 1) for index, problem in enumerate(selected)],
        "warnings": warnings,
    }


def format_exam_paper_draft_answer(draft: dict[str, Any]) -> str:
    if draft.get("status") == "needs_input":
        questions = draft.get("clarification_questions") or []
        if not questions:
            return "시험지 제작에 필요한 정보가 부족합니다. 과목, 학년, 문항 수, 난이도 배치, 템플릿을 알려주세요."
        question_text = " ".join(f"{index + 1}. {question}" for index, question in enumerate(questions[:5]))
        return f"시험지 제작 전에 확인이 필요합니다. {question_text}"

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
    if selected < requested:
        parts.append("요청 문항 수를 채우려면 보관 문항을 더 추가하거나 조건을 넓혀야 합니다.")
    elif missing:
        parts.append("일부 배점 구간은 후보가 부족해서 아직 생성하지 않았습니다. 조건을 완화할지, 문항을 더 추출할지 알려주시면 제가 이어서 만들겠습니다.")
    else:
        parts.append("조건이 완성되면 제가 실제 문제세트까지 생성하고 확인 링크를 제시하겠습니다.")
    return " ".join(parts)
