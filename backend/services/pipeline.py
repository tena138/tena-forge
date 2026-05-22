import base64
import io
import json
import math
import os
import re
import threading
import time
import traceback
from collections import defaultdict
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import fitz
from openai import OpenAI, RateLimitError
from PIL import Image
from sqlalchemy.orm import Session, joinedload

from database import SessionLocal, get_settings
from models import Batch, BatchStatus, KoreanExtractionDocument, KoreanPassageGroup, KoreanQuestion, Problem, Tag
from services.korean_extraction import (
    KOREAN_EXTRACTION_PROMPT,
    KOREAN_SOLUTION_PROMPT,
    map_korean_answers,
    merge_korean_page_payloads,
    normalize_korean_page_payload,
)
from services.matcher import match_with_summary
from services.math_normalization import normalize_geometry_notation
from services.storage import save_visual_bytes
from services.subject_engines import KOREAN_ENGINE, normalize_subject_engine


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
  "has_visual": <true if figure/diagram/table/graph present, else false>,
  "is_exercise": <true only for standalone unsolved exercises>,
  "skip_reason": null,
  "subject": <subject label or null>,
  "unit": <unit label or null>,
  "section_label": <visible section/day/chapter/unit marker such as "DAY 01", "Chapter 1", "Unit 03", "유형 01", or null>
}
Return a JSON array of all problems found on this page.
If there are no valid standalone exercises, return [].
Include all condition text that belongs to the problem, even when it is inside a bordered box, shaded callout, rounded rectangle, table-like condition block, or region labeled (가), (나), ㄱ, ㄴ, etc. A text-only box is part of problem_text, not a separate visual asset. Preserve its labels, order, and line breaks.
Remove all answer choices (?졻몼?™몿??or ?긱꽩??options) from problem_text.
Convert every mathematical expression, function, interval, limit, summation, fraction, root, exponent, coordinate, and equation into LaTeX.
When the source image visibly draws a geometric symbol over letters, encode only that drawn symbol as LaTeX, for example an overbar over BC as $\overline{BC}$. Do not infer symbols from ordinary Korean words such as 선분 BC, 변 BC, 직선 BC, 반직선 BC, or 호 BC; preserve those words as plain text unless the symbol itself is drawn.
Use inline LaTeX delimiters like $f(x)=x^2$ inside Korean sentences.
Use display LaTeX delimiters like $$\lim_{x \to 0} f(x)$$ for standalone formulas.
Do not leave plain-text math such as x^2, f'(x), lim x->1, or a/b when it should be LaTeX.
Use the standard Korean math terms 최댓값 and 최솟값; do not rewrite them as 최대값 or 최소값.
Detect structural markers before extracting problem text. section_label must come only from visible page headers, footers, section titles, day/chapter/unit labels, or equivalent source text. Do not invent it.
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
  "has_visual": <true if figure/diagram/table/graph present, else false>,
  "is_exercise": <true only for standalone exercises>,
  "skip_reason": null,
  "subject": <subject label or null>,
  "unit": <unit label or null>,
  "section_label": <visible section/day/chapter/unit marker such as "DAY 01", "Chapter 1", "Unit 03", "유형 01", or null>
}

Include all condition text that belongs to the problem, even when it is inside a bordered box, shaded callout, rounded rectangle, table-like condition block, or region labeled (가), (나), ㄱ, ㄴ, etc. A text-only box is part of problem_text, not a separate visual asset. Preserve its labels, order, and line breaks.
Convert mathematical expressions into LaTeX.
Use the standard Korean math terms 최댓값 and 최솟값; do not rewrite them as 최대값 or 최소값.
Detect structural markers before extracting problem text. section_label must come only from visible page headers, footers, section titles, day/chapter/unit labels, or equivalent source text. Do not invent it.
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
    return any(str(solution.get(key) or "").strip() for key in ("answer", "solution_steps", "key_concept"))


STRUCTURAL_SECTION_RE = re.compile(
    r"\b(?:DAY|CHAPTER|UNIT|LESSON|TYPE)\s*\d{1,3}\b|(?:단원|유형)\s*\d{1,3}",
    re.IGNORECASE,
)


def _is_structural_section_label(value: Any) -> bool:
    text = str(value or "").strip()
    return bool(text and STRUCTURAL_SECTION_RE.search(text))


def _problem_match_payload(problem: Problem) -> dict[str, Any]:
    tags = problem.tags
    unit = tags.unit if tags else None
    section_label = unit if _is_structural_section_label(unit) else None
    review_page_number = problem.review_page_number
    page_index = max(int(review_page_number or 1) - 1, 0)
    return {
        "_problem_id": str(problem.id),
        "problem_number": problem.problem_number,
        "problem_no": str(problem.problem_number),
        "problem_text": problem.problem_text,
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
    matched_payloads = matching_result["problems"]
    _write_batch_artifact(batch.id, "extracted_problems_by_section.json", _items_by_section(problem_payloads, "page_index"))
    _write_batch_artifact(batch.id, "extracted_solutions_by_section.json", _items_by_section(solutions, "page_idx"))
    _write_batch_artifact(batch.id, "matches_by_section.json", matching_result.get("matches_by_section", {}))
    _write_batch_artifact(batch.id, "validation_report.json", matching_result.get("validation_report", matching_result.get("summary", {})))
    matched_by_id = {str(item.get("_problem_id")): item for item in matched_payloads}
    matched_count = 0
    unmatched_count = 0
    cleared_stale_count = 0
    now = datetime.utcnow()
    for problem in problems:
        matched = matched_by_id.get(str(problem.id)) or {}
        solution = matched.get("solution")
        if has_solution_content(solution):
            answer = solution.get("answer")
            if isinstance(answer, str) and CHOICE_SYMBOL_PATTERN.search(answer.strip()):
                answer = None
            problem.answer = answer
            problem.solution_steps = solution.get("solution_steps")
            problem.key_concept = solution.get("key_concept")
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
    units = _clean_text_candidates(unit_candidates, max_items=80)
    return (
        EXTRACTION_PROMPT
        + "\n\nClassify each extracted problem while extracting it.\n"
        + "A single PDF can contain multiple subjects, so classify per problem, not per file.\n"
        + _candidate_instruction("subject", subjects)
        + "\n"
        + _candidate_instruction("unit", units)
        + "\nIf the selected subjects include multiple courses such as 수학Ⅰ and 수학Ⅱ, use the visible concept, title, page context, and problem content to choose the best subject for each problem."
    )

SOLUTION_PROMPT = r"""You are extracting answers and solutions from a Korean exam solution booklet.
For each problem on this page return:
{
  "problem_number": "<problem number exactly as written in the source>",
  "answer": "<final answer as value, number, or expression ??never a choice number like ??",
  "solution_steps": "<full step-by-step solution in Korean>",
  "key_concept": "<one sentence: the core concept this problem tests>",
  "section_label": "<section/unit/exam label from page header/footer or unit title only, or null>",
  "page_idx": <0-based solution PDF page index supplied by the system>,
  "referenced_problem_snippet": "<30-120 chars of explicitly quoted problem text from the solution, or null>",
  "solution_first_line": "<first line of the solution explanation>"
}
If the answer is given as a choice number (e.g. ?뺣떟: ??, resolve it to the actual value from the solution text. If unresolvable, set answer to null.
problem_number must always be a string. Preserve original labels such as "1", "1-1", "23-(가)", or "[보기 5]".
referenced_problem_snippet must contain only problem text explicitly quoted in the solution. Do not guess. If none is quoted, set it to null.
section_label must come only from page headers, footers, visible section titles, unit names, exam round labels, or equivalent source text. Do not invent it.
Before extracting content, identify the section/day/chapter structure and solution headers such as "01 정답", "문제 01 해설", or "1번 해설". For two-column pages, read the left column top-to-bottom first, then the right column top-to-bottom, unless the page clearly shows another reading order.
Convert every mathematical expression in answer, solution_steps, and key_concept into LaTeX.
Use inline LaTeX delimiters like $x=2$ inside Korean sentences.
Use display LaTeX delimiters like $$\int_0^1 f(x)\,dx$$ for standalone formulas.
Do not leave plain-text math such as x^2, f'(x), lim x->1, or a/b when it should be LaTeX.
Return raw JSON array only."""

SOLUTION_TRANSCRIPTION_PROMPT = r"""You are OCR-transcribing a Korean exam solution booklet page.
Your highest priority is faithful transcription, not summarization.

Identify every solution visible on this page.
For each problem return:
{
  "problem_number": "<problem number exactly as written in the source>",
  "answer": "<final answer as value, number, or expression; never a choice symbol like ??",
  "solution_steps": "<verbatim full Korean solution text visible for this problem, preserving all steps, equations, conditions, cases, line breaks, and explanatory sentences>",
  "key_concept": "<one short sentence describing the core concept tested>",
  "section_label": "<section/unit/exam label from page header/footer or unit title only, or null>",
  "page_idx": <0-based solution PDF page index supplied by the system>,
  "referenced_problem_snippet": "<30-120 chars of explicitly quoted problem text from the solution, or null>",
  "solution_first_line": "<first line of the solution explanation>"
}

Rules for solution_steps:
- Do NOT summarize, shorten, paraphrase, or rewrite the explanation.
- Do NOT invent missing intermediate steps.
- Include every visible equation, substitution, case split, table value, and conclusion belonging to the solution.
- Preserve the original order and line breaks as much as possible.
- If text is partially unclear, transcribe the readable part and insert [遺덈챸?? only for the unreadable fragment.
- If a problem's solution continues from a previous page or to the next page, transcribe only the visible part and include [?댁쟾 ?섏씠吏?먯꽌 怨꾩냽] or [?ㅼ쓬 ?섏씠吏??怨꾩냽] when appropriate.
- Convert mathematical expressions into LaTeX while preserving the original meaning exactly.
- Use inline LaTeX delimiters like $x=2$ inside Korean sentences.
- Use display LaTeX delimiters like $$\int_0^1 f(x)\,dx$$ for standalone formulas.
- Do not leave plain-text math such as x^2, f'(x), lim x->1, or a/b when it should be LaTeX.

Rules for answer:
- If the answer is given as a choice number or symbol, resolve it to the actual value from the visible solution text.
- If the actual value cannot be resolved from the visible page, set answer to null.

Rules for matching metadata:
- problem_number must always be a string. Preserve original labels such as "1", "1-1", "23-(가)", or "[보기 5]".
- referenced_problem_snippet must contain only problem text explicitly quoted in the solution. Do not guess. If none is quoted, set it to null.
- section_label must come only from page headers, footers, visible section titles, unit names, exam round labels, or equivalent source text. Do not invent it.
- Before extracting content, identify the section/day/chapter structure and solution headers such as "01 정답", "문제 01 해설", or "1번 해설". For two-column pages, read the left column top-to-bottom first, then the right column top-to-bottom, unless the page clearly shows another reading order.
- page_idx must be the exact 0-based solution PDF page index supplied by the system.
- solution_first_line must be the first visible sentence or line of the solution explanation.

Return raw JSON array only. No markdown. No explanation outside JSON."""

SOLUTION_FAST_PROMPT = r"""You are extracting answer metadata from a Korean exam solution page.

Identify every solution visible on this page.
For each problem return:
{
  "problem_number": "<problem number exactly as written in the source>",
  "answer": "<final answer as value, number, or expression; never a choice symbol like ①>",
  "solution_steps": "<concise Korean solution summary, maximum 3 sentences>",
  "key_concept": "<one short Korean phrase describing the core concept>",
  "section_label": "<section/unit/exam label from page header/footer or unit title only, or null>",
  "page_idx": <0-based solution PDF page index supplied by the system>,
  "referenced_problem_snippet": "<30-120 chars of explicitly quoted problem text from the solution, or null>",
  "solution_first_line": "<first line of the solution explanation>"
}

Rules:
- Prioritize final answers and problem-number matching.
- Do not transcribe the full solution text.
- Do not invent missing steps.
- Convert mathematical expressions into LaTeX.
- If the actual answer cannot be resolved from the visible page, set answer to null.
- problem_number must always be a string. Preserve original labels such as "1", "1-1", "23-(가)", or "[보기 5]".
- referenced_problem_snippet must contain only problem text explicitly quoted in the solution. Do not guess. If none is quoted, set it to null.
- section_label must come only from page headers, footers, visible section titles, unit names, exam round labels, or equivalent source text. Do not invent it.
- Before extracting content, identify the section/day/chapter structure and solution headers such as "01 정답", "문제 01 해설", or "1번 해설". For two-column pages, read the left column top-to-bottom first, then the right column top-to-bottom, unless the page clearly shows another reading order.
- page_idx must be the exact 0-based solution PDF page index supplied by the system.

Return raw JSON array only. No markdown. No explanation outside JSON."""

PAGE_STRUCTURE_PROMPT = r"""You are reading one page from a Korean problem book or solution book.
Extract page-level structure metadata only. Do not extract full problems or full solutions.

Return exactly one JSON object inside a JSON array:
[
  {
    "page_number": <1-based page number supplied by the system>,
    "detected_section_ids": ["DAY 03", "UNIT 02", "..."],
    "detected_problem_headers": ["01", "02"],
    "detected_solution_headers": ["01", "02"],
    "page_type": "problem_page" | "solution_page" | "cover" | "log" | "blank" | "unknown",
    "layout": "single_column" | "two_column" | "unknown",
    "section_confidence": <0.0 to 1.0>
  }
]

Rules:
- Only report metadata visible on this page.
- detected_section_ids must come from explicit section/day/unit/chapter/exam labels only. Do not invent missing section IDs.
- detected_problem_headers should contain problem numbers that start problem statements.
- detected_solution_headers should contain problem numbers that start answers or solutions.
- For two-column solution pages, set layout to "two_column".
- Return raw JSON only."""

progress_messages: dict[str, str] = {}
progress_states: dict[str, dict[str, float | int | str]] = {}
PAGE_CHUNK_SIZE = 16
LARGE_FILE_DPI = 160
DEFAULT_RENDER_DPI = 180


@dataclass
class RenderedPage:
    page_index: int
    base64_png: str
    png_bytes: bytes
    ai_image_mime: str = "image/png"
    column_index: int = 0
    source_page_index: int | None = None


def set_progress(batch_id: UUID, message: str, current: int | None = None, total: int | None = None, reset: bool = False) -> None:
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
    batch.progress_message = message
    db.commit()


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


def _normalize_page_type(value: Any, fallback: str) -> str:
    text = str(value or "").strip().lower()
    allowed = {"problem_page", "solution_page", "cover", "log", "blank", "unknown"}
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
        "detected_section_ids": _clean_metadata_list(raw.get("detected_section_ids")),
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
    label = "해설 구조 분석 중" if doc_kind == "solution" else "문제 구조 분석 중"
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
                900,
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
            text = str(section or "").strip()
            if text:
                return text
    return None


def build_section_ranges_from_metadata(metadata: list[dict[str, Any]], doc_kind: str, page_count: int) -> list[dict[str, Any]]:
    relevant = sorted(
        [item for item in metadata if item.get("document_kind") == doc_kind],
        key=lambda item: int(item.get("page_index") or 0),
    )
    starts: list[tuple[str, int, float]] = []
    seen: set[str] = set()
    for item in relevant:
        section = _primary_section_id(item)
        if not section or section in seen:
            continue
        starts.append((section, int(item.get("page_number") or 1), float(item.get("section_confidence") or 0.0)))
        seen.add(section)

    if not starts:
        content_pages = [
            int(item.get("page_number") or 1)
            for item in relevant
            if item.get("page_type") in {"problem_page", "solution_page", "unknown"}
        ]
        if not content_pages and page_count > 0:
            content_pages = list(range(1, page_count + 1))
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
    for index, (section, page_start, confidence) in enumerate(starts):
        if index + 1 < len(starts):
            next_start = starts[index + 1][1]
            page_end = next_start if next_start == page_start else next_start - 1
        else:
            following_pages = [
                int(item.get("page_number") or 1)
                for item in relevant
                if int(item.get("page_number") or 1) >= page_start
                and item.get("page_type") not in {"cover", "blank", "log"}
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
        if str(item.get("section_label") or item.get("section_id") or "").strip():
            continue
        page_index = int(item.get(page_key, item.get("page_idx", 0)) or 0)
        section_id = _section_for_page(page_index, sections)
        if section_id:
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
    render_label = "해설 구조 분석용 렌더링 중" if doc_kind == "solution" else "문제 구조 분석용 렌더링 중"
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


def _extract_korean_problem_document(
    path: str,
    batch_id: UUID,
    document_id: str,
    source_file: str,
    page_count: int,
    dpi: int,
    total_units: int,
) -> dict[str, Any]:
    settings = get_settings()
    client = _openai_client()
    model_pool = _ai_model_pool()
    page_payloads: list[dict[str, Any]] = []
    processed_pages = 0
    for range_group in iter_split_page_range_groups(page_count, len(model_pool)):
        chunk_len = sum(end - start for start, end in range_group)
        rendered_groups: list[list[RenderedPage]] = []
        rendered_pages = 0
        for start, end in range_group:
            rendered = render_pdf(
                path,
                batch_id=batch_id,
                label="국어 PDF 렌더링 중",
                start_page=start,
                end_page=end,
                dpi=dpi,
                progress_offset=processed_pages + rendered_pages,
                progress_total=total_units,
            )
            rendered_groups.append(rendered)
            rendered_pages += end - start
        pages = interleave_rendered_page_groups(rendered_groups)
        completed = 0
        set_progress(batch_id, f"국어 지문/문항 추출 중 (0/{len(pages)}페이지)", processed_pages + chunk_len, total_units)
        with ThreadPoolExecutor(max_workers=_ai_worker_count(len(pages), len(model_pool))) as executor:
            futures = {
                executor.submit(
                    vision_json,
                    client,
                    page.base64_png,
                    (
                        f"{KOREAN_EXTRACTION_PROMPT}\n\n"
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
                message_factory=lambda: f"국어 지문/문항 추출 중 ({completed}/{len(pages)}페이지, AI 응답 대기 중)",
                current_factory=lambda: processed_pages + chunk_len + completed,
                total=total_units,
            ):
                items = future.result()
                raw = items[0] if items and isinstance(items[0], dict) else {}
                page_payloads.append(normalize_korean_page_payload(raw, document_id, source_file, page.page_index + 1))
                completed += 1
                set_progress(
                    batch_id,
                    f"국어 지문/문항 추출 중 ({completed}/{len(pages)}페이지, {page.page_index + 1}/{page_count}페이지)",
                    processed_pages + chunk_len + completed,
                    total_units,
                )
        processed_pages += chunk_len
    return merge_korean_page_payloads(document_id, source_file, page_payloads)


def _extract_korean_solution_items(
    path: str,
    batch_id: UUID,
    page_count: int,
    dpi: int,
    offset: int,
    total_units: int,
) -> list[dict[str, Any]]:
    settings = get_settings()
    client = _openai_client()
    model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
    answer_items: list[dict[str, Any]] = []
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
                label="국어 정답/해설 PDF 렌더링 중",
                start_page=start,
                end_page=end,
                dpi=dpi,
                progress_offset=base + rendered_pages,
                progress_total=total_units,
            )
            rendered_groups.append(rendered)
            rendered_pages += end - start
        pages = interleave_rendered_page_groups(rendered_groups)
        completed = 0
        with ThreadPoolExecutor(max_workers=_ai_worker_count(len(pages), len(model_pool))) as executor:
            futures = {
                executor.submit(
                    vision_json,
                    client,
                    page.base64_png,
                    f"{KOREAN_SOLUTION_PROMPT}\n\nCurrent source page: {page.page_index + 1}. Use this page number in source_pages.",
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
                message_factory=lambda: f"국어 정답/해설 추출 중 ({completed}/{len(pages)}페이지, AI 응답 대기 중)",
                current_factory=lambda: base + chunk_len + completed,
                total=total_units,
            ):
                items = future.result()
                completed += 1
                set_progress(
                    batch_id,
                    f"국어 정답/해설 추출 중 ({completed}/{len(pages)}페이지, {page.page_index + 1}/{page_count}페이지)",
                    base + chunk_len + completed,
                    total_units,
                )
                for item in items:
                    if isinstance(item, dict) and str(item.get("question_number") or "").strip():
                        answer_items.append(item)
        processed_pages += chunk_len
    return answer_items


def _korean_question_number(value: Any, fallback: int) -> int:
    match = re.search(r"\d+", str(value or ""))
    return int(match.group(0)) if match else fallback


def _korean_problem_text(question: dict[str, Any], passage: dict[str, Any] | None) -> str:
    parts: list[str] = []
    if passage:
        if passage.get("passage_instruction"):
            parts.append(str(passage["passage_instruction"]))
        if passage.get("passage_title"):
            parts.append(str(passage["passage_title"]))
        if passage.get("passage_text"):
            parts.append(str(passage["passage_text"]))
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


def _save_korean_document_results(db: Session, batch: Batch, document: dict[str, Any]) -> None:
    existing = db.query(KoreanExtractionDocument).filter(KoreanExtractionDocument.batch_id == batch.id).first()
    if existing:
        db.query(KoreanQuestion).filter(KoreanQuestion.document_id == existing.id).delete(synchronize_session=False)
        db.query(KoreanPassageGroup).filter(KoreanPassageGroup.document_id == existing.id).delete(synchronize_session=False)
        db.delete(existing)
        db.flush()

    record = KoreanExtractionDocument(
        batch_id=batch.id,
        document_id=str(document.get("document_id") or batch.id),
        subject="korean",
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
            )
        )

    batch_name = (batch.name or "Korean batch").strip()
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
                solution=question.get("solution"),
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
            has_visual=False,
            visual_url=None,
            review_page_image_url=None,
            review_page_number=first_page,
            answer=question.get("answer"),
            solution_steps=question.get("solution"),
            key_concept=passage.get("passage_type") if passage else None,
            needs_review=bool(combined_warnings),
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
            subject="국어",
            unit=(passage.get("passage_type") if passage else None) or None,
            problem_type="객관식" if question.get("choices") else None,
            source=f"{batch_name} / p.{first_page} / {question.get('question_number') or index}번",
        )
        db.add(problem)


def process_korean_batch(db: Session, batch: Batch, batch_id: UUID) -> None:
    settings = get_settings()
    problem_page_count = count_pdf_pages(batch.problem_pdf_filename)
    solution_page_count = count_pdf_pages(batch.solution_pdf_filename) if batch.solution_pdf_filename else 0
    total_units = max(problem_page_count * 2 + solution_page_count * 2, 1)
    problem_dpi = choose_render_dpi(batch.problem_pdf_filename, problem_page_count)
    solution_dpi = (settings.pdf_solution_render_dpi or choose_render_dpi(batch.solution_pdf_filename, solution_page_count)) if batch.solution_pdf_filename else problem_dpi
    set_progress(batch_id, "국어 추출 준비 완료", 0, total_units)
    document_id = f"korean-{batch.id}"

    document = _extract_korean_problem_document(
        batch.problem_pdf_filename,
        batch_id,
        document_id,
        os.path.basename(batch.problem_pdf_filename),
        problem_page_count,
        problem_dpi,
        total_units,
    )
    _write_batch_artifact(batch_id, "korean_extraction.json", document)

    if batch.solution_pdf_filename:
        answer_items = _extract_korean_solution_items(
            batch.solution_pdf_filename,
            batch_id,
            solution_page_count,
            solution_dpi,
            offset=problem_page_count * 2,
            total_units=total_units,
        )
        _write_batch_artifact(batch_id, "korean_answer_solution_items.json", answer_items)
        document = map_korean_answers(document, answer_items)
        _write_batch_artifact(batch_id, "korean_extraction_with_answers.json", document)

    set_progress(batch_id, "국어 지문/문항 저장 중", total_units, total_units)
    _save_korean_document_results(db, batch, document)
    batch.status = BatchStatus.done
    batch.processing_task = "full"
    batch.progress_message = "완료"
    batch.progress_current = total_units
    batch.progress_total = total_units
    batch.progress_updated_at = datetime.utcnow()
    db.commit()
    set_progress(batch_id, "완료", total_units, total_units)


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
        if normalize_subject_engine(batch.subject_engine) == KOREAN_ENGINE:
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
        if should_extract_solutions:
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

        solutions: list[dict[str, Any]] = []
        if should_extract_solutions:
            solution_model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
            processed_solution_pages = 0
            for range_group in iter_split_page_range_groups(solution_page_count, len(solution_model_pool)):
                chunk_len = sum(end - start for start, end in range_group)
                base = structure_units + processed_solution_pages * units_per_page
                rendered_groups: list[list[RenderedPage]] = []
                rendered_pages = 0
                for start, end in range_group:
                    rendered = render_pdf(
                        batch.solution_pdf_filename,
                        batch_id=batch_id,
                        label="해설 PDF 렌더링 중",
                        start_page=start,
                        end_page=end,
                        dpi=solution_dpi,
                        progress_offset=base + rendered_pages,
                        progress_total=total_units,
                    )
                    rendered_groups.append(rendered)
                    rendered_pages += end - start
                solution_pages = interleave_rendered_page_groups(rendered_groups)
                solution_pages = split_two_column_solution_pages(solution_pages, solution_page_metadata)
                extracted_solutions = extract_solutions(
                    solution_pages,
                    batch_id,
                    offset=base + chunk_len,
                    total=total_units,
                    display_total_pages=solution_page_count,
                )
                _apply_section_ranges_to_items(extracted_solutions, solution_sections, "page_idx")
                solutions.extend(extracted_solutions)
                processed_solution_pages += chunk_len
            solutions = _apply_structure_indexes(solutions, page_key="page_idx")
            if not any(has_solution_content(solution) for solution in solutions):
                raise RuntimeError("Solution PDF was provided, but no answer or solution content was extracted.")
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

            set_progress(batch_id, f"선지 정리 중 ({page_range_label})", base + chunk_len * units_per_page, total_units)
            for problem in extracted:
                cleaned, suspicious = strip_answer_choices(problem["problem_text"])
                problem["problem_text"] = normalize_geometry_notation(cleaned)
                problem["needs_review"] = problem["needs_review"] or suspicious

            set_progress(batch_id, f"문항 저장 중 ({page_range_label})", base + chunk_len * units_per_page, total_units)
            all_extracted.extend(extracted)
            processed_problem_pages += chunk_len

        _apply_section_ranges_to_items(all_extracted, problem_sections, "page_index")
        all_extracted = _apply_structure_indexes(all_extracted, page_key="page_index")
        _write_batch_artifact(batch_id, "extracted_problems_by_section.json", _items_by_section(all_extracted, "page_index"))
        set_progress(batch_id, "문항-해설 매칭 중", total_units, total_units)
        matching_result = match_with_summary(all_extracted, solutions)
        matched_problems = matching_result["problems"]
        _write_batch_artifact(batch_id, "matches_by_section.json", matching_result.get("matches_by_section", {}))
        _write_batch_artifact(batch_id, "validation_report.json", matching_result.get("validation_report", matching_result.get("summary", {})))
        set_progress(batch_id, "문항 저장 중", total_units, total_units)
        save_results(db, batch, matched_problems)
        db.commit()

        batch.status = BatchStatus.done
        batch.processing_task = "full"
        batch.progress_message = "완료"
        batch.progress_current = total_units
        batch.progress_total = total_units
        batch.progress_updated_at = datetime.utcnow()
        db.commit()
        set_progress(batch_id, "완료", total_units, total_units)
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
            set_progress(batch_id, failed.progress_message)
        else:
            set_progress(batch_id, f"오류: {exc}")
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
            raise RuntimeError("Solution PDF is required for solution-only reprocessing.")
        existing_problem_count = db.query(Problem).filter(Problem.source_batch_id == batch.id, Problem.deleted_at.is_(None)).count()
        if existing_problem_count <= 0:
            raise RuntimeError("Existing problems are required before reprocessing solutions.")

        batch.status = BatchStatus.processing
        batch.processing_task = "solution_only"
        batch.progress_message = "해설 재처리 시작"
        batch.progress_current = 0
        batch.progress_total = None
        batch.progress_started_at = datetime.utcnow()
        batch.progress_updated_at = batch.progress_started_at
        batch.failure_stage = None
        batch.failure_reason = None
        batch.failure_hint = None
        batch.failed_at = None
        db.commit()
        set_progress(batch_id, "해설 재처리 시작", 0, 0, reset=True)
        if not get_settings().openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for processing")
        if normalize_subject_engine(batch.subject_engine) == KOREAN_ENGINE:
            raise RuntimeError("Korean Language solution-only reprocessing is not supported yet. Retry the full Korean batch to remap answers and explanations.")

        settings = get_settings()
        solution_mode = str(settings.ai_solution_mode or "skip").strip().lower()
        if solution_mode == "skip":
            raise RuntimeError("AI solution extraction is disabled.")
        extraction_passes = max(settings.ai_extraction_passes, 1)
        units_per_page = 1 + extraction_passes
        problem_page_count = count_pdf_pages(batch.problem_pdf_filename)
        solution_page_count = count_pdf_pages(batch.solution_pdf_filename)
        stored_problem_sections = _read_batch_artifact(batch_id, "problem_sections.json")
        reuse_problem_sections = isinstance(stored_problem_sections, list)
        existing_pages_metadata = _read_batch_artifact(batch_id, "pages_metadata.json")
        problem_page_metadata = [
            item
            for item in (existing_pages_metadata if isinstance(existing_pages_metadata, list) else [])
            if isinstance(item, dict) and item.get("document_kind") == "problem"
        ]
        problem_sections: list[dict[str, Any]] = [
            item for item in (stored_problem_sections if reuse_problem_sections else []) if isinstance(item, dict)
        ]
        problem_structure_units = 0 if reuse_problem_sections else 2 * problem_page_count
        solution_structure_units = 2 * solution_page_count
        structure_units = problem_structure_units + solution_structure_units
        solution_units = solution_page_count * units_per_page
        total_units = max(structure_units + solution_units, 1)
        problem_dpi = choose_render_dpi(batch.problem_pdf_filename, problem_page_count)
        solution_dpi = settings.pdf_solution_render_dpi or choose_render_dpi(batch.solution_pdf_filename, solution_page_count)
        set_progress(batch_id, "해설 PDF 페이지 수 확인 완료", 0, total_units)

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

        solutions: list[dict[str, Any]] = []
        solution_model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
        processed_solution_pages = 0
        for range_group in iter_split_page_range_groups(solution_page_count, len(solution_model_pool)):
            chunk_len = sum(end - start for start, end in range_group)
            base = structure_units + processed_solution_pages * units_per_page
            rendered_groups: list[list[RenderedPage]] = []
            rendered_pages = 0
            for start, end in range_group:
                rendered = render_pdf(
                    batch.solution_pdf_filename,
                    batch_id=batch_id,
                    label="해설 PDF 렌더링 중",
                    start_page=start,
                    end_page=end,
                    dpi=solution_dpi,
                    progress_offset=base + rendered_pages,
                    progress_total=total_units,
                )
                rendered_groups.append(rendered)
                rendered_pages += end - start
            solution_pages = interleave_rendered_page_groups(rendered_groups)
            solution_pages = split_two_column_solution_pages(solution_pages, solution_page_metadata)
            extracted_solutions = extract_solutions(
                solution_pages,
                batch_id,
                offset=base + chunk_len,
                total=total_units,
                display_total_pages=solution_page_count,
            )
            _apply_section_ranges_to_items(extracted_solutions, solution_sections, "page_idx")
            solutions.extend(extracted_solutions)
            processed_solution_pages += chunk_len
        solutions = _apply_structure_indexes(solutions, page_key="page_idx")
        if not any(has_solution_content(solution) for solution in solutions):
            raise RuntimeError("Solution PDF was provided, but no answer or solution content was extracted.")

        set_progress(batch_id, "기존 문항과 해설 재매칭 중", total_units, total_units)
        stats = apply_solutions_to_existing_problems(db, batch, solutions, problem_sections=problem_sections)
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
                "problem_sections": problem_sections,
                "solution_sections": solution_sections,
                "stats": stats,
            },
        )
        batch.status = BatchStatus.done
        batch.processing_task = "solution_only"
        batch.progress_message = (
            f"해설 재처리 완료({solution_mode}): "
            f"{stats['matched_count']}개 매칭, {stats['unmatched_count']}개 확인 필요, "
            f"{stats['cleared_stale_count']}개 기존 해설 비움"
        )
        batch.progress_current = total_units
        batch.progress_total = total_units
        batch.progress_updated_at = datetime.utcnow()
        batch.failure_stage = None
        batch.failure_reason = None
        batch.failure_hint = None
        batch.failed_at = None
        db.commit()
        set_progress(batch_id, batch.progress_message, total_units, total_units)
    except Exception as exc:
        traceback.print_exc()
        db.rollback()
        last_stage = progress_messages.get(str(batch_id))
        failed = db.get(Batch, batch_id)
        if failed:
            reason, hint = explain_failure(exc)
            failed.status = BatchStatus.error
            failed.processing_task = "solution_only"
            failed.progress_message = "해설 재처리에 실패했습니다."
            failed.failure_stage = last_stage or failed.progress_message or "해설 재처리 단계 확인 불가"
            failed.failure_reason = reason
            failed.failure_hint = hint
            failed.failed_at = datetime.utcnow()
            failed.progress_updated_at = failed.failed_at
            db.commit()
            set_progress(batch_id, failed.progress_message)
        else:
            set_progress(batch_id, f"오류: {exc}")
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
    for key in ("section_label", "section_id", "unit", "chapter", "day"):
        text = str(item.get(key) or "").strip()
        if text:
            return text
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
                "has_visual": bool(item.get("has_visual")),
                "subject": str(item.get("subject") or "").strip() or None,
                "unit": str(item.get("unit") or "").strip() or None,
                "section_label": section_label,
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
        visual_boxes = [item.get("visual_bbox") for item in items if item.get("visual_bbox")]
        section_labels = [item.get("section_label") for item in items if item.get("section_label")]
        problem_nos = [item.get("problem_no") for item in items if item.get("problem_no")]
        source_order = min(int(item.get("_source_order", page_index * 10000) or 0) for item in items)
        merged.append(
            {
                "problem_number": number,
                "problem_no": _longer_text(problem_nos) or str(number),
                "problem_text": longest,
                "has_visual": any(visual_values),
                "subject": _most_common_text(items, "subject", subjects),
                "unit": _most_common_text(items, "unit", units),
                "section_label": _longer_text(section_labels),
                "visual_bbox": visual_boxes[0] if visual_boxes else None,
                "visual_url": None,
                "needs_review": True,
                "page_index": page_index,
                "page_number_occurrence": occurrence,
                "_source_order": source_order,
            }
        )
    return _apply_structure_indexes(merged)


def attach_visuals(problems: list[dict[str, Any]], pages: list[RenderedPage], batch_id: UUID) -> None:
    """Do not auto-crop problem visuals during extraction.

    Review page snapshots are stored separately by attach_review_page_images.
    A human can then crop the exact visual from the review screen, which avoids
    bad automatic crops becoming exported problem assets.
    """
    for problem in problems:
        problem["visual_url"] = None


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


def strip_answer_choices(text: str) -> tuple[str, bool]:
    cleaned = CHOICE_PATTERN.sub("", text).strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    suspicious = len(cleaned) < max(12, len(text) * 0.35) or cleaned.endswith(("중", "것", "값", "고르시오"))
    return cleaned or text.strip(), suspicious


def _longer_text(values: list[Any]) -> str | None:
    texts = [str(value).strip() for value in values if value is not None and str(value).strip()]
    return max(texts, key=len) if texts else None


def extract_solutions(pages: list[RenderedPage], batch_id: UUID | None = None, offset: int = 0, total: int | None = None, display_total_pages: int | None = None) -> list[dict[str, Any]]:
    settings = get_settings()
    client = _openai_client()
    by_key: dict[tuple[int, str | None, str, int], list[dict[str, Any]]] = {}
    extraction_passes = max(settings.ai_extraction_passes, 1)
    total_steps = total or len(pages) * extraction_passes
    model_pool = _ai_model_pool(settings.ai_solution_model_pool, settings.ai_model)
    solution_mode = str(settings.ai_solution_mode or "fast").strip().lower()
    solution_prompt = SOLUTION_TRANSCRIPTION_PROMPT if solution_mode == "full" else SOLUTION_FAST_PROMPT
    solution_max_tokens = max(settings.ai_max_output_tokens, settings.ai_solution_max_output_tokens) if solution_mode == "full" else settings.ai_solution_max_output_tokens
    tasks = [(local_index, page, run_index) for local_index, page in enumerate(pages) for run_index in range(extraction_passes)]
    if batch_id:
        model_note = f", 모델 {len(model_pool)}개" if len(model_pool) > 1 else ""
        mode_label = "원문 검사" if solution_mode == "full" else "빠른 검사"
        set_progress(batch_id, f"해설 {mode_label} 중 (0/{len(tasks)}요청 완료{model_note})", offset, total_steps)

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
            message_factory=lambda: f"해설 {mode_label} 중 ({completed}/{len(tasks)}요청 완료, AI 응답 대기 중)",
            current_factory=lambda: offset + completed,
            total=total_steps,
        ):
            items = future.result()
            completed += 1
            if batch_id:
                set_progress(
                    batch_id,
                    f"해설 {mode_label} 중 ({completed}/{len(tasks)}요청 완료, {page.page_index + 1}/{display_total_pages or len(pages)}페이지)",
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
                        "solution_steps": item.get("solution_steps"),
                        "key_concept": item.get("key_concept"),
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
        solution_texts = [str(run.get("solution_steps") or "").strip() for run in runs if str(run.get("solution_steps") or "").strip()]
        answer_texts = [str(run.get("answer") or "").strip() for run in runs if str(run.get("answer") or "").strip()]
        concept_texts = [str(run.get("key_concept") or "").strip() for run in runs if str(run.get("key_concept") or "").strip()]
        snippets = [str(run.get("referenced_problem_snippet") or "").strip() for run in runs if str(run.get("referenced_problem_snippet") or "").strip()]
        first_lines = [str(run.get("solution_first_line") or "").strip() for run in runs if str(run.get("solution_first_line") or "").strip()]
        section_labels = [str(run.get("section_label") or "").strip() for run in runs if str(run.get("section_label") or "").strip()]
        source_order = min(int(run.get("_source_order", 0) or 0) for run in runs)
        solution_steps = _longer_text(solution_texts)
        solution_first_line = _longer_text(first_lines)
        if not solution_first_line and solution_steps:
            solution_first_line = solution_steps.splitlines()[0]
        solutions.append({
            "problem_number": number,
            "problem_no": number,
            "answer": _longer_text(answer_texts),
            "solution_steps": solution_steps,
            "key_concept": _longer_text(concept_texts),
            "section_label": _longer_text(section_labels),
            "page_idx": page_idx,
            "_source_order": source_order,
            "page_number_occurrence": occurrence,
            "referenced_problem_snippet": _longer_text(snippets),
            "solution_first_line": solution_first_line,
            "needs_review": len(runs) < extraction_passes or len(set(solution_texts)) > 1 or len(set(answer_texts)) > 1,
        })
    return _apply_structure_indexes(solutions, page_key="page_idx")


def save_results(db: Session, batch: Batch, problems: list[dict[str, Any]]) -> None:
    batch_name = (batch.name or "이름 없는 배치").strip()
    for item in problems:
        solution = item.get("solution") or {
            "answer": item.get("answer"),
            "solution_steps": item.get("solution_steps"),
            "key_concept": item.get("key_concept"),
        }
        answer = solution.get("answer")
        if isinstance(answer, str) and CHOICE_SYMBOL_PATTERN.search(answer.strip()):
            answer = None
        problem = Problem(
            problem_number=item["problem_number"],
            problem_text=item["problem_text"],
            has_visual=item["has_visual"],
            visual_url=item.get("visual_url"),
            review_page_image_url=item.get("review_page_image_url"),
            review_page_number=item.get("review_page_number"),
            answer=answer,
            solution_steps=solution.get("solution_steps"),
            key_concept=solution.get("key_concept"),
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
            unit=str(item.get("unit") or item.get("section_label") or "").strip() or None,
            source=f"{batch_name} / p.{page_number} / {item['problem_number']}번",
        )
        db.add(problem)
