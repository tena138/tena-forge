from __future__ import annotations

from typing import Any


DOCUMENT_TYPE_PROBLEM = "problem"
DOCUMENT_TYPE_SOLUTION = "solution"
DOCUMENT_TYPE_MIXED = "mixed"
DOCUMENT_TYPE_VALUES = {DOCUMENT_TYPE_PROBLEM, DOCUMENT_TYPE_SOLUTION, DOCUMENT_TYPE_MIXED}
DEFAULT_DOCUMENT_TYPE = DOCUMENT_TYPE_MIXED


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_document_type_hint(value: Any) -> str:
    text = str(value or "").strip().lower()
    aliases = {
        "body": DOCUMENT_TYPE_PROBLEM,
        "main": DOCUMENT_TYPE_PROBLEM,
        "question": DOCUMENT_TYPE_PROBLEM,
        "questions": DOCUMENT_TYPE_PROBLEM,
        "problem": DOCUMENT_TYPE_PROBLEM,
        "problems": DOCUMENT_TYPE_PROBLEM,
        "본문": DOCUMENT_TYPE_PROBLEM,
        "문제": DOCUMENT_TYPE_PROBLEM,
        "answer": DOCUMENT_TYPE_SOLUTION,
        "answers": DOCUMENT_TYPE_SOLUTION,
        "solution": DOCUMENT_TYPE_SOLUTION,
        "solutions": DOCUMENT_TYPE_SOLUTION,
        "explanation": DOCUMENT_TYPE_SOLUTION,
        "explanations": DOCUMENT_TYPE_SOLUTION,
        "해설": DOCUMENT_TYPE_SOLUTION,
        "풀이": DOCUMENT_TYPE_SOLUTION,
        "답안": DOCUMENT_TYPE_SOLUTION,
        "정답": DOCUMENT_TYPE_SOLUTION,
        "mix": DOCUMENT_TYPE_MIXED,
        "mixed": DOCUMENT_TYPE_MIXED,
        "combined": DOCUMENT_TYPE_MIXED,
        "믹스": DOCUMENT_TYPE_MIXED,
        "혼합": DOCUMENT_TYPE_MIXED,
    }
    return aliases.get(text, text if text in DOCUMENT_TYPE_VALUES else DEFAULT_DOCUMENT_TYPE)


def normalize_document_type_hint_items(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for index, raw in enumerate(value):
        if not isinstance(raw, dict):
            continue
        file_index = _int_or_none(raw.get("file_index"))
        items.append(
            {
                "file_index": file_index if file_index is not None else index,
                "filename": str(raw.get("filename") or "").strip()[:500],
                "size": _int_or_none(raw.get("size")),
                "type": normalize_document_type_hint(raw.get("type")),
            }
        )
    return items


def document_type_for_page(hints: list[dict[str, Any]] | None, page_index: int) -> str | None:
    if not hints:
        return None
    for item in hints:
        try:
            start = int(item.get("page_index_start"))
            end = int(item.get("page_index_end"))
        except (TypeError, ValueError):
            continue
        if start <= page_index <= end:
            return normalize_document_type_hint(item.get("type"))
    return None


def document_type_hints_allow_embedded_solutions(hints: list[dict[str, Any]] | None) -> bool:
    if not hints:
        return True
    return any(normalize_document_type_hint(item.get("type")) in {DOCUMENT_TYPE_SOLUTION, DOCUMENT_TYPE_MIXED} for item in hints)


def document_type_hints_note(hint: str | None, *, doc_kind: str) -> str:
    normalized = normalize_document_type_hint(hint) if hint else ""
    if normalized == DOCUMENT_TYPE_PROBLEM:
        return (
            "Uploaded document type hint for this page: PROBLEM/BODY material. "
            "Use this page primarily for student-facing problem extraction. Treat answer keys, worked solutions, and teacher explanations as absent unless they are explicitly visible on this page."
        )
    if normalized == DOCUMENT_TYPE_SOLUTION:
        return (
            "Uploaded document type hint for this page: ANSWER/SOLUTION material. "
            "Use this page as answer metadata source: final answers, answer tables, worked solution explanations, and problem-number-to-answer mappings. Do not reinterpret solution explanations as standalone student problems."
        )
    if normalized == DOCUMENT_TYPE_MIXED:
        return (
            "Uploaded document type hint for this page: MIXED material. "
            "The same PDF may contain both student problems and answers/solutions. Separate student-facing problem extraction from answer metadata recovery before returning results."
        )
    return (
        f"Uploaded document type hint for this page: not provided. Use visible evidence and the declared document kind ({doc_kind}) to classify the page."
    )


def apply_document_type_hints_to_metadata(metadata: list[dict[str, Any]], hints: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not hints:
        return metadata
    output: list[dict[str, Any]] = []
    for item in metadata:
        copied = dict(item)
        page_index = int(copied.get("page_index") or 0)
        hint = document_type_for_page(hints, page_index)
        if hint:
            copied["document_type_hint"] = hint
        if hint == DOCUMENT_TYPE_SOLUTION:
            copied["page_type"] = "solution_page"
        elif hint == DOCUMENT_TYPE_PROBLEM and str(copied.get("page_type") or "") in {"solution_page", "unknown", ""}:
            copied["page_type"] = "problem_page"
        output.append(copied)
    return output
