from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from services.subject_engines import ENGLISH_ENGINE, KOREAN_ENGINE, MATH_ENGINE, normalize_subject_engine


POINT_DIFFICULTIES = {"2점", "3점", "4점"}
ALLOWED_POINT_DIFFICULTIES = {
    MATH_ENGINE: {"2점", "3점", "4점"},
    KOREAN_ENGINE: {"2점", "3점"},
    ENGLISH_ENGINE: {"2점", "3점"},
}

_POINT_VALUE_RE = re.compile(r"(?<!\d)([234])\s*점(?!\d)")

_BRACKETED_POINT_RE = re.compile(
    r"(?P<prefix>^|[\s\n])[\(\[\{<（［【]\s*(?:배점\s*)?(?P<point>[234])\s*점\s*[\)\]\}>）］】](?P<suffix>\s*)"
)
_POINT_ONLY_LINE_RE = re.compile(r"(?m)^[ \t]*(?:난이도\s*)?(?:배점\s*)?(?P<point>[234])\s*점[ \t]*$")
_LEADING_POINT_RE = re.compile(
    r"(?m)^[ \t]*(?:#?\s*\d{1,3}\s*(?:번|[.)])?\s*)?(?:난이도\s*)?(?:배점\s*)?(?P<point>[234])\s*점\s*[:：\-–—]?[ \t]*"
)
_TRAILING_POINT_RE = re.compile(r"(?P<prefix>[\s\n]+)(?:난이도\s*)?(?:배점\s*)?(?P<point>[234])\s*점[ \t]*$")


@dataclass(frozen=True)
class PointDifficultyCleanResult:
    text: str
    difficulty: str | None
    warnings: list[str]


def normalize_point_difficulty(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text in POINT_DIFFICULTIES:
        return text
    match = _POINT_VALUE_RE.search(text)
    if match:
        return f"{match.group(1)}점"
    if text in {"easy", "쉬움", "쉬운", "하"}:
        return "2점"
    if text in {"medium", "중간", "중", "보통"}:
        return "3점"
    if text in {"hard", "어려움", "어려운", "상"}:
        return "4점"
    return None


def point_difficulty_warnings(difficulty: str | None, subject_engine: Any) -> list[str]:
    if not difficulty:
        return []
    engine = normalize_subject_engine(subject_engine)
    allowed = ALLOWED_POINT_DIFFICULTIES.get(engine, POINT_DIFFICULTIES)
    if difficulty not in allowed:
        return [f"unsupported_point_difficulty_for_subject:{difficulty}"]
    return []


def _clean_spacing(value: str) -> str:
    text = re.sub(r"[ \t]{2,}", " ", value)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_text_and_extract_point_difficulty(text: Any, subject_engine: Any = None) -> PointDifficultyCleanResult:
    original = str(text or "")
    if not original:
        return PointDifficultyCleanResult(text="", difficulty=None, warnings=[])

    detected: list[str] = []

    def remember(match: re.Match[str]) -> str:
        label = f"{match.group('point')}점"
        detected.append(label)
        return ""

    def remember_with_prefix(match: re.Match[str]) -> str:
        label = f"{match.group('point')}점"
        detected.append(label)
        prefix = match.groupdict().get("prefix") or ""
        suffix = match.groupdict().get("suffix") or ""
        if "\n" in prefix or "\n" in suffix:
            return "\n"
        return " " if prefix and suffix else prefix

    cleaned = _BRACKETED_POINT_RE.sub(remember_with_prefix, original)
    cleaned = _POINT_ONLY_LINE_RE.sub(remember, cleaned)
    cleaned = _LEADING_POINT_RE.sub(remember, cleaned, count=1)
    cleaned = _TRAILING_POINT_RE.sub(remember_with_prefix, cleaned)
    cleaned = _clean_spacing(cleaned)

    difficulty = detected[0] if detected else None
    warnings: list[str] = []
    if len(set(detected)) > 1:
        warnings.append("conflicting_point_difficulty_labels")
    warnings.extend(point_difficulty_warnings(difficulty, subject_engine))
    return PointDifficultyCleanResult(text=cleaned, difficulty=difficulty, warnings=warnings)


def apply_point_difficulty_to_payload(payload: dict[str, Any], *, subject_engine: Any, text_fields: tuple[str, ...]) -> dict[str, Any]:
    existing = normalize_point_difficulty(
        payload.get("difficulty")
        or payload.get("point_difficulty")
        or payload.get("points")
        or payload.get("score")
    )
    difficulty = existing
    warnings = list(payload.get("warnings") or [])

    for field in text_fields:
        if field not in payload or payload.get(field) is None:
            continue
        result = clean_text_and_extract_point_difficulty(payload.get(field), subject_engine)
        payload[field] = result.text
        if result.difficulty:
            if difficulty and difficulty != result.difficulty:
                warnings.append("conflicting_point_difficulty_labels")
            difficulty = difficulty or result.difficulty
        warnings.extend(result.warnings)

    if difficulty:
        payload["difficulty"] = difficulty
        warnings.extend(point_difficulty_warnings(difficulty, subject_engine))
    else:
        payload["difficulty"] = None

    if warnings:
        payload["warnings"] = list(dict.fromkeys(str(item) for item in warnings if item))
    return payload


def difficulty_for_request_label(label: str, subject_engine: Any = None) -> str | None:
    text = str(label or "").replace(" ", "").lower()
    engine = normalize_subject_engine(subject_engine)
    if "2점" in text or text in {"easy", "쉬움", "쉬운", "하"}:
        return "2점"
    if "3점" in text or text in {"medium", "중간", "중", "보통"}:
        return "3점"
    if "4점" in text or text in {"hard", "어려움", "어려운", "상"}:
        return "4점" if engine == MATH_ENGINE else "3점"
    return normalize_point_difficulty(label)
