import base64
import io
import json
import math
import os
import re
import threading
import time
import traceback
import unicodedata
from collections import defaultdict
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import fitz
from openai import OpenAI, RateLimitError
from PIL import Image, ImageChops
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from database import SessionLocal, get_settings
from models import Batch, BatchStatus, KoreanExtractionDocument, KoreanPassageGroup, KoreanQuestion, Problem, Tag
from services.english_extraction import (
    ENGLISH_EXTRACTION_PROMPT,
    ENGLISH_SOLUTION_PROMPT,
    merge_english_page_payloads,
    normalize_english_page_payload,
)
from services.korean_extraction import (
    KOREAN_EXTRACTION_PROMPT,
    KOREAN_SOLUTION_PROMPT,
    map_korean_answers,
    merge_korean_page_payloads,
    missing_passage_range_questions,
    normalize_korean_page_payload,
)
from services.matcher import match_with_summary
from services.math_normalization import normalize_geometry_notation
from services.storage import save_visual_bytes
from services.subject_engines import ENGLISH_ENGINE, KOREAN_ENGINE, is_language_passage_engine, language_engine_label, normalize_subject_engine


_ai_request_lock = threading.Lock()
_last_ai_request_at_by_model: dict[str, float] = {}


EXTRACTION_PROMPT = r"""You are extracting standalone student exercises from a Korean textbook or exam page.

First decide whether this page contains any standalone problems that a student is expected to solve.
Extract valid problems even when the same page also contains concept notes, formulas, hints, examples, answer choices, or short commentary.
Return [] only when the page has no independent student task at all, or when it is purely a table of contents, cover, index, answer key, solution page, or teacher-facing explanation.

Extract items that have a clear problem number/label and a question/instruction for the student to solve.
Do not extract standalone definitions, formulas, or commentary paragraphs as separate problems, but do not let them block extraction of nearby problems.

For each problem return a JSON object with:
{
  "problem_number": <integer>,
  "problem_text": "<question stem only in Korean, absolutely no answer choices>",
  "choices": [
    {"label": "①", "text": "<visible answer choice text only>"}
  ],
  "has_visual": <true if figure/diagram/table/graph present, else false>,
  "problem_bbox": {"x1": <0-1>, "y1": <0-1>, "x2": <0-1>, "y2": <0-1>},
  "visual_bbox": {"x1": <0-1>, "y1": <0-1>, "x2": <0-1>, "y2": <0-1>} or null,
  "is_exercise": <true only for standalone unsolved exercises>,
  "skip_reason": null,
  "subject": <subject label or null>,
  "unit": <unit label or null>,
  "section_label": <visible section/day/chapter/unit marker such as "DAY 01", "Chapter 1", "Unit 03", "유형 01", or null>
}
Return a JSON array of all problems found on this page.
If there are no valid standalone exercises, return [].
Include all condition text that belongs to the problem, even when it is inside a bordered box, shaded callout, rounded rectangle, table-like condition block, or region labeled (가), (나), ㄱ, ㄴ, etc. A text-only box is part of problem_text, not a separate visual asset. Preserve its labels, order, and line breaks.
problem_bbox must tightly enclose the entire target problem on this page, including its number, stem, choices, and any attached figure, using normalized page coordinates from 0.0 to 1.0.
visual_bbox must tightly enclose only the non-text figure, graph, diagram, table, or image that belongs to this exact problem, using normalized page coordinates from 0.0 to 1.0. If there are multiple visual pieces for the same problem, return one tight union box. Do not include neighboring problems, answer choices, problem text, or text-only condition boxes in visual_bbox. Use null when there is no real visual asset.
For the math engine, remove answer choices from problem_text but preserve visible choices in choices[] so answer keys can be resolved to concrete choice text.
Convert every mathematical expression, function, interval, limit, summation, fraction, root, exponent, coordinate, and equation into LaTeX.
When the source image visibly draws a geometric symbol over letters, encode only that drawn symbol as LaTeX, for example an overbar over BC as $\overline{BC}$. Do not infer symbols from ordinary Korean words such as 선분 BC, 변 BC, 직선 BC, 반직선 BC, or 호 BC; preserve those words as plain text unless the symbol itself is drawn.
Use inline LaTeX delimiters like $f(x)=x^2$ inside Korean sentences.
Use display LaTeX delimiters like $$\lim_{x \to 0} f(x)$$ for standalone formulas.
Always use display LaTeX delimiters like $$\sum_{k=1}^{n} a_k$$ for any sigma/summation expression containing \sum, \Sigma, or ∑; never write those expressions as inline $...$ math.
Do not leave plain-text math such as x^2, f'(x), lim x->1, or a/b when it should be LaTeX.
Use the standard Korean math terms 최댓값 and 최솟값; do not rewrite them as 최대값 or 최소값.
Detect structural markers before extracting problem text. section_label must come only from visible page headers, footers, section titles, day/chapter/unit/exam-round labels such as "제1회", "1회", "DAY 01", or equivalent source text. Do not invent it. Do not use a book title such as "Single Connection/싱글 커넥션" or a subject-only label such as "수학Ⅰ/수1" as section_label.
Return raw JSON only, no markdown, no explanation."""


RESCUE_EXTRACTION_PROMPT = r"""You are re-checking a page that may have been missed during exercise extraction.

Extract every visible standalone student exercise from this single page.
Use a more inclusive rule than the first pass:
- Extract numbered problems even when the page also contains answer choices, short hints, or a small amount of adjacent commentary.
- Do not skip a page merely because it has a diagram, table, graph, or dense math.
- Still return [] for pure solution pages, answer keys, concept explanations, table of contents, covers, indexes, or pages with no independent student question.

For each problem return a JSON object with:
{
  "problem_number": <integer>,
  "problem_text": "<question stem only in Korean, no answer choices>",
  "choices": [
    {"label": "①", "text": "<visible answer choice text only>"}
  ],
  "has_visual": <true if figure/diagram/table/graph present, else false>,
  "problem_bbox": {"x1": <0-1>, "y1": <0-1>, "x2": <0-1>, "y2": <0-1>},
  "visual_bbox": {"x1": <0-1>, "y1": <0-1>, "x2": <0-1>, "y2": <0-1>} or null,
  "is_exercise": <true only for standalone exercises>,
  "skip_reason": null,
  "subject": <subject label or null>,
  "unit": <unit label or null>,
  "section_label": <visible section/day/chapter/unit marker such as "DAY 01", "Chapter 1", "Unit 03", "유형 01", or null>
}

Include all condition text that belongs to the problem, even when it is inside a bordered box, shaded callout, rounded rectangle, table-like condition block, or region labeled (가), (나), ㄱ, ㄴ, etc. A text-only box is part of problem_text, not a separate visual asset. Preserve its labels, order, and line breaks.
problem_bbox must tightly enclose the entire target problem on this page, including its number, stem, choices, and any attached figure, using normalized page coordinates from 0.0 to 1.0.
visual_bbox must tightly enclose only the non-text figure, graph, diagram, table, or image that belongs to this exact problem, using normalized page coordinates from 0.0 to 1.0. If there are multiple visual pieces for the same problem, return one tight union box. Do not include neighboring problems, answer choices, problem text, or text-only condition boxes in visual_bbox. Use null when there is no real visual asset.
For the math engine, remove answer choices from problem_text but preserve visible choices in choices[] so answer keys can be resolved to concrete choice text.
Convert mathematical expressions into LaTeX.
Always use display LaTeX delimiters like $$\sum_{k=1}^{n} a_k$$ for any sigma/summation expression containing \sum, \Sigma, or ∑; never write those expressions as inline $...$ math.
Use the standard Korean math terms 최댓값 and 최솟값; do not rewrite them as 최대값 or 최소값.
Detect structural markers before extracting problem text. section_label must come only from visible page headers, footers, section titles, day/chapter/unit/exam-round labels such as "제1회", "1회", "DAY 01", or equivalent source text. Do not invent it. Do not use a book title such as "Single Connection/싱글 커넥션" or a subject-only label such as "수학Ⅰ/수1" as section_label.
When the source image visibly draws a geometric symbol over letters, encode only that drawn symbol as LaTeX, for example an overbar over BC as $\overline{BC}$. Do not infer symbols from ordinary Korean words such as 선분 BC, 변 BC, 직선 BC, 반직선 BC, or 호 BC; preserve those words as plain text unless the symbol itself is drawn.
Return raw JSON array only, no markdown, no explanation."""


def _clean_text_candidates(values: Any, max_items: int = 80) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        cleaned.append(text)
        seen.add(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _candidate_instruction(label: str, values: list[str]) -> str:
    if not values:
        return f"- {label}: no candidate list was provided; return null unless it is explicitly clear from the page."
    options = ", ".join(json.dumps(value, ensure_ascii=False) for value in values)
    return f"- {label}: choose exactly one of [{options}] when the page gives enough evidence; otherwise return null. Do not invent labels outside this list."


def has_solution_content(solution: dict[str, Any] | None) -> bool:
    if not solution:
        return False
    return bool(str(solution.get("answer") or "").strip())


STRUCTURAL_SECTION_RE = re.compile(
    r"\b(?:DAY|CHAPTER|UNIT|LESSON|TYPE|ROUND)\s*\d{1,3}\b|(?:단원|유형|회차)\s*\d{1,3}|(?:제\s*)?\d{1,3}\s*회(?:차)?|[/＞>›]",
    re.IGNORECASE,
)
SECTION_ID_PATTERNS = (
    (re.compile(r"\bDAY\s*0*(\d{1,3})\b", re.IGNORECASE), "DAY"),
    (re.compile(r"\bCH(?:APTER)?\s*0*(\d{1,3})\b", re.IGNORECASE), "CHAPTER"),
    (re.compile(r"\bUNIT\s*0*(\d{1,3})\b", re.IGNORECASE), "UNIT"),
    (re.compile(r"\bLESSON\s*0*(\d{1,3})\b", re.IGNORECASE), "LESSON"),
    (re.compile(r"\bTYPE\s*0*(\d{1,3})\b", re.IGNORECASE), "TYPE"),
    (re.compile(r"\bROUND\s*0*(\d{1,3})\b", re.IGNORECASE), "회차"),
    (re.compile(r"회차\s*0*(\d{1,3})", re.IGNORECASE), "회차"),
    (re.compile(r"(?:제\s*)?0*(\d{1,3})\s*회(?:차)?", re.IGNORECASE), "회차"),
    (re.compile(r"(단원|유형)\s*0*(\d{1,3})", re.IGNORECASE), None),
)
SOURCE_TITLE_RE = re.compile(r"(?:single\s*connection|singleconnection|싱글\s*커넥션)", re.IGNORECASE)
MATH_SUBJECT_ONLY_RE = re.compile(
    r"^(?:수학\s*[ⅠⅡⅢIVX0-9]+|수\s*[12ⅠⅡ]|수[12]|미적분?|확률과\s*통계|확통|기하|공통수학\s*[12]?)$",
    re.IGNORECASE,
)
MATH_CURRICULUM_UNIT_RE = re.compile(
    r"(?:지수|로그|삼각|수열|극한|연속|미분|적분|도함수|다항식|방정식|부등식|함수|확률|통계|경우의\s*수|도형|벡터|행렬)",
    re.IGNORECASE,
)


def _normalized_label_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _is_source_or_subject_label(value: Any) -> bool:
    text = _normalized_label_text(value)
    if not text:
        return False
    if SOURCE_TITLE_RE.search(text):
        return True
    normalized = unicodedata.normalize("NFKC", text)
    compact = re.sub(r"[\s/_>\-]+", "", normalized)
    return bool(MATH_SUBJECT_ONLY_RE.fullmatch(text) or MATH_SUBJECT_ONLY_RE.fullmatch(normalized) or MATH_SUBJECT_ONLY_RE.fullmatch(compact))


def _is_curriculum_unit_label(value: Any) -> bool:
    text = _normalized_label_text(value)
    return bool(text and not _is_source_or_subject_label(text) and MATH_CURRICULUM_UNIT_RE.search(text))


def _is_structural_section_label(value: Any) -> bool:
    text = _normalized_label_text(value)
    if _is_source_or_subject_label(text):
        return False
    return bool(text and STRUCTURAL_SECTION_RE.search(text))


def _normalize_section_id(value: Any) -> str | None:
    text = _normalized_label_text(value)
    if not text:
        return None
    normalized = text.replace("＞", ">")
    for pattern, label in SECTION_ID_PATTERNS:
        match = pattern.search(normalized)
        if not match:
            continue
        if label:
            return f"{label} {int(match.group(1)):02d}"
        return f"{match.group(1)} {int(match.group(2)):02d}"
    normalized = re.sub(r"\s*[/>\-]\s*", " / ", normalized)
    return normalized


def _usable_section_id(value: Any, *, allow_plain_title: bool = False) -> str | None:
    section_id = _normalize_section_id(value)
    if not section_id or _is_source_or_subject_label(section_id):
        return None
    if _is_structural_section_label(section_id):
        return section_id
    if "/" in section_id:
        unit_part = section_id.split("/")[-1].strip()
        if _is_curriculum_unit_label(unit_part):
            return section_id
    if allow_plain_title and _is_curriculum_unit_label(section_id):
        return section_id
    return None


def _clean_unit_label(value: Any) -> str | None:
    text = _normalized_label_text(value)
    if not text or _is_source_or_subject_label(text):
        return None
    if _is_structural_section_label(text):
        return None
    return text


def _tag_unit_label(section_label: Any, unit: Any) -> str | None:
    section = _usable_section_id(section_label, allow_plain_title=True)
    if section:
        return section
    return _clean_unit_label(unit)


def _section_ranges_are_usable(sections: list[dict[str, Any]]) -> bool:
    for section in sections:
        section_id = str(section.get("section_id") or "").strip()
        if not section_id or section_id == "UNSECTIONED":
            continue
        if not _usable_section_id(section_id, allow_plain_title=True):
            return False
    return True


def _problem_match_payload(problem: Problem) -> dict[str, Any]:
    tags = problem.tags
    unit = _clean_unit_label(tags.unit if tags else None)
    section_label = _usable_section_id(tags.unit if tags else None, allow_plain_title=True)
    review_page_number = problem.review_page_number
    page_index = max(int(review_page_number or 1) - 1, 0)
    return {
        "_problem_id": str(problem.id),
        "problem_number": problem.problem_number,
        "problem_no": str(problem.problem_number),
        "problem_text": problem.problem_text,
        "choices": problem.choices or [],
        "unit": unit,
        "section_label": section_label,
        "subject": tags.subject if tags else None,
        "page_index": page_index,
    }


def apply_solutions_to_existing_problems(
    db: Session,
    batch: Batch,
    solutions: list[dict[str, Any]],
    problem_sections: list[dict[str, Any]] | None = None,
    solution_sections: list[dict[str, Any]] | None = None,
    page_metadata: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    problems = (
        db.query(Problem)
        .filter(Problem.source_batch_id == batch.id, Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags))
        .order_by(
            Problem.review_page_number.is_(None).asc(),
            Problem.review_page_number.asc(),
            Problem.problem_number.asc(),
            Problem.created_at.asc(),
            Problem.id.asc(),
        )
        .all()
    )
    problem_payloads = [_problem_match_payload(problem) for problem in problems]
    for global_index, payload in enumerate(problem_payloads, start=1):
        payload["global_index"] = global_index
        payload["local_index"] = global_index
    if problem_sections:
        _apply_section_ranges_to_items(problem_payloads, problem_sections, "page_index")
        problem_payloads = _apply_structure_indexes(problem_payloads, page_key="page_index")
    matching_result = match_with_summary(problem_payloads, solutions)
    structure_report = build_structure_validation_report(
        page_metadata or [],
        problem_sections or [],
        solution_sections or [],
        problem_payloads,
        solutions,
    )
    _mark_section_validation_warnings(problem_payloads, structure_report)
    matched_payloads = matching_result["problems"]
    _write_batch_artifact(batch.id, "extracted_problems_by_section.json", _items_by_section(problem_payloads, "page_index"))
    _write_batch_artifact(batch.id, "extracted_solutions_by_section.json", _items_by_section(solutions, "page_idx"))
    _write_batch_artifact(batch.id, "matches_by_section.json", matching_result.get("matches_by_section", {}))
    _write_batch_artifact(batch.id, "structure_validation_report.json", structure_report)
    _write_batch_artifact(batch.id, "validation_report.json", _validation_with_structure(matching_result, structure_report))
    matched_by_id = {str(item.get("_problem_id")): item for item in matched_payloads}
    matched_count = 0
    unmatched_count = 0
    cleared_stale_count = 0
    now = datetime.utcnow()
    for problem in problems:
        matched = matched_by_id.get(str(problem.id)) or {}
        solution = matched.get("solution")
        if has_solution_content(solution):
            problem.answer = answer_for_subject(solution.get("answer"), problem.choices, batch.subject_engine)
            problem.solution_steps = None
            problem.key_concept = None
            problem.needs_review = True
            matched_count += 1
        else:
            had_previous_solution = has_solution_content(
                {
                    "answer": problem.answer,
                    "solution_steps": problem.solution_steps,
                    "key_concept": problem.key_concept,
                }
            )
            problem.answer = None
            problem.solution_steps = None
            problem.key_concept = None
            problem.needs_review = True
            unmatched_count += 1
            if had_previous_solution:
                cleared_stale_count += 1
        problem.updated_at = now
    return {
        "problem_count": len(problems),
        "solution_count": len(solutions),
        "matched_count": matched_count,
        "unmatched_count": unmatched_count,
        "cleared_stale_count": cleared_stale_count,
        "matching_summary": matching_result.get("summary", {}),
    }


def build_extraction_prompt(subject_candidates: list[str] | None = None, unit_candidates: list[str] | None = None) -> str:
    subjects = _clean_text_candidates(subject_candidates, max_items=24)
    units = [unit for unit in _clean_text_candidates(unit_candidates, max_items=80) if _clean_unit_label(unit)]
    return (
        EXTRACTION_PROMPT
        + "\n\nClassify each extracted problem while extracting it.\n"
        + "A single PDF can contain multiple subjects, so classify per problem, not per file.\n"
        + _candidate_instruction("subject", subjects)
        + "\n"
        + _candidate_instruction("unit", units)
        + "\nIf the selected subjects include multiple courses such as 수학Ⅰ and 수학Ⅱ, use the visible concept, title, page context, and problem content to choose the best subject for each problem."
        + "\nDo not classify source/book titles such as Single Connection/싱글 커넥션 or subject-only labels such as 수학Ⅰ/수1 as units."
    )

SOLUTION_PROMPT = r"""You are extracting answer metadata from a Korean exam answer or solution booklet.
For each problem on this page return:
{
  "problem_number": "<problem number exactly as written in the source>",
  "answer": "<final answer>",
  "solution_steps": null,
  "key_concept": null,
  "section_label": "<section/unit/exam label from page header/footer or unit title only, or null>",
  "page_idx": <0-based solution PDF page index supplied by the system>,
  "referenced_problem_snippet": "<30-120 chars of explicitly quoted problem text from the solution, or null>",
  "solution_first_line": "<first line of the solution explanation>"
}
For math, if the answer is given as a choice number or symbol, resolve it to the actual choice value when visible. If only the choice marker is visible, return that marker so the matcher can resolve it from the stored choices.
For Korean Language and English, keep objective answers as the visible choice label or number.
problem_number must always be a string. Preserve original labels such as "1", "1-1", "23-(가)", or "[보기 5]".
referenced_problem_snippet must contain only problem text explicitly quoted in the solution. Do not guess. If none is quoted, set it to null.
section_label must come only from page headers, footers, visible section titles, unit names, exam round labels such as "제1회", "1회", "DAY 01", or equivalent source text. Do not invent it. Do not use a book title such as "Single Connection/싱글 커넥션" or a subject-only label such as "수학Ⅰ/수1" as section_label.
Before extracting content, identify the section/day/chapter structure and solution headers such as "01 정답", "문제 01 해설", or "1번 해설". For two-column pages, read the left column top-to-bottom first, then the right column top-to-bottom, unless the page clearly shows another reading order.
Do not transcribe, summarize, or return explanations. Keep solution_steps and key_concept null.
Convert every mathematical expression in answer into LaTeX.
Use inline LaTeX delimiters like $x=2$ inside Korean sentences.
Use display LaTeX delimiters like $$\int_0^1 f(x)\,dx$$ for standalone formulas.
Always use display LaTeX delimiters like $$\sum_{k=1}^{n} a_k$$ for any sigma/summation expression containing \sum, \Sigma, or ∑; never write those expressions as inline $...$ math.
Do not leave plain-text math such as x^2, f'(x), lim x->1, or a/b when it should be LaTeX.
Return raw JSON array only."""

SOLUTION_TRANSCRIPTION_PROMPT = r"""You are extracting answer metadata from a Korean exam answer or solution booklet page.
Your highest priority is final answer accuracy and problem-number matching.

Identify every answer visible on this page.
For each problem return:
{
  "problem_number": "<problem number exactly as written in the source>",
  "answer": "<final answer>",
  "solution_steps": null,
  "key_concept": null,
  "section_label": "<section/unit/exam label from page header/footer or unit title only, or null>",
  "page_idx": <0-based solution PDF page index supplied by the system>,
  "referenced_problem_snippet": "<30-120 chars of explicitly quoted problem text from the solution, or null>",
  "solution_first_line": "<first line of the solution explanation>"
}

Rules for explanations:
- Do not transcribe, summarize, or return explanations.
- Keep solution_steps and key_concept null even when a full explanation is visible.

Rules for answer:
- For math, if the answer is given as a choice number or symbol, resolve it to the actual choice value when visible. If only the choice marker is visible, return that marker so the matcher can resolve it from the stored choices.
- For Korean Language and English, keep objective answers as the visible choice label or number.
- If the answer cannot be found, set answer to null.
- Convert mathematical expressions in answer into LaTeX.

Rules for matching metadata:
- problem_number must always be a string. Preserve original labels such as "1", "1-1", "23-(가)", or "[보기 5]".
- referenced_problem_snippet must contain only problem text explicitly quoted in the solution. Do not guess. If none is quoted, set it to null.
- section_label must come only from page headers, footers, visible section titles, unit names, exam round labels such as "제1회", "1회", "DAY 01", or equivalent source text. Do not invent it. Do not use a book title such as "Single Connection/싱글 커넥션" or a subject-only label such as "수학Ⅰ/수1" as section_label.
- Before extracting content, identify the section/day/chapter structure and solution headers such as "01 정답", "문제 01 해설", or "1번 해설". For two-column pages, read the left column top-to-bottom first, then the right column top-to-bottom, unless the page clearly shows another reading order.
- page_idx must be the exact 0-based solution PDF page index supplied by the system.
- solution_first_line must be the first visible sentence or line of the solution explanation.

Return raw JSON array only. No markdown. No explanation outside JSON."""

SOLUTION_FAST_PROMPT = r"""You are extracting answer metadata from a Korean exam answer or solution page.

Identify every answer visible on this page.
For each problem return:
{
  "problem_number": "<problem number exactly as written in the source>",
  "answer": "<final answer>",
  "solution_steps": null,
  "key_concept": null,
  "section_label": "<section/unit/exam label from page header/footer or unit title only, or null>",
  "page_idx": <0-based solution PDF page index supplied by the system>,
  "referenced_problem_snippet": "<30-120 chars of explicitly quoted problem text from the solution, or null>",
  "solution_first_line": "<first line of the solution explanation>"
}

Rules:
- Prioritize final answers and problem-number matching.
- Do not transcribe, summarize, or return explanation text.
- Keep solution_steps and key_concept null.
- Convert mathematical expressions in answer into LaTeX.
- Always use display LaTeX delimiters like $$\sum_{k=1}^{n} a_k$$ for any sigma/summation expression containing \sum, \Sigma, or ∑; never write those expressions as inline $...$ math.
- For math, if the answer is given as a choice number or symbol, resolve it to the actual choice value when visible. If only the choice marker is visible, return that marker so the matcher can resolve it from the stored choices.
- For Korean Language and English, keep objective answers as the visible choice label or number.
- If the answer cannot be found, set answer to null.
- problem_number must always be a string. Preserve original labels such as "1", "1-1", "23-(가)", or "[보기 5]".
- referenced_problem_snippet must contain only problem text explicitly quoted in the solution. Do not guess. If none is quoted, set it to null.
- section_label must come only from page headers, footers, visible section titles, unit names, exam round labels such as "제1회", "1회", "DAY 01", or equivalent source text. Do not invent it. Do not use a book title such as "Single Connection/싱글 커넥션" or a subject-only label such as "수학Ⅰ/수1" as section_label.
- Before extracting content, identify the section/day/chapter structure and solution headers such as "01 정답", "문제 01 해설", or "1번 해설". For two-column pages, read the left column top-to-bottom first, then the right column top-to-bottom, unless the page clearly shows another reading order.
- page_idx must be the exact 0-based solution PDF page index supplied by the system.

Return raw JSON array only. No markdown. No explanation outside JSON."""

QUICK_ANSWER_TABLE_SCAN_PROMPT = r"""You are classifying one page from an answer or solution PDF.

Decide whether this page is a compact quick answer key/table/list page.

Return exactly one JSON object inside a JSON array:
[
  {
    "is_quick_answer_table": true,
    "confidence": 0.0,
    "answer_count_estimate": 0,
    "first_problem_number": "<first visible problem/question number, or null>",
    "last_problem_number": "<last visible problem/question number, or null>",
    "section_labels": ["<visible section/day/unit/round labels, if any>"],
    "has_explanations": false,
    "reason": "<short reason>"
  }
]

Classify true only when the page is primarily a dense final-answer key: for example pages titled 빠른 정답, 빠른 답, 정답표, 답안표, 정답만 모아보기, answer key, quick answers, or a continuation page that is mostly problem-number/final-answer pairs.
Classify false for ordinary solution/explanation pages, even when each explanation starts with a final answer.
has_explanations must be true when the page contains paragraphs of solution reasoning, derivations, or worked explanations.
answer_count_estimate should count visible problem-number/final-answer pairs only.
Use 0-based page_idx only in the prompt context; do not include page_idx in the returned object.
Return raw JSON array only. No markdown. No explanation outside JSON."""

QUICK_ANSWER_TABLE_EXTRACTION_PROMPT = r"""You are extracting final answers from a compact quick answer key/table/list page.

If this page is not primarily a quick final-answer key, return [].

For every visible answer pair return:
{
  "problem_number": "<problem or question number exactly as written>",
  "answer": "<final answer>",
  "solution_steps": null,
  "key_concept": null,
  "section_label": "<visible section/unit/day/round label from the table header or nearby header, or null>",
  "page_idx": <0-based solution PDF page index supplied by the system>,
  "referenced_problem_snippet": null,
  "solution_first_line": null
}

Rules:
- Extract only final answers. Do not transcribe explanations, notes, or 풀이 text.
- Keep solution_steps, key_concept, referenced_problem_snippet, and solution_first_line null.
- For math, if an objective answer is shown only as a choice number or symbol, return that marker so the matcher can resolve it from the stored choices. If the actual choice value is visible, return the actual value.
- For Korean Language and English, keep objective answers as the visible choice label or number.
- Convert mathematical expressions in answer into LaTeX.
- Preserve original problem labels such as "1", "1-1", "23-(가)", or "[보기 5]".
- Read table/list order top-to-bottom and left-to-right unless the page clearly shows another order.
- page_idx must be the exact 0-based solution PDF page index supplied by the system.

Return raw JSON array only. No markdown. No explanation outside JSON."""

PAGE_STRUCTURE_PROMPT = r"""You are reading one page from a Korean problem book or solution book.
Extract page-level structure metadata only. Do not extract full problems or full solutions.

Return exactly one JSON object inside a JSON array:
[
  {
    "page_number": <1-based page number supplied by the system>,
    "detected_section_ids": ["DAY 03", "UNIT 02", "..."],
    "detected_subjects": ["수학Ⅰ", "수학Ⅱ", "..."],
    "detected_units": ["지수함수와 로그함수", "수열", "..."],
    "toc_entries": [
      {"section_id": "DAY 01", "subject": null, "unit": null, "page_number": 12, "problem_number_start": "01", "problem_number_end": "10", "problem_count": 10},
      {"section_id": "수학Ⅰ / 지수함수와 로그함수", "subject": "수학Ⅰ", "unit": "지수함수와 로그함수", "page_number": 24, "problem_number_start": null, "problem_number_end": null, "problem_count": null}
    ],
    "section_pattern": "subject_unit" | "day" | "round" | "mixed" | "unknown",
    "detected_problem_headers": ["01", "02"],
    "detected_solution_headers": ["01", "02"],
    "page_type": "problem_page" | "solution_page" | "toc" | "cover" | "log" | "blank" | "unknown",
    "layout": "single_column" | "two_column" | "unknown",
    "section_confidence": <0.0 to 1.0>
  }
]

Rules:
- Only report metadata visible on this page.
- If this page is a table of contents / 목차 / 차례, set page_type to "toc" and extract toc_entries.
- Common structures are:
  1. subject + unit sections, e.g. "수학Ⅰ / 지수함수와 로그함수", "수학Ⅱ / 수열".
  2. DAY-based sections, e.g. "DAY 1", "Day 02", "DAY 03".
  3. exam-round / 회차 sections, e.g. "제1회", "1회", "01회", "실전 모의고사 2회".
- Normalize DAY labels to "DAY 01", "DAY 02", etc.
- Normalize exam-round labels to "회차 01", "회차 02", etc.
- detected_section_ids must come from explicit section/day/unit/chapter/exam labels only. Do not invent missing section IDs.
- For subject + unit pages, detected_section_ids should prefer "subject / unit" when both are visible.
- For 회차형 books, detected_section_ids must prefer the visible 회차 label over subject/book-title text.
- Treat "Single Connection", "singleconnection", "싱글 커넥션", and similar book/source titles as source titles, not units and not section IDs.
- Treat "수학Ⅰ", "수1", "수학 1", "수학Ⅱ", "수2" as subjects only unless a real curriculum unit or 회차 label is also visible.
- detected_problem_headers should contain problem numbers that start problem statements.
- detected_solution_headers should contain problem numbers that start answers or solutions.
- toc_entries.page_number should be the printed page number or visible destination page number in the table of contents. If no page number is visible, use null.
- If a table of contents row shows a problem range/count for a section, fill problem_number_start, problem_number_end, and problem_count. If not visible, use null.
- For two-column solution pages, set layout to "two_column".
- Return raw JSON only."""

progress_messages: dict[str, str] = {}
progress_states: dict[str, dict[str, float | int | str]] = {}
PAGE_CHUNK_SIZE = 16
LARGE_FILE_DPI = 160
DEFAULT_RENDER_DPI = 180
CANCEL_FAILURE_STAGE = "사용자 중단"


class BatchCancelled(RuntimeError):
    pass


@dataclass
class RenderedPage:
    page_index: int
    base64_png: str
    png_bytes: bytes
    ai_image_mime: str = "image/png"
    column_index: int = 0
    source_page_index: int | None = None


def set_progress(
    batch_id: UUID,
    message: str,
    current: int | None = None,
    total: int | None = None,
    reset: bool = False,
    allow_inactive: bool = False,
) -> None:
    key = str(batch_id)
    now = datetime.utcnow()
    progress_messages[key] = message
    if reset or key not in progress_states:
        progress_states[key] = {"started_at": time.time(), "current": 0, "total": 0}
    state = progress_states[key]
    state["message"] = message
    next_current = current
    if current is not None:
        previous_current = int(state.get("current") or 0)
        next_current = current if reset else max(current, previous_current)
        state["current"] = next_current
    if total is not None:
        state["total"] = total
    db = SessionLocal()
    try:
        batch = db.get(Batch, batch_id)
        if batch:
            if not allow_inactive and batch.status not in {BatchStatus.pending, BatchStatus.processing}:
                raise BatchCancelled(f"Batch {batch_id} is no longer active.")
            batch.progress_message = message
            if next_current is not None:
                batch.progress_current = next_current
            if total is not None:
                batch.progress_total = total
            if not batch.progress_started_at:
                batch.progress_started_at = now
            batch.progress_updated_at = now
            db.commit()
    finally:
        db.close()


def persist_progress(db: Session, batch: Batch, message: str, current: int | None = None, total: int | None = None) -> None:
    set_progress(batch.id, message, current, total)
    db.refresh(batch)
    if batch.status not in {BatchStatus.pending, BatchStatus.processing}:
        raise BatchCancelled(f"Batch {batch.id} is no longer active.")
    batch.progress_message = message
    db.commit()


def ensure_batch_active(batch_id: UUID) -> None:
    db = SessionLocal()
    try:
        batch = db.get(Batch, batch_id)
        if batch and batch.status not in {BatchStatus.pending, BatchStatus.processing}:
            raise BatchCancelled(f"Batch {batch_id} is no longer active.")
    finally:
        db.close()


def explain_failure(exc: Exception) -> tuple[str, str]:
    raw = str(exc).strip() or exc.__class__.__name__
    lowered = raw.lower()

    if "openai_api_key" in raw:
        return (
            "AI 異붿텧???꾩슂??OpenAI API ?ㅺ? ?ㅼ젙?섏? ?딆븯?듬땲??",
            "backend .env??OPENAI_API_KEY瑜??ㅼ젙?????쒕쾭瑜??ㅼ떆 ?쒖옉?섍퀬 諛곗튂瑜??ъ쿂由ы븯?몄슂.",
        )
    if "model_not_found" in lowered or "does not exist or you do not have access" in lowered:
        return (
            "설정된 AI 모델에 접근할 수 없습니다.",
            f"모델명을 확인하거나 모델 풀에서 접근 불가 모델을 제거한 뒤 다시 처리하세요. 원문: {raw[:300]}",
        )
    if "insufficient_quota" in lowered or "exceeded your current quota" in lowered:
        return (
            "OpenAI API 사용 한도 또는 결제 크레딧이 부족합니다.",
            "OpenAI 결제 상태와 프로젝트 사용 한도를 확인한 뒤 다시 처리하세요.",
        )
    if isinstance(exc, RateLimitError) or "rate limit" in lowered or "429" in lowered:
        return (
            "AI ?붿껌 ?쒕룄???꾨떖??臾명빆 異붿텧??怨꾩냽?????놁뒿?덈떎.",
            "?좎떆 ???ㅼ떆 泥섎━?섍굅???ъ슜 以묒씤 AI 怨꾩젙???쒕룄? 寃곗젣 ?곹깭瑜??뺤씤?섏꽭??",
        )
    if "vision request failed after retry" in lowered:
        return (
            "AI 臾명빆 ?몄떇 ?붿껌???щ윭 踰??ㅽ뙣?덉뒿?덈떎.",
            "?ㅽ듃?뚰겕 ?곹깭, AI API ?? 紐⑤뜽 ?묎렐 沅뚰븳???뺤씤?????ㅼ떆 泥섎━?섏꽭??",
        )
    if "json" in lowered or "expecting value" in lowered or "decode" in lowered:
        return (
            "AI ?묐떟??臾명빆 ?곗씠???뺤떇?쇰줈 ?댁꽍?섏? 紐삵뻽?듬땲??",
            "?먮낯 PDF媛 ?덈Т 蹂듭옟?섍굅???묐떟??遺덉븞?뺥뻽?????덉뒿?덈떎. ?ㅼ떆 泥섎━?대낫怨?諛섎났?섎㈃ PDF瑜????묒? ?⑥쐞濡??섎늻?몄슂.",
        )
    if "cannot open" in lowered or "failed to open" in lowered or "password" in lowered:
        return (
            "PDF ?뚯씪???닿굅???뚮뜑留곹븯吏 紐삵뻽?듬땲??",
            "?뚯씪???먯긽?섏뿀嫄곕굹 ?뷀샇?붾릺???덉? ?딆?吏 ?뺤씤?????ㅼ떆 ?낅줈?쒗븯?몄슂.",
        )
    if "timeout" in lowered or "connection" in lowered or "network" in lowered:
        return (
            "?몃? 泥섎━ ?붿껌???ㅽ듃?뚰겕 臾몄젣濡??ㅽ뙣?덉뒿?덈떎.",
            "?명꽣???곌껐怨?AI ?쒕퉬???곹깭瑜??뺤씤?????ъ쿂由ы븯?몄슂.",
        )

    return (
        raw[:500],
        "?ъ쿂由ы빐??媛숈? 臾몄젣媛 諛섎났?섎㈃ ?먮낯 PDF, ?댁꽕 PDF, ?쒕쾭 濡쒓렇瑜??④퍡 ?뺤씤?섏꽭??",
    )


def count_pdf_pages(path: str) -> int:
    doc = fitz.open(path)
    try:
        return doc.page_count
    finally:
        doc.close()


def choose_render_dpi(path: str, page_count: int) -> int:
    settings = get_settings()
    try:
        size_mb = os.path.getsize(path) / (1024 * 1024)
    except OSError:
        size_mb = 0
    if page_count >= 80 or size_mb >= 80:
        return settings.pdf_large_file_dpi or LARGE_FILE_DPI
    return settings.pdf_render_dpi or DEFAULT_RENDER_DPI


def iter_page_ranges(page_count: int, chunk_size: int = PAGE_CHUNK_SIZE):
    for start in range(0, page_count, chunk_size):
        yield start, min(start + chunk_size, page_count)


def iter_split_page_range_groups(page_count: int, split_count: int, chunk_size: int = PAGE_CHUNK_SIZE):
    if split_count <= 1:
        for start, end in iter_page_ranges(page_count, chunk_size):
            yield [(start, end)]
        return

    boundaries = [index * page_count // split_count for index in range(split_count + 1)]
    cursors = boundaries[:-1]
    while True:
        group: list[tuple[int, int]] = []
        for index, start in enumerate(cursors):
            shard_end = boundaries[index + 1]
            if start >= shard_end:
                continue
            end = min(start + chunk_size, shard_end)
            group.append((start, end))
            cursors[index] = end
        if not group:
            break
        yield group


def format_page_range_group(ranges: list[tuple[int, int]], page_count: int) -> str:
    labels = [f"{start + 1}" if end == start + 1 else f"{start + 1}-{end}" for start, end in ranges]
    return f"{', '.join(labels)}/{page_count}페이지"


def interleave_rendered_page_groups(groups: list[list[RenderedPage]]) -> list[RenderedPage]:
    interleaved: list[RenderedPage] = []
    max_group_len = max((len(group) for group in groups), default=0)
    for index in range(max_group_len):
        for group in groups:
            if index < len(group):
                interleaved.append(group[index])
    return interleaved


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, UUID)):
        return str(value)
    return str(value)


def _batch_artifact_dir(batch_id: UUID) -> Path:
    root = Path(get_settings().uploads_dir).resolve()
    target = root / "batch_artifacts" / str(batch_id)
    target.mkdir(parents=True, exist_ok=True)
    return target


def _write_batch_artifact(batch_id: UUID, filename: str, payload: Any) -> None:
    target_dir = _batch_artifact_dir(batch_id)
    target = (target_dir / filename).resolve()
    if target_dir not in target.parents and target != target_dir:
        raise ValueError("Invalid artifact path")
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")


def _read_batch_artifact(batch_id: UUID, filename: str) -> Any | None:
    target_dir = _batch_artifact_dir(batch_id)
    target = (target_dir / filename).resolve()
    if target_dir not in target.parents and target != target_dir:
        raise ValueError("Invalid artifact path")
    if not target.exists():
        return None
    return json.loads(target.read_text(encoding="utf-8"))


def _openai_client() -> OpenAI:
    settings = get_settings()
    timeout = max(float(settings.ai_request_timeout_seconds or 180), 30.0)
    return OpenAI(api_key=settings.openai_api_key, timeout=timeout, max_retries=0)


def _ai_progress_heartbeat_seconds() -> float:
    return max(float(get_settings().ai_progress_heartbeat_seconds or 15), 5.0)


def _completed_futures_with_heartbeat(
    futures: dict[Any, Any],
    *,
    batch_id: UUID | None,
    message_factory,
    current_factory,
    total: int | None,
):
    pending = set(futures)
    while pending:
        done, pending = wait(pending, timeout=_ai_progress_heartbeat_seconds(), return_when=FIRST_COMPLETED)
        if not done:
            if batch_id:
                set_progress(batch_id, message_factory(), current_factory(), total)
            continue
        for future in done:
            yield future, futures[future]


def _clean_metadata_list(value: Any, max_items: int = 16) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        cleaned.append(text)
        seen.add(text)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _normalize_detected_sections(value: Any) -> list[str]:
    sections: list[str] = []
    seen: set[str] = set()
    for item in _clean_metadata_list(value, max_items=32):
        section = _usable_section_id(item, allow_plain_title=True)
        if not section or section in seen:
            continue
        sections.append(section)
        seen.add(section)
    return sections


def _int_or_none(value: Any) -> int | None:
    match = re.search(r"\d+", str(value or ""))
    return int(match.group(0)) if match else None


def _toc_problem_bounds(raw: dict[str, Any] | str) -> tuple[int | None, int | None, int | None]:
    if isinstance(raw, dict):
        start = _int_or_none(
            raw.get("problem_number_start")
            or raw.get("problem_start")
            or raw.get("first_problem_number")
            or raw.get("first_problem")
        )
        end = _int_or_none(
            raw.get("problem_number_end")
            or raw.get("problem_end")
            or raw.get("last_problem_number")
            or raw.get("last_problem")
        )
        count = _int_or_none(raw.get("problem_count") or raw.get("question_count") or raw.get("count"))
        range_text = str(raw.get("problem_range") or raw.get("question_range") or "").strip()
    else:
        start = end = count = None
        range_text = str(raw or "")
    if range_text:
        range_match = re.search(r"(\d{1,3})\s*(?:~|-|–|—|至|부터)\s*(\d{1,3})", range_text)
        if range_match:
            start = start or int(range_match.group(1))
            end = end or int(range_match.group(2))
    if start is not None and end is not None and count is None and end >= start:
        count = end - start + 1
    return start, end, count


def _normalize_toc_entries(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    entries: list[dict[str, Any]] = []
    seen: set[tuple[str, int | None]] = set()
    for raw in value:
        if isinstance(raw, dict):
            subject = str(raw.get("subject") or "").strip() or None
            unit = str(raw.get("unit") or "").strip() or None
            title = str(raw.get("section_id") or raw.get("title") or raw.get("label") or "").strip()
            title_section = _usable_section_id(title, allow_plain_title=True)
            if title_section:
                section_id = title_section
            elif subject and unit and _is_curriculum_unit_label(unit):
                section_id = _normalize_section_id(f"{subject} / {unit}")
            else:
                section_id = _usable_section_id(title or unit or subject, allow_plain_title=True)
            page_number = _int_or_none(raw.get("page_number", raw.get("start_page", raw.get("page"))))
        else:
            text = str(raw or "").strip()
            trailing_page = re.search(r"(\d{1,4})\s*$", text)
            section_text = text
            page_number = None
            if trailing_page:
                candidate = text[: trailing_page.start()].strip()
                bare_heading = re.fullmatch(r"(?:DAY|CHAPTER|UNIT|LESSON|TYPE|단원|유형)", candidate, re.IGNORECASE)
                if candidate and not bare_heading:
                    page_number = int(trailing_page.group(1))
                    section_text = candidate
            subject = None
            unit = None
            section_id = _usable_section_id(section_text, allow_plain_title=True)
        problem_start, problem_end, problem_count = _toc_problem_bounds(raw)
        if not section_id:
            continue
        key = (section_id, page_number)
        if key in seen:
            continue
        seen.add(key)
        entries.append(
            {
                "section_id": section_id,
                "subject": subject,
                "unit": unit,
                "page_number": page_number,
                "problem_number_start": problem_start,
                "problem_number_end": problem_end,
                "problem_count": problem_count,
            }
        )
        if len(entries) >= 80:
            break
    return entries


def _normalize_page_type(value: Any, fallback: str) -> str:
    text = str(value or "").strip().lower()
    allowed = {"problem_page", "solution_page", "toc", "cover", "log", "blank", "unknown"}
    return text if text in allowed else fallback


def _normalize_layout(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if text in {"single_column", "two_column", "unknown"} else "unknown"


def _normalize_page_metadata(raw: dict[str, Any], page: RenderedPage, doc_kind: str) -> dict[str, Any]:
    fallback_type = "solution_page" if doc_kind == "solution" else "problem_page"
    try:
        confidence = float(raw.get("section_confidence", 0.0) or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "page_number": page.page_index + 1,
        "page_index": page.page_index,
        "document_kind": doc_kind,
        "detected_section_ids": _normalize_detected_sections(raw.get("detected_section_ids")),
        "detected_subjects": _clean_metadata_list(raw.get("detected_subjects")),
        "detected_units": _clean_metadata_list(raw.get("detected_units")),
        "toc_entries": _normalize_toc_entries(raw.get("toc_entries")),
        "section_pattern": str(raw.get("section_pattern") or "unknown").strip() or "unknown",
        "detected_problem_headers": _clean_metadata_list(raw.get("detected_problem_headers"), max_items=64),
        "detected_solution_headers": _clean_metadata_list(raw.get("detected_solution_headers"), max_items=64),
        "page_type": _normalize_page_type(raw.get("page_type"), fallback_type),
        "layout": _normalize_layout(raw.get("layout")),
        "section_confidence": max(0.0, min(1.0, confidence)),
    }


def extract_page_metadata(
    pages: list[RenderedPage],
    doc_kind: str,
    batch_id: UUID | None = None,
    offset: int = 0,
    total: int | None = None,
    display_total_pages: int | None = None,
) -> list[dict[str, Any]]:
    if not pages:
        return []
    settings = get_settings()
    client = _openai_client()
    model_pool = _ai_model_pool(settings.ai_solution_model_pool if doc_kind == "solution" else settings.ai_model_pool, settings.ai_model)
    total_steps = total or len(pages)
    label = "답안 구조 분석 중" if doc_kind == "solution" else "문제 구조 분석 중"
    if batch_id:
        set_progress(batch_id, f"{label} (0/{len(pages)}페이지)", offset, total_steps)

    completed = 0
    metadata: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=_ai_worker_count(len(pages), len(model_pool))) as executor:
        futures = {
            executor.submit(
                vision_json,
                client,
                page.base64_png,
                f"{PAGE_STRUCTURE_PROMPT}\n\nDocument kind: {doc_kind}. Current page_number: {page.page_index + 1}. Return this exact page_number.",
                _page_split_model(model_pool, page.page_index, display_total_pages),
                page.ai_image_mime,
                1800,
                settings.ai_solution_image_detail if doc_kind == "solution" else settings.ai_image_detail,
            ): page
            for page in pages
        }
        for future, page in _completed_futures_with_heartbeat(
            futures,
            batch_id=batch_id,
            message_factory=lambda: f"{label} ({completed}/{len(pages)}페이지, AI 응답 대기 중)",
            current_factory=lambda: offset + completed,
            total=total_steps,
        ):
            items = future.result()
            raw = items[0] if items and isinstance(items[0], dict) else {}
            metadata.append(_normalize_page_metadata(raw, page, doc_kind))
            completed += 1
            if batch_id:
                set_progress(
                    batch_id,
                    f"{label} ({completed}/{len(pages)}페이지, {page.page_index + 1}/{display_total_pages or len(pages)}페이지)",
                    offset + completed,
                    total_steps,
                )
    return sorted(metadata, key=lambda item: int(item.get("page_index") or 0))


def _primary_section_id(metadata: dict[str, Any]) -> str | None:
    sections = metadata.get("detected_section_ids")
    if isinstance(sections, list):
        for section in sections:
            text = _usable_section_id(section, allow_plain_title=True)
            if text:
                return text
    subjects = metadata.get("detected_subjects")
    units = metadata.get("detected_units")
    subject = str(subjects[0]).strip() if isinstance(subjects, list) and subjects else ""
    unit = str(units[0]).strip() if isinstance(units, list) and units else ""
    if subject and unit and _is_curriculum_unit_label(unit):
        return _normalize_section_id(f"{subject} / {unit}")
    return None


def _metadata_content_page_numbers(relevant: list[dict[str, Any]], page_count: int) -> list[int]:
    content_pages = [
        int(item.get("page_number") or 1)
        for item in relevant
        if item.get("page_type") in {"problem_page", "solution_page", "unknown"}
    ]
    if not content_pages and page_count > 0:
        return list(range(1, page_count + 1))
    return content_pages


def _toc_section_starts(relevant: list[dict[str, Any]], page_count: int) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    seen_entries: set[tuple[str, int]] = set()
    for item in relevant:
        if item.get("page_type") != "toc" and not item.get("toc_entries"):
            continue
        for entry in item.get("toc_entries") or []:
            section_id = str(entry.get("section_id") or "").strip()
            page_number = _int_or_none(entry.get("page_number"))
            if not section_id or page_number is None:
                continue
            key = (section_id, page_number)
            if key in seen_entries:
                continue
            seen_entries.add(key)
            entries.append(
                {
                    "section_id": section_id,
                    "page_number": page_number,
                    "problem_number_start": entry.get("problem_number_start"),
                    "problem_number_end": entry.get("problem_number_end"),
                    "problem_count": entry.get("problem_count"),
                }
            )
    if not entries:
        return []

    content_pages = _metadata_content_page_numbers(relevant, page_count)
    min_content_page = min(content_pages) if content_pages else 1
    first_entry_page = min(int(entry["page_number"]) for entry in entries)
    offsets = [0]
    inferred_offset = min_content_page - first_entry_page
    if inferred_offset and inferred_offset not in offsets:
        offsets.append(inferred_offset)

    best: list[dict[str, Any]] = []
    best_score = -1
    for offset in offsets:
        starts: list[dict[str, Any]] = []
        seen_sections: set[str] = set()
        last_page = 0
        score = 0
        for entry in entries:
            section_id = str(entry["section_id"])
            if section_id in seen_sections:
                continue
            page_start = int(entry["page_number"]) + offset
            if page_start < 1 or page_start > page_count:
                continue
            if content_pages and page_start < min_content_page:
                continue
            if page_start >= last_page:
                score += 2
            else:
                score -= 3
            last_page = max(last_page, page_start)
            starts.append(
                {
                    "section_id": section_id,
                    "page_start": page_start,
                    "section_confidence": 0.68,
                    "source": "toc",
                    "expected_problem_start": entry.get("problem_number_start"),
                    "expected_problem_end": entry.get("problem_number_end"),
                    "expected_problem_count": entry.get("problem_count"),
                }
            )
            seen_sections.add(section_id)
        score += len(starts)
        if score > best_score:
            best_score = score
            best = starts
    return best


def build_section_ranges_from_metadata(metadata: list[dict[str, Any]], doc_kind: str, page_count: int) -> list[dict[str, Any]]:
    relevant = sorted(
        [item for item in metadata if item.get("document_kind") == doc_kind],
        key=lambda item: int(item.get("page_index") or 0),
    )
    starts: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in relevant:
        if item.get("page_type") in {"toc", "cover", "blank", "log"}:
            continue
        section = _primary_section_id(item)
        if not section or section in seen:
            continue
        starts.append(
            {
                "section_id": section,
                "page_start": int(item.get("page_number") or 1),
                "section_confidence": float(item.get("section_confidence") or 0.0),
                "source": "page_header",
            }
        )
        seen.add(section)

    toc_starts = _toc_section_starts(relevant, page_count)
    if toc_starts and (len(toc_starts) >= 2 or not starts or (len(starts) <= 1 and len(toc_starts) > len(starts))):
        starts = toc_starts

    if not starts:
        content_pages = _metadata_content_page_numbers(relevant, page_count)
        if not content_pages:
            return []
        return [
            {
                "section_id": "UNSECTIONED",
                "page_start": min(content_pages),
                "page_end": max(content_pages),
                "status": "needs_review",
                "reason": "section_boundary_not_detected",
                "section_confidence": 0.0,
            }
        ]

    sections: list[dict[str, Any]] = []
    for index, start in enumerate(starts):
        section = str(start.get("section_id") or "").strip()
        page_start = int(start.get("page_start") or 1)
        confidence = float(start.get("section_confidence") or 0.0)
        if index + 1 < len(starts):
            next_start = int(starts[index + 1].get("page_start") or page_start)
            page_end = next_start if next_start == page_start else next_start - 1
        else:
            following_pages = [
                int(item.get("page_number") or 1)
                for item in relevant
                if int(item.get("page_number") or 1) >= page_start
                and item.get("page_type") not in {"cover", "blank", "log", "toc"}
            ]
            page_end = max(following_pages) if following_pages else page_count
        sections.append(
            {
                "section_id": section,
                "page_start": max(1, page_start),
                "page_end": max(page_start, min(page_end, page_count)),
                "status": "ok" if confidence >= 0.55 else "needs_review",
                "reason": None if confidence >= 0.55 else "low_ocr_confidence_on_section_header",
                "section_confidence": confidence,
                "source": start.get("source"),
                "expected_problem_start": start.get("expected_problem_start"),
                "expected_problem_end": start.get("expected_problem_end"),
                "expected_problem_count": start.get("expected_problem_count"),
            }
        )
    return sections


def _section_for_page(page_index: int, sections: list[dict[str, Any]]) -> str | None:
    page_number = page_index + 1
    for section in sections:
        start = int(section.get("page_start") or 0)
        end = int(section.get("page_end") or 0)
        if start <= page_number <= end:
            section_id = str(section.get("section_id") or "").strip()
            return section_id if section_id and section_id != "UNSECTIONED" else None
    return None


def _apply_section_ranges_to_items(items: list[dict[str, Any]], sections: list[dict[str, Any]], page_key: str) -> None:
    for item in items:
        existing_section = str(item.get("section_label") or item.get("section_id") or "").strip()
        if existing_section and not item.get("section_inferred"):
            continue
        page_index = int(item.get(page_key, item.get("page_idx", 0)) or 0)
        section_id = _section_for_page(page_index, sections)
        if section_id:
            if existing_section and existing_section != section_id:
                item["section_overridden_from"] = existing_section
            item["section_label"] = section_id
            item["section_id"] = section_id
            item["section_inferred"] = True


def _items_by_section(items: list[dict[str, Any]], page_key: str) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        section_id = str(item.get("section_id") or item.get("section_label") or "UNSECTIONED").strip() or "UNSECTIONED"
        grouped[section_id].append(
            {
                "problem_number": item.get("problem_number"),
                "problem_no": item.get("problem_no"),
                "page_number": int(item.get(page_key, item.get("page_idx", 0)) or 0) + 1,
                "local_index": item.get("local_index"),
                "global_index": item.get("global_index"),
            }
        )
    return grouped


def _numbers_from_values(values: list[Any]) -> list[int]:
    numbers: list[int] = []
    for value in values:
        match = re.search(r"\d+", str(value or ""))
        if match:
            numbers.append(int(match.group(0)))
    return numbers


def _number_anchor(numbers: list[int]) -> dict[str, Any]:
    ordered = sorted(numbers)
    duplicates = sorted({number for number in ordered if ordered.count(number) > 1})
    missing: list[int] = []
    if ordered:
        unique = sorted(set(ordered))
        missing = [number for number in range(unique[0], unique[-1] + 1) if number not in unique]
    return {
        "first": ordered[0] if ordered else None,
        "last": ordered[-1] if ordered else None,
        "count": len(numbers),
        "unique_count": len(set(numbers)),
        "missing": missing[:40],
        "duplicates": duplicates[:40],
    }


def _section_header_anchors(metadata: list[dict[str, Any]], doc_kind: str, sections: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    anchors: dict[str, dict[str, Any]] = {}
    header_key = "detected_solution_headers" if doc_kind == "solution" else "detected_problem_headers"
    relevant = [item for item in metadata if item.get("document_kind") == doc_kind]
    for section in sections:
        section_id = str(section.get("section_id") or "UNSECTIONED").strip() or "UNSECTIONED"
        page_start = int(section.get("page_start") or 1)
        page_end = int(section.get("page_end") or page_start)
        headers: list[Any] = []
        pages: list[int] = []
        for item in relevant:
            page_number = int(item.get("page_number") or 1)
            if page_start <= page_number <= page_end:
                headers.extend(item.get(header_key) or [])
                pages.append(page_number)
        anchor = _number_anchor(_numbers_from_values(headers))
        anchor["pages"] = sorted(set(pages))
        anchors[section_id] = anchor
    return anchors


def _item_section_id(item: dict[str, Any]) -> str:
    section_id = str(item.get("section_id") or item.get("section_label") or "UNSECTIONED").strip()
    return section_id or "UNSECTIONED"


def _extracted_section_anchors(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[int]] = defaultdict(list)
    for item in items:
        number = _int_or_none(item.get("problem_number") or item.get("problem_no"))
        if number is not None:
            grouped[_item_section_id(item)].append(number)
    return {section_id: _number_anchor(numbers) for section_id, numbers in grouped.items()}


def build_structure_validation_report(
    metadata: list[dict[str, Any]],
    problem_sections: list[dict[str, Any]],
    solution_sections: list[dict[str, Any]],
    problems: list[dict[str, Any]],
    solutions: list[dict[str, Any]],
) -> dict[str, Any]:
    problem_headers = _section_header_anchors(metadata, "problem", problem_sections)
    solution_headers = _section_header_anchors(metadata, "solution", solution_sections) if solution_sections else {}
    extracted_problem_anchors = _extracted_section_anchors(problems)
    extracted_solution_anchors = _extracted_section_anchors(solutions)

    section_by_id = {str(section.get("section_id") or "UNSECTIONED").strip() or "UNSECTIONED": section for section in problem_sections}
    if solution_sections:
        for section in solution_sections:
            section_by_id.setdefault(str(section.get("section_id") or "UNSECTIONED").strip() or "UNSECTIONED", section)

    section_ids = sorted(
        set(section_by_id)
        | set(problem_headers)
        | set(solution_headers)
        | set(extracted_problem_anchors)
        | set(extracted_solution_anchors)
    )
    sections: list[dict[str, Any]] = []
    global_warnings: list[str] = []
    for section_id in section_ids:
        section = section_by_id.get(section_id, {})
        expected_count = _int_or_none(section.get("expected_problem_count"))
        expected_start = _int_or_none(section.get("expected_problem_start"))
        expected_end = _int_or_none(section.get("expected_problem_end"))
        if expected_count is None and expected_start is not None and expected_end is not None and expected_end >= expected_start:
            expected_count = expected_end - expected_start + 1

        problem_anchor = extracted_problem_anchors.get(section_id, _number_anchor([]))
        solution_anchor = extracted_solution_anchors.get(section_id, _number_anchor([]))
        problem_header_anchor = problem_headers.get(section_id, _number_anchor([]))
        solution_header_anchor = solution_headers.get(section_id, _number_anchor([]))

        reasons: list[str] = []
        if expected_count is not None and problem_anchor["count"] and problem_anchor["count"] != expected_count:
            reasons.append(f"toc_expected_problem_count {expected_count} but extracted_problem_count {problem_anchor['count']}")
        if problem_header_anchor["count"] and problem_anchor["count"] and problem_header_anchor["count"] != problem_anchor["count"]:
            reasons.append(f"page_header_problem_count {problem_header_anchor['count']} but extracted_problem_count {problem_anchor['count']}")
        if solution_anchor["count"] and problem_anchor["count"] and solution_anchor["count"] != problem_anchor["count"]:
            reasons.append(f"problem_count {problem_anchor['count']} but solution_count {solution_anchor['count']}")
        if problem_header_anchor["missing"]:
            reasons.append("missing_problem_headers")
        if problem_header_anchor["duplicates"]:
            reasons.append("duplicated_problem_headers")
        if solution_header_anchor["duplicates"]:
            reasons.append("duplicated_solution_headers")
        if section.get("status") == "needs_review" and section.get("reason"):
            reasons.append(str(section.get("reason")))

        status = "needs_review" if reasons else "ok"
        if status == "needs_review":
            global_warnings.append(f"{section_id}: {'; '.join(reasons)}")
        sections.append(
            {
                "section_id": None if section_id == "UNSECTIONED" else section_id,
                "source": section.get("source"),
                "page_start": section.get("page_start"),
                "page_end": section.get("page_end"),
                "expected_problem_anchor": {
                    "first": expected_start,
                    "last": expected_end,
                    "count": expected_count,
                },
                "page_metadata_problem_anchor": problem_header_anchor,
                "page_metadata_solution_anchor": solution_header_anchor,
                "extracted_problem_anchor": problem_anchor,
                "extracted_solution_anchor": solution_anchor,
                "status": status,
                "reasons": reasons,
            }
        )
    return {
        "status": "needs_review" if global_warnings else "ok",
        "toc_section_count": len([section for section in problem_sections if section.get("source") == "toc"]),
        "page_header_section_count": len([section for section in problem_sections if section.get("source") == "page_header"]),
        "sections": sections,
        "warnings": global_warnings,
    }


def _mark_section_validation_warnings(items: list[dict[str, Any]], structure_report: dict[str, Any]) -> None:
    needs_review = {
        str(section.get("section_id") or "UNSECTIONED")
        for section in structure_report.get("sections", [])
        if section.get("status") == "needs_review"
    }
    if not needs_review:
        return
    for item in items:
        section_id = _item_section_id(item)
        if section_id in needs_review:
            item["needs_review"] = True
            warnings = list(item.get("structure_warnings") or [])
            if "section_structure_needs_review" not in warnings:
                warnings.append("section_structure_needs_review")
            item["structure_warnings"] = warnings


def _validation_with_structure(matching_result: dict[str, Any], structure_report: dict[str, Any]) -> dict[str, Any]:
    validation = dict(matching_result.get("validation_report") or matching_result.get("summary") or {})
    validation["structure"] = structure_report
    warnings = list(validation.get("warnings") or [])
    for warning in structure_report.get("warnings") or []:
        warnings.append(f"structure:{warning}")
    validation["warnings"] = list(dict.fromkeys(warnings))
    return validation


def _metadata_by_page(metadata: list[dict[str, Any]], doc_kind: str) -> dict[int, dict[str, Any]]:
    return {
        int(item.get("page_index") or 0): item
        for item in metadata
        if item.get("document_kind") == doc_kind
    }


def _encode_image_for_ai(image: Image.Image, mime: str) -> tuple[str, bytes, str]:
    buffer = io.BytesIO()
    if mime == "image/jpeg":
        quality = min(max(int(get_settings().ai_image_jpeg_quality or 82), 50), 95)
        image.convert("RGB").save(buffer, format="JPEG", quality=quality, optimize=True)
    else:
        image.save(buffer, format="PNG")
        mime = "image/png"
    data = buffer.getvalue()
    return base64.b64encode(data).decode("ascii"), data, mime


def split_two_column_solution_pages(pages: list[RenderedPage], page_metadata: dict[int, dict[str, Any]]) -> list[RenderedPage]:
    expanded: list[RenderedPage] = []
    for page in pages:
        metadata = page_metadata.get(page.page_index) or {}
        if metadata.get("layout") != "two_column":
            expanded.append(page)
            continue
        with Image.open(io.BytesIO(page.png_bytes)) as source:
            width, height = source.size
            if width < 2:
                expanded.append(page)
                continue
            midpoint = width // 2
            for column_index, box in enumerate(((0, 0, midpoint, height), (midpoint, 0, width, height))):
                cropped = source.crop(box)
                base64_image, image_bytes, mime = _encode_image_for_ai(cropped, page.ai_image_mime)
                expanded.append(
                    RenderedPage(
                        page.page_index,
                        base64_image,
                        image_bytes,
                        mime,
                        column_index=column_index,
                        source_page_index=page.page_index,
                    )
                )
    return expanded


def collect_page_metadata_for_pdf(
    path: str,
    page_count: int,
    dpi: int,
    doc_kind: str,
    batch_id: UUID,
    offset: int,
    total_units: int,
) -> list[dict[str, Any]]:
    model_pool = _ai_model_pool(get_settings().ai_solution_model_pool if doc_kind == "solution" else get_settings().ai_model_pool, get_settings().ai_model)
    metadata: list[dict[str, Any]] = []
    processed_pages = 0
    render_label = "답안 구조 분석용 렌더링 중" if doc_kind == "solution" else "문제 구조 분석용 렌더링 중"
    for range_group in iter_split_page_range_groups(page_count, len(model_pool)):
        chunk_len = sum(end - start for start, end in range_group)
        base = offset + processed_pages * 2
        rendered_groups: list[list[RenderedPage]] = []
        rendered_pages = 0
        for start, end in range_group:
            rendered = render_pdf(
                path,
                batch_id=batch_id,
                label=render_label,
                start_page=start,
                end_page=end,
                dpi=dpi,
                progress_offset=base + rendered_pages,
                progress_total=total_units,
            )
            rendered_groups.append(rendered)
            rendered_pages += end - start
        pages = interleave_rendered_page_groups(rendered_groups)
        metadata.extend(
            extract_page_metadata(
                pages,
                doc_kind,
                batch_id=batch_id,
                offset=base + chunk_len,
                total=total_units,
                display_total_pages=page_count,
            )
        )
        processed_pages += chunk_len
    return sorted(metadata, key=lambda item: int(item.get("page_index") or 0))


QUICK_ANSWER_EDGE_PAGE_COUNT = 6
QUICK_ANSWER_MIN_ANSWER_COUNT = 5
QUICK_ANSWER_STRONG_CONFIDENCE = 0.68
QUICK_ANSWER_WEAK_CONFIDENCE = 0.55
QUICK_ANSWER_EXPECTED_COVERAGE = 0.9


def _quick_answer_candidate_page_indexes(page_count: int, edge_count: int = QUICK_ANSWER_EDGE_PAGE_COUNT) -> list[int]:
    if page_count <= 0:
        return []
    edge = max(1, min(int(edge_count), page_count))
    indexes = list(range(0, edge)) + list(range(max(0, page_count - edge), page_count))
    return sorted(set(index for index in indexes if 0 <= index < page_count))


def _contiguous_page_ranges(page_indexes: list[int]) -> list[tuple[int, int]]:
    ordered = sorted(set(index for index in page_indexes if index >= 0))
    if not ordered:
        return []
    ranges: list[tuple[int, int]] = []
    start = previous = ordered[0]
    for index in ordered[1:]:
        if index == previous + 1:
            previous = index
            continue
        ranges.append((start, previous + 1))
        start = previous = index
    ranges.append((start, previous + 1))
    return ranges


def render_pdf_page_indexes(
    path: str,
    page_indexes: list[int],
    batch_id: UUID | None = None,
    label: str = "PDF 렌더링 중",
    dpi: int = DEFAULT_RENDER_DPI,
    progress_offset: int = 0,
    progress_total: int | None = None,
) -> list[RenderedPage]:
    ordered_indexes = sorted(set(index for index in page_indexes if index >= 0))
    if not ordered_indexes:
        return []
    rendered_by_index: dict[int, RenderedPage] = {}
    rendered_count = 0
    for start, end in _contiguous_page_ranges(ordered_indexes):
        rendered = render_pdf(
            path,
            batch_id=batch_id,
            label=label,
            start_page=start,
            end_page=end,
            dpi=dpi,
            progress_offset=progress_offset + rendered_count,
            progress_total=progress_total,
        )
        rendered_by_index.update({page.page_index: page for page in rendered})
        rendered_count += end - start
    return [rendered_by_index[index] for index in ordered_indexes if index in rendered_by_index]


def _quick_answer_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value or "").strip().lower() in {"true", "1", "yes", "y", "예", "네"}


def _quick_answer_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return fallback


def _quick_answer_count(value: Any) -> int:
    number = _int_or_none(value)
    return max(int(number or 0), 0)


def _solution_answer_count(solutions: list[dict[str, Any]]) -> int:
    return sum(1 for solution in solutions if has_solution_content(solution))


def _quick_answers_cover_expected_count(answer_count: int, expected_count: int | None) -> bool:
    if answer_count <= 0:
        return False
    if expected_count is None or expected_count <= 0:
        return answer_count >= QUICK_ANSWER_MIN_ANSWER_COUNT
    if expected_count <= QUICK_ANSWER_MIN_ANSWER_COUNT:
        return answer_count >= expected_count
    return answer_count >= max(QUICK_ANSWER_MIN_ANSWER_COUNT, math.ceil(expected_count * QUICK_ANSWER_EXPECTED_COVERAGE))


def scan_quick_answer_table_pages(
    path: str,
    page_count: int,
    dpi: int,
    batch_id: UUID | None,
    progress_offset: int,
    total_units: int | None,
) -> dict[str, Any]:
    candidate_indexes = _quick_answer_candidate_page_indexes(page_count)
    report: dict[str, Any] = {
        "strategy": "edge_page_scan",
        "candidate_page_indexes": candidate_indexes,
        "candidate_page_numbers": [index + 1 for index in candidate_indexes],
        "selected_page_indexes": [],
        "selected_page_numbers": [],
        "pages": [],
        "used": False,
    }
    if not candidate_indexes:
        return report

    pages = render_pdf_page_indexes(
        path,
        candidate_indexes,
        batch_id=batch_id,
        label="빠른 답안표 탐색용 렌더링 중",
        dpi=dpi,
        progress_offset=progress_offset,
        progress_total=total_units,
    )
    if not pages:
        return report

    settings = get_settings()
    client = _openai_client()
    model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
    completed = 0
    if batch_id:
        model_note = f", 모델 {len(model_pool)}개" if len(model_pool) > 1 else ""
        set_progress(batch_id, f"빠른 답안표 탐색 중 (0/{len(pages)}페이지{model_note})", progress_offset + len(pages), total_units)

    page_reports: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=_ai_worker_count(len(pages), len(model_pool))) as executor:
        futures = {
            executor.submit(
                vision_json,
                client,
                page.base64_png,
                (
                    f"{QUICK_ANSWER_TABLE_SCAN_PROMPT}\n\n"
                    f"Current answer PDF page_idx: {page.page_index}.\n"
                    f"Current answer PDF page number: {page.page_index + 1}."
                ),
                _page_split_model(model_pool, page.page_index, page_count),
                page.ai_image_mime,
                1024,
                settings.ai_solution_image_detail,
            ): page
            for page in pages
        }
        for future, page in _completed_futures_with_heartbeat(
            futures,
            batch_id=batch_id,
            message_factory=lambda: f"빠른 답안표 탐색 중 ({completed}/{len(pages)}페이지, AI 응답 대기 중)",
            current_factory=lambda: progress_offset + len(pages) + completed,
            total=total_units,
        ):
            items = future.result()
            raw = items[0] if items and isinstance(items[0], dict) else {}
            is_quick = _quick_answer_bool(raw.get("is_quick_answer_table"))
            confidence = _quick_answer_float(raw.get("confidence"))
            answer_count = _quick_answer_count(raw.get("answer_count_estimate"))
            has_explanations = _quick_answer_bool(raw.get("has_explanations"))
            strong = (
                is_quick
                and not has_explanations
                and confidence >= QUICK_ANSWER_STRONG_CONFIDENCE
                and answer_count >= QUICK_ANSWER_MIN_ANSWER_COUNT
            )
            weak = (
                is_quick
                and not has_explanations
                and confidence >= QUICK_ANSWER_WEAK_CONFIDENCE
                and answer_count >= 3
            )
            page_report = {
                "page_index": page.page_index,
                "page_number": page.page_index + 1,
                "is_quick_answer_table": is_quick,
                "confidence": confidence,
                "answer_count_estimate": answer_count,
                "first_problem_number": raw.get("first_problem_number"),
                "last_problem_number": raw.get("last_problem_number"),
                "section_labels": raw.get("section_labels") if isinstance(raw.get("section_labels"), list) else [],
                "has_explanations": has_explanations,
                "reason": raw.get("reason"),
                "strong_candidate": strong,
                "weak_candidate": weak,
            }
            page_reports.append(page_report)
            completed += 1
            if batch_id:
                set_progress(
                    batch_id,
                    f"빠른 답안표 탐색 중 ({completed}/{len(pages)}페이지, {page.page_index + 1}/{page_count}페이지)",
                    progress_offset + len(pages) + completed,
                    total_units,
                )

    strong_indexes = {int(item["page_index"]) for item in page_reports if item.get("strong_candidate")}
    selected_indexes: list[int] = []
    if strong_indexes:
        for item in page_reports:
            page_index = int(item["page_index"])
            if item.get("strong_candidate") or (item.get("weak_candidate") and any(abs(page_index - strong) <= 1 for strong in strong_indexes)):
                selected_indexes.append(page_index)
    else:
        weak_reports = [item for item in page_reports if item.get("weak_candidate")]
        if sum(int(item.get("answer_count_estimate") or 0) for item in weak_reports) >= QUICK_ANSWER_MIN_ANSWER_COUNT * 2:
            selected_indexes = [int(item["page_index"]) for item in weak_reports]

    selected_indexes = sorted(set(selected_indexes))
    report["pages"] = sorted(page_reports, key=lambda item: int(item.get("page_index") or 0))
    report["selected_page_indexes"] = selected_indexes
    report["selected_page_numbers"] = [index + 1 for index in selected_indexes]
    return report


def extract_quick_answer_table_solutions(
    path: str,
    page_count: int,
    dpi: int,
    batch_id: UUID | None,
    progress_offset: int,
    total_units: int | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    report = scan_quick_answer_table_pages(path, page_count, dpi, batch_id, progress_offset, total_units)
    selected_indexes = [int(index) for index in report.get("selected_page_indexes") or []]
    if not selected_indexes:
        report["extracted_answer_count"] = 0
        report["fallback_reason"] = "quick_answer_table_not_found"
        return [], report

    pages = render_pdf_page_indexes(
        path,
        selected_indexes,
        batch_id=batch_id,
        label="빠른 답안표 렌더링 중",
        dpi=dpi,
        progress_offset=progress_offset + len(report.get("candidate_page_indexes") or []),
        progress_total=total_units,
    )
    settings = get_settings()
    solutions = extract_solutions(
        pages,
        batch_id=batch_id,
        offset=progress_offset + len(report.get("candidate_page_indexes") or []) + len(pages),
        total=total_units,
        display_total_pages=page_count,
        prompt_override=QUICK_ANSWER_TABLE_EXTRACTION_PROMPT,
        mode_label_override="빠른 답안표 검사",
        max_output_tokens_override=max(settings.ai_solution_max_output_tokens, settings.ai_max_output_tokens, 4096),
    )
    for solution in solutions:
        solution["extraction_source"] = "quick_answer_table"
    answer_count = _solution_answer_count(solutions)
    report["extracted_answer_count"] = answer_count
    report["used"] = answer_count >= QUICK_ANSWER_MIN_ANSWER_COUNT
    if not report["used"]:
        report["fallback_reason"] = "quick_answer_table_extracted_too_few_answers"
    return solutions, report


def extract_full_solution_pdf(
    path: str,
    page_count: int,
    dpi: int,
    batch_id: UUID,
    offset: int,
    total_units: int,
    units_per_page: int,
    solution_sections: list[dict[str, Any]],
    solution_page_metadata: dict[int, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    settings = get_settings()
    solution_model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
    solutions: list[dict[str, Any]] = []
    processed_solution_pages = 0
    for range_group in iter_split_page_range_groups(page_count, len(solution_model_pool)):
        chunk_len = sum(end - start for start, end in range_group)
        base = offset + processed_solution_pages * units_per_page
        rendered_groups: list[list[RenderedPage]] = []
        rendered_pages = 0
        for start, end in range_group:
            rendered = render_pdf(
                path,
                batch_id=batch_id,
                label="답안 PDF 렌더링 중",
                start_page=start,
                end_page=end,
                dpi=dpi,
                progress_offset=base + rendered_pages,
                progress_total=total_units,
            )
            rendered_groups.append(rendered)
            rendered_pages += end - start
        solution_pages = interleave_rendered_page_groups(rendered_groups)
        if solution_page_metadata:
            solution_pages = split_two_column_solution_pages(solution_pages, solution_page_metadata)
        extracted_solutions = extract_solutions(
            solution_pages,
            batch_id,
            offset=base + chunk_len,
            total=total_units,
            display_total_pages=page_count,
        )
        _apply_section_ranges_to_items(extracted_solutions, solution_sections, "page_idx")
        solutions.extend(extracted_solutions)
        processed_solution_pages += chunk_len
    return _apply_structure_indexes(solutions, page_key="page_idx")


KOREAN_RANGE_RECOVERY_PROMPT = r"""You are repairing a Korean Language extraction where a visible passage range was incomplete.

Return raw JSON array only. The array must contain exactly one object:
[
  {
    "document_id": "<document id supplied by the system>",
    "subject": "korean",
    "source_file": "<source file name supplied by the system>",
    "passage_groups": [],
    "questions": [
      {
        "question_id": "<stable id unique within this document>",
        "source_pages": [<1-based source page numbers>],
        "question_number": "<one of the requested missing question numbers>",
        "linked_passage_id": "<the supplied passage_id>",
        "question_stem": "<exact visible question stem for this number only>",
        "additional_material": "<보기/additional material text or null>",
        "choices": [
          {"choice_label": "①", "choice_text": "<exact choice text>"}
        ],
        "answer": null,
        "solution": null,
        "extraction_confidence": <0.0 to 1.0>,
        "warnings": []
      }
    ],
    "global_warnings": []
  }
]

Rules:
- Extract only the requested missing question numbers. Do not repeat already extracted numbers.
- Link every recovered question to the supplied passage_id.
- Preserve exact Korean text, 보기 blocks, circled choices ①②③④⑤, and source page number.
- When any visible text is underlined, wrap only the exact underlined characters in <u>...</u> in the appropriate field: question_stem, additional_material, or choice_text.
- Do not extract answers from the problem file."""


def _question_number_key(value: Any) -> str:
    match = re.search(r"\d+", str(value or ""))
    return str(int(match.group(0))) if match else str(value or "").strip()


def _korean_range_recovery_prompt(
    document_id: str,
    source_file: str,
    page_number: int,
    group: dict[str, Any],
) -> str:
    passage_excerpt = str(group.get("passage_text") or "")[:1400]
    return (
        f"{KOREAN_RANGE_RECOVERY_PROMPT}\n\n"
        f"Document id: {document_id}\n"
        f"Source file: {source_file}\n"
        f"Current source page: {page_number}\n"
        "Use the current source page number in every source_pages array.\n"
        f"Visible passage_id to link: {group.get('passage_id')}\n"
        f"Visible passage instruction/title: {group.get('passage_instruction') or ''} {group.get('passage_title') or ''}\n"
        f"Expected range numbers: {', '.join(str(number) for number in group.get('expected_numbers') or [])}\n"
        f"Missing question numbers to recover: {', '.join(str(number) for number in group.get('missing_numbers') or [])}\n"
        f"Existing passage excerpt for context:\n{passage_excerpt}"
    )


def _recover_missing_korean_range_questions(
    client: OpenAI,
    model_pool: list[str],
    rendered_pages_by_number: dict[int, RenderedPage],
    document: dict[str, Any],
    document_id: str,
    source_file: str,
    page_count: int,
    batch_id: UUID,
    total_units: int,
) -> dict[str, Any]:
    missing_groups = missing_passage_range_questions(document)
    if not missing_groups:
        return document

    settings = get_settings()
    recovered_payloads: list[dict[str, Any]] = []
    for index, group in enumerate(missing_groups, start=1):
        page_numbers = [int(page) for page in group.get("source_pages") or [] if int(page or 0) > 0]
        page_number = page_numbers[0] if page_numbers else 1
        page = rendered_pages_by_number.get(page_number)
        if not page:
            continue
        set_progress(batch_id, f"국어 범위 누락 문항 보정 중 ({index}/{len(missing_groups)})", total_units, total_units)
        items = vision_json(
            client,
            page.base64_png,
            _korean_range_recovery_prompt(document_id, source_file, page_number, group),
            _page_split_model(model_pool, page.page_index, page_count),
            page.ai_image_mime,
            max(settings.ai_max_output_tokens, settings.ai_solution_max_output_tokens),
            settings.ai_image_detail,
        )
        raw = items[0] if items and isinstance(items[0], dict) else {}
        payload = normalize_korean_page_payload(raw, document_id, source_file, page_number, subject="korean")
        missing_numbers = {str(number) for number in group.get("missing_numbers") or []}
        for question in payload.get("questions") or []:
            if not isinstance(question, dict):
                continue
            if _question_number_key(question.get("question_number")) in missing_numbers and not question.get("linked_passage_id"):
                question["linked_passage_id"] = group.get("passage_id")
        recovered_payloads.append(payload)

    if not recovered_payloads:
        return document
    return merge_korean_page_payloads(document_id, source_file, [document, *recovered_payloads], subject="korean")


def _extract_korean_problem_document(
    path: str,
    batch_id: UUID,
    document_id: str,
    source_file: str,
    page_count: int,
    dpi: int,
    total_units: int,
    subject_engine: str = KOREAN_ENGINE,
) -> tuple[dict[str, Any], dict[int, str]]:
    settings = get_settings()
    client = _openai_client()
    model_pool = _ai_model_pool()
    engine = normalize_subject_engine(subject_engine)
    engine_label = language_engine_label(engine)
    extraction_prompt = ENGLISH_EXTRACTION_PROMPT if engine == ENGLISH_ENGINE else KOREAN_EXTRACTION_PROMPT
    page_payloads: list[dict[str, Any]] = []
    review_page_urls: dict[int, str] = {}
    rendered_pages_by_number: dict[int, RenderedPage] = {}
    processed_pages = 0
    for range_group in iter_split_page_range_groups(page_count, len(model_pool)):
        chunk_len = sum(end - start for start, end in range_group)
        rendered_groups: list[list[RenderedPage]] = []
        rendered_pages = 0
        for start, end in range_group:
            rendered = render_pdf(
                path,
                batch_id=batch_id,
                label=f"{engine_label} PDF 렌더링 중",
                start_page=start,
                end_page=end,
                dpi=dpi,
                progress_offset=processed_pages + rendered_pages,
                progress_total=total_units,
            )
            rendered_groups.append(rendered)
            rendered_pages += end - start
        pages = interleave_rendered_page_groups(rendered_groups)
        for page in pages:
            page_number = page.page_index + 1
            filename = f"{batch_id}_page_{page_number}_review_source.png"
            review_page_urls[page_number] = save_visual_bytes(page.png_bytes, filename)
            rendered_pages_by_number[page_number] = page
        completed = 0
        set_progress(batch_id, f"{engine_label} 지문/문항 추출 중 (0/{len(pages)}페이지)", processed_pages + chunk_len, total_units)
        with ThreadPoolExecutor(max_workers=_ai_worker_count(len(pages), len(model_pool))) as executor:
            futures = {
                executor.submit(
                    vision_json,
                    client,
                    page.base64_png,
                    (
                        f"{extraction_prompt}\n\n"
                        f"Document id: {document_id}\n"
                        f"Source file: {source_file}\n"
                        f"Current source page: {page.page_index + 1}\n"
                        "Use the current source page number in every source_pages array."
                    ),
                    _page_split_model(model_pool, page.page_index, page_count),
                    page.ai_image_mime,
                    max(settings.ai_max_output_tokens, settings.ai_solution_max_output_tokens),
                    settings.ai_image_detail,
                ): page
                for page in pages
            }
            for future, page in _completed_futures_with_heartbeat(
                futures,
                batch_id=batch_id,
                message_factory=lambda: f"{engine_label} 지문/문항 추출 중 ({completed}/{len(pages)}페이지, AI 응답 대기 중)",
                current_factory=lambda: processed_pages + chunk_len + completed,
                total=total_units,
            ):
                items = future.result()
                raw = items[0] if items and isinstance(items[0], dict) else {}
                if engine == ENGLISH_ENGINE:
                    page_payloads.append(normalize_english_page_payload(raw, document_id, source_file, page.page_index + 1))
                else:
                    page_payloads.append(normalize_korean_page_payload(raw, document_id, source_file, page.page_index + 1, subject=engine))
                completed += 1
                set_progress(
                    batch_id,
                    f"{engine_label} 지문/문항 추출 중 ({completed}/{len(pages)}페이지, {page.page_index + 1}/{page_count}페이지)",
                    processed_pages + chunk_len + completed,
                    total_units,
                )
        processed_pages += chunk_len
    if engine == ENGLISH_ENGINE:
        return merge_english_page_payloads(document_id, source_file, page_payloads), review_page_urls
    document = merge_korean_page_payloads(document_id, source_file, page_payloads, subject=engine)
    if engine == KOREAN_ENGINE:
        document = _recover_missing_korean_range_questions(
            client,
            model_pool,
            rendered_pages_by_number,
            document,
            document_id,
            source_file,
            page_count,
            batch_id,
            total_units,
        )
    return document, review_page_urls


def _extract_korean_solution_items(
    path: str,
    batch_id: UUID,
    page_count: int,
    dpi: int,
    offset: int,
    total_units: int,
    subject_engine: str = KOREAN_ENGINE,
    page_indexes: list[int] | None = None,
) -> list[dict[str, Any]]:
    settings = get_settings()
    client = _openai_client()
    model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
    engine = normalize_subject_engine(subject_engine)
    engine_label = language_engine_label(engine)
    solution_prompt = ENGLISH_SOLUTION_PROMPT if engine == ENGLISH_ENGINE else KOREAN_SOLUTION_PROMPT
    answer_items: list[dict[str, Any]] = []

    def extract_answer_items_from_pages(pages: list[RenderedPage], progress_base: int) -> list[dict[str, Any]]:
        if not pages:
            return []
        extracted_items: list[dict[str, Any]] = []
        completed = 0
        set_progress(batch_id, f"{engine_label} 답안 추출 중 (0/{len(pages)}페이지)", progress_base, total_units)
        with ThreadPoolExecutor(max_workers=_ai_worker_count(len(pages), len(model_pool))) as executor:
            futures = {
                executor.submit(
                    vision_json,
                    client,
                    page.base64_png,
                    f"{solution_prompt}\n\nCurrent source page: {page.page_index + 1}. Use this page number in source_pages.",
                    _page_split_model(model_pool, page.page_index, page_count),
                    page.ai_image_mime,
                    settings.ai_solution_max_output_tokens,
                    settings.ai_solution_image_detail,
                ): page
                for page in pages
            }
            for future, page in _completed_futures_with_heartbeat(
                futures,
                batch_id=batch_id,
                message_factory=lambda: f"{engine_label} 답안 추출 중 ({completed}/{len(pages)}페이지, AI 응답 대기 중)",
                current_factory=lambda: progress_base + completed,
                total=total_units,
            ):
                items = future.result()
                completed += 1
                set_progress(
                    batch_id,
                    f"{engine_label} 답안 추출 중 ({completed}/{len(pages)}페이지, {page.page_index + 1}/{page_count}페이지)",
                    progress_base + completed,
                    total_units,
                )
                for item in items:
                    if isinstance(item, dict) and str(item.get("question_number") or "").strip():
                        extracted_items.append(item)
        return extracted_items

    if page_indexes is not None:
        selected_indexes: list[int] = []
        for raw_index in page_indexes:
            try:
                index = int(raw_index)
            except (TypeError, ValueError):
                continue
            if 0 <= index < page_count:
                selected_indexes.append(index)
        selected_indexes = sorted(set(selected_indexes))
        pages = render_pdf_page_indexes(
            path,
            selected_indexes,
            batch_id=batch_id,
            label=f"{engine_label} 빠른 답안표 렌더링 중",
            dpi=dpi,
            progress_offset=offset,
            progress_total=total_units,
        )
        return extract_answer_items_from_pages(pages, offset + len(pages))

    processed_pages = 0
    for range_group in iter_split_page_range_groups(page_count, len(model_pool)):
        chunk_len = sum(end - start for start, end in range_group)
        base = offset + processed_pages
        rendered_groups: list[list[RenderedPage]] = []
        rendered_pages = 0
        for start, end in range_group:
            rendered = render_pdf(
                path,
                batch_id=batch_id,
                label=f"{engine_label} 답안 PDF 렌더링 중",
                start_page=start,
                end_page=end,
                dpi=dpi,
                progress_offset=base + rendered_pages,
                progress_total=total_units,
            )
            rendered_groups.append(rendered)
            rendered_pages += end - start
        pages = interleave_rendered_page_groups(rendered_groups)
        answer_items.extend(extract_answer_items_from_pages(pages, base + chunk_len))
        processed_pages += chunk_len
    return answer_items


def _korean_question_number(value: Any, fallback: int) -> int:
    match = re.search(r"\d+", str(value or ""))
    return int(match.group(0)) if match else fallback


def _korean_problem_text(question: dict[str, Any], passage: dict[str, Any] | None) -> str:
    parts: list[str] = []
    if question.get("question_stem"):
        parts.append(str(question["question_stem"]))
    if question.get("additional_material"):
        parts.append(str(question["additional_material"]))
    choices = question.get("choices") if isinstance(question.get("choices"), list) else []
    choice_lines = [
        f"{choice.get('choice_label', '')} {choice.get('choice_text', '')}".strip()
        for choice in choices
        if isinstance(choice, dict)
    ]
    if choice_lines:
        parts.append("\n".join(choice_lines))
    return "\n\n".join(part for part in parts if part.strip()).strip() or str(question.get("question_stem") or "")


def _save_korean_document_results(db: Session, batch: Batch, document: dict[str, Any], review_page_urls: dict[int, str] | None = None) -> None:
    subject_engine = normalize_subject_engine(batch.subject_engine)
    subject_label = language_engine_label(subject_engine)
    existing = db.query(KoreanExtractionDocument).filter(KoreanExtractionDocument.batch_id == batch.id).first()
    if existing:
        db.query(KoreanQuestion).filter(KoreanQuestion.document_id == existing.id).delete(synchronize_session=False)
        db.query(KoreanPassageGroup).filter(KoreanPassageGroup.document_id == existing.id).delete(synchronize_session=False)
        db.delete(existing)
        db.flush()

    record = KoreanExtractionDocument(
        batch_id=batch.id,
        document_id=str(document.get("document_id") or batch.id),
        subject=subject_engine,
        source_file=str(document.get("source_file") or batch.problem_pdf_filename),
        payload=document,
        global_warnings=document.get("global_warnings") or [],
    )
    db.add(record)
    db.flush()

    passages = document.get("passage_groups") if isinstance(document.get("passage_groups"), list) else []
    questions = document.get("questions") if isinstance(document.get("questions"), list) else []
    passage_by_id = {str(passage.get("passage_id")): passage for passage in passages if isinstance(passage, dict)}

    for passage in passages:
        if not isinstance(passage, dict):
            continue
        db.add(
            KoreanPassageGroup(
                document_id=record.id,
                passage_id=str(passage.get("passage_id") or ""),
                source_pages=passage.get("source_pages") or [],
                passage_instruction=passage.get("passage_instruction"),
                passage_title=passage.get("passage_title"),
                passage_text=str(passage.get("passage_text") or ""),
                passage_type=str(passage.get("passage_type") or "unknown"),
                linked_question_ids=passage.get("linked_question_ids") or [],
                extraction_confidence=float(passage.get("extraction_confidence") or 0),
                warnings=passage.get("warnings") or [],
                needs_review=True,
            )
        )

    batch_name = (batch.name or f"{subject_label} batch").strip()
    for index, question in enumerate(questions, start=1):
        if not isinstance(question, dict):
            continue
        passage = passage_by_id.get(str(question.get("linked_passage_id") or ""))
        db.add(
            KoreanQuestion(
                document_id=record.id,
                question_id=str(question.get("question_id") or f"q{index}"),
                source_pages=question.get("source_pages") or [],
                question_number=str(question.get("question_number") or ""),
                linked_passage_id=question.get("linked_passage_id"),
                question_stem=str(question.get("question_stem") or ""),
                additional_material=question.get("additional_material"),
                choices=question.get("choices") or [],
                answer=question.get("answer"),
                solution=None,
                extraction_confidence=float(question.get("extraction_confidence") or 0),
                warnings=question.get("warnings") or [],
            )
        )

        source_pages = question.get("source_pages") or []
        first_page = int(source_pages[0]) if source_pages else 1
        combined_warnings = list(document.get("global_warnings") or []) + list(question.get("warnings") or [])
        if passage:
            combined_warnings.extend(passage.get("warnings") or [])
        problem = Problem(
            problem_number=_korean_question_number(question.get("question_number"), index),
            problem_text=_korean_problem_text(question, passage),
            choices=_normalize_problem_choices(question.get("choices")),
            has_visual=False,
            visual_url=None,
            review_page_image_url=(review_page_urls or {}).get(first_page),
            review_page_number=first_page,
            answer=question.get("answer"),
            solution_steps=None,
            key_concept=None,
            needs_review=True,
            source_batch_id=batch.id,
            source_type=batch.source_type,
            source_label=batch.source_label,
            rights_confirmed=batch.rights_confirmed,
            rights_confirmed_at=batch.rights_confirmed_at,
            rights_note=batch.rights_note,
            visibility="private",
            origin_type="owned" if batch.source_type in {"self_created", "academy_internal"} else "licensed" if batch.source_type == "licensed" else "imported_unknown" if batch.source_type == "unknown" else "derived",
            owner_id=batch.owner_id,
            academy_id=batch.academy_id,
        )
        problem.tags = Tag(
            subject=subject_label,
            unit=(passage.get("passage_type") if passage else None) or None,
            problem_type="객관식" if question.get("choices") else None,
            source=f"{batch_name} / p.{first_page} / {question.get('question_number') or index}번",
        )
        db.add(problem)


def process_korean_batch(db: Session, batch: Batch, batch_id: UUID) -> None:
    settings = get_settings()
    subject_engine = normalize_subject_engine(batch.subject_engine)
    subject_label = language_engine_label(subject_engine)
    problem_page_count = count_pdf_pages(batch.problem_pdf_filename)
    solution_page_count = count_pdf_pages(batch.solution_pdf_filename) if batch.solution_pdf_filename else 0
    total_units = max(problem_page_count * 2 + solution_page_count * 2, 1)
    problem_dpi = choose_render_dpi(batch.problem_pdf_filename, problem_page_count)
    solution_dpi = (settings.pdf_solution_render_dpi or choose_render_dpi(batch.solution_pdf_filename, solution_page_count)) if batch.solution_pdf_filename else problem_dpi
    set_progress(batch_id, f"{subject_label} 추출 준비 완료", 0, total_units)
    document_id = f"{subject_engine}-{batch.id}"

    document, review_page_urls = _extract_korean_problem_document(
        batch.problem_pdf_filename,
        batch_id,
        document_id,
        os.path.basename(batch.problem_pdf_filename),
        problem_page_count,
        problem_dpi,
        total_units,
        subject_engine=subject_engine,
    )
    _write_batch_artifact(batch_id, "korean_extraction.json", document)

    if batch.solution_pdf_filename:
        answer_items: list[dict[str, Any]] = []
        question_count = len([question for question in document.get("questions") or [] if isinstance(question, dict)])
        quick_answer_report = scan_quick_answer_table_pages(
            batch.solution_pdf_filename,
            solution_page_count,
            solution_dpi,
            batch_id,
            progress_offset=problem_page_count * 2,
            total_units=total_units,
        )
        selected_quick_pages = [int(index) for index in quick_answer_report.get("selected_page_indexes") or []]
        if selected_quick_pages:
            answer_items = _extract_korean_solution_items(
                batch.solution_pdf_filename,
                batch_id,
                solution_page_count,
                solution_dpi,
                offset=problem_page_count * 2,
                total_units=total_units,
                subject_engine=subject_engine,
                page_indexes=selected_quick_pages,
            )
        quick_answer_count = len(
            {
                _question_number_key(item.get("question_number"))
                for item in answer_items
                if isinstance(item, dict) and _question_number_key(item.get("question_number"))
            }
        )
        quick_answer_report["expected_problem_count"] = question_count
        quick_answer_report["extracted_answer_count"] = quick_answer_count
        quick_answer_report["coverage_threshold_met"] = _quick_answers_cover_expected_count(quick_answer_count, question_count)
        if _quick_answers_cover_expected_count(quick_answer_count, question_count):
            quick_answer_report["used"] = True
            quick_answer_report["final_used_source"] = "quick_answer_table"
        else:
            quick_answer_report["used"] = False
            quick_answer_report.setdefault("fallback_reason", "quick_answer_count_below_extracted_question_count")
            quick_answer_report["final_used_source"] = "full_solution_pdf"
            answer_items = _extract_korean_solution_items(
                batch.solution_pdf_filename,
                batch_id,
                solution_page_count,
                solution_dpi,
                offset=problem_page_count * 2,
                total_units=total_units,
                subject_engine=subject_engine,
            )
            quick_answer_report["full_fallback_answer_count"] = len(
                {
                    _question_number_key(item.get("question_number"))
                    for item in answer_items
                    if isinstance(item, dict) and _question_number_key(item.get("question_number"))
                }
            )
        _write_batch_artifact(batch_id, "quick_answer_table_report.json", quick_answer_report)
        _write_batch_artifact(batch_id, "korean_answer_solution_items.json", answer_items)
        document = map_korean_answers(document, answer_items)
        _write_batch_artifact(batch_id, "korean_extraction_with_answers.json", document)

    set_progress(batch_id, f"{subject_label} 지문/문항 저장 중", total_units, total_units)
    ensure_batch_active(batch_id)
    _save_korean_document_results(db, batch, document, review_page_urls)
    ensure_batch_active(batch_id)
    batch.status = BatchStatus.done
    batch.processing_task = "full"
    batch.progress_message = "완료"
    batch.progress_current = total_units
    batch.progress_total = total_units
    batch.progress_updated_at = datetime.utcnow()
    db.commit()
    set_progress(batch_id, "완료", total_units, total_units, allow_inactive=True)


def _language_document_without_answers(document: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(document or {})
    for question in payload.get("questions") or []:
        if isinstance(question, dict):
            question["answer"] = None
            question["solution"] = None
    return payload


def _language_answer_items_by_number(answer_items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_number: dict[str, dict[str, Any]] = {}
    for item in answer_items:
        if not isinstance(item, dict):
            continue
        number = _question_number_key(item.get("question_number"))
        answer = str(item.get("answer") or "").strip()
        if number and answer:
            by_number[number] = item
    return by_number


def _apply_language_answers_to_existing_records(
    db: Session,
    batch: Batch,
    document: KoreanExtractionDocument,
    mapped_document: dict[str, Any],
    answer_items: list[dict[str, Any]],
) -> dict[str, Any]:
    answer_by_number = _language_answer_items_by_number(answer_items)
    questions = db.scalars(select(KoreanQuestion).where(KoreanQuestion.document_id == document.id)).all()
    problems = db.scalars(
        select(Problem)
        .where(Problem.source_batch_id == batch.id, Problem.deleted_at.is_(None))
        .order_by(
            Problem.review_page_number.is_(None).asc(),
            Problem.review_page_number.asc(),
            Problem.problem_number.asc(),
            Problem.created_at.asc(),
            Problem.id.asc(),
        )
    ).all()

    matched_question_count = 0
    unmatched_question_count = 0
    matched_problem_count = 0
    unmatched_problem_count = 0
    cleared_stale_count = 0
    now = datetime.utcnow()

    for question in questions:
        number = _question_number_key(question.question_number)
        item = answer_by_number.get(number)
        answer = str(item.get("answer") or "").strip() if item else ""
        if answer:
            question.answer = answer
            question.solution = None
            matched_question_count += 1
        else:
            question.answer = None
            question.solution = None
            unmatched_question_count += 1

    for problem in problems:
        number = _question_number_key(problem.problem_number)
        item = answer_by_number.get(number)
        answer = str(item.get("answer") or "").strip() if item else ""
        if answer:
            problem.answer = answer
            problem.solution_steps = None
            problem.key_concept = None
            problem.needs_review = True
            matched_problem_count += 1
        else:
            if has_solution_content({"answer": problem.answer}):
                cleared_stale_count += 1
            problem.answer = None
            problem.solution_steps = None
            problem.key_concept = None
            problem.needs_review = True
            unmatched_problem_count += 1
        problem.updated_at = now

    document.payload = mapped_document
    document.global_warnings = mapped_document.get("global_warnings") or []
    document.updated_at = now
    return {
        "question_count": len(questions),
        "problem_count": len(problems),
        "solution_count": len(answer_by_number),
        "matched_question_count": matched_question_count,
        "unmatched_question_count": unmatched_question_count,
        "matched_count": matched_problem_count,
        "unmatched_count": unmatched_problem_count,
        "cleared_stale_count": cleared_stale_count,
    }


def process_language_solutions_only(
    db: Session,
    batch: Batch,
    batch_id: UUID,
    existing_problem_count: int,
    settings: Any,
    solution_mode: str,
) -> None:
    engine = normalize_subject_engine(batch.subject_engine)
    subject_label = language_engine_label(engine)
    document = db.scalar(select(KoreanExtractionDocument).where(KoreanExtractionDocument.batch_id == batch.id))
    if not document:
        raise RuntimeError(f"Existing {subject_label} extraction document is required before reprocessing answers.")

    solution_page_count = count_pdf_pages(batch.solution_pdf_filename)
    solution_dpi = settings.pdf_solution_render_dpi or choose_render_dpi(batch.solution_pdf_filename, solution_page_count)
    total_units = max(solution_page_count * 2, 1)
    set_progress(batch_id, f"{subject_label} 답안 PDF 페이지 수 확인 완료", 0, total_units)

    answer_items: list[dict[str, Any]] = []
    quick_answer_report = scan_quick_answer_table_pages(
        batch.solution_pdf_filename,
        solution_page_count,
        solution_dpi,
        batch_id,
        progress_offset=0,
        total_units=total_units,
    )
    selected_quick_pages = [int(index) for index in quick_answer_report.get("selected_page_indexes") or []]
    if selected_quick_pages:
        answer_items = _extract_korean_solution_items(
            batch.solution_pdf_filename,
            batch_id,
            solution_page_count,
            solution_dpi,
            offset=0,
            total_units=total_units,
            subject_engine=engine,
            page_indexes=selected_quick_pages,
        )

    quick_answer_count = len(_language_answer_items_by_number(answer_items))
    quick_answer_report["expected_problem_count"] = existing_problem_count
    quick_answer_report["extracted_answer_count"] = quick_answer_count
    quick_answer_report["coverage_threshold_met"] = _quick_answers_cover_expected_count(quick_answer_count, existing_problem_count)
    if _quick_answers_cover_expected_count(quick_answer_count, existing_problem_count):
        quick_answer_report["used"] = True
        quick_answer_report["final_used_source"] = "quick_answer_table"
    else:
        quick_answer_report["used"] = False
        quick_answer_report.setdefault("fallback_reason", "quick_answer_count_below_existing_problem_count")
        quick_answer_report["final_used_source"] = "full_solution_pdf"
        answer_items = _extract_korean_solution_items(
            batch.solution_pdf_filename,
            batch_id,
            solution_page_count,
            solution_dpi,
            offset=0,
            total_units=total_units,
            subject_engine=engine,
        )
        quick_answer_report["full_fallback_answer_count"] = len(_language_answer_items_by_number(answer_items))

    if not answer_items:
        raise RuntimeError("Answer PDF was provided, but no answer content was extracted.")

    base_document = _language_document_without_answers(document.payload or {})
    mapped_document = map_korean_answers(base_document, answer_items)
    stats = _apply_language_answers_to_existing_records(db, batch, document, mapped_document, answer_items)
    _write_batch_artifact(batch_id, "quick_answer_table_report.json", quick_answer_report)
    _write_batch_artifact(batch_id, "korean_answer_solution_items.json", answer_items)
    _write_batch_artifact(batch_id, "korean_extraction_with_answers.json", mapped_document)
    _write_batch_artifact(
        batch_id,
        "solution_reprocess_report.json",
        {
            "batch_id": str(batch_id),
            "ai_solution_mode": solution_mode,
            "ai_solution_model_pool": _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model),
            "ai_solution_image_detail": settings.ai_solution_image_detail,
            "subject_engine": engine,
            "solution_page_count": solution_page_count,
            "quick_answer_table": quick_answer_report,
            "quick_answer_table_used": bool(quick_answer_report.get("used")),
            "stats": stats,
        },
    )

    ensure_batch_active(batch_id)
    batch.status = BatchStatus.done
    batch.processing_task = "solution_only"
    batch.progress_message = (
        f"{subject_label} 답안 재처리 완료({solution_mode}): "
        f"{stats['matched_count']}개 매칭, {stats['unmatched_count']}개 확인 필요, "
        f"{stats['cleared_stale_count']}개 기존 답안 비움"
    )
    batch.progress_current = total_units
    batch.progress_total = total_units
    batch.progress_updated_at = datetime.utcnow()
    batch.failure_stage = None
    batch.failure_reason = None
    batch.failure_hint = None
    batch.failed_at = None
    db.commit()
    set_progress(batch_id, batch.progress_message, total_units, total_units, allow_inactive=True)


def get_progress_message(batch: Batch) -> str:
    return str(get_progress_detail(batch)["progress_message"])


def get_progress_detail(batch: Batch) -> dict[str, Any]:
    key = str(batch.id)
    raw_status = batch.status.value if isinstance(batch.status, BatchStatus) else str(batch.status or BatchStatus.pending.value)
    try:
        status = BatchStatus(raw_status)
    except ValueError:
        status = BatchStatus.pending
    message = progress_messages.get(
        key,
        batch.progress_message
        or {
            BatchStatus.pending: "대기 중",
            BatchStatus.processing: "처리 중",
            BatchStatus.done: "완료",
            BatchStatus.error: "오류가 발생했습니다",
        }.get(status, "처리 중"),
    )
    state = progress_states.get(key)
    base = {
        "failure_stage": batch.failure_stage,
        "failure_reason": batch.failure_reason,
        "failure_hint": batch.failure_hint,
        "failed_at": batch.failed_at,
    }
    if status == BatchStatus.done:
        return {"progress_message": message, "progress_percent": 100, "estimated_seconds_remaining": 0, **base}
    if status == BatchStatus.error:
        return {"progress_message": message, "progress_percent": None, "estimated_seconds_remaining": None, **base}
    current = int(state.get("current") or 0) if state else int(batch.progress_current or 0)
    total = int(state.get("total") or 0) if state else int(batch.progress_total or 0)
    if state:
        elapsed = max(time.time() - float(state.get("started_at") or time.time()), 1.0)
    elif batch.progress_started_at:
        elapsed = max((datetime.utcnow() - batch.progress_started_at).total_seconds(), 1.0)
    else:
        return {"progress_message": message, "progress_percent": None, "estimated_seconds_remaining": None, **base}

    if current <= 0 or total <= 0:
        return {"progress_message": message, "progress_percent": None, "estimated_seconds_remaining": None, **base}

    percent = min(max(int(current * 100 / total), 0), 99)
    ai_request_match = re.search(r"\((\d+)/(\d+)요청 완료", message)
    if ai_request_match and int(ai_request_match.group(1)) == 0:
        return {"progress_message": message, "progress_percent": percent, "estimated_seconds_remaining": None, **base}

    min_samples = min(total, max(3, math.ceil(total * 0.05)))
    if current < min_samples or elapsed < 30:
        return {"progress_message": message, "progress_percent": percent, "estimated_seconds_remaining": None, **base}

    estimated_total = elapsed * total / current
    remaining = max(int(estimated_total - elapsed), 0)
    return {"progress_message": message, "progress_percent": percent, "estimated_seconds_remaining": remaining, **base}


def process_batch(batch_id: UUID) -> None:
    db = SessionLocal()
    try:
        batch = db.get(Batch, batch_id)
        if not batch:
            return
        batch.status = BatchStatus.processing
        batch.processing_task = "full"
        batch.progress_message = "처리 시작"
        batch.progress_current = 0
        batch.progress_total = None
        batch.progress_started_at = datetime.utcnow()
        batch.progress_updated_at = batch.progress_started_at
        batch.failure_stage = None
        batch.failure_reason = None
        batch.failure_hint = None
        batch.failed_at = None
        db.commit()
        set_progress(batch_id, "처리 시작", 0, 0, reset=True)
        if not get_settings().openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for processing")

        settings = get_settings()
        if is_language_passage_engine(batch.subject_engine):
            process_korean_batch(db, batch, batch_id)
            return

        extraction_passes = max(settings.ai_extraction_passes, 1)
        solution_mode = str(settings.ai_solution_mode or "skip").strip().lower()
        should_extract_solutions = bool(batch.solution_pdf_filename and solution_mode != "skip")
        units_per_page = 1 + extraction_passes
        problem_page_count = count_pdf_pages(batch.problem_pdf_filename)
        solution_page_count = count_pdf_pages(batch.solution_pdf_filename) if should_extract_solutions else 0
        structure_units = 2 * (problem_page_count + solution_page_count)
        solution_units = solution_page_count * units_per_page
        problem_units = problem_page_count * units_per_page
        total_units = structure_units + solution_units + problem_units
        problem_dpi = choose_render_dpi(batch.problem_pdf_filename, problem_page_count)
        solution_dpi = (settings.pdf_solution_render_dpi or choose_render_dpi(batch.solution_pdf_filename, solution_page_count)) if should_extract_solutions else problem_dpi
        set_progress(batch_id, "PDF 페이지 수 확인 완료", 0, total_units)

        page_metadata: list[dict[str, Any]] = []
        solutions: list[dict[str, Any]] = []
        quick_answer_report: dict[str, Any] | None = None
        quick_answers_used = False
        if should_extract_solutions:
            quick_solutions, quick_answer_report = extract_quick_answer_table_solutions(
                batch.solution_pdf_filename,
                solution_page_count,
                solution_dpi,
                batch_id,
                progress_offset=0,
                total_units=total_units,
            )
            quick_answer_count = _solution_answer_count(quick_solutions)
            if _quick_answers_cover_expected_count(quick_answer_count, None):
                solutions = quick_solutions
                quick_answers_used = True
                quick_answer_report["used"] = True
                quick_answer_report["final_used_source"] = "quick_answer_table"
            else:
                if quick_answer_report is not None:
                    quick_answer_report["used"] = False
                    quick_answer_report.setdefault("fallback_reason", "quick_answer_table_not_complete")
                page_metadata.extend(
                    collect_page_metadata_for_pdf(
                        batch.solution_pdf_filename,
                        solution_page_count,
                        solution_dpi,
                        "solution",
                        batch_id,
                        offset=0,
                        total_units=total_units,
                    )
                )
        page_metadata.extend(
            collect_page_metadata_for_pdf(
                batch.problem_pdf_filename,
                problem_page_count,
                problem_dpi,
                "problem",
                batch_id,
                offset=solution_page_count * 2,
                total_units=total_units,
            )
        )
        _write_batch_artifact(batch_id, "pages_metadata.json", page_metadata)
        problem_sections = build_section_ranges_from_metadata(page_metadata, "problem", problem_page_count)
        solution_sections = build_section_ranges_from_metadata(page_metadata, "solution", solution_page_count) if should_extract_solutions else []
        _write_batch_artifact(batch_id, "problem_sections.json", problem_sections)
        _write_batch_artifact(batch_id, "solution_sections.json", solution_sections)
        solution_page_metadata = _metadata_by_page(page_metadata, "solution")

        if should_extract_solutions and not quick_answers_used:
            solutions = extract_full_solution_pdf(
                batch.solution_pdf_filename,
                solution_page_count,
                solution_dpi,
                batch_id,
                offset=structure_units,
                total_units=total_units,
                units_per_page=units_per_page,
                solution_sections=solution_sections,
                solution_page_metadata=solution_page_metadata,
            )
            if not any(has_solution_content(solution) for solution in solutions):
                raise RuntimeError("Answer PDF was provided, but no answer content was extracted.")
        if quick_answer_report is not None:
            _write_batch_artifact(batch_id, "quick_answer_table_report.json", quick_answer_report)
        _write_batch_artifact(batch_id, "extracted_solutions_by_section.json", _items_by_section(solutions, "page_idx"))

        problem_model_pool = _ai_model_pool()
        all_extracted: list[dict[str, Any]] = []
        processed_problem_pages = 0
        for range_group in iter_split_page_range_groups(problem_page_count, len(problem_model_pool)):
            chunk_len = sum(end - start for start, end in range_group)
            base = structure_units + solution_units + processed_problem_pages * units_per_page
            rendered_groups: list[list[RenderedPage]] = []
            rendered_pages = 0
            for start, end in range_group:
                rendered = render_pdf(
                    batch.problem_pdf_filename,
                    batch_id=batch_id,
                    label="문제 PDF 렌더링 중",
                    start_page=start,
                    end_page=end,
                    dpi=problem_dpi,
                    progress_offset=base + rendered_pages,
                    progress_total=total_units,
                )
                rendered_groups.append(rendered)
                rendered_pages += end - start
            problem_pages = interleave_rendered_page_groups(rendered_groups)
            extracted = extract_and_cross_check(
                problem_pages,
                batch_id,
                offset=base + chunk_len,
                total=total_units,
                display_total_pages=problem_page_count,
                subject_candidates=batch.subject_candidates,
                unit_candidates=batch.unit_candidates,
            )
            _apply_section_ranges_to_items(extracted, problem_sections, "page_index")
            page_range_label = format_page_range_group(range_group, problem_page_count)

            set_progress(batch_id, f"검토용 원본 페이지 저장 중 ({page_range_label})", base + chunk_len * units_per_page, total_units)
            attach_review_page_images(extracted, problem_pages, batch_id)

            set_progress(batch_id, f"문항 미리보기 검증 중 ({page_range_label})", base + chunk_len * units_per_page, total_units)
            refine_problem_previews(
                extracted,
                problem_pages,
                batch_id,
                progress_offset=base + chunk_len * units_per_page,
                progress_total=total_units,
            )

            set_progress(batch_id, f"선지 정리 중 ({page_range_label})", base + chunk_len * units_per_page, total_units)
            for problem in extracted:
                cleaned, suspicious = strip_answer_choices(problem["problem_text"])
                problem["problem_text"] = normalize_geometry_notation(cleaned)
                problem["needs_review"] = problem["needs_review"] or suspicious or text_has_suspicious_math(problem["problem_text"])

            set_progress(batch_id, f"문항 저장 중 ({page_range_label})", base + chunk_len * units_per_page, total_units)
            all_extracted.extend(extracted)
            processed_problem_pages += chunk_len

        _apply_section_ranges_to_items(all_extracted, problem_sections, "page_index")
        all_extracted = _apply_structure_indexes(all_extracted, page_key="page_index")
        _write_batch_artifact(batch_id, "extracted_problems_by_section.json", _items_by_section(all_extracted, "page_index"))
        if should_extract_solutions and quick_answers_used:
            expected_problem_count = len(all_extracted)
            quick_answer_count = _solution_answer_count(solutions)
            if quick_answer_report is not None:
                quick_answer_report["expected_problem_count"] = expected_problem_count
                quick_answer_report["coverage_threshold_met"] = _quick_answers_cover_expected_count(quick_answer_count, expected_problem_count)
            if not _quick_answers_cover_expected_count(quick_answer_count, expected_problem_count):
                if quick_answer_report is not None:
                    quick_answer_report["used"] = False
                    quick_answer_report["fallback_reason"] = "quick_answer_count_below_extracted_problem_count"
                    quick_answer_report["final_used_source"] = "full_solution_pdf"
                fallback_extra_units = solution_page_count * (units_per_page + 2)
                fallback_total_units = total_units + fallback_extra_units
                fallback_metadata_offset = total_units
                set_progress(batch_id, "빠른 답안표 부족으로 전체 답안 PDF 확인 중", total_units, fallback_total_units)
                solution_metadata = collect_page_metadata_for_pdf(
                    batch.solution_pdf_filename,
                    solution_page_count,
                    solution_dpi,
                    "solution",
                    batch_id,
                    offset=fallback_metadata_offset,
                    total_units=fallback_total_units,
                )
                problem_metadata = [item for item in page_metadata if item.get("document_kind") == "problem"]
                page_metadata = solution_metadata + problem_metadata
                solution_sections = build_section_ranges_from_metadata(solution_metadata, "solution", solution_page_count)
                solution_page_metadata = _metadata_by_page(solution_metadata, "solution")
                _write_batch_artifact(batch_id, "pages_metadata.json", page_metadata)
                _write_batch_artifact(batch_id, "solution_sections.json", solution_sections)
                solutions = extract_full_solution_pdf(
                    batch.solution_pdf_filename,
                    solution_page_count,
                    solution_dpi,
                    batch_id,
                    offset=fallback_metadata_offset + solution_page_count * 2,
                    total_units=fallback_total_units,
                    units_per_page=units_per_page,
                    solution_sections=solution_sections,
                    solution_page_metadata=solution_page_metadata,
                )
                total_units = fallback_total_units
                if quick_answer_report is not None:
                    quick_answer_report["full_fallback_answer_count"] = _solution_answer_count(solutions)
                if not any(has_solution_content(solution) for solution in solutions):
                    raise RuntimeError("Answer PDF was provided, but no answer content was extracted.")
                _write_batch_artifact(batch_id, "extracted_solutions_by_section.json", _items_by_section(solutions, "page_idx"))
                if quick_answer_report is not None:
                    _write_batch_artifact(batch_id, "quick_answer_table_report.json", quick_answer_report)
            elif quick_answer_report is not None:
                quick_answer_report["used"] = True
                quick_answer_report["final_used_source"] = "quick_answer_table"
                _write_batch_artifact(batch_id, "quick_answer_table_report.json", quick_answer_report)
        structure_report = build_structure_validation_report(page_metadata, problem_sections, solution_sections, all_extracted, solutions)
        _mark_section_validation_warnings(all_extracted, structure_report)
        _write_batch_artifact(batch_id, "structure_validation_report.json", structure_report)
        set_progress(batch_id, "문항-답안 매칭 중", total_units, total_units)
        matching_result = match_with_summary(all_extracted, solutions)
        matched_problems = matching_result["problems"]
        _write_batch_artifact(batch_id, "matches_by_section.json", matching_result.get("matches_by_section", {}))
        _write_batch_artifact(batch_id, "validation_report.json", _validation_with_structure(matching_result, structure_report))
        set_progress(batch_id, "문항 저장 중", total_units, total_units)
        ensure_batch_active(batch_id)
        save_results(db, batch, matched_problems)
        db.commit()

        ensure_batch_active(batch_id)
        batch.status = BatchStatus.done
        batch.processing_task = "full"
        batch.progress_message = "완료"
        batch.progress_current = total_units
        batch.progress_total = total_units
        batch.progress_updated_at = datetime.utcnow()
        db.commit()
        set_progress(batch_id, "완료", total_units, total_units, allow_inactive=True)
    except BatchCancelled:
        db.rollback()
    except Exception as exc:
        traceback.print_exc()
        db.rollback()
        last_stage = progress_messages.get(str(batch_id))
        failed = db.get(Batch, batch_id)
        if failed:
            reason, hint = explain_failure(exc)
            failed.status = BatchStatus.error
            failed.processing_task = "full"
            failed.progress_message = "처리에 실패했습니다."
            failed.failure_stage = last_stage or failed.progress_message or "처리 단계 확인 불가"
            failed.failure_reason = reason
            failed.failure_hint = hint
            failed.failed_at = datetime.utcnow()
            db.commit()
            set_progress(batch_id, failed.progress_message, allow_inactive=True)
        else:
            set_progress(batch_id, f"오류: {exc}", allow_inactive=True)
    finally:
        db.close()
        try:
            from services.batch_jobs import schedule_next_batch

            schedule_next_batch()
        except Exception:
            traceback.print_exc()


def process_solutions_only(batch_id: UUID) -> None:
    db = SessionLocal()
    try:
        batch = db.get(Batch, batch_id)
        if not batch:
            return
        if not batch.solution_pdf_filename:
            raise RuntimeError("Answer PDF is required for answer-only reprocessing.")
        existing_problem_count = db.query(Problem).filter(Problem.source_batch_id == batch.id, Problem.deleted_at.is_(None)).count()
        if existing_problem_count <= 0:
            raise RuntimeError("Existing problems are required before reprocessing answers.")

        batch.status = BatchStatus.processing
        batch.processing_task = "solution_only"
        batch.progress_message = "답안 재처리 시작"
        batch.progress_current = 0
        batch.progress_total = None
        batch.progress_started_at = datetime.utcnow()
        batch.progress_updated_at = batch.progress_started_at
        batch.failure_stage = None
        batch.failure_reason = None
        batch.failure_hint = None
        batch.failed_at = None
        db.commit()
        set_progress(batch_id, "답안 재처리 시작", 0, 0, reset=True)
        if not get_settings().openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for processing")

        settings = get_settings()
        solution_mode = str(settings.ai_solution_mode or "skip").strip().lower()
        if solution_mode == "skip":
            raise RuntimeError("AI solution extraction is disabled.")
        if is_language_passage_engine(batch.subject_engine):
            process_language_solutions_only(
                db,
                batch,
                batch_id,
                existing_problem_count,
                settings,
                solution_mode,
            )
            return
        extraction_passes = max(settings.ai_extraction_passes, 1)
        units_per_page = 1 + extraction_passes
        problem_page_count = count_pdf_pages(batch.problem_pdf_filename)
        solution_page_count = count_pdf_pages(batch.solution_pdf_filename)
        stored_problem_sections = _read_batch_artifact(batch_id, "problem_sections.json")
        existing_pages_metadata = _read_batch_artifact(batch_id, "pages_metadata.json")
        problem_page_metadata = [
            item
            for item in (existing_pages_metadata if isinstance(existing_pages_metadata, list) else [])
            if isinstance(item, dict) and item.get("document_kind") == "problem"
        ]
        problem_sections: list[dict[str, Any]] = [
            item for item in (stored_problem_sections if isinstance(stored_problem_sections, list) else []) if isinstance(item, dict)
        ]
        reuse_problem_sections = bool(problem_sections) and _section_ranges_are_usable(problem_sections)
        problem_structure_units = 0 if reuse_problem_sections else 2 * problem_page_count
        solution_structure_units = 2 * solution_page_count
        structure_units = problem_structure_units + solution_structure_units
        solution_units = solution_page_count * units_per_page
        total_units = max(structure_units + solution_units, 1)
        problem_dpi = choose_render_dpi(batch.problem_pdf_filename, problem_page_count)
        solution_dpi = settings.pdf_solution_render_dpi or choose_render_dpi(batch.solution_pdf_filename, solution_page_count)
        solution_model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
        set_progress(batch_id, "답안 PDF 페이지 수 확인 완료", 0, total_units)

        if reuse_problem_sections:
            set_progress(batch_id, "기존 문제 섹션맵 재사용 중", 0, total_units)
        else:
            problem_page_metadata = collect_page_metadata_for_pdf(
                batch.problem_pdf_filename,
                problem_page_count,
                problem_dpi,
                "problem",
                batch_id,
                offset=0,
                total_units=total_units,
            )
            problem_sections = build_section_ranges_from_metadata(problem_page_metadata, "problem", problem_page_count)
            _write_batch_artifact(batch_id, "problem_sections.json", problem_sections)

        solutions: list[dict[str, Any]] = []
        page_metadata: list[dict[str, Any]] = []
        solution_sections: list[dict[str, Any]] = []
        quick_answer_report: dict[str, Any] | None = None
        quick_answers_used = False
        quick_solutions, quick_answer_report = extract_quick_answer_table_solutions(
            batch.solution_pdf_filename,
            solution_page_count,
            solution_dpi,
            batch_id,
            progress_offset=problem_structure_units,
            total_units=total_units,
        )
        quick_answer_count = _solution_answer_count(quick_solutions)
        if _quick_answers_cover_expected_count(quick_answer_count, existing_problem_count):
            solutions = quick_solutions
            quick_answers_used = True
            quick_answer_report["used"] = True
            quick_answer_report["expected_problem_count"] = existing_problem_count
            quick_answer_report["coverage_threshold_met"] = True
            quick_answer_report["final_used_source"] = "quick_answer_table"
            _write_batch_artifact(batch_id, "pages_metadata.json", problem_page_metadata)
            _write_batch_artifact(batch_id, "solution_sections.json", solution_sections)
        else:
            if quick_answer_report is not None:
                quick_answer_report["used"] = False
                quick_answer_report["expected_problem_count"] = existing_problem_count
                quick_answer_report["coverage_threshold_met"] = False
                quick_answer_report.setdefault("fallback_reason", "quick_answer_count_below_existing_problem_count")
                quick_answer_report["final_used_source"] = "full_solution_pdf"
            page_metadata = collect_page_metadata_for_pdf(
                batch.solution_pdf_filename,
                solution_page_count,
                solution_dpi,
                "solution",
                batch_id,
                offset=problem_structure_units,
                total_units=total_units,
            )
            _write_batch_artifact(batch_id, "pages_metadata.json", problem_page_metadata + page_metadata)
            solution_sections = build_section_ranges_from_metadata(page_metadata, "solution", solution_page_count)
            _write_batch_artifact(batch_id, "solution_sections.json", solution_sections)
            solution_page_metadata = _metadata_by_page(page_metadata, "solution")
            solutions = extract_full_solution_pdf(
                batch.solution_pdf_filename,
                solution_page_count,
                solution_dpi,
                batch_id,
                offset=structure_units,
                total_units=total_units,
                units_per_page=units_per_page,
                solution_sections=solution_sections,
                solution_page_metadata=solution_page_metadata,
            )
            if quick_answer_report is not None:
                quick_answer_report["full_fallback_answer_count"] = _solution_answer_count(solutions)
        if not any(has_solution_content(solution) for solution in solutions):
            raise RuntimeError("Answer PDF was provided, but no answer content was extracted.")
        if quick_answer_report is not None:
            _write_batch_artifact(batch_id, "quick_answer_table_report.json", quick_answer_report)

        set_progress(batch_id, "기존 문항과 답안 재매칭 중", total_units, total_units)
        ensure_batch_active(batch_id)
        stats = apply_solutions_to_existing_problems(
            db,
            batch,
            solutions,
            problem_sections=problem_sections,
            solution_sections=solution_sections,
            page_metadata=problem_page_metadata + page_metadata,
        )
        _write_batch_artifact(
            batch_id,
            "solution_reprocess_report.json",
            {
                "batch_id": str(batch_id),
                "ai_solution_mode": solution_mode,
                "ai_solution_model_pool": solution_model_pool,
                "ai_solution_image_detail": settings.ai_solution_image_detail,
                "problem_page_count": problem_page_count,
                "solution_page_count": solution_page_count,
                "reused_problem_sections": reuse_problem_sections,
                "quick_answer_table": quick_answer_report,
                "quick_answer_table_used": quick_answers_used,
                "problem_sections": problem_sections,
                "solution_sections": solution_sections,
                "stats": stats,
            },
        )
        ensure_batch_active(batch_id)
        batch.status = BatchStatus.done
        batch.processing_task = "solution_only"
        batch.progress_message = (
            f"답안 재처리 완료({solution_mode}): "
            f"{stats['matched_count']}개 매칭, {stats['unmatched_count']}개 확인 필요, "
            f"{stats['cleared_stale_count']}개 기존 답안 비움"
        )
        batch.progress_current = total_units
        batch.progress_total = total_units
        batch.progress_updated_at = datetime.utcnow()
        batch.failure_stage = None
        batch.failure_reason = None
        batch.failure_hint = None
        batch.failed_at = None
        db.commit()
        set_progress(batch_id, batch.progress_message, total_units, total_units, allow_inactive=True)
    except BatchCancelled:
        db.rollback()
    except Exception as exc:
        traceback.print_exc()
        db.rollback()
        last_stage = progress_messages.get(str(batch_id))
        failed = db.get(Batch, batch_id)
        if failed:
            reason, hint = explain_failure(exc)
            failed.status = BatchStatus.error
            failed.processing_task = "solution_only"
            failed.progress_message = "답안 재처리에 실패했습니다."
            failed.failure_stage = last_stage or failed.progress_message or "답안 재처리 단계 확인 불가"
            failed.failure_reason = reason
            failed.failure_hint = hint
            failed.failed_at = datetime.utcnow()
            failed.progress_updated_at = failed.failed_at
            db.commit()
            set_progress(batch_id, failed.progress_message, allow_inactive=True)
        else:
            set_progress(batch_id, f"오류: {exc}", allow_inactive=True)
    finally:
        db.close()
        try:
            from services.batch_jobs import schedule_next_batch

            schedule_next_batch()
        except Exception:
            traceback.print_exc()


def render_pdf(
    path: str,
    batch_id: UUID | None = None,
    label: str = "PDF 렌더링 중",
    start_page: int = 0,
    end_page: int | None = None,
    dpi: int = DEFAULT_RENDER_DPI,
    progress_offset: int = 0,
    progress_total: int | None = None,
) -> list[RenderedPage]:
    doc = fitz.open(path)
    pages: list[RenderedPage] = []
    page_count = doc.page_count
    end = min(end_page if end_page is not None else page_count, page_count)
    matrix = fitz.Matrix(dpi / 72, dpi / 72)
    for local_index, index in enumerate(range(start_page, end)):
        page = doc[index]
        if batch_id:
            set_progress(batch_id, f"{label} ({index + 1}/{page_count}페이지)", progress_offset + local_index + 1, progress_total or page_count)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        png = pix.tobytes("png")
        ai_bytes = png
        ai_mime = "image/png"
        settings = get_settings()
        if settings.ai_image_format.lower() in {"jpg", "jpeg"}:
            buffer = io.BytesIO()
            quality = min(max(int(settings.ai_image_jpeg_quality or 82), 50), 95)
            with Image.open(io.BytesIO(png)) as image:
                image.convert("RGB").save(buffer, format="JPEG", quality=quality, optimize=True)
            ai_bytes = buffer.getvalue()
            ai_mime = "image/jpeg"
        pages.append(RenderedPage(index, base64.b64encode(ai_bytes).decode("ascii"), png, ai_mime))
    doc.close()
    return pages


def _rate_limit_sleep_seconds(exc: RateLimitError, attempt: int) -> float:
    settings = get_settings()
    response = getattr(exc, "response", None)
    if response is not None:
        header_value = response.headers.get("retry-after")
        if header_value:
            try:
                return min(max(float(header_value), 1.0), float(settings.ai_request_max_sleep_seconds))
            except ValueError:
                pass
    match = re.search(r"try again in ([\d.]+)\s*(ms|s)", str(exc), re.IGNORECASE)
    if match:
        value = float(match.group(1))
        seconds = value / 1000 if match.group(2).lower() == "ms" else value
        return min(max(seconds + 1.0, 1.0), float(settings.ai_request_max_sleep_seconds))
    return min(2.0 * (attempt + 1), float(settings.ai_request_max_sleep_seconds))


def _ai_model_pool(raw_pool: str | None = None, fallback: str | None = None) -> list[str]:
    settings = get_settings()
    models = [model.strip() for model in str(raw_pool if raw_pool is not None else settings.ai_model_pool or "").split(",") if model.strip()]
    return models or [fallback or settings.ai_model]


def _openai_error_code(exc: Exception) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict):
            return str(error.get("code") or error.get("type") or "").lower()
        return str(body.get("code") or body.get("type") or "").lower()
    return ""


def _openai_status_code(exc: Exception) -> int | None:
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    response = getattr(exc, "response", None)
    response_status = getattr(response, "status_code", None)
    return response_status if isinstance(response_status, int) else None


def _is_non_retryable_ai_error(exc: Exception) -> bool:
    code = _openai_error_code(exc)
    text = str(exc).lower()
    if code in {"model_not_found", "insufficient_quota", "invalid_api_key"}:
        return True
    if "does not exist or you do not have access" in text:
        return True
    if "exceeded your current quota" in text:
        return True
    status_code = _openai_status_code(exc)
    return status_code in {401, 403, 404}


def _page_split_model(model_pool: list[str], page_index: int, page_count: int | None = None) -> str:
    if len(model_pool) <= 1:
        return model_pool[0]
    total_pages = max(int(page_count or 0), page_index + 1, 1)
    shard_index = min((page_index * len(model_pool)) // total_pages, len(model_pool) - 1)
    return model_pool[shard_index]


def _wait_for_ai_slot(model_name: str) -> None:
    settings = get_settings()
    rpm = max(settings.ai_requests_per_minute, 1)
    min_interval = 60.0 / rpm
    while True:
        with _ai_request_lock:
            now = time.monotonic()
            last_request_at = _last_ai_request_at_by_model.get(model_name, 0.0)
            wait_seconds = min_interval - (now - last_request_at)
            if wait_seconds <= 0:
                _last_ai_request_at_by_model[model_name] = now
                return
        time.sleep(wait_seconds)


def _ai_worker_count(task_count: int, model_count: int = 1) -> int:
    if task_count <= 1:
        return 1
    settings = get_settings()
    worker_limit = int(settings.ai_concurrent_requests or 1) * max(model_count, 1)
    return max(1, min(worker_limit, task_count))


def _vision_chat_completion(
    client: OpenAI,
    model_name: str,
    base64_image: str,
    prompt: str,
    image_mime: str = "image/png",
    max_output_tokens_override: int | None = None,
    image_detail_override: str | None = None,
):
    settings = get_settings()
    max_output_tokens = max(max_output_tokens_override or settings.ai_max_output_tokens, 512)
    image_detail = image_detail_override or settings.ai_image_detail
    kwargs = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{image_mime};base64,{base64_image}",
                            "detail": image_detail,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    }

    try:
        return client.chat.completions.create(max_tokens=max_output_tokens, **kwargs)
    except Exception as exc:
        if "max_tokens" not in str(exc):
            raise

    try:
        return client.chat.completions.create(
            extra_body={"max_completion_tokens": max_output_tokens},
            **kwargs,
        )
    except Exception as exc:
        if "max_completion_tokens" not in str(exc):
            raise

    return client.chat.completions.create(**kwargs)


def vision_json(
    client: OpenAI,
    base64_image: str,
    prompt: str,
    model: str | None = None,
    image_mime: str = "image/png",
    max_output_tokens: int | None = None,
    image_detail: str | None = None,
) -> list[dict[str, Any]]:
    settings = get_settings()
    model_name = model or settings.ai_model
    last_error: Exception | None = None
    for attempt in range(max(settings.ai_request_max_retries, 1)):
        try:
            _wait_for_ai_slot(model_name)
            response = _vision_chat_completion(client, model_name, base64_image, prompt, image_mime, max_output_tokens, image_detail)
            content = response.choices[0].message.content or "[]"
            content = _extract_json_text(content)
            data = _loads_lenient_json(content)
            return data if isinstance(data, list) else []
        except RateLimitError as exc:
            last_error = exc
            if _is_non_retryable_ai_error(exc):
                raise
            time.sleep(_rate_limit_sleep_seconds(exc, attempt))
        except Exception as exc:
            last_error = exc
            if _is_non_retryable_ai_error(exc):
                raise
            if attempt >= 1:
                break
            time.sleep(1)
    raise ValueError(f"Vision request failed after retry: {last_error}")


def _extract_json_text(content: str) -> str:
    text = content.strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
      return text[start : end + 1]
    return text


def _loads_lenient_json(content: str) -> Any:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Vision responses often contain LaTeX like \lim or \frac inside JSON
        # strings. Those are invalid JSON escapes unless the backslash is doubled.
        repaired = _escape_latex_backslashes_in_json_strings(content)
        return json.loads(repaired)


def _escape_latex_backslashes_in_json_strings(content: str) -> str:
    result: list[str] = []
    in_string = False
    i = 0
    while i < len(content):
        char = content[i]
        if char == '"':
            in_string = not in_string
            result.append(char)
            i += 1
            continue
        if in_string and char == "\\":
            next_char = content[i + 1] if i + 1 < len(content) else ""
            if next_char in {'"', "\\"}:
                result.append(char)
                result.append(next_char)
                i += 2
                continue
            else:
                result.append("\\\\")
            i += 1
            continue
        result.append(char)
        i += 1
    return "".join(result)


def _most_common_text(items: list[dict[str, Any]], key: str, candidates: list[str]) -> str | None:
    values = [str(item.get(key) or "").strip() for item in items if str(item.get(key) or "").strip()]
    if candidates:
        allowed = set(candidates)
        values = [value for value in values if value in allowed]
    if not values:
        return None
    return max(set(values), key=lambda value: (values.count(value), -values.index(value)))


def _is_exercise_candidate(item: dict[str, Any]) -> bool:
    marker = item.get("is_exercise")
    if isinstance(marker, bool):
        return marker
    if isinstance(marker, str):
        if marker.strip().lower() in {"false", "no", "0", "skip"}:
            return False
        if marker.strip().lower() in {"true", "yes", "1"}:
            return True
    text = str(item.get("problem_text") or "").strip()
    if len(text) < 12:
        return False
    skip_reason = str(item.get("skip_reason") or "").strip().lower()
    if skip_reason and skip_reason not in {"none", "null", "-"}:
        return False
    return True


def _normalized_visual_bbox(value: Any) -> dict[str, float] | None:
    if value is None:
        return None
    if isinstance(value, dict):
        raw_values = [value.get(key) for key in ("x1", "y1", "x2", "y2")]
    elif isinstance(value, list | tuple) and len(value) >= 4:
        raw_values = value[:4]
    else:
        return None
    try:
        x1, y1, x2, y2 = [float(raw_value) for raw_value in raw_values]
    except (TypeError, ValueError):
        return None
    x1, x2 = sorted((max(0.0, min(1.0, x1)), max(0.0, min(1.0, x2))))
    y1, y2 = sorted((max(0.0, min(1.0, y1)), max(0.0, min(1.0, y2))))
    if x2 - x1 < 0.03 or y2 - y1 < 0.03:
        return None
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}


def _bbox_area(bbox: dict[str, float] | None) -> float:
    if not bbox:
        return 0.0
    return max(0.0, float(bbox["x2"]) - float(bbox["x1"])) * max(0.0, float(bbox["y2"]) - float(bbox["y1"]))


def _preferred_bbox(boxes: list[dict[str, float]], *, largest: bool = False) -> dict[str, float] | None:
    usable = [box for box in boxes if _bbox_area(box) > 0]
    if not usable:
        return None
    return max(usable, key=_bbox_area) if largest else sorted(usable, key=_bbox_area)[len(usable) // 2]


def _bbox_to_pixel_box(
    bbox: dict[str, float],
    width: int,
    height: int,
    *,
    padding_ratio: float = 0.0,
) -> tuple[int, int, int, int] | None:
    if width <= 1 or height <= 1:
        return None
    pad_x = max(0, int(width * padding_ratio))
    pad_y = max(0, int(height * padding_ratio))
    left = max(0, min(width - 1, int(float(bbox["x1"]) * width) - pad_x))
    top = max(0, min(height - 1, int(float(bbox["y1"]) * height) - pad_y))
    right = max(left + 1, min(width, int(math.ceil(float(bbox["x2"]) * width)) + pad_x))
    bottom = max(top + 1, min(height, int(math.ceil(float(bbox["y2"]) * height)) + pad_y))
    if right - left < 8 or bottom - top < 8:
        return None
    return left, top, right, bottom


def _crop_by_normalized_bbox(image: Image.Image, bbox: dict[str, float], *, padding_ratio: float = 0.0) -> Image.Image | None:
    box = _bbox_to_pixel_box(bbox, image.width, image.height, padding_ratio=padding_ratio)
    return image.crop(box) if box else None


VISUAL_CROP_MARGIN_PT = 8
VISUAL_CROP_CANDIDATE_MARGIN_PT = 28


def _points_to_render_pixels(points: float) -> int:
    return max(1, int(round(float(points) * DEFAULT_RENDER_DPI / 72)))


def _clamp_pixel_box(box: tuple[int, int, int, int], width: int, height: int) -> tuple[int, int, int, int] | None:
    left, top, right, bottom = box
    left = max(0, min(width - 1, int(left)))
    top = max(0, min(height - 1, int(top)))
    right = max(left + 1, min(width, int(right)))
    bottom = max(top + 1, min(height, int(bottom)))
    if right - left < 8 or bottom - top < 8:
        return None
    return left, top, right, bottom


def _intersect_pixel_box(
    box: tuple[int, int, int, int],
    bounds: tuple[int, int, int, int] | None,
    width: int,
    height: int,
) -> tuple[int, int, int, int] | None:
    if bounds:
        left = max(box[0], bounds[0])
        top = max(box[1], bounds[1])
        right = min(box[2], bounds[2])
        bottom = min(box[3], bounds[3])
    else:
        left, top, right, bottom = box
    return _clamp_pixel_box((left, top, right, bottom), width, height)


def _expand_pixel_box(
    box: tuple[int, int, int, int],
    width: int,
    height: int,
    margin_px: int,
    bounds: tuple[int, int, int, int] | None = None,
) -> tuple[int, int, int, int] | None:
    expanded = (box[0] - margin_px, box[1] - margin_px, box[2] + margin_px, box[3] + margin_px)
    return _intersect_pixel_box(expanded, bounds, width, height)


def _visual_ink_mask(image: Image.Image, diff_threshold: int = 18, dark_threshold: int = 238) -> Image.Image:
    rgb = image.convert("RGB")
    corners = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((rgb.width - 1, 0)),
        rgb.getpixel((0, rgb.height - 1)),
        rgb.getpixel((rgb.width - 1, rgb.height - 1)),
    ]
    background = max(corners, key=lambda color: color[0] + color[1] + color[2])
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, background)).convert("L")
    gray = rgb.convert("L")
    diff_mask = diff.point(lambda value: 255 if value > diff_threshold else 0)
    dark_mask = gray.point(lambda value: 255 if value < dark_threshold else 0)
    return ImageChops.lighter(diff_mask, dark_mask)


def _projection_counts(mask: Image.Image) -> tuple[list[int], list[int]]:
    width, height = mask.size
    data = mask.tobytes()
    row_counts = [data[y * width : (y + 1) * width].count(255) for y in range(height)]
    col_counts = [0] * width
    for y in range(height):
        row = data[y * width : (y + 1) * width]
        for x, value in enumerate(row):
            if value:
                col_counts[x] += 1
    return row_counts, col_counts


def _active_projection_runs(counts: list[int], min_count: int, gap_tolerance: int) -> list[tuple[int, int, int]]:
    runs: list[tuple[int, int, int]] = []
    run_start: int | None = None
    run_end = 0
    run_total = 0
    gap = 0
    for index, count in enumerate(counts):
        active = count >= min_count
        if active:
            if run_start is None:
                run_start = index
                run_total = 0
            elif gap > gap_tolerance:
                runs.append((run_start, run_end + 1, run_total))
                run_start = index
                run_total = 0
            gap = 0
            run_end = index
            run_total += count
        elif run_start is not None:
            gap += 1
    if run_start is not None:
        runs.append((run_start, run_end + 1, run_total))
    return runs


def _distance_between_intervals(a_start: int, a_end: int, b_start: int, b_end: int) -> int:
    if a_end < b_start:
        return b_start - a_end
    if b_end < a_start:
        return a_start - b_end
    return 0


def _select_ink_interval(
    counts: list[int],
    seed_start: int,
    seed_end: int,
    *,
    min_count: int,
    gap_tolerance: int,
    merge_distance: int,
) -> tuple[int, int] | None:
    runs = _active_projection_runs(counts, min_count, gap_tolerance)
    if not runs:
        return None
    seed_start = max(0, min(len(counts) - 1, seed_start))
    seed_end = max(seed_start + 1, min(len(counts), seed_end))
    seed_mid = (seed_start + seed_end) / 2
    seed_span = seed_end - seed_start
    if seed_span > max(80, int(len(counts) * 0.35)):
        focus_radius = max(merge_distance, int(len(counts) * 0.08))
        seed_start = max(0, int(seed_mid - focus_radius))
        seed_end = min(len(counts), int(seed_mid + focus_radius))
    nearby = [
        run
        for run in runs
        if _distance_between_intervals(run[0], run[1], seed_start, seed_end) <= merge_distance
    ]
    if nearby:
        start = min(run[0] for run in nearby)
        end = max(run[1] for run in nearby)
    else:
        def score(run: tuple[int, int, int]) -> tuple[float, int, int]:
            run_mid = (run[0] + run[1]) / 2
            return (abs(run_mid - seed_mid), -run[2], -(run[1] - run[0]))

        selected = min(runs, key=score)
        start, end = selected[0], selected[1]

    changed = True
    while changed:
        changed = False
        for run_start, run_end, _total in runs:
            if run_end < start and start - run_end <= merge_distance:
                start = run_start
                changed = True
            elif run_start > end and run_start - end <= merge_distance:
                end = run_end
                changed = True
    return start, end


def _ink_box_near_seed(
    image: Image.Image,
    seed_box: tuple[int, int, int, int],
    *,
    padding_px: int,
) -> tuple[int, int, int, int] | None:
    if image.width < 8 or image.height < 8:
        return None
    mask = _visual_ink_mask(image)
    raw_box = mask.getbbox()
    if not raw_box:
        return None
    row_counts, col_counts = _projection_counts(mask)
    row_min = max(2, int(image.width * 0.0015))
    col_min = max(2, int(image.height * 0.0015))
    gap_tolerance = max(2, padding_px // 5)
    merge_distance = max(padding_px * 2, 12)
    row_interval = _select_ink_interval(
        row_counts,
        seed_box[1],
        seed_box[3],
        min_count=row_min,
        gap_tolerance=gap_tolerance,
        merge_distance=merge_distance,
    )
    col_interval = _select_ink_interval(
        col_counts,
        seed_box[0],
        seed_box[2],
        min_count=col_min,
        gap_tolerance=gap_tolerance,
        merge_distance=merge_distance,
    )
    if not row_interval or not col_interval:
        left, top, right, bottom = raw_box
    else:
        left, right = col_interval
        top, bottom = row_interval
    left = max(0, left - padding_px)
    top = max(0, top - padding_px)
    right = min(image.width, right + padding_px)
    bottom = min(image.height, bottom + padding_px)
    if right - left < 8 or bottom - top < 8:
        return None
    return left, top, right, bottom


def _crop_visual_ink_region(
    image: Image.Image,
    visual_bbox: dict[str, float],
    *,
    problem_bbox: dict[str, float] | None = None,
) -> Image.Image | None:
    seed_box = _bbox_to_pixel_box(visual_bbox, image.width, image.height)
    if not seed_box:
        return None
    problem_box = _bbox_to_pixel_box(problem_bbox, image.width, image.height, padding_ratio=0.004) if problem_bbox else None
    if problem_box:
        seed_box = _intersect_pixel_box(seed_box, problem_box, image.width, image.height) or seed_box

    seed_w = seed_box[2] - seed_box[0]
    seed_h = seed_box[3] - seed_box[1]
    candidate_margin = max(
        _points_to_render_pixels(VISUAL_CROP_CANDIDATE_MARGIN_PT),
        int(max(seed_w, seed_h) * 0.35),
        int(min(image.width, image.height) * 0.015),
    )
    candidate_box = _expand_pixel_box(seed_box, image.width, image.height, candidate_margin, problem_box)
    if not candidate_box:
        return None
    candidate = image.crop(candidate_box)
    seed_relative = (
        max(0, seed_box[0] - candidate_box[0]),
        max(0, seed_box[1] - candidate_box[1]),
        min(candidate.width, seed_box[2] - candidate_box[0]),
        min(candidate.height, seed_box[3] - candidate_box[1]),
    )
    margin_px = _points_to_render_pixels(VISUAL_CROP_MARGIN_PT)
    ink_box = _ink_box_near_seed(candidate, seed_relative, padding_px=margin_px)
    if not ink_box:
        return candidate
    return candidate.crop(ink_box)


def _trim_visual_whitespace(image: Image.Image, padding: int = 16, threshold: int = 18) -> Image.Image:
    if image.width < 20 or image.height < 20:
        return image.copy()
    rgb = image.convert("RGB")
    corners = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((rgb.width - 1, 0)),
        rgb.getpixel((0, rgb.height - 1)),
        rgb.getpixel((rgb.width - 1, rgb.height - 1)),
    ]
    background = max(corners, key=lambda color: color[0] + color[1] + color[2])
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, background)).convert("L")
    mask = diff.point(lambda value: 255 if value > threshold else 0)
    crop_box = mask.getbbox()
    if not crop_box:
        return image.copy()
    left = max(0, crop_box[0] - padding)
    top = max(0, crop_box[1] - padding)
    right = min(image.width, crop_box[2] + padding)
    bottom = min(image.height, crop_box[3] + padding)
    if right - left < 8 or bottom - top < 8:
        return image.copy()
    return image.crop((left, top, right, bottom))


BROKEN_MATH_PATTERNS = (
    re.compile(r"(?<!\\)/(?:w|frac|sqrt|sum|lim|int|left|right|overline|bar|cdot|times|theta|alpha|beta|gamma)\b", re.IGNORECASE),
    re.compile(r"\\w(?:\s*\$\$|\b)"),
    re.compile(r"\$\$\s*\$\$|\$\s+\$"),
    re.compile(r"\$\$\s*(?:/|\\w)\w*"),
)


def _math_delimiters_balanced(text: str) -> bool:
    index = 0
    single_count = 0
    display_count = 0
    while index < len(text):
        if text[index] != "$" or (index > 0 and text[index - 1] == "\\"):
            index += 1
            continue
        if text.startswith("$$", index):
            display_count += 1
            index += 2
        else:
            single_count += 1
            index += 1
    return single_count % 2 == 0 and display_count % 2 == 0


def text_has_suspicious_math(text: Any) -> bool:
    value = str(text or "")
    if not value:
        return False
    if not _math_delimiters_balanced(value):
        return True
    return any(pattern.search(value) for pattern in BROKEN_MATH_PATTERNS)


ANCHOR_NUMBER_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:\d+(?:[.,]\d+)?)(?:\s*(?:cm|mm|m|km|°|도))?(?![A-Za-z0-9])",
    re.IGNORECASE,
)
GEOMETRY_LATEX_LABEL_RE = re.compile(
    r"\\(?:triangle|angle|overline|overrightarrow|overleftarrow|widehat)\s*\{?\s*([A-Z]{1,5})\s*\}?"
)
GEOMETRY_TEXT_LABEL_RE = re.compile(
    r"(?:점|꼭짓점|교점|직선|선분|반직선|변|호|각|삼각형|사각형|원|중심)\s*([A-Z]{1,5}(?:\s*,\s*[A-Z]{1,5})*)"
)
COORDINATE_POINT_LABEL_RE = re.compile(r"(?<![A-Za-z])([A-Z])\s*\(")
STANDALONE_POINT_LABEL_RE = re.compile(r"(?<![A-Za-z\\])([A-Z])(?![A-Za-z])")
PLAIN_GEOMETRY_LABEL_RE = re.compile(r"(?:△|∠)\s*([A-Z]{1,5})")
MEASURED_GEOMETRY_LABEL_RE = re.compile(r"(?<![A-Za-z])([A-Z]{1,5})\s*(?==|=|의\s*(?:길이|넓이))")


def _unique_limited(values: list[str], limit: int = 24) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value or "").strip()))
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned)
        if len(result) >= limit:
            break
    return result


def _anchor_numbers(text: str) -> list[str]:
    values: list[str] = []
    for match in ANCHOR_NUMBER_RE.finditer(text):
        token = match.group(0).strip()
        if not token:
            continue
        token = token.replace(",", "")
        if token in {"0", "1", "2", "3", "4", "5"} and re.search(rf"[①②③④⑤]|{re.escape(token)}[\).]", text):
            continue
        values.append(token)
    return _unique_limited(values)


def _expand_geometry_label(raw: str) -> tuple[list[str], list[str]]:
    points: list[str] = []
    labels: list[str] = []
    for part in re.split(r"\s*,\s*", raw or ""):
        token = re.sub(r"[^A-Z]", "", part.upper())
        if not token:
            continue
        labels.append(token)
        points.extend(list(token))
    return points, labels


def _anchor_geometry(text: str) -> tuple[list[str], list[str]]:
    points: list[str] = []
    labels: list[str] = []
    for pattern in (GEOMETRY_LATEX_LABEL_RE, GEOMETRY_TEXT_LABEL_RE, PLAIN_GEOMETRY_LABEL_RE, MEASURED_GEOMETRY_LABEL_RE):
        for match in pattern.finditer(text):
            next_points, next_labels = _expand_geometry_label(match.group(1))
            points.extend(next_points)
            labels.extend(next_labels)
    points.extend(match.group(1).upper() for match in COORDINATE_POINT_LABEL_RE.finditer(text))
    points.extend(match.group(1).upper() for match in STANDALONE_POINT_LABEL_RE.finditer(text))
    return _unique_limited(points), _unique_limited(labels)


def _problem_visual_anchor_hints(problem: dict[str, Any]) -> dict[str, list[str]]:
    text = str(problem.get("problem_text") or "")
    point_labels, geometry_labels = _anchor_geometry(text)
    return {
        "numbers": _anchor_numbers(text),
        "point_labels": point_labels,
        "geometry_labels": geometry_labels,
    }


def _has_visual_anchor_hints(problem: dict[str, Any]) -> bool:
    hints = _problem_visual_anchor_hints(problem)
    return any(hints.values())


def _extract_problem_number(value: Any) -> tuple[int, str] | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    normalized = re.sub(r"\s+", "", raw)
    normalized = re.sub(r"^(?:#|No\.?|NO\.?|문제|문항|번호)+", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:번|문제|문항)$", "", normalized)
    normalized = re.sub(r"(?<=\d)[\.:：\)]$", "", normalized)
    match = re.search(r"\d+", normalized)
    if not match:
        return None
    number = int(match.group(0))
    problem_no = re.sub(r"^0+(\d)", r"\1", normalized) or str(number)
    return number, problem_no


def _structure_label(item: dict[str, Any]) -> str | None:
    for key in ("section_label", "section_id", "chapter", "day"):
        text = str(item.get(key) or "").strip()
        section_id = _usable_section_id(text, allow_plain_title=True)
        if section_id:
            return section_id
        if text and not _is_source_or_subject_label(text):
            return _normalize_section_id(text)
    unit = item.get("unit")
    section_id = _usable_section_id(unit, allow_plain_title=True)
    if section_id:
        return section_id
    return None


def _sort_number(value: Any) -> int:
    match = re.search(r"\d+", str(value or ""))
    return int(match.group(0)) if match else 10**9


def _apply_structure_indexes(items: list[dict[str, Any]], page_key: str = "page_index") -> list[dict[str, Any]]:
    ordered = sorted(
        items,
        key=lambda item: (
            int(item.get(page_key, item.get("page_idx", 0)) or 0),
            int(item.get("_source_order", 0) or 0),
            _sort_number(item.get("problem_number")),
        ),
    )
    last_section: str | None = None
    local_counts: dict[str | None, int] = defaultdict(int)
    for global_index, item in enumerate(ordered, start=1):
        section_label = _structure_label(item)
        if section_label:
            last_section = section_label
            item["section_label"] = section_label
        elif last_section:
            item["section_label"] = last_section
            item["section_inferred"] = True
            section_label = last_section
        local_counts[section_label] += 1
        item["global_index"] = global_index
        item["local_index"] = local_counts[section_label]
        item.setdefault("problem_no", str(item.get("problem_number") or ""))
    return ordered


INLINE_CHOICE_RE = re.compile(r"(?:^|\n)\s*([①②③④⑤]|[1-5][\).])\s*([^\n]+)")
CHOICE_LABELS = ("①", "②", "③", "④", "⑤")


def _choice_label_from_value(value: Any, fallback_index: int | None = None) -> str | None:
    raw = str(value or "").strip()
    if raw in CHOICE_LABELS:
        return raw
    match = re.search(r"[①②③④⑤]|[1-5]", unicodedata.normalize("NFKC", raw))
    if match:
        digit = match.group(0)
        if digit in CHOICE_LABELS:
            return digit
        if digit.isdigit() and 1 <= int(digit) <= len(CHOICE_LABELS):
            return CHOICE_LABELS[int(digit) - 1]
    if fallback_index is not None and 0 <= fallback_index < len(CHOICE_LABELS):
        return CHOICE_LABELS[fallback_index]
    return None


def _inline_choices_from_text(text: Any) -> list[dict[str, str]]:
    choices: list[dict[str, str]] = []
    for match in INLINE_CHOICE_RE.finditer(str(text or "")):
        label = _choice_label_from_value(match.group(1), len(choices))
        choice_text = match.group(2).strip()
        if label and choice_text:
            choices.append({"label": label, "text": choice_text})
    return choices


def _normalize_problem_choices(value: Any, fallback_text: Any = None) -> list[dict[str, str]]:
    raw_items = value if isinstance(value, list) else []
    choices: list[dict[str, str]] = []
    for index, raw in enumerate(raw_items):
        if isinstance(raw, dict):
            label = _choice_label_from_value(raw.get("label") or raw.get("choice_label"), index)
            text = str(raw.get("text") or raw.get("choice_text") or raw.get("value") or "").strip()
        else:
            raw_text = str(raw or "").strip()
            match = re.match(r"^\s*([①②③④⑤]|[1-5][\).])\s*(.*)$", raw_text)
            label = _choice_label_from_value(match.group(1), index) if match else _choice_label_from_value(None, index)
            text = (match.group(2) if match else raw_text).strip()
        if label or text:
            choices.append({"label": label or "", "text": text})
    if not choices:
        choices = _inline_choices_from_text(fallback_text)

    normalized: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for choice in choices:
        label = str(choice.get("label") or "").strip()
        text = normalize_geometry_notation(str(choice.get("text") or "").strip())
        key = (label, re.sub(r"\s+", " ", text))
        if not (label or text) or key in seen:
            continue
        seen.add(key)
        normalized.append({"label": label, "text": text})
        if len(normalized) >= 10:
            break
    return normalized


def _normalize_extracted_items(
    items: list[dict[str, Any]],
    page: RenderedPage,
) -> list[dict[str, Any]]:
    normalized_items: list[dict[str, Any]] = []
    occurrence_counts: dict[tuple[str | None, int], int] = defaultdict(int)
    for item_order, item in enumerate(items):
        number_data = _extract_problem_number(item.get("problem_number"))
        if number_data is None:
            continue
        number, problem_no = number_data
        if not _is_exercise_candidate(item):
            continue
        section_label = _structure_label(item)
        occurrence_key = (section_label, number)
        page_number_occurrence = occurrence_counts[occurrence_key]
        occurrence_counts[occurrence_key] += 1
        normalized_items.append(
            {
                "problem_number": number,
                "problem_no": problem_no,
                "problem_text": normalize_geometry_notation(str(item.get("problem_text") or "").strip()),
                "choices": _normalize_problem_choices(item.get("choices"), item.get("problem_text")),
                "has_visual": bool(item.get("has_visual")),
                "subject": str(item.get("subject") or "").strip() or None,
                "unit": _clean_unit_label(item.get("unit")),
                "section_label": section_label,
                "problem_bbox": _normalized_visual_bbox(item.get("problem_bbox")),
                "visual_bbox": _normalized_visual_bbox(item.get("visual_bbox")),
                "page_index": page.page_index,
                "page_number_occurrence": page_number_occurrence,
                "_source_order": page.page_index * 10000 + int(getattr(page, "column_index", 0) or 0) * 1000 + item_order,
            }
        )
    return normalized_items


def _extracted_problem_merge_key(page_index: int, item: dict[str, Any]) -> tuple[int, str | None, int, int]:
    return (
        page_index,
        str(item.get("section_label") or "").strip() or None,
        int(item.get("problem_number") or 0),
        int(item.get("page_number_occurrence") or 0),
    )


def _pages_for_rescue_check(pages: list[RenderedPage], extracted_page_indexes: set[int]) -> list[RenderedPage]:
    if not extracted_page_indexes:
        return []
    rescue_pages: list[RenderedPage] = []
    for page in sorted(pages, key=lambda item: item.page_index):
        if page.page_index in extracted_page_indexes:
            continue
        if any(abs(page.page_index - extracted_page_index) <= 2 for extracted_page_index in extracted_page_indexes):
            rescue_pages.append(page)
    return rescue_pages


def extract_and_cross_check(
    pages: list[RenderedPage],
    batch_id: UUID | None = None,
    offset: int = 0,
    total: int | None = None,
    display_total_pages: int | None = None,
    subject_candidates: list[str] | None = None,
    unit_candidates: list[str] | None = None,
) -> list[dict[str, Any]]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for processing")
    client = _openai_client()
    by_problem_key: dict[tuple[int, str | None, int, int], list[dict[str, Any]]] = {}
    extraction_passes = max(settings.ai_extraction_passes, 1)
    total_steps = total or len(pages) * extraction_passes
    subjects = _clean_text_candidates(subject_candidates, max_items=24)
    units = _clean_text_candidates(unit_candidates, max_items=80)
    prompt = build_extraction_prompt(subjects, units)
    model_pool = _ai_model_pool()

    tasks = [(local_index, page, run_index) for local_index, page in enumerate(pages) for run_index in range(extraction_passes)]
    if batch_id:
        model_note = f", 모델 {len(model_pool)}개" if len(model_pool) > 1 else ""
        set_progress(batch_id, f"문항 추출 중 (0/{len(tasks)}요청 완료{model_note})", offset, total_steps)

    completed = 0
    with ThreadPoolExecutor(max_workers=_ai_worker_count(len(tasks), len(model_pool))) as executor:
        futures = {
            executor.submit(
                vision_json,
                client,
                page.base64_png,
                prompt,
                _page_split_model(model_pool, page.page_index, display_total_pages),
                page.ai_image_mime,
            ): (local_index, page, run_index)
            for task_index, (local_index, page, run_index) in enumerate(tasks)
        }
        for future, (local_index, page, run_index) in _completed_futures_with_heartbeat(
            futures,
            batch_id=batch_id,
            message_factory=lambda: f"문항 추출 중 ({completed}/{len(tasks)}요청 완료, AI 응답 대기 중)",
            current_factory=lambda: offset + completed,
            total=total_steps,
        ):
            items = future.result()
            completed += 1
            if batch_id:
                set_progress(
                    batch_id,
                    f"문항 추출 중 ({completed}/{len(tasks)}요청 완료, {page.page_index + 1}/{display_total_pages or len(pages)}페이지)",
                    offset + completed,
                    total_steps,
                )
            for normalized in _normalize_extracted_items(items, page):
                # Problem numbers often repeat across workbook sections. Keep page identity
                # and same-page occurrence attached so distinct exercises never merge.
                by_problem_key.setdefault(_extracted_problem_merge_key(page.page_index, normalized), []).append(normalized)

    extracted_page_indexes = {page_index for page_index, _section, _number, _occurrence in by_problem_key}
    rescue_pages = _pages_for_rescue_check(pages, extracted_page_indexes)
    if rescue_pages:
        if batch_id:
            set_progress(
                batch_id,
                f"누락 의심 페이지 재검사 중 (0/{len(rescue_pages)}페이지)",
                min(offset + completed, total_steps),
                total_steps,
            )
        rescue_completed = 0
        with ThreadPoolExecutor(max_workers=_ai_worker_count(len(rescue_pages), len(model_pool))) as executor:
            futures = {
                executor.submit(
                    vision_json,
                    client,
                    page.base64_png,
                    RESCUE_EXTRACTION_PROMPT,
                    _page_split_model(model_pool, page.page_index, display_total_pages),
                    page.ai_image_mime,
                ): page
                for page in rescue_pages
            }
            for future, page in _completed_futures_with_heartbeat(
                futures,
                batch_id=batch_id,
                message_factory=lambda: f"누락 의심 페이지 재검사 중 ({rescue_completed}/{len(rescue_pages)}페이지, AI 응답 대기 중)",
                current_factory=lambda: min(offset + completed, total_steps),
                total=total_steps,
            ):
                items = future.result()
                rescue_completed += 1
                if batch_id:
                    set_progress(
                        batch_id,
                        f"누락 의심 페이지 재검사 중 ({rescue_completed}/{len(rescue_pages)}페이지, {page.page_index + 1}/{display_total_pages or len(pages)}페이지)",
                        min(offset + completed, total_steps),
                        total_steps,
                    )
                for normalized in _normalize_extracted_items(items, page):
                    by_problem_key.setdefault(_extracted_problem_merge_key(page.page_index, normalized), []).append(normalized)

    merged: list[dict[str, Any]] = []
    for (page_index, _section_label, number, occurrence), items in by_problem_key.items():
        texts = [item["problem_text"] for item in items if item["problem_text"]]
        longest = max(texts, key=len) if texts else ""
        visual_values = {item["has_visual"] for item in items}
        problem_boxes = [item.get("problem_bbox") for item in items if item.get("problem_bbox")]
        visual_boxes = [item.get("visual_bbox") for item in items if item.get("visual_bbox")]
        section_labels = [item.get("section_label") for item in items if item.get("section_label")]
        problem_nos = [item.get("problem_no") for item in items if item.get("problem_no")]
        choice_sets = [item.get("choices") for item in items if isinstance(item.get("choices"), list) and item.get("choices")]
        choices = max(choice_sets, key=lambda values: (len(values), sum(len(str(choice.get("text") or "")) for choice in values))) if choice_sets else []
        source_order = min(int(item.get("_source_order", page_index * 10000) or 0) for item in items)
        merged.append(
            {
                "problem_number": number,
                "problem_no": _longer_text(problem_nos) or str(number),
                "problem_text": longest,
                "choices": choices,
                "has_visual": any(visual_values) or bool(visual_boxes),
                "subject": _most_common_text(items, "subject", subjects),
                "unit": _most_common_text(items, "unit", units),
                "section_label": _longer_text(section_labels),
                "problem_bbox": _preferred_bbox(problem_boxes, largest=True),
                "visual_bbox": _preferred_bbox(visual_boxes),
                "visual_url": None,
                "needs_review": True,
                "page_index": page_index,
                "page_number_occurrence": occurrence,
                "_source_order": source_order,
            }
        )
    return _apply_structure_indexes(merged)


PROBLEM_PREVIEW_QA_PROMPT = r"""You are a strict visual QA pass for one cropped problem preview.

You will receive an image cropped to one target problem and the current extraction JSON.
Return a JSON array with exactly one object:
[
  {
    "target_problem_ok": <true if the preview is centered on the target problem, false if neighboring problems dominate or the crop is ambiguous>,
    "problem_text": "<corrected full question stem only, excluding answer choices>" or null,
    "choices": [
      {"label": "①", "text": "<visible answer choice text only>"}
    ],
    "has_visual": <true if this problem uses a non-text figure, graph, diagram, table, or image>,
    "visual_bbox": {"x1": <0-1>, "y1": <0-1>, "x2": <0-1>, "y2": <0-1>} or null,
    "visible_numbers": ["<numbers/measurements visibly inside the visual only>"],
    "visible_point_labels": ["A", "B", "..."],
    "visible_geometry_labels": ["AB", "ABC", "..."],
    "visual_anchor_consistency": "matched" | "mismatch" | "insufficient" | "not_applicable",
    "visual_anchor_mismatch_reasons": ["short reason", "..."],
    "latex_ok": <true if the corrected/current math text has balanced, valid LaTeX delimiters and no malformed tokens>,
    "needs_review": <true if anything remains ambiguous>,
    "warnings": ["short machine-readable reason", "..."]
  }
]

Rules:
- The source image is authoritative. Use the current extraction only as context.
- If current text contains broken tokens like /w, \w, empty $$ $$, unbalanced $, or malformed LaTeX, correct them from the image.
- problem_text must contain only the target problem stem and condition text. Do not include neighboring problems, answers, explanations, or choices.
- Preserve Korean text faithfully and convert math expressions to LaTeX with $...$ or $$...$$.
- Always use display LaTeX delimiters like $$\sum_{k=1}^{n} a_k$$ for any sigma/summation expression containing \sum, \Sigma, or ∑.
- visual_bbox coordinates are relative to this cropped preview, not the full page.
- visual_bbox must tightly enclose only the non-text figure/graph/diagram/table/image belonging to this problem. Exclude the problem stem, answer choices, and pure text condition boxes.
- If there is no real visual asset, set has_visual false and visual_bbox null.
- Use expected_visual_anchors from the supplied extraction JSON as a consistency check. Compare numbers, measurements, point labels, and geometry labels in the visual against the target problem text.
- Set visual_anchor_consistency to "matched" when visible diagram anchors agree with the expected anchors. Set it to "mismatch" when the diagram visibly contains different numbers/labels that suggest it belongs to a neighboring problem. Set it to "insufficient" when the target text has anchors but the visual has too few readable anchors to verify. Set it to "not_applicable" when neither the text nor the visual has useful anchors.
- Do not reject a correct diagram merely because it has extra labels, but do reject when key labels or measurements conflict with the target problem.
- Return raw JSON only."""


def _problem_preview_qa_prompt(problem: dict[str, Any]) -> str:
    payload = {
        "problem_number": problem.get("problem_number"),
        "problem_no": problem.get("problem_no"),
        "problem_text": problem.get("problem_text"),
        "choices": problem.get("choices") or [],
        "has_visual": bool(problem.get("has_visual")),
        "page_number": int(problem.get("page_index") or 0) + 1,
        "expected_visual_anchors": _problem_visual_anchor_hints(problem),
    }
    return PROBLEM_PREVIEW_QA_PROMPT + "\n\nCurrent extraction JSON:\n" + json.dumps(payload, ensure_ascii=False)


def _save_problem_visual_crop(problem: dict[str, Any], image: Image.Image, batch_id: UUID, source_label: str) -> bool:
    if image.width < 16 or image.height < 16:
        problem["needs_review"] = True
        return False
    cropped = _trim_visual_whitespace(image)
    buffer = io.BytesIO()
    cropped.save(buffer, format="PNG")
    page_number = int(problem.get("page_index") or 0) + 1
    problem_number = re.sub(r"[^0-9A-Za-z_-]+", "_", str(problem.get("problem_no") or problem.get("problem_number") or "problem"))
    occurrence = int(problem.get("page_number_occurrence") or 0)
    filename = f"{batch_id}_p{page_number}_{problem_number}_{occurrence}_{source_label}_visual.png"
    problem["visual_url"] = save_visual_bytes(buffer.getvalue(), filename)
    problem["has_visual"] = True
    return True


def _attach_visual_from_page_bbox(problem: dict[str, Any], page: RenderedPage, batch_id: UUID, *, mark_review: bool) -> bool:
    visual_bbox = problem.get("visual_bbox")
    if not visual_bbox:
        return False
    if _bbox_area(visual_bbox) > 0.65:
        problem["needs_review"] = True
        return False
    with Image.open(io.BytesIO(page.png_bytes)) as source:
        crop = _crop_visual_ink_region(source, visual_bbox, problem_bbox=problem.get("problem_bbox"))
        if not crop:
            problem["needs_review"] = True
            return False
        saved = _save_problem_visual_crop(problem, crop, batch_id, "page")
    if mark_review:
        problem["needs_review"] = True
    return saved


def _build_problem_preview_payload(problem: dict[str, Any], page: RenderedPage) -> dict[str, Any] | None:
    problem_bbox = problem.get("problem_bbox")
    if not problem_bbox:
        return None
    if _bbox_area(problem_bbox) > 0.85:
        problem["needs_review"] = True
        return None
    with Image.open(io.BytesIO(page.png_bytes)) as source:
        preview = _crop_by_normalized_bbox(source, problem_bbox, padding_ratio=0.012)
        if not preview:
            problem["needs_review"] = True
            return None
        png_buffer = io.BytesIO()
        preview.save(png_buffer, format="PNG")
        preview_png = png_buffer.getvalue()
        base64_image, _image_bytes, mime = _encode_image_for_ai(preview, page.ai_image_mime)
    return {
        "problem": problem,
        "base64_image": base64_image,
        "image_mime": mime,
        "preview_png": preview_png,
    }


def _should_preview_qa(problem: dict[str, Any]) -> bool:
    return bool(problem.get("has_visual")) or bool(problem.get("visual_bbox")) or text_has_suspicious_math(problem.get("problem_text"))


def _visual_anchor_status(qa: dict[str, Any]) -> str:
    status = str(qa.get("visual_anchor_consistency") or "").strip().lower()
    return status if status in {"matched", "mismatch", "insufficient", "not_applicable"} else ""


def _visual_anchor_rejects_crop(problem: dict[str, Any], qa: dict[str, Any]) -> bool:
    status = _visual_anchor_status(qa)
    if status == "mismatch":
        return True
    if status == "insufficient" and _has_visual_anchor_hints(problem):
        return True
    warnings = [str(value or "").strip().lower() for value in qa.get("visual_anchor_mismatch_reasons") or []]
    return any("mismatch" in warning or "neighbor" in warning or "different" in warning for warning in warnings)


def _apply_preview_qa_result(problem: dict[str, Any], preview_png: bytes, qa: dict[str, Any], batch_id: UUID) -> None:
    previous_has_visual = bool(problem.get("has_visual"))
    if not bool(qa.get("target_problem_ok", True)):
        problem["needs_review"] = True

    corrected_text = str(qa.get("problem_text") or "").strip()
    if corrected_text:
        corrected_text = normalize_geometry_notation(corrected_text)
        if text_has_suspicious_math(corrected_text):
            problem["needs_review"] = True
        else:
            problem["problem_text"] = corrected_text

    if isinstance(qa.get("choices"), list) and qa.get("choices"):
        problem["choices"] = _normalize_problem_choices(qa.get("choices"), problem.get("problem_text"))

    if isinstance(qa.get("has_visual"), bool):
        problem["has_visual"] = bool(qa.get("has_visual"))
        if previous_has_visual and not problem["has_visual"]:
            problem["needs_review"] = True

    if not bool(qa.get("latex_ok", True)) or bool(qa.get("needs_review")):
        problem["needs_review"] = True

    anchor_rejects_crop = _visual_anchor_rejects_crop(problem, qa)
    if anchor_rejects_crop:
        problem["needs_review"] = True
        problem["visual_url"] = None

    if problem.get("has_visual"):
        visual_bbox = _normalized_visual_bbox(qa.get("visual_bbox"))
        if visual_bbox and _bbox_area(visual_bbox) <= 0.70 and not anchor_rejects_crop:
            with Image.open(io.BytesIO(preview_png)) as preview:
                crop = _crop_visual_ink_region(preview, visual_bbox)
                if crop:
                    _save_problem_visual_crop(problem, crop, batch_id, "preview")
                else:
                    problem["needs_review"] = True
        else:
            problem["needs_review"] = True
    else:
        problem["visual_url"] = None

    if text_has_suspicious_math(problem.get("problem_text")):
        problem["needs_review"] = True


def refine_problem_previews(
    problems: list[dict[str, Any]],
    pages: list[RenderedPage],
    batch_id: UUID,
    *,
    progress_offset: int | None = None,
    progress_total: int | None = None,
) -> None:
    page_by_index = {page.page_index: page for page in pages}
    candidates: list[dict[str, Any]] = []
    for problem in problems:
        page = page_by_index.get(int(problem.get("page_index") or 0))
        if not page:
            problem["needs_review"] = True
            continue
        if not _should_preview_qa(problem):
            continue
        payload = _build_problem_preview_payload(problem, page)
        if payload:
            candidates.append(payload)
            continue
        if problem.get("has_visual"):
            _attach_visual_from_page_bbox(problem, page, batch_id, mark_review=True)
        if text_has_suspicious_math(problem.get("problem_text")):
            problem["needs_review"] = True

    if not candidates:
        return

    settings = get_settings()
    client = _openai_client()
    model_pool = _ai_model_pool(settings.ai_model_pool, settings.ai_model)
    completed = 0
    set_progress(batch_id, f"문항 미리보기 검증 중 (0/{len(candidates)}문항)", progress_offset, progress_total)
    with ThreadPoolExecutor(max_workers=_ai_worker_count(len(candidates), len(model_pool))) as executor:
        futures = {
            executor.submit(
                vision_json,
                client,
                payload["base64_image"],
                _problem_preview_qa_prompt(payload["problem"]),
                _page_split_model(model_pool, int(payload["problem"].get("page_index") or 0), len(pages)),
                payload["image_mime"],
                2048,
                settings.ai_image_detail,
            ): payload
            for payload in candidates
        }
        for future, payload in _completed_futures_with_heartbeat(
            futures,
            batch_id=batch_id,
            message_factory=lambda: f"문항 미리보기 검증 중 ({completed}/{len(candidates)}문항, AI 응답 대기 중)",
            current_factory=lambda: progress_offset,
            total=progress_total,
        ):
            problem = payload["problem"]
            try:
                items = future.result()
                qa = items[0] if items and isinstance(items[0], dict) else {}
                _apply_preview_qa_result(problem, payload["preview_png"], qa, batch_id)
            except Exception:
                problem["needs_review"] = True
                page = page_by_index.get(int(problem.get("page_index") or 0))
                if page and problem.get("has_visual"):
                    _attach_visual_from_page_bbox(problem, page, batch_id, mark_review=True)
            completed += 1
            set_progress(batch_id, f"문항 미리보기 검증 중 ({completed}/{len(candidates)}문항)", progress_offset, progress_total)


def attach_visuals(problems: list[dict[str, Any]], pages: list[RenderedPage], batch_id: UUID) -> None:
    """Attach conservative automatic crops for problem visuals when bbox data is available."""
    page_by_index = {page.page_index: page for page in pages}
    for problem in problems:
        problem["visual_url"] = None
        if not problem.get("has_visual"):
            continue
        page = page_by_index.get(int(problem.get("page_index") or 0))
        if not page or not _attach_visual_from_page_bbox(problem, page, batch_id, mark_review=True):
            problem["needs_review"] = True


def attach_review_page_images(problems: list[dict[str, Any]], pages: list[RenderedPage], batch_id: UUID) -> None:
    """Store source page snapshots for review only.

    These URLs are intentionally separate from visual_url, which is the only image
    field used by export/problem-set rendering. Review snapshots help humans compare
    extracted text against the original page without leaking into generated outputs.
    """
    page_urls: dict[int, str] = {}
    for page in pages:
        page_number = page.page_index + 1
        filename = f"{batch_id}_page_{page_number}_review_source.png"
        page_urls[page.page_index] = save_visual_bytes(page.png_bytes, filename)

    for problem in problems:
        page_index = int(problem.get("page_index") or 0)
        problem["review_page_image_url"] = page_urls.get(page_index)
        problem["review_page_number"] = page_index + 1


CHOICE_PATTERN = re.compile(
    r"(\s*[①②③④⑤]\s*[^\n]*)|(\s*[1-5]\.\s*[^\n]*)|(\s*(정답|답)\s*[:：]\s*[①②③④⑤1-5])",
    re.MULTILINE,
)
CHOICE_SYMBOL_PATTERN = re.compile(r"^(정답|답)\s*[:：]?\s*[①②③④⑤1-5]$")
ANSWER_PREFIX_PATTERN = re.compile(r"^(?:정답|답)\s*[:：]?\s*", re.IGNORECASE)
CHOICE_ANSWER_PATTERN = re.compile(r"^(?:정답|답)?\s*[:：]?\s*([①②③④⑤]|[1-5])\s*(?:번|선지)?\s*$", re.IGNORECASE)


def clean_solution_answer(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = ANSWER_PREFIX_PATTERN.sub("", text).strip()
    return text or None


def _choice_index_from_answer(value: Any) -> int | None:
    text = str(value or "").strip()
    if not text:
        return None
    match = CHOICE_ANSWER_PATTERN.fullmatch(unicodedata.normalize("NFKC", text))
    if not match:
        match = CHOICE_ANSWER_PATTERN.fullmatch(text)
    if not match:
        return None
    token = match.group(1)
    if token in CHOICE_LABELS:
        return CHOICE_LABELS.index(token)
    if token.isdigit() and 1 <= int(token) <= len(CHOICE_LABELS):
        return int(token) - 1
    return None


def answer_for_subject(answer: Any, choices: Any, subject_engine: Any) -> str | None:
    cleaned = clean_solution_answer(answer)
    if not cleaned:
        return None
    if normalize_subject_engine(subject_engine) != "math":
        return cleaned
    choice_index = _choice_index_from_answer(cleaned)
    normalized_choices = _normalize_problem_choices(choices)
    if choice_index is None or choice_index >= len(normalized_choices):
        return cleaned
    choice_text = str(normalized_choices[choice_index].get("text") or "").strip()
    return choice_text or cleaned


def strip_answer_choices(text: str) -> tuple[str, bool]:
    cleaned = CHOICE_PATTERN.sub("", text).strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    suspicious = len(cleaned) < max(12, len(text) * 0.35) or cleaned.endswith(("중", "것", "값", "고르시오"))
    return cleaned or text.strip(), suspicious


def _longer_text(values: list[Any]) -> str | None:
    texts = [str(value).strip() for value in values if value is not None and str(value).strip()]
    return max(texts, key=len) if texts else None


def extract_solutions(
    pages: list[RenderedPage],
    batch_id: UUID | None = None,
    offset: int = 0,
    total: int | None = None,
    display_total_pages: int | None = None,
    prompt_override: str | None = None,
    mode_label_override: str | None = None,
    max_output_tokens_override: int | None = None,
) -> list[dict[str, Any]]:
    settings = get_settings()
    client = _openai_client()
    by_key: dict[tuple[int, str | None, str, int], list[dict[str, Any]]] = {}
    extraction_passes = max(settings.ai_extraction_passes, 1)
    total_steps = total or len(pages) * extraction_passes
    model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
    solution_mode = str(settings.ai_solution_mode or "fast").strip().lower()
    solution_prompt = prompt_override or (SOLUTION_TRANSCRIPTION_PROMPT if solution_mode == "full" else SOLUTION_FAST_PROMPT)
    solution_max_tokens = (
        max_output_tokens_override
        or (max(settings.ai_max_output_tokens, settings.ai_solution_max_output_tokens) if solution_mode == "full" else settings.ai_solution_max_output_tokens)
    )
    tasks = [(local_index, page, run_index) for local_index, page in enumerate(pages) for run_index in range(extraction_passes)]
    mode_label = mode_label_override or ("원문 검사" if solution_mode == "full" else "빠른 검사")
    if batch_id:
        model_note = f", 모델 {len(model_pool)}개" if len(model_pool) > 1 else ""
        set_progress(batch_id, f"답안 {mode_label} 중 (0/{len(tasks)}요청 완료{model_note})", offset, total_steps)

    completed = 0
    with ThreadPoolExecutor(max_workers=_ai_worker_count(len(tasks), len(model_pool))) as executor:
        futures = {
            executor.submit(
                vision_json,
                client,
                page.base64_png,
                f"{solution_prompt}\n\nCurrent solution PDF page_idx: {page.page_index}. Return this exact integer in page_idx for every item on this page.",
                _page_split_model(model_pool, page.page_index, display_total_pages),
                page.ai_image_mime,
                solution_max_tokens,
                settings.ai_solution_image_detail,
            ): (local_index, page, run_index)
            for task_index, (local_index, page, run_index) in enumerate(tasks)
        }
        for future, (local_index, page, run_index) in _completed_futures_with_heartbeat(
            futures,
            batch_id=batch_id,
            message_factory=lambda: f"답안 {mode_label} 중 ({completed}/{len(tasks)}요청 완료, AI 응답 대기 중)",
            current_factory=lambda: offset + completed,
            total=total_steps,
        ):
            items = future.result()
            completed += 1
            if batch_id:
                set_progress(
                    batch_id,
                    f"답안 {mode_label} 중 ({completed}/{len(tasks)}요청 완료, {page.page_index + 1}/{display_total_pages or len(pages)}페이지)",
                    offset + completed,
                    total_steps,
                )
            occurrence_counts: dict[tuple[str | None, str], int] = defaultdict(int)
            for item_order, item in enumerate(items):
                number = str(item.get("problem_number") or "").strip()
                if not number:
                    continue
                section_label = str(item.get("section_label") or "").strip() or None
                occurrence_key = (section_label, number)
                page_number_occurrence = occurrence_counts[occurrence_key]
                occurrence_counts[occurrence_key] += 1
                by_key.setdefault((page.page_index, section_label, number, page_number_occurrence), []).append(
                    {
                        "problem_number": number,
                        "problem_no": number,
                        "answer": item.get("answer"),
                        "solution_steps": None,
                        "key_concept": None,
                        "section_label": section_label,
                        "page_idx": page.page_index,
                        "_source_order": page.page_index * 10000 + int(getattr(page, "column_index", 0) or 0) * 1000 + item_order,
                        "page_number_occurrence": page_number_occurrence,
                        "referenced_problem_snippet": item.get("referenced_problem_snippet"),
                        "solution_first_line": item.get("solution_first_line"),
                    }
                )

    solutions: list[dict[str, Any]] = []
    for (page_idx, _section_label, number, occurrence), runs in sorted(by_key.items(), key=lambda value: min(run.get("_source_order", 0) for run in value[1])):
        answer_texts = [str(run.get("answer") or "").strip() for run in runs if str(run.get("answer") or "").strip()]
        snippets = [str(run.get("referenced_problem_snippet") or "").strip() for run in runs if str(run.get("referenced_problem_snippet") or "").strip()]
        first_lines = [str(run.get("solution_first_line") or "").strip() for run in runs if str(run.get("solution_first_line") or "").strip()]
        section_labels = [str(run.get("section_label") or "").strip() for run in runs if str(run.get("section_label") or "").strip()]
        source_order = min(int(run.get("_source_order", 0) or 0) for run in runs)
        solution_first_line = _longer_text(first_lines)
        solutions.append({
            "problem_number": number,
            "problem_no": number,
            "answer": _longer_text(answer_texts),
            "solution_steps": None,
            "key_concept": None,
            "section_label": _longer_text(section_labels),
            "page_idx": page_idx,
            "_source_order": source_order,
            "page_number_occurrence": occurrence,
            "referenced_problem_snippet": _longer_text(snippets),
            "solution_first_line": solution_first_line,
            "needs_review": len(runs) < extraction_passes or len(set(answer_texts)) > 1,
        })
    return _apply_structure_indexes(solutions, page_key="page_idx")


def save_results(db: Session, batch: Batch, problems: list[dict[str, Any]]) -> None:
    batch_name = (batch.name or "이름 없는 배치").strip()
    subject_engine = normalize_subject_engine(batch.subject_engine)
    ensure_batch_active(batch.id)
    for index, item in enumerate(problems):
        if index and index % 20 == 0:
            ensure_batch_active(batch.id)
        solution = item.get("solution") or {
            "answer": item.get("answer"),
            "solution_steps": item.get("solution_steps"),
            "key_concept": item.get("key_concept"),
        }
        problem = Problem(
            problem_number=item["problem_number"],
            problem_text=item["problem_text"],
            choices=_normalize_problem_choices(item.get("choices")),
            has_visual=item["has_visual"],
            visual_url=item.get("visual_url"),
            review_page_image_url=item.get("review_page_image_url"),
            review_page_number=item.get("review_page_number"),
            answer=answer_for_subject(solution.get("answer"), item.get("choices"), subject_engine),
            solution_steps=None,
            key_concept=None,
            needs_review=True,
            source_batch_id=batch.id,
            source_type=batch.source_type,
            source_label=batch.source_label,
            rights_confirmed=batch.rights_confirmed,
            rights_confirmed_at=batch.rights_confirmed_at,
            rights_note=batch.rights_note,
            visibility="private",
            origin_type="owned" if batch.source_type in {"self_created", "academy_internal"} else "licensed" if batch.source_type == "licensed" else "imported_unknown" if batch.source_type == "unknown" else "derived",
            owner_id=batch.owner_id,
            academy_id=batch.academy_id,
        )
        page_number = int(item.get("page_index") or 0) + 1
        problem.tags = Tag(
            subject=str(item.get("subject") or "").strip() or None,
            unit=_tag_unit_label(item.get("section_label"), item.get("unit")),
            source=f"{batch_name} / p.{page_number} / {item['problem_number']}번",
        )
        db.add(problem)
    ensure_batch_active(batch.id)
