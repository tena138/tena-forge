from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import numpy as np


MODEL_NAME = "jhgan/ko-sroberta-multitask"
_embedding_model = None
_embedding_cache: dict[str, np.ndarray] = {}


@dataclass
class MatchItem:
    item: dict[str, Any]
    section_label: str | None
    problem_number: str
    occurrence: int
    page_idx: int
    number_occurrence: int = 0

    @property
    def key(self) -> tuple[str | None, str, int]:
        return (self.section_label, self.problem_number, self.occurrence)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _canonical_number(value: Any) -> str:
    text = _text(value)
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"(번|문항|문제)$", "", text)
    return text


def _section_label(item: dict[str, Any]) -> str | None:
    label = _text(item.get("section_label"))
    if label:
        return label
    label = _text(item.get("unit"))
    return label or None


def _page_idx(item: dict[str, Any]) -> int:
    value = item.get("page_idx", item.get("page_index", 0))
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _stem_text(problem: dict[str, Any]) -> str:
    return _text(problem.get("stem_text") or problem.get("problem_text"))


def _solution_snippet(solution: dict[str, Any] | None) -> str:
    if not solution:
        return ""
    return _text(solution.get("referenced_problem_snippet"))


def _solution_text_for_fallback(solution: dict[str, Any] | None) -> str:
    if not solution:
        return ""
    return _text(
        solution.get("referenced_problem_snippet")
        or solution.get("solution_first_line")
        or solution.get("key_concept")
        or solution.get("solution_steps")
    )


def _annotate_occurrences(items: list[dict[str, Any]]) -> list[MatchItem]:
    grouped: dict[tuple[str | None, str], list[dict[str, Any]]] = defaultdict(list)
    by_number: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        number = _canonical_number(item.get("problem_number"))
        grouped[(_section_label(item), number)].append(item)
        by_number[number].append(item)

    number_occurrences: dict[int, int] = {}
    for number_group in by_number.values():
        for occurrence, item in enumerate(sorted(number_group, key=lambda value: (_page_idx(value), _text(value.get("problem_number"))))):
            number_occurrences[id(item)] = occurrence

    annotated: list[MatchItem] = []
    for (section_label, number), group in grouped.items():
        for occurrence, item in enumerate(sorted(group, key=lambda value: (_page_idx(value), _text(value.get("problem_number"))))):
            annotated.append(
                MatchItem(
                    item=item,
                    section_label=section_label,
                    problem_number=number,
                    occurrence=occurrence,
                    page_idx=_page_idx(item),
                    number_occurrence=number_occurrences.get(id(item), 0),
                )
            )
    return annotated


def _model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer

        _embedding_model = SentenceTransformer(MODEL_NAME)
    return _embedding_model


def _embedding(text: str) -> np.ndarray | None:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return None
    if normalized not in _embedding_cache:
        try:
            vector = _model().encode([normalized], normalize_embeddings=True)[0]
            _embedding_cache[normalized] = np.asarray(vector, dtype=np.float32)
        except Exception:
            return None
    return _embedding_cache[normalized]


def cosine_similarity(left: str, right: str) -> float | None:
    left_vec = _embedding(left)
    right_vec = _embedding(right)
    if left_vec is None or right_vec is None:
        return None
    denom = float(np.linalg.norm(left_vec) * np.linalg.norm(right_vec))
    if not denom:
        return None
    return max(-1.0, min(1.0, float(np.dot(left_vec, right_vec) / denom)))


def _score_pair(problem: dict[str, Any], solution: dict[str, Any] | None) -> tuple[float, bool, bool]:
    snippet = _solution_snippet(solution)
    if not snippet:
        return 0.5, True, False
    similarity = cosine_similarity(snippet, _stem_text(problem))
    if similarity is None:
        return 0.5, True, False
    if similarity < 0.5:
        return similarity, True, True
    return similarity, similarity < 0.75, False


def _attach(problem: dict[str, Any], solution: dict[str, Any] | None, confidence: float, needs_review: bool, matched_via: str) -> None:
    problem["solution"] = solution
    problem["match_confidence"] = max(0.0, min(1.0, float(confidence)))
    problem["match_flags"] = {
        "needs_review": bool(needs_review),
        "inversion_warning": False,
        "matched_via": matched_via,
    }


def _hungarian_assign(problem_items: list[MatchItem], solution_items: list[MatchItem]) -> tuple[int, set[int]]:
    rescued = 0
    used_solution_indexes: set[int] = set()
    by_section_problems: dict[str | None, list[MatchItem]] = defaultdict(list)
    by_section_solutions: dict[str | None, list[MatchItem]] = defaultdict(list)
    for problem in problem_items:
        by_section_problems[problem.section_label].append(problem)
    for solution in solution_items:
        by_section_solutions[solution.section_label].append(solution)

    for section_label, section_problems in by_section_problems.items():
        section_solutions = by_section_solutions.get(section_label, [])
        if not section_problems or not section_solutions:
            continue
        scores = np.zeros((len(section_problems), len(section_solutions)), dtype=np.float32)
        for row, problem in enumerate(section_problems):
            for column, solution in enumerate(section_solutions):
                probe_text = _solution_text_for_fallback(solution.item)
                score = cosine_similarity(probe_text, _stem_text(problem.item))
                scores[row, column] = float(score if score is not None else 0.0)

        try:
            from scipy.optimize import linear_sum_assignment

            rows, columns = linear_sum_assignment(-scores)
        except Exception:
            rows, columns = _greedy_assignment(scores)

        for row, column in zip(rows, columns):
            score = float(scores[row, column])
            if score < 0.6:
                continue
            problem = section_problems[int(row)]
            solution = section_solutions[int(column)]
            _attach(problem.item, solution.item, score, score < 0.75, "hungarian")
            used_solution_indexes.add(id(solution.item))
            rescued += 1
    return rescued, used_solution_indexes


def _number_order_assign(problem_items: list[MatchItem], solution_items: list[MatchItem]) -> tuple[int, set[int]]:
    """Pair remaining duplicate problem numbers by source order.

    Workbooks often restart numbering in every section. If the problem side and
    solution side disagree on the section label, exact section keys miss those
    pairs even though the nth remaining "1" still belongs to the nth remaining
    "1" in the solution booklet. Keep these matches review-marked unless the
    quoted snippet gives high confidence.
    """
    rescued = 0
    used_solution_ids: set[int] = set()
    by_number_problems: dict[str, list[MatchItem]] = defaultdict(list)
    by_number_solutions: dict[str, list[MatchItem]] = defaultdict(list)
    for problem in problem_items:
        by_number_problems[problem.problem_number].append(problem)
    for solution in solution_items:
        by_number_solutions[solution.problem_number].append(solution)

    for number, number_problems in by_number_problems.items():
        number_solutions = by_number_solutions.get(number, [])
        if not number_solutions:
            continue
        ordered_problems = sorted(number_problems, key=lambda value: (value.number_occurrence, value.page_idx))
        ordered_solutions = sorted(number_solutions, key=lambda value: (value.number_occurrence, value.page_idx))
        for problem, solution in zip(ordered_problems, ordered_solutions):
            if id(solution.item) in used_solution_ids:
                continue
            confidence, needs_review, rejected = _score_pair(problem.item, solution.item)
            if rejected:
                continue
            _attach(problem.item, solution.item, confidence, needs_review, "number_order")
            used_solution_ids.add(id(solution.item))
            rescued += 1
    return rescued, used_solution_ids


def _hungarian_assign_by_number(problem_items: list[MatchItem], solution_items: list[MatchItem]) -> tuple[int, set[int]]:
    rescued = 0
    used_solution_ids: set[int] = set()
    by_number_problems: dict[str, list[MatchItem]] = defaultdict(list)
    by_number_solutions: dict[str, list[MatchItem]] = defaultdict(list)
    for problem in problem_items:
        by_number_problems[problem.problem_number].append(problem)
    for solution in solution_items:
        by_number_solutions[solution.problem_number].append(solution)

    for number, number_problems in by_number_problems.items():
        number_solutions = by_number_solutions.get(number, [])
        if not number_problems or not number_solutions:
            continue
        scores = np.zeros((len(number_problems), len(number_solutions)), dtype=np.float32)
        for row, problem in enumerate(number_problems):
            for column, solution in enumerate(number_solutions):
                probe_text = _solution_text_for_fallback(solution.item)
                score = cosine_similarity(probe_text, _stem_text(problem.item))
                scores[row, column] = float(score if score is not None else 0.0)

        try:
            from scipy.optimize import linear_sum_assignment

            rows, columns = linear_sum_assignment(-scores)
        except Exception:
            rows, columns = _greedy_assignment(scores)

        for row, column in zip(rows, columns):
            score = float(scores[row, column])
            if score < 0.55:
                continue
            problem = number_problems[int(row)]
            solution = number_solutions[int(column)]
            _attach(problem.item, solution.item, score, score < 0.75, "number_hungarian")
            used_solution_ids.add(id(solution.item))
            rescued += 1
    return rescued, used_solution_ids


def _greedy_assignment(scores: np.ndarray) -> tuple[list[int], list[int]]:
    pairs: list[tuple[float, int, int]] = []
    for row in range(scores.shape[0]):
        for column in range(scores.shape[1]):
            pairs.append((float(scores[row, column]), row, column))
    rows: list[int] = []
    columns: list[int] = []
    used_rows: set[int] = set()
    used_columns: set[int] = set()
    for _score, row, column in sorted(pairs, reverse=True):
        if row in used_rows or column in used_columns:
            continue
        used_rows.add(row)
        used_columns.add(column)
        rows.append(row)
        columns.append(column)
    return rows, columns


def _apply_inversion_warnings(problems: list[dict[str, Any]]) -> int:
    matched = [
        problem
        for problem in sorted(problems, key=_page_idx)
        if problem.get("solution") is not None and problem.get("match_flags")
    ]
    warning_count = 0
    previous_solution_page: int | None = None
    previous_problem: dict[str, Any] | None = None
    for problem in matched:
        solution_page = _page_idx(problem["solution"])
        if previous_solution_page is not None and solution_page < previous_solution_page:
            for target in (previous_problem, problem):
                if target and target.get("match_flags"):
                    target["match_flags"]["inversion_warning"] = True
            warning_count += 1
        previous_solution_page = solution_page
        previous_problem = problem
    return warning_count


def _print_stats(
    problems: list[dict[str, Any]],
    primary_count: int,
    section_rescued_count: int,
    number_order_count: int,
    number_hungarian_count: int,
    inversion_count: int,
) -> None:
    total = len(problems)
    matched = [problem for problem in problems if problem.get("solution") is not None]
    high = sum(1 for problem in problems if float(problem.get("match_confidence") or 0.0) >= 0.75)
    medium = sum(1 for problem in problems if 0.5 <= float(problem.get("match_confidence") or 0.0) < 0.75)
    low = sum(1 for problem in problems if float(problem.get("match_confidence") or 0.0) < 0.5)
    print(
        "[matcher] "
        f"total_problems={total}, matched={len(matched)}, unmatched={total - len(matched)}, "
        f"confidence_high={high}, confidence_mid={medium}, confidence_low={low}, "
        f"primary_matches={primary_count}, section_hungarian_rescued={section_rescued_count}, "
        f"number_order_rescued={number_order_count}, number_hungarian_rescued={number_hungarian_count}, "
        f"inversion_warnings={inversion_count}",
        flush=True,
    )


def match(problems: list[dict[str, Any]], solutions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    problem_items = _annotate_occurrences(problems)
    solution_items = _annotate_occurrences(solutions)
    solutions_by_key = {solution.key: solution for solution in solution_items}
    used_solution_ids: set[int] = set()
    rejected_problem_items: list[MatchItem] = []
    primary_count = 0

    for problem in problem_items:
        solution = solutions_by_key.get(problem.key)
        if solution is None:
            continue
        confidence, needs_review, rejected = _score_pair(problem.item, solution.item)
        if rejected:
            rejected_problem_items.append(problem)
            continue
        _attach(problem.item, solution.item, confidence, needs_review, "primary")
        used_solution_ids.add(id(solution.item))
        primary_count += 1

    unmatched_problem_items = [
        problem for problem in problem_items
        if problem.item.get("solution") is None
    ]
    unmatched_solution_items = [
        solution for solution in solution_items
        if id(solution.item) not in used_solution_ids
    ]
    section_rescued_count, section_rescued_solution_ids = _hungarian_assign(unmatched_problem_items, unmatched_solution_items)
    used_solution_ids.update(section_rescued_solution_ids)

    unmatched_problem_items = [
        problem for problem in problem_items
        if problem.item.get("solution") is None
    ]
    unmatched_solution_items = [
        solution for solution in solution_items
        if id(solution.item) not in used_solution_ids
    ]
    number_order_count, number_order_solution_ids = _number_order_assign(unmatched_problem_items, unmatched_solution_items)
    used_solution_ids.update(number_order_solution_ids)

    unmatched_problem_items = [
        problem for problem in problem_items
        if problem.item.get("solution") is None
    ]
    unmatched_solution_items = [
        solution for solution in solution_items
        if id(solution.item) not in used_solution_ids
    ]
    number_hungarian_count, number_hungarian_solution_ids = _hungarian_assign_by_number(unmatched_problem_items, unmatched_solution_items)
    used_solution_ids.update(number_hungarian_solution_ids)

    for problem in problem_items:
        if problem.item.get("solution") is None:
            _attach(problem.item, None, 0.0, True, "unmatched")

    inversion_count = _apply_inversion_warnings(problems)
    _print_stats(problems, primary_count, section_rescued_count, number_order_count, number_hungarian_count, inversion_count)
    return problems
