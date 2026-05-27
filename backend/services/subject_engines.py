from __future__ import annotations

from dataclasses import dataclass
from typing import Any


MATH_ENGINE = "math"
KOREAN_ENGINE = "korean"
DEFAULT_SUBJECT_ENGINES = [MATH_ENGINE]
SUBJECT_ENGINE_MONTHLY_ADDON_KRW = 30_000


@dataclass(frozen=True)
class SubjectEngineDefinition:
    code: str
    label: str
    description: str


SUBJECT_ENGINES: dict[str, SubjectEngineDefinition] = {
    MATH_ENGINE: SubjectEngineDefinition(
        code=MATH_ENGINE,
        label="수학 1.0",
        description="Math extraction for formulas, problem stems, choices, answers, and LaTeX-preserved solutions.",
    ),
    KOREAN_ENGINE: SubjectEngineDefinition(
        code=KOREAN_ENGINE,
        label="국어 beta",
        description=(
            "Korean Language extraction uses a separate high-precision pipeline for long passages, "
            "shared passage-question groups, and exact multiple-choice extraction."
        ),
    ),
}


def normalize_subject_engine(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"korean", "kor", "language", "korean_language", "korean-language", "국어", "언어"}:
        return KOREAN_ENGINE
    return MATH_ENGINE


def normalize_subject_engines(value: Any) -> list[str]:
    if value is None:
        raw_items: list[Any] = DEFAULT_SUBJECT_ENGINES
    elif isinstance(value, str):
        raw_items = [item.strip() for item in value.split(",")]
    elif isinstance(value, list):
        raw_items = value
    else:
        raw_items = [value]

    engines: list[str] = []
    for item in raw_items:
        engine = normalize_subject_engine(item)
        if engine not in engines:
            engines.append(engine)
    return engines or DEFAULT_SUBJECT_ENGINES.copy()


def infer_subject_engine_from_subjects(subjects: list[str] | None, fallback: str = MATH_ENGINE) -> str:
    for subject in subjects or []:
        compact = str(subject or "").replace(" ", "").lower()
        if any(marker in compact for marker in ("국어", "언어와매체", "화법과작문", "문학", "비문학", "독서", "korean")):
            return KOREAN_ENGINE
    return normalize_subject_engine(fallback)


def subject_engine_pricing(base_monthly_price: int, enabled_engines: list[str] | None) -> dict[str, int | float | list[str]]:
    engines = normalize_subject_engines(enabled_engines)
    engine_count = max(len(engines), 1)
    multiplier = float(engine_count)
    extra_engine_count = max(engine_count - 1, 0)
    subject_engine_monthly_delta = extra_engine_count * SUBJECT_ENGINE_MONTHLY_ADDON_KRW
    final_monthly_price = int(max(int(base_monthly_price or 0), 0) + subject_engine_monthly_delta)
    return {
        "enabled_subject_engines": engines,
        "subject_engine_count": engine_count,
        "subject_multiplier": multiplier,
        "subject_engine_monthly_delta_krw": subject_engine_monthly_delta,
        "final_monthly_price": final_monthly_price,
        "final_annual_price": final_monthly_price * 12,
    }
