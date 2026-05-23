from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from difflib import SequenceMatcher
from os import getenv
from typing import Any

import numpy as np


MODEL_NAME = "jhgan/ko-sroberta-multitask"
_embedding_model = None
_embedding_cache: dict[str, np.ndarray] = {}
_TRUTHY_VALUES = {"1", "true", "yes", "on"}
_LEXICAL_MATCH_THRESHOLD = 0.60
_LEXICAL_REVIEW_THRESHOLD = 0.32
_MAX_UNSECTIONED_GLOBAL_ORDER = 40

SECTION_PATTERNS = (
    (re.compile(r"\bDAY\s*0*(\d{1,3})\b", re.IGNORECASE), "DAY"),
    (re.compile(r"\bCH(?:APTER)?\s*0*(\d{1,3})\b", re.IGNORECASE), "CHAPTER"),
    (re.compile(r"\bUNIT\s*0*(\d{1,3})\b", re.IGNORECASE), "UNIT"),
    (re.compile(r"(?:\uc720\ud615|TYPE)\s*0*(\d{1,3})", re.IGNORECASE), "\uc720\ud615"),
    (re.compile(r"(?:\ub2e8\uc6d0|LESSON)\s*0*(\d{1,3})", re.IGNORECASE), "\ub2e8\uc6d0"),
)
NUMBER_PREFIX_RE = re.compile(
    r"^(?:#|No\.?|NO\.?|Q\.?|Problem|"
    r"\ubb38\uc81c|\ubb38\ud56d|\ubc88\ud638)+",
    re.IGNORECASE,
)
NUMBER_LABEL_RE = re.compile(r"(?:\uc815\ub2f5|\ub2f5|\ud574\uc124|\ud480\uc774).*$")
NUMBER_SUFFIX_RE = re.compile(r"(?:\ubc88|\ubb38\uc81c|\ubb38\ud56d)$")


@dataclass
class MatchItem:
    item: dict[str, Any]
    section_label: str | None
    problem_number: str
    occurrence: int
    page_idx: int
    source_order: int
    global_index: int
    local_index: int
    number_occurrence: int = 0

    @property
    def key(self) -> tuple[str | None, str, int]:
        return (self.section_label, self.problem_number, self.occurrence)


@dataclass
class SectionValidation:
    section_id: str | None
    problem_items: list[MatchItem]
    solution_items: list[MatchItem]
    problem_anchor: dict[str, Any]
    solution_anchor: dict[str, Any]
    status: str
    reasons: list[str]

    @property
    def allow_order_matching(self) -> bool:
        return (
            self.status == "ok"
            and bool(self.section_id)
            and len(self.problem_items) == len(self.solution_items)
            and len(self.problem_items) > 0
        )


def _text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip()


def _normalize_section_label(value: Any) -> str | None:
    text = _normalize_spaces(_text(value))
    if not text:
        return None
    for pattern, label in SECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            return f"{label} {int(match.group(1)):02d}"
    return text.upper()


def _section_label(item: dict[str, Any]) -> str | None:
    for key in ("section_id", "section_label", "unit", "chapter", "day"):
        label = _normalize_section_label(item.get(key))
        if label:
            return label
    return None


def _page_idx(item: dict[str, Any]) -> int:
    value = item.get("page_idx", item.get("page_index", 0))
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _source_order_key(item: dict[str, Any], fallback_index: int) -> tuple[int, int, int, str]:
    global_index = _int_or_none(item.get("global_index"))
    local_index = _int_or_none(item.get("local_index"))
    return (
        global_index if global_index is not None else 10**9,
        _page_idx(item),
        local_index if local_index is not None else fallback_index,
        _text(item.get("problem_number")),
    )


def _canonical_number(value: Any) -> str:
    circled_digits = str.maketrans(
        "\u2460\u2461\u2462\u2463\u2464\u2465\u2466\u2467\u2468",
        "123456789",
    )
    text = unicodedata.normalize("NFKC", _text(value)).translate(circled_digits)
    text = re.sub(r"\s+", "", text)
    text = NUMBER_PREFIX_RE.sub("", text)
    text = NUMBER_LABEL_RE.sub("", text)
    text = NUMBER_SUFFIX_RE.sub("", text)
    text = re.sub(r"^[\[\(【](\d+(?:[-~]\d+)?)[]\)】]$", r"\1", text)
    text = re.sub(r"(?<=\d)[\.:：\)]$", "", text)
    text = re.sub(r"^0+(\d)", r"\1", text)
    if text:
        return text
    fallback = re.search(r"\d+(?:[-~]\d+)?", unicodedata.normalize("NFKC", _text(value)))
    if not fallback:
        return ""
    return re.sub(r"^0+(\d)", r"\1", fallback.group(0))


def _numeric_number(value: str) -> int | None:
    if re.fullmatch(r"\d+", value):
        return int(value)
    return None


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
    ordered = [
        item
        for _index, item in sorted(
            enumerate(items),
            key=lambda pair: _source_order_key(pair[1], pair[0]),
        )
    ]
    inherited_section: str | None = None
    by_section_number: dict[tuple[str | None, str], list[dict[str, Any]]] = defaultdict(list)
    by_number: dict[str, list[dict[str, Any]]] = defaultdict(list)
    section_local_counts: dict[str | None, int] = defaultdict(int)

    for global_index, item in enumerate(ordered, start=1):
        section = _section_label(item)
        if section:
            inherited_section = section
        elif inherited_section:
            section = inherited_section
            item["section_inferred"] = True
        number = _canonical_number(item.get("problem_no", item.get("problem_number")))
        section_local_counts[section] += 1
        item["section_id"] = section
        item["problem_no"] = number
        item["canonical_key"] = f"{section}-{number}" if section and number else None
        item["global_index"] = _int_or_none(item.get("global_index")) or global_index
        item["local_index"] = _int_or_none(item.get("local_index")) or section_local_counts[section]
        by_section_number[(section, number)].append(item)
        by_number[number].append(item)

    number_occurrences: dict[int, int] = {}
    for number_group in by_number.values():
        for occurrence, item in enumerate(number_group):
            number_occurrences[id(item)] = occurrence

    annotated: list[MatchItem] = []
    for (section_label, number), group in by_section_number.items():
        for occurrence, item in enumerate(group):
            annotated.append(
                MatchItem(
                    item=item,
                    section_label=section_label,
                    problem_number=number,
                    occurrence=occurrence,
                    page_idx=_page_idx(item),
                    source_order=int(item.get("global_index") or 0),
                    global_index=int(item.get("global_index") or 0),
                    local_index=int(item.get("local_index") or 0),
                    number_occurrence=number_occurrences.get(id(item), 0),
                )
            )
    return sorted(annotated, key=lambda value: (value.global_index, value.page_idx, value.local_index))


def _model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer

        _embedding_model = SentenceTransformer(MODEL_NAME)
    return _embedding_model


def _embedding_matching_enabled() -> bool:
    return getenv("SEMANTIC_MATCHING_ENABLED", "").strip().lower() in _TRUTHY_VALUES


def _compact_for_similarity(text: str, max_chars: int = 1600) -> str:
    normalized = unicodedata.normalize("NFKC", _text(text)).lower()
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"[\W_]+", "", normalized, flags=re.UNICODE)
    return normalized[:max_chars]


def _char_ngrams(text: str, size: int = 3) -> set[str]:
    if len(text) <= size:
        return {text} if text else set()
    return {text[index : index + size] for index in range(len(text) - size + 1)}


def _lexical_similarity(left: str, right: str) -> float | None:
    left_norm = _compact_for_similarity(left)
    right_norm = _compact_for_similarity(right)
    if not left_norm or not right_norm:
        return None
    if left_norm in right_norm or right_norm in left_norm:
        return 1.0

    left_grams = _char_ngrams(left_norm)
    right_grams = _char_ngrams(right_norm)
    union = len(left_grams | right_grams)
    jaccard = (len(left_grams & right_grams) / union) if union else 0.0
    overlap = len(left_grams & right_grams) / max(min(len(left_grams), len(right_grams)), 1)
    sequence = SequenceMatcher(None, left_norm, right_norm, autojunk=False).ratio()
    return max(0.0, min(1.0, (overlap * 0.55) + (jaccard * 0.25) + (sequence * 0.20)))


def _text_similarity(left: str, right: str) -> float | None:
    if _embedding_matching_enabled():
        score = cosine_similarity(left, right)
        if score is not None:
            return score
    return _lexical_similarity(left, right)


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


def _semantic_review_warnings(problem: dict[str, Any], solution: dict[str, Any] | None) -> list[str]:
    snippet = _solution_snippet(solution)
    if not snippet:
        return []
    similarity = _text_similarity(snippet, _stem_text(problem))
    warning_threshold = 0.5 if _embedding_matching_enabled() else _LEXICAL_REVIEW_THRESHOLD
    if similarity is not None and similarity < warning_threshold:
        return ["semantic_conflict"]
    return []


def _reference_supports_pair(problem: dict[str, Any], solution: dict[str, Any] | None) -> bool:
    snippet = _solution_snippet(solution)
    if not snippet:
        return True
    similarity = _text_similarity(snippet, _stem_text(problem))
    threshold = 0.5 if _embedding_matching_enabled() else _LEXICAL_MATCH_THRESHOLD
    return similarity is None or similarity >= threshold


def _attach(
    problem: dict[str, Any],
    solution: dict[str, Any] | None,
    confidence: float,
    needs_review: bool,
    matched_via: str,
    warnings: list[str] | None = None,
) -> None:
    unique_warnings = list(dict.fromkeys(warnings or []))
    problem["solution"] = solution
    problem["match_confidence"] = max(0.0, min(1.0, float(confidence)))
    problem["match_flags"] = {
        "needs_review": bool(needs_review or unique_warnings or confidence < 0.7),
        "inversion_warning": False,
        "matched_via": matched_via,
        "warnings": unique_warnings,
    }


def _score_pair(problem: dict[str, Any], solution: dict[str, Any] | None) -> float:
    probe_text = _solution_text_for_fallback(solution)
    score = _text_similarity(probe_text, _stem_text(problem))
    return float(score if score is not None else 0.0)


def _group_by_section(items: list[MatchItem]) -> dict[str | None, list[MatchItem]]:
    grouped: dict[str | None, list[MatchItem]] = defaultdict(list)
    for item in items:
        grouped[item.section_label].append(item)
    return grouped


def _section_order(items: list[MatchItem]) -> list[str | None]:
    seen: set[str | None] = set()
    ordered: list[str | None] = []
    for item in sorted(items, key=lambda value: (value.global_index, value.page_idx, value.local_index)):
        if item.section_label in seen:
            continue
        seen.add(item.section_label)
        ordered.append(item.section_label)
    return ordered


def _section_label_has_anchor(value: str | None) -> bool:
    if not value:
        return False
    text = unicodedata.normalize("NFKC", str(value))
    return bool(re.search(r"\d", text))


def _ordered_items(items: list[MatchItem]) -> list[MatchItem]:
    return sorted(items, key=lambda value: (value.local_index, value.global_index, value.page_idx))


def _anchor_for_items(items: list[MatchItem]) -> dict[str, Any]:
    ordered = _ordered_items(items)
    numbers = [item.problem_number for item in ordered if item.problem_number]
    return {
        "first": numbers[0] if numbers else None,
        "last": numbers[-1] if numbers else None,
        "count": len(numbers),
    }


def _sequence_issue_codes(items: list[MatchItem], prefix: str) -> list[str]:
    numeric_numbers = [_numeric_number(item.problem_number) for item in _ordered_items(items)]
    numeric_numbers = [number for number in numeric_numbers if number is not None]
    if not numeric_numbers:
        return []

    issues: list[str] = []
    counts = Counter(numeric_numbers)
    if any(count > 1 for count in counts.values()):
        issues.append(f"duplicated_{prefix}_numbers")

    unique_sorted = sorted(counts)
    expected = list(range(unique_sorted[0], unique_sorted[-1] + 1)) if unique_sorted else []
    if [number for number in expected if number not in counts]:
        issues.append(f"missing_{prefix}_numbers")

    if numeric_numbers != sorted(numeric_numbers):
        issues.append(f"suspicious_{prefix}_number_jump")
    elif any((right - left) > 1 for left, right in zip(numeric_numbers, numeric_numbers[1:])):
        issues.append(f"suspicious_{prefix}_number_jump")

    return issues


def _build_section_validations(
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
) -> dict[str | None, SectionValidation]:
    problem_groups = _group_by_section(problem_items)
    solution_groups = _group_by_section(solution_items)
    validations: dict[str | None, SectionValidation] = {}
    for section_id in sorted(set(problem_groups) | set(solution_groups), key=lambda value: value or ""):
        section_problems = problem_groups.get(section_id, [])
        section_solutions = solution_groups.get(section_id, [])
        problem_anchor = _anchor_for_items(section_problems)
        solution_anchor = _anchor_for_items(section_solutions)
        reasons: list[str] = []

        if not section_id:
            reasons.append("section_boundary_not_detected")
        if len(section_problems) != len(section_solutions):
            reasons.append(f"problem_count {len(section_problems)} but solution_count {len(section_solutions)}")

        reasons.extend(_sequence_issue_codes(section_problems, "problem"))
        reasons.extend(_sequence_issue_codes(section_solutions, "solution"))

        if section_problems and section_solutions:
            if problem_anchor["first"] and solution_anchor["first"] and problem_anchor["first"] != solution_anchor["first"]:
                reasons.append("first_anchor_mismatch")
            if problem_anchor["last"] and solution_anchor["last"] and problem_anchor["last"] != solution_anchor["last"]:
                reasons.append("last_anchor_mismatch")
            if problem_anchor["count"] != solution_anchor["count"]:
                reasons.append("count_anchor_mismatch")

        inferred_problem_sections = sum(1 for item in section_problems if item.item.get("section_inferred"))
        inferred_solution_sections = sum(1 for item in section_solutions if item.item.get("section_inferred"))
        if section_id and (
            inferred_problem_sections == len(section_problems) > 0
            or inferred_solution_sections == len(section_solutions) > 0
        ):
            reasons.append("low_ocr_confidence_on_section_header")

        validations[section_id] = SectionValidation(
            section_id=section_id,
            problem_items=section_problems,
            solution_items=section_solutions,
            problem_anchor=problem_anchor,
            solution_anchor=solution_anchor,
            status="needs_review" if reasons else "ok",
            reasons=list(dict.fromkeys(reasons)),
        )
    return validations


def _anchors_are_compatible(problem_items: list[MatchItem], solution_items: list[MatchItem]) -> bool:
    if len(problem_items) != len(solution_items):
        return False
    if not problem_items:
        return False
    problem_anchor = _anchor_for_items(problem_items)
    solution_anchor = _anchor_for_items(solution_items)
    for key in ("first", "last"):
        if problem_anchor.get(key) and solution_anchor.get(key) and problem_anchor[key] != solution_anchor[key]:
            return False
    problem_numbers = [item.problem_number for item in _ordered_items(problem_items) if item.problem_number]
    solution_numbers = [item.problem_number for item in _ordered_items(solution_items) if item.problem_number]
    if problem_numbers and solution_numbers and problem_numbers != solution_numbers:
        return False
    return True


def _relabel_solution_section(solution: MatchItem, target_section: str | None, warnings: list[str]) -> None:
    if solution.section_label == target_section:
        return
    original = solution.section_label
    solution.section_label = target_section
    solution.item["section_label"] = target_section
    solution.item["section_id"] = target_section
    solution.item["canonical_key"] = f"{target_section}-{solution.problem_number}" if target_section and solution.problem_number else None
    solution.item["section_aligned_from"] = original
    if original:
        solution.item["original_section_label"] = original
    if warnings:
        item_warnings = list(solution.item.get("matching_warnings") or [])
        for warning in warnings:
            if warning not in item_warnings:
                item_warnings.append(warning)
        solution.item["matching_warnings"] = item_warnings


def _align_solution_sections_by_anchors(problem_items: list[MatchItem], solution_items: list[MatchItem]) -> list[str]:
    """Align OCR-noisy solution section labels to problem sections when anchors agree.

    This is intentionally deterministic and conservative: section relabeling only happens
    when per-section counts and visible problem-number anchors are compatible.
    """
    warnings: list[str] = []
    problem_groups = _group_by_section(problem_items)
    solution_groups = _group_by_section(solution_items)
    problem_sections = [section for section in _section_order(problem_items) if section is not None]
    solution_sections = [section for section in _section_order(solution_items) if section is not None]

    if problem_sections and solution_sections and set(problem_sections) != set(solution_sections):
        if len(problem_sections) == len(solution_sections):
            pairs = [
                (problem_section, solution_section)
                for problem_section, solution_section in zip(problem_sections, solution_sections)
                if problem_section != solution_section
            ]
            if pairs and all(_section_label_has_anchor(left) or _section_label_has_anchor(right) for left, right in pairs) and all(
                _anchors_are_compatible(problem_groups.get(problem_section, []), solution_groups.get(solution_section, []))
                for problem_section, solution_section in zip(problem_sections, solution_sections)
            ):
                for problem_section, solution_section in pairs:
                    for solution in solution_groups.get(solution_section, []):
                        _relabel_solution_section(solution, problem_section, ["section_label_aligned"])
                warnings.append("solution_sections_aligned_by_anchor")

    problem_groups = _group_by_section(problem_items)
    solution_groups = _group_by_section(solution_items)
    problem_sections = [section for section in _section_order(problem_items) if section is not None]
    unsectioned_solutions = solution_groups.get(None, [])
    if problem_sections and unsectioned_solutions and not [section for section in _section_order(solution_items) if section is not None]:
        ordered_solutions = sorted(unsectioned_solutions, key=lambda value: (value.global_index, value.page_idx, value.local_index))
        cursor = 0
        candidate_groups: list[tuple[str, list[MatchItem], list[MatchItem]]] = []
        for problem_section in problem_sections:
            section_problems = _ordered_items(problem_groups.get(problem_section, []))
            section_solutions = ordered_solutions[cursor : cursor + len(section_problems)]
            cursor += len(section_problems)
            candidate_groups.append((problem_section, section_problems, section_solutions))
        if cursor == len(ordered_solutions) and all(_anchors_are_compatible(problems, solutions) for _section, problems, solutions in candidate_groups):
            for problem_section, _problems, section_solutions in candidate_groups:
                for solution in section_solutions:
                    _relabel_solution_section(solution, problem_section, ["section_inferred_from_problem_anchor"])
            warnings.append("unsectioned_solutions_partitioned_by_problem_sections")

    return warnings


def _assign_section_number(
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
    used_solution_ids: set[int],
) -> int:
    matched = 0
    solutions_by_key: dict[tuple[str | None, str, int], MatchItem] = {
        solution.key: solution
        for solution in solution_items
        if solution.section_label and solution.problem_number
    }
    for problem in problem_items:
        if problem.item.get("solution") is not None:
            continue
        if not problem.section_label or not problem.problem_number:
            continue
        solution = solutions_by_key.get(problem.key)
        if solution is None or id(solution.item) in used_solution_ids:
            continue
        warnings = list(solution.item.get("matching_warnings") or [])
        warnings.extend(_semantic_review_warnings(problem.item, solution.item))
        _attach(problem.item, solution.item, 0.99, bool(warnings), "section_number", warnings)
        used_solution_ids.add(id(solution.item))
        matched += 1
    return matched


def _assign_section_order(
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
    used_solution_ids: set[int],
    section_validations: dict[str | None, SectionValidation],
) -> int:
    matched = 0
    by_section_problems = _group_by_section(
        [problem for problem in problem_items if problem.item.get("solution") is None and problem.section_label]
    )
    by_section_solutions = _group_by_section(
        [solution for solution in solution_items if id(solution.item) not in used_solution_ids and solution.section_label]
    )
    for section_label, section_problems in by_section_problems.items():
        validation = section_validations.get(section_label)
        if validation is None or not validation.allow_order_matching:
            continue
        section_solutions = by_section_solutions.get(section_label, [])
        if not section_solutions:
            continue
        if len(section_problems) != len(section_solutions):
            continue
        ordered_problems = _ordered_items(section_problems)
        ordered_solutions = _ordered_items(section_solutions)
        for problem, solution in zip(ordered_problems, ordered_solutions):
            if problem.item.get("solution") is not None or id(solution.item) in used_solution_ids:
                continue
            warnings: list[str] = list(solution.item.get("matching_warnings") or [])
            warnings.extend(_semantic_review_warnings(problem.item, solution.item))
            _attach(problem.item, solution.item, 0.95, bool(warnings), "section_order", warnings)
            used_solution_ids.add(id(solution.item))
            matched += 1
    return matched


def _assign_unique_number(
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
    used_solution_ids: set[int],
) -> int:
    by_number_problems: dict[str, list[MatchItem]] = defaultdict(list)
    by_number_solutions: dict[str, list[MatchItem]] = defaultdict(list)
    for problem in problem_items:
        if problem.item.get("solution") is None and problem.problem_number:
            by_number_problems[problem.problem_number].append(problem)
    for solution in solution_items:
        if id(solution.item) not in used_solution_ids and solution.problem_number:
            by_number_solutions[solution.problem_number].append(solution)

    matched = 0
    for number, number_problems in by_number_problems.items():
        number_solutions = by_number_solutions.get(number, [])
        if len(number_problems) != 1 or len(number_solutions) != 1:
            continue
        problem = number_problems[0]
        solution = number_solutions[0]
        if not _reference_supports_pair(problem.item, solution.item):
            continue
        warnings = list(solution.item.get("matching_warnings") or [])
        if problem.section_label and solution.section_label and problem.section_label != solution.section_label:
            warnings.append("section_label_mismatch")
        warnings.extend(_semantic_review_warnings(problem.item, solution.item))
        _attach(problem.item, solution.item, 0.93, bool(warnings), "unique_number", warnings)
        used_solution_ids.add(id(solution.item))
        matched += 1
    return matched


def _assign_number_order(
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
    used_solution_ids: set[int],
) -> int:
    matched = 0
    by_number_problems: dict[str, list[MatchItem]] = defaultdict(list)
    by_number_solutions: dict[str, list[MatchItem]] = defaultdict(list)
    for problem in problem_items:
        if problem.item.get("solution") is None and problem.problem_number:
            by_number_problems[problem.problem_number].append(problem)
    for solution in solution_items:
        if id(solution.item) not in used_solution_ids and solution.problem_number:
            by_number_solutions[solution.problem_number].append(solution)

    for number, number_problems in by_number_problems.items():
        number_solutions = by_number_solutions.get(number, [])
        if not number_solutions or len(number_problems) != len(number_solutions):
            continue
        ordered_problems = sorted(number_problems, key=lambda value: (value.global_index, value.page_idx, value.local_index))
        ordered_solutions = sorted(number_solutions, key=lambda value: (value.global_index, value.page_idx, value.local_index))
        for problem, solution in zip(ordered_problems, ordered_solutions):
            if problem.item.get("solution") is not None or id(solution.item) in used_solution_ids:
                continue
            if not _reference_supports_pair(problem.item, solution.item):
                continue
            warnings = list(solution.item.get("matching_warnings") or [])
            warnings.extend(_semantic_review_warnings(problem.item, solution.item))
            _attach(problem.item, solution.item, 0.92, bool(warnings), "number_order", warnings)
            used_solution_ids.add(id(solution.item))
            matched += 1
    return matched


def _assign_global_order(
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
    used_solution_ids: set[int],
    section_validations: dict[str | None, SectionValidation],
) -> int:
    if not _allow_global_order(problem_items, solution_items, section_validations):
        return 0
    unmatched_problems = [problem for problem in problem_items if problem.item.get("solution") is None]
    unmatched_solutions = [solution for solution in solution_items if id(solution.item) not in used_solution_ids]
    if not unmatched_problems or not unmatched_solutions:
        return 0
    if len(unmatched_problems) != len(unmatched_solutions):
        return 0
    matched = 0
    for problem, solution in zip(
        sorted(unmatched_problems, key=lambda value: (value.global_index, value.page_idx, value.local_index)),
        sorted(unmatched_solutions, key=lambda value: (value.global_index, value.page_idx, value.local_index)),
    ):
        if not _reference_supports_pair(problem.item, solution.item):
            continue
        warnings = list(solution.item.get("matching_warnings") or [])
        warnings.extend(_semantic_review_warnings(problem.item, solution.item))
        _attach(problem.item, solution.item, 0.90, bool(warnings), "global_order", warnings)
        used_solution_ids.add(id(solution.item))
        matched += 1
    return matched


def _allow_global_order(
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
    section_validations: dict[str | None, SectionValidation],
) -> bool:
    if not problem_items or not solution_items or len(problem_items) != len(solution_items):
        return False
    problem_sections = {item.section_label for item in problem_items}
    solution_sections = {item.section_label for item in solution_items}
    if problem_sections == {None} and solution_sections == {None}:
        validation = section_validations.get(None)
        sequence_reasons = [reason for reason in (validation.reasons if validation else []) if reason != "section_boundary_not_detected"]
        return len(problem_items) <= _MAX_UNSECTIONED_GLOBAL_ORDER and not sequence_reasons
    if None in problem_sections or None in solution_sections:
        return False
    if problem_sections != solution_sections:
        return False
    return all(validation.status == "ok" for validation in section_validations.values())


def _semantic_assign(
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
    used_solution_ids: set[int],
    same_section_only: bool,
    method: str,
    threshold: float,
) -> int:
    if not _embedding_matching_enabled():
        threshold = max(threshold, _LEXICAL_MATCH_THRESHOLD)
    unmatched_problems = [problem for problem in problem_items if problem.item.get("solution") is None]
    unmatched_solutions = [solution for solution in solution_items if id(solution.item) not in used_solution_ids]
    if same_section_only:
        pairs_by_bucket: dict[str | None, tuple[list[MatchItem], list[MatchItem]]] = {}
        problem_groups = _group_by_section(unmatched_problems)
        solution_groups = _group_by_section(unmatched_solutions)
        for section_label, section_problems in problem_groups.items():
            section_solutions = solution_groups.get(section_label, [])
            if section_label and section_solutions:
                pairs_by_bucket[section_label] = (section_problems, section_solutions)
    else:
        pairs_by_bucket = {None: (unmatched_problems, unmatched_solutions)}

    matched = 0
    for _bucket, (bucket_problems, bucket_solutions) in pairs_by_bucket.items():
        if not bucket_problems or not bucket_solutions:
            continue
        scores = np.zeros((len(bucket_problems), len(bucket_solutions)), dtype=np.float32)
        for row, problem in enumerate(bucket_problems):
            for column, solution in enumerate(bucket_solutions):
                scores[row, column] = _score_pair(problem.item, solution.item)
        rows, columns = _linear_assignment(scores)
        for row, column in zip(rows, columns):
            score = float(scores[row, column])
            if score < threshold:
                continue
            problem = bucket_problems[int(row)]
            solution = bucket_solutions[int(column)]
            if problem.item.get("solution") is not None or id(solution.item) in used_solution_ids:
                continue
            warnings = []
            if problem.section_label != solution.section_label:
                warnings.append("semantic_cross_section")
            confidence = max(0.70, min(0.89, score))
            _attach(problem.item, solution.item, confidence, True, method, warnings)
            used_solution_ids.add(id(solution.item))
            matched += 1
    return matched


def _linear_assignment(scores: np.ndarray) -> tuple[list[int], list[int]]:
    try:
        from scipy.optimize import linear_sum_assignment

        rows, columns = linear_sum_assignment(-scores)
        return list(rows), list(columns)
    except Exception:
        return _greedy_assignment(scores)


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


def _sequence_warning_codes(items: list[MatchItem]) -> list[str]:
    warnings: list[str] = []
    by_section = _group_by_section(items)
    for section_items in by_section.values():
        numbers = [_numeric_number(item.problem_number) for item in section_items]
        numeric_numbers = [number for number in numbers if number is not None]
        if not numeric_numbers:
            continue
        counts = Counter(numeric_numbers)
        if any(count > 1 for count in counts.values()):
            warnings.append("duplicate_numbers")
        unique_sorted = sorted(counts)
        if unique_sorted:
            expected = list(range(unique_sorted[0], unique_sorted[-1] + 1))
            missing = [number for number in expected if number not in counts]
            if missing:
                warnings.append("missing_numbers")
        if numeric_numbers != sorted(numeric_numbers):
            warnings.append("reordered_numbers")
    return list(dict.fromkeys(warnings))


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
                    warnings = target["match_flags"].setdefault("warnings", [])
                    if "solution_order_inversion" not in warnings:
                        warnings.append("solution_order_inversion")
            warning_count += 1
        previous_solution_page = solution_page
        previous_problem = problem
    return warning_count


def _section_summary(section_validations: dict[str | None, SectionValidation]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for section_id, validation in sorted(section_validations.items(), key=lambda pair: pair[0] or ""):
        sections.append(
            {
                "section_id": section_id,
                "problem_count": len(validation.problem_items),
                "solution_count": len(validation.solution_items),
                "problem_anchor": validation.problem_anchor,
                "solution_anchor": validation.solution_anchor,
                "status": validation.status,
                "reason": "; ".join(validation.reasons) if validation.reasons else None,
                "reasons": validation.reasons,
            }
        )
    return sections


def _item_json(item: dict[str, Any], text_key: str) -> dict[str, Any]:
    return {
        "section_id": item.get("section_id"),
        "problem_no": item.get("problem_no") or _canonical_number(item.get("problem_number")),
        "global_index": item.get("global_index"),
        "page_start": int(item.get("page_index", item.get("page_idx", 0)) or 0) + 1,
        "page_end": int(item.get("page_end", item.get("page_index", item.get("page_idx", 0))) or 0) + 1,
        "text": _text(item.get(text_key)),
        "image_refs": [value for value in (item.get("visual_url"), item.get("review_page_image_url")) if value],
    }


def _build_match_json(problems: list[dict[str, Any]]) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for problem in problems:
        flags = problem.get("match_flags") or {}
        solution = problem.get("solution")
        problem_key = problem.get("canonical_key") or f"{problem.get('section_id')}-{problem.get('problem_no')}"
        payload.append(
            {
                "match_id": problem_key,
                "problem": _item_json(problem, "problem_text"),
                "solution": _item_json(solution, "solution_steps") if solution else None,
                "match_method": flags.get("matched_via", "unmatched"),
                "confidence": problem.get("match_confidence", 0.0),
                "warnings": flags.get("warnings", []),
            }
        )
    return payload


def _matches_by_section(
    match_json: list[dict[str, Any]],
    solution_items: list[MatchItem],
    used_solution_ids: set[int],
    section_validations: dict[str | None, SectionValidation],
) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}

    def bucket_for(section_id: Any) -> dict[str, Any]:
        normalized = section_id or "UNSECTIONED"
        return grouped.setdefault(
            str(normalized),
            {
                "section_id": None if normalized == "UNSECTIONED" else normalized,
                "status": "ok",
                "safe_matches": [],
                "unmatched_problems": [],
                "unmatched_solutions": [],
            },
        )

    for match in match_json:
        problem = match.get("problem") or {}
        solution = match.get("solution") or {}
        section_id = problem.get("section_id") or solution.get("section_id") or "UNSECTIONED"
        bucket = bucket_for(section_id)
        warnings = match.get("warnings") or []
        if warnings:
            bucket["status"] = "needs_review"
        if match.get("solution") is None:
            bucket["unmatched_problems"].append(problem)
        else:
            bucket["safe_matches"].append(match)
    for solution in solution_items:
        if id(solution.item) in used_solution_ids:
            continue
        bucket = bucket_for(solution.section_label)
        bucket["status"] = "needs_review"
        bucket["unmatched_solutions"].append(_item_json(solution.item, "solution_steps"))
    for section_id, validation in section_validations.items():
        bucket = bucket_for(section_id)
        if validation.status != "ok":
            bucket["status"] = "needs_review"
            bucket["reason"] = "; ".join(validation.reasons)
            bucket["reasons"] = validation.reasons
    return grouped


def _build_summary(
    problems: list[dict[str, Any]],
    problem_items: list[MatchItem],
    solution_items: list[MatchItem],
    section_validations: dict[str | None, SectionValidation],
    extra_warnings: list[str] | None = None,
) -> dict[str, Any]:
    matched = [problem for problem in problems if problem.get("solution") is not None]
    used_solution_ids = {id(problem["solution"]) for problem in matched if problem.get("solution") is not None}
    summary = {
        "problem_count": len(problem_items),
        "solution_count": len(solution_items),
        "matched_count": len(matched),
        "unmatched_problems": [
            problem.get("canonical_key") or problem.get("global_index")
            for problem in problems
            if problem.get("solution") is None
        ],
        "unmatched_solutions": [
            solution.item.get("canonical_key") or solution.item.get("global_index")
            for solution in solution_items
            if id(solution.item) not in used_solution_ids
        ],
        "sections": _section_summary(section_validations),
        "warnings": [],
    }
    if len(problem_items) != len(solution_items):
        summary["warnings"].append("count_mismatch")
    summary["warnings"].extend(extra_warnings or [])
    summary["warnings"].extend(f"problem_{code}" for code in _sequence_warning_codes(problem_items))
    summary["warnings"].extend(f"solution_{code}" for code in _sequence_warning_codes(solution_items))
    summary["warnings"] = list(dict.fromkeys(summary["warnings"]))
    return summary


def _print_stats(
    problems: list[dict[str, Any]],
    method_counts: dict[str, int],
    inversion_count: int,
    summary: dict[str, Any],
) -> None:
    total = len(problems)
    matched = [problem for problem in problems if problem.get("solution") is not None]
    high = sum(1 for problem in problems if float(problem.get("match_confidence") or 0.0) >= 0.9)
    medium = sum(1 for problem in problems if 0.7 <= float(problem.get("match_confidence") or 0.0) < 0.9)
    low = sum(1 for problem in problems if float(problem.get("match_confidence") or 0.0) < 0.7)
    method_text = ", ".join(f"{key}={value}" for key, value in sorted(method_counts.items()))
    print(
        "[matcher] "
        f"total_problems={total}, total_solutions={summary['solution_count']}, "
        f"matched={len(matched)}, unmatched={total - len(matched)}, "
        f"confidence_high={high}, confidence_mid={medium}, confidence_low={low}, "
        f"{method_text}, inversion_warnings={inversion_count}, "
        f"summary_warnings={summary['warnings']}",
        flush=True,
    )


def match_with_summary(problems: list[dict[str, Any]], solutions: list[dict[str, Any]]) -> dict[str, Any]:
    problem_items = _annotate_occurrences(problems)
    solution_items = _annotate_occurrences(solutions)
    alignment_warnings = _align_solution_sections_by_anchors(problem_items, solution_items)
    section_validations = _build_section_validations(problem_items, solution_items)
    used_solution_ids: set[int] = set()
    method_counts: dict[str, int] = {}

    method_counts["section_number"] = _assign_section_number(problem_items, solution_items, used_solution_ids)
    method_counts["section_order"] = _assign_section_order(problem_items, solution_items, used_solution_ids, section_validations)
    method_counts["number_order"] = 0
    method_counts["global_order"] = _assign_global_order(problem_items, solution_items, used_solution_ids, section_validations)
    method_counts["unique_number"] = _assign_unique_number(problem_items, solution_items, used_solution_ids)
    method_counts["semantic_section"] = _semantic_assign(
        problem_items,
        solution_items,
        used_solution_ids,
        same_section_only=True,
        method="semantic_section",
        threshold=0.60,
    )
    method_counts["semantic_global"] = 0

    for problem in problem_items:
        if problem.item.get("solution") is None:
            _attach(problem.item, None, 0.0, True, "unmatched", ["unmatched_solution"])

    inversion_count = _apply_inversion_warnings(problems)
    summary = _build_summary(problems, problem_items, solution_items, section_validations, alignment_warnings)
    if not _allow_global_order(problem_items, solution_items, section_validations):
        summary["warnings"].append("global_order_disabled")
        summary["warnings"] = list(dict.fromkeys(summary["warnings"]))
    matches = _build_match_json(problems)
    matches_by_section = _matches_by_section(matches, solution_items, used_solution_ids, section_validations)
    validation_report = {
        "sections": summary["sections"],
        "global_order_allowed": _allow_global_order(problem_items, solution_items, section_validations),
        "method_counts": method_counts,
        "warnings": summary["warnings"],
    }
    _print_stats(problems, method_counts, inversion_count, summary)
    return {
        "matches": matches,
        "matches_by_section": matches_by_section,
        "validation_report": validation_report,
        "summary": summary,
        "problems": problems,
    }


def match(problems: list[dict[str, Any]], solutions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return match_with_summary(problems, solutions)["problems"]
