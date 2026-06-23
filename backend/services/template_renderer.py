import base64
import io
import json
import re
from datetime import datetime
from functools import lru_cache
from html import escape
from pathlib import Path
from typing import Any

from jinja2 import Environment, StrictUndefined, TemplateError
from markupsafe import Markup
from PIL import Image, ImageChops
from sqlalchemy.orm import object_session

from database import get_settings
from models import HubTemplate, KoreanExtractionDocument, KoreanPassageGroup, KoreanQuestion, Problem
from services.math_normalization import normalize_geometry_notation
from services.problem_visuals import is_high_confidence_problem_visual_schema, problem_visual_schema_to_svg


BLOCKED_CONTAINER_TAGS = ("script", "iframe", "object", "embed")
UNDERLINE_TAG_PATTERN = re.compile(r"</?u>", re.IGNORECASE)


def underline_html_markup(value: Any) -> Markup:
    text = str(value or "")
    rendered: list[str] = []
    cursor = 0
    for match in UNDERLINE_TAG_PATTERN.finditer(text):
        if match.start() > cursor:
            rendered.append(escape(text[cursor:match.start()]))
        rendered.append("</u>" if match.group(0).startswith("</") else "<u>")
        cursor = match.end()
    if cursor < len(text):
        rendered.append(escape(text[cursor:]))
    return Markup("".join(rendered))


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
    bbox = mask.getbbox()
    if not bbox:
        return image.copy()
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    if right - left < 5 or bottom - top < 5:
        return image.copy()
    return image.crop((left, top, right, bottom))


def _static_visual_path(url: str | None) -> Path | None:
    if not url or not url.startswith("/static/"):
        return None
    relative_key = url.split("?", 1)[0].removeprefix("/static/")
    uploads_root = Path(get_settings().uploads_dir).resolve()
    path = uploads_root.joinpath(*relative_key.split("/")).resolve()
    if uploads_root not in path.parents and path != uploads_root:
        return None
    return path if path.exists() else None


@lru_cache(maxsize=256)
def _export_visual_url(url: str | None) -> str:
    if not url:
        return ""
    path = _static_visual_path(url)
    if not path:
        return url
    try:
        with Image.open(path) as image:
            trimmed = _trim_visual_whitespace(image)
            if trimmed.size == image.size:
                return url
            buffer = io.BytesIO()
            trimmed.save(buffer, format="PNG")
    except Exception:
        return url
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def sanitize_template_html(html: str) -> str:
    """Template Hub sanitizer: remove obvious executable HTML before storing or rendering."""
    cleaned = html or ""
    for tag in BLOCKED_CONTAINER_TAGS:
        cleaned = re.sub(rf"<\s*{tag}\b[^>]*>.*?<\s*/\s*{tag}\s*>", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
        cleaned = re.sub(rf"<\s*{tag}\b[^>]*?/?>", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"<\s*link\b(?=[^>]*\brel\s*=\s*['\"]?import['\"]?)[^>]*>", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"<\s*meta\b(?=[^>]*\bhttp-equiv\s*=\s*['\"]?refresh['\"]?)[^>]*>", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"\s+on[a-zA-Z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(href|src|xlink:href)\s*=\s*([\"'])\s*javascript:[^\"']*\2", r"\1=\"#\"", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(href|src|xlink:href)\s*=\s*javascript:[^\s>]+", r"\1=\"#\"", cleaned, flags=re.IGNORECASE)
    return cleaned


def sanitize_template_css(css: str | None) -> str:
    cleaned = css or ""
    cleaned = re.sub(r"@import[^;]+;", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"expression\s*\([^)]*\)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"url\s*\(\s*(['\"]?)\s*javascript:[^)]+\)", "url(#)", cleaned, flags=re.IGNORECASE)
    return cleaned


def render_template_html(template_html: str, data: dict[str, Any]) -> str:
    env = Environment(autoescape=True, undefined=StrictUndefined)
    try:
        return env.from_string(sanitize_template_html(template_html)).render(**data)
    except TemplateError as exc:
        raise ValueError(f"Template render failed: {exc}") from exc


def wrap_rendered_html(rendered_html: str, css: str | None = None) -> str:
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
{sanitize_template_css(css)}
  </style>
</head>
<body>
{rendered_html}
</body>
</html>"""


def render_template_document(template: HubTemplate, data: dict[str, Any]) -> str:
    return wrap_rendered_html(render_template_html(template.html, data), template.css)


def _has_solution(problem: Problem) -> bool:
    return bool(str(problem.answer or "").strip())


def _source_lookup_metadata(problem: Problem) -> str:
    tags = problem.tags
    batch = getattr(problem, "batch", None)
    lines = ["답안이 저장되어 있지 않습니다. 원본 자료에서 답지를 확인하세요."]
    if tags and tags.source:
        lines.append(f"저장된 출처: {tags.source}")
    if batch and getattr(batch, "name", None):
        lines.append(f"원본 배치: {batch.name}")
    if batch and getattr(batch, "problem_pdf_filename", None):
        lines.append(f"문항 PDF: {Path(str(batch.problem_pdf_filename)).name}")
    if problem.review_page_number:
        lines.append(f"원본 페이지: p.{problem.review_page_number}")
    lines.append(f"문항 번호: {problem.problem_number}번")
    if problem.answer:
        lines.append(f"저장된 정답: {problem.answer}")
    return "\n".join(lines)


def _solution_text_for_export(problem: Problem, base_data: dict[str, Any]) -> str:
    if problem.answer:
        return problem.answer or ""
    if base_data.get("include_missing_solution_metadata"):
        return _source_lookup_metadata(problem)
    return ""


def _solution_items_for_export(problem_data: list[dict[str, Any]], base_data: dict[str, Any]) -> list[dict[str, Any]]:
    if base_data.get("include_solution"):
        return list(problem_data)
    if base_data.get("include_missing_solution_metadata"):
        return [item for item in problem_data if not item.get("has_solution")]
    return []


def problem_to_template_data(problem: Problem, base_data: dict[str, Any], page_number: int, total_pages: int) -> dict[str, Any]:
    tags = problem.tags
    tag_values = [value for value in ([tags.subject, tags.unit, tags.difficulty, tags.problem_type, tags.source] if tags else []) if value]
    solution_text = _solution_text_for_export(problem, base_data)
    return {
        **base_data,
        "test_title": base_data.get("test_title") or base_data.get("exam_title") or "Tena Forge",
        "student_name": base_data.get("student_name") or "",
        "problem_text": underline_html_markup(normalize_geometry_notation(problem.problem_text)),
        "solution": underline_html_markup(solution_text),
        "solution_text": underline_html_markup(solution_text),
        "source_lookup_metadata": _source_lookup_metadata(problem),
        "has_solution": _has_solution(problem),
        "answer": underline_html_markup(problem.answer),
        "page_number": page_number,
        "total_pages": total_pages,
        "subject": tags.subject if tags else base_data.get("subject", ""),
        "unit": tags.unit if tags else base_data.get("unit", ""),
        "difficulty": tags.difficulty if tags else base_data.get("difficulty", ""),
        "tags": ", ".join(tag_values),
        "problem_number": problem.problem_number,
        "visual_url": _export_visual_url(problem.visual_url),
        "visual_schema": problem.visual_schema,
        "math_model": problem.math_model,
        "visual_svg": Markup(problem_visual_schema_to_svg(problem.visual_schema, problem.math_model))
        if is_high_confidence_problem_visual_schema(problem.visual_schema) or not problem.visual_url
        else Markup(""),
    }


def render_problems_with_hub_template(template: HubTemplate, problems: list[Problem], base_data: dict[str, Any]) -> str:
    total = max(1, len(problems))
    pages = []
    for index, problem in enumerate(problems, start=1):
        data = problem_to_template_data(problem, base_data, index, total)
        pages.append(render_template_html(template.html, data))
    joined = "\n".join(pages)
    return wrap_rendered_html(joined, template.css)


REGION_TYPES = {"problemRegion", "solutionRegion", "answerRegion", "contentRegion", "counselingRegion"}
VISUAL_DOUBLE_TOKEN_PATTERN = re.compile(r"\{\{\s*([^{}\n]+?)\s*\}\}")
VISUAL_SINGLE_TOKEN_PATTERN = re.compile(r"(^|[^{])\{\s*([^{}\n]+?)\s*\}(?!\})")
VISUAL_TOKEN_ALIASES = {
    "시험일": "exam_date",
    "년": "year",
    "연도": "year",
    "월": "month",
    "달": "month",
    "일": "day",
    "시험시간": "exam_time",
    "시험일시": "exam_datetime",
    "시작시간": "exam_start_time",
    "종료시간": "exam_end_time",
    "페이지": "page_number",
    "전체페이지": "total_pages",
    "난이도": "difficulty",
    "태그": "tags",
    "응시자수": "exam_stats_respondent_count",
    "응시자평균": "exam_stats_average",
    "평균점수": "exam_stats_average",
    "최고점": "exam_stats_highest",
    "최저점": "exam_stats_lowest",
    "Q1": "exam_stats_q1",
    "q1": "exam_stats_q1",
    "Q2": "exam_stats_q2",
    "q2": "exam_stats_q2",
    "중앙값": "exam_stats_q2",
    "Q3": "exam_stats_q3",
    "q3": "exam_stats_q3",
    "표준편차": "exam_stats_standard_deviation",
}


def _visual_schema(template: HubTemplate) -> dict[str, Any] | None:
    schema = template.schema_json or {}
    visual = schema.get("visualTemplateSet") if isinstance(schema, dict) else None
    if isinstance(visual, dict) and isinstance(visual.get("pages"), list):
        return visual
    return None


def _num(value: Any, default: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _css_px(value: Any, default: float = 0) -> str:
    return f"{_num(value, default):g}px"


def _katex_assets() -> tuple[str, str]:
    service_path = Path(__file__).resolve()
    candidates = [
        service_path.parents[2] / "frontend" / "node_modules" / "katex" / "dist",
        service_path.parents[1] / "node_modules" / "katex" / "dist",
        Path("/app/node_modules/katex/dist"),
    ]
    for dist in candidates:
        css_path = dist / "katex.min.css"
        js_path = dist / "katex.min.js"
        if not css_path.exists() or not js_path.exists():
            continue
        css = css_path.read_text(encoding="utf-8", errors="ignore")
        fonts_dir = css_path.parent / "fonts"
        css = re.sub(
            r"url\((['\"]?)fonts/([^)'\"\s]+)\1\)",
            lambda match: f'url("{(fonts_dir / match.group(2)).as_uri()}")',
            css,
        )
        script = js_path.read_text(encoding="utf-8", errors="ignore")
        return css, script
    return "", ""


def _safe_css_value(value: Any, default: str = "transparent") -> str:
    text = str(value or "").strip()
    if not text:
        return default
    if re.match(r"^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$", text):
        return text
    if re.match(r"^(rgba?|hsla?)\([0-9.,% \-]+\)$", text):
        return text
    if text in {"transparent", "white", "black", "inherit", "currentColor"}:
        return text
    return default


def _style_to_css(style: dict[str, Any] | None) -> str:
    style = style or {}
    rules: list[str] = []
    if style.get("fill") is not None:
        rules.append(f"background:{_safe_css_value(style.get('fill'))}")
    if style.get("color") is not None:
        rules.append(f"color:{_safe_css_value(style.get('color'), '#111827')}")
    if style.get("strokeWidth") is not None or style.get("borderStyle") is not None:
        stroke_width = _num(style.get("strokeWidth"), 0)
        border_style = str(style.get("borderStyle") or ("solid" if stroke_width > 0 else "none"))
        if border_style == "none" or stroke_width <= 0:
            rules.append("border:0")
        else:
            rules.append(f"border:{stroke_width:g}px {border_style} {_safe_css_value(style.get('stroke'), '#d8dee9')}")
    if style.get("radius") is not None:
        rules.append(f"border-radius:{_css_px(style.get('radius'))}")
    if style.get("fontFamily"):
        rules.append(f"font-family:{str(style.get('fontFamily')).replace(';', '')}")
    if style.get("fontSize"):
        rules.append(f"font-size:{_css_px(style.get('fontSize'))}")
    if style.get("fontWeight"):
        weight = {"normal": "400", "medium": "600", "bold": "700"}.get(str(style.get("fontWeight")), str(style.get("fontWeight")))
        rules.append(f"font-weight:{weight}")
    if style.get("fontStyle"):
        rules.append(f"font-style:{str(style.get('fontStyle'))}")
    if style.get("textAlign"):
        rules.append(f"text-align:{str(style.get('textAlign'))}")
    if style.get("lineHeight"):
        rules.append(f"line-height:{_num(style.get('lineHeight'), 1.5):g}")
    if style.get("letterSpacing") is not None:
        rules.append(f"letter-spacing:{_css_px(style.get('letterSpacing'))}")
    shadow = style.get("shadow")
    if isinstance(shadow, dict):
        rules.append(
            "box-shadow:"
            f"{_css_px(shadow.get('x'))} {_css_px(shadow.get('y'))} {_css_px(shadow.get('blur'))} "
            f"{_safe_css_value(shadow.get('color'), 'rgba(15,23,42,0.18)')}"
        )
    return ";".join(rules)


def _line_border_css(style: dict[str, Any] | None, default_width: float = 0, default_style: str = "none") -> str:
    style = style or {}
    stroke_width = _num(style.get("strokeWidth"), default_width)
    border_style = str(style.get("borderStyle") or (default_style if stroke_width > 0 else "none"))
    if border_style == "none" or stroke_width <= 0:
        return ""
    return f"{stroke_width:g}px {border_style} {_safe_css_value(style.get('stroke'), '#d8dee9')}"


def _column_divider_left(index: int, columns: int, padding: float, column_gap: float) -> str:
    fraction = index / max(1, columns)
    offset = padding * (1 - 2 * fraction) + column_gap * (fraction - 0.5)
    return f"calc({fraction * 100:g}% + {offset:g}px)"


def _render_column_dividers(element: dict[str, Any], columns: int) -> str:
    if columns <= 1:
        return ""
    style = element.get("columnDividerStyle") if isinstance(element.get("columnDividerStyle"), dict) else {}
    border = _line_border_css(style)
    if not border:
        return ""
    padding = _num(element.get("padding"), 12)
    column_gap = _num(element.get("columnGap"), 12)
    spans = []
    for index in range(1, columns):
        left = _column_divider_left(index, columns, padding, column_gap)
        spans.append(f'<span class="column-divider" style="left:{left};top:{padding:g}px;bottom:{padding:g}px;border-left:{border}"></span>')
    return "".join(spans)


def _element_frame_css(element: dict[str, Any]) -> str:
    style = element.get("style") if isinstance(element.get("style"), dict) else {}
    return ";".join(
        [
            "position:absolute",
            f"left:{_css_px(element.get('x'))}",
            f"top:{_css_px(element.get('y'))}",
            f"width:{_css_px(element.get('width'), 1)}",
            f"height:{_css_px(element.get('height'), 1)}",
            f"opacity:{_num(element.get('opacity'), 1):g}",
            f"z-index:{int(_num(element.get('zIndex'), 1))}",
            f"transform:rotate({_num(element.get('rotation'), 0):g}deg)",
            "transform-origin:center center",
            "overflow:hidden",
            _style_to_css(style),
        ]
    )


def _visual_date_parts(data: dict[str, Any]) -> dict[str, str]:
    source = str(data.get("date") or data.get("exam_date") or "")
    match = re.search(r"(\d{4})\D*(\d{1,2})\D*(\d{1,2})", source)
    if match:
        year, month, day = match.groups()
        return {"year": year, "month": month.zfill(2), "day": day.zfill(2)}
    today = datetime.now()
    return {"year": f"{today.year:04d}", "month": f"{today.month:02d}", "day": f"{today.day:02d}"}


def _visual_token_value(key: str, data: dict[str, Any]) -> Any:
    trimmed = str(key or "").strip()
    prepared = {**_visual_date_parts(data), **data}
    normalized = VISUAL_TOKEN_ALIASES.get(trimmed, trimmed)
    value = prepared.get(normalized, prepared.get(trimmed))
    if value is None:
        return None
    return value


def _replace_visual_tokens(value: str | None, data: dict[str, Any], escape_literals: bool) -> str:
    text = escape(value or "") if escape_literals else value or ""

    def replace_double(match: re.Match) -> str:
        resolved = _visual_token_value(match.group(1), data)
        return match.group(0) if resolved is None else escape(str(resolved))

    def replace_single(match: re.Match) -> str:
        resolved = _visual_token_value(match.group(2), data)
        if resolved is None:
            return match.group(0)
        return f"{match.group(1)}{escape(str(resolved))}"

    text = VISUAL_DOUBLE_TOKEN_PATTERN.sub(replace_double, text)
    return VISUAL_SINGLE_TOKEN_PATTERN.sub(replace_single, text)


def _resolve_visual_text(value: str | None, data: dict[str, Any]) -> str:
    return _replace_visual_tokens(value, data, True)


def _resolve_visual_markup(value: str | None, data: dict[str, Any]) -> str:
    return _replace_visual_tokens(value, data, False)


def _resolve_visual_variable(element: dict[str, Any], data: dict[str, Any]) -> str:
    key = str(element.get("variableKey") or "")
    value = _visual_token_value(key, data)
    if value is None or value == "":
        value = element.get("fallback") or ""
    return escape(str(value))


def _problem_export_data(problem: Problem, index: int, total: int, base_data: dict[str, Any]) -> dict[str, Any]:
    tags = problem.tags
    tag_values = [value for value in ([tags.subject, tags.unit, tags.difficulty, tags.problem_type, tags.source] if tags else []) if value]
    solution_text = _solution_text_for_export(problem, base_data)
    source_lookup_metadata = _source_lookup_metadata(problem)
    return {
        "id": str(problem.id),
        "source_batch_id": str(problem.source_batch_id),
        "number": index,
        "problem_number": problem.problem_number,
        "text": normalize_geometry_notation(problem.problem_text),
        "problem_text": normalize_geometry_notation(problem.problem_text),
        "choices": problem.choices or [],
        "answer": problem.answer or "",
        "solution": solution_text,
        "solution_text": solution_text,
        "source_lookup_metadata": source_lookup_metadata,
        "has_solution": _has_solution(problem),
        "key_concept": "",
        "difficulty": tags.difficulty if tags else "",
        "subject": tags.subject if tags else base_data.get("subject", ""),
        "unit": tags.unit if tags else base_data.get("unit", ""),
        "tags": ", ".join(tag_values),
        "source": tags.source if tags and tags.source else "",
        "visual_url": _export_visual_url(problem.visual_url),
        "visual_schema": problem.visual_schema,
        "math_model": problem.math_model,
        "visual_svg": Markup(problem_visual_schema_to_svg(problem.visual_schema, problem.math_model))
        if is_high_confidence_problem_visual_schema(problem.visual_schema) or not problem.visual_url
        else Markup(""),
        "page_number": index,
        "total_pages": total,
    }


def _question_number_int(value: Any) -> int | None:
    match = re.search(r"\d+", str(value or ""))
    if not match:
        return None
    try:
        return int(match.group(0))
    except ValueError:
        return None


def _choice_label_text(choice: Any, fallback_index: int) -> str:
    if isinstance(choice, dict):
        label = str(choice.get("choice_label") or choice.get("label") or fallback_index).strip()
        text = str(choice.get("choice_text") or choice.get("text") or choice.get("value") or "").strip()
        return f"{label} {text}".strip()
    return str(choice or "").strip()


def _choice_lines(choices: Any) -> list[str]:
    if not isinstance(choices, list):
        return []
    return [line for index, choice in enumerate(choices, start=1) if (line := _choice_label_text(choice, index))]


def _korean_question_export_data(question: KoreanQuestion, fallback_problem: dict[str, Any], order: int, total: int) -> dict[str, Any]:
    parts = [str(question.question_stem or "").strip(), str(question.additional_material or "").strip()]
    text = "\n\n".join(part for part in parts if part)
    reviewed_text = str(fallback_problem.get("problem_text") or fallback_problem.get("text") or "").strip()
    reviewed_choices = fallback_problem.get("choices") if isinstance(fallback_problem.get("choices"), list) else None
    reviewed_answer = str(fallback_problem.get("answer") or "").strip()
    reviewed_solution = str(fallback_problem.get("solution") or fallback_problem.get("solution_text") or "").strip()
    answer_text = reviewed_answer or question.answer or ""
    return {
        "id": str(fallback_problem.get("id") or question.id),
        "layout_type": "korean_question",
        "number": order,
        "problem_number": question.question_number or order,
        "text": normalize_geometry_notation(reviewed_text or text),
        "problem_text": normalize_geometry_notation(reviewed_text or text),
        "choices": reviewed_choices if reviewed_choices is not None else question.choices or [],
        "answer": answer_text,
        "solution": reviewed_solution or answer_text,
        "solution_text": reviewed_solution or answer_text,
        "visual_url": fallback_problem.get("visual_url") or "",
        "page_number": order,
        "total_pages": total,
    }


def _build_korean_passage_flow_items(problems: list[Problem], problem_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not problems:
        return []
    session = object_session(problems[0])
    if session is None:
        return []
    batch_ids = sorted({problem.source_batch_id for problem in problems if problem.source_batch_id}, key=str)
    if not batch_ids:
        return []

    documents = session.query(KoreanExtractionDocument).filter(KoreanExtractionDocument.batch_id.in_(batch_ids)).all()
    if not documents:
        return []
    document_ids = [document.id for document in documents]
    passages = session.query(KoreanPassageGroup).filter(KoreanPassageGroup.document_id.in_(document_ids)).all()
    questions = session.query(KoreanQuestion).filter(KoreanQuestion.document_id.in_(document_ids)).all()

    selected_by_batch_number: dict[tuple[str, int], tuple[int, dict[str, Any]]] = {}
    for index, problem in enumerate(problems):
        key_number = _question_number_int(problem.problem_number)
        if key_number is not None:
            selected_by_batch_number[(str(problem.source_batch_id), key_number)] = (index, problem_data[index])

    question_entries: list[tuple[int, KoreanQuestion, dict[str, Any]]] = []
    used_problem_ids: set[str] = set()
    for question in questions:
        document = next((item for item in documents if item.id == question.document_id), None)
        if document is None:
            continue
        number = _question_number_int(question.question_number)
        if number is None:
            continue
        selected = selected_by_batch_number.get((str(document.batch_id), number))
        if not selected:
            continue
        order, fallback_problem = selected
        question_entries.append((order, question, _korean_question_export_data(question, fallback_problem, fallback_problem.get("number") or order + 1, len(problem_data))))
        used_problem_ids.add(str(fallback_problem.get("id") or ""))

    if not question_entries:
        return []

    passage_by_document_and_id = {(str(passage.document_id), str(passage.passage_id)): passage for passage in passages}
    questions_by_passage: dict[tuple[str, str], list[tuple[int, dict[str, Any]]]] = {}
    standalone: list[tuple[int, dict[str, Any]]] = []
    for order, question, item in question_entries:
        key = (str(question.document_id), str(question.linked_passage_id or ""))
        if question.linked_passage_id and key in passage_by_document_and_id:
            questions_by_passage.setdefault(key, []).append((order, item))
        else:
            standalone.append((order, item))

    items: list[tuple[int, dict[str, Any]]] = []
    for key, question_items in questions_by_passage.items():
        passage = passage_by_document_and_id[key]
        question_items.sort(key=lambda item: item[0])
        first_order = question_items[0][0]
        first_number = question_items[0][1].get("problem_number")
        last_number = question_items[-1][1].get("problem_number")
        items.append(
            (
                first_order,
                {
                    "id": f"korean-passage-{passage.id}",
                    "layout_type": "korean_passage_group",
                    "number": f"{first_number}~{last_number}" if first_number != last_number else str(first_number),
                    "passage_instruction": passage.passage_instruction or "",
                    "passage_title": passage.passage_title or "",
                    "passage_text": passage.passage_text or "",
                    "passage_type": passage.passage_type or "",
                    "questions": [item for _, item in question_items],
                },
            )
        )

    items.extend(standalone)
    items.sort(key=lambda item: item[0])

    for problem in problem_data:
        if str(problem.get("id") or "") not in used_problem_ids:
            items.append((int(problem.get("number") or 10**9), problem))
    return [item for _, item in items]


def _estimate_problem_height(problem_data: dict[str, Any], region: dict[str, Any]) -> int:
    body_style = region.get("bodyStyle") if isinstance(region.get("bodyStyle"), dict) else {}
    font_size = int(_num(body_style.get("fontSize"), 12))
    line_height = _num(body_style.get("lineHeight"), 1.6)
    if problem_data.get("layout_type") == "korean_passage_group":
        passage_text = " ".join(
            [
                str(problem_data.get("passage_instruction") or ""),
                str(problem_data.get("passage_title") or ""),
                str(problem_data.get("passage_text") or ""),
            ]
        )
        passage_lines = max(4, int(len(passage_text) / 34) + 1)
        question_lines = 0
        for question in problem_data.get("questions") if isinstance(problem_data.get("questions"), list) else []:
            if isinstance(question, dict):
                question_lines += max(2, int(len(str(question.get("text") or "")) / 36) + 1)
                question_lines += max(0, int(len(" ".join(_choice_lines(question.get("choices")))) / 42) + 1)
        return max(int(_num(region.get("minItemHeight"), 120)), 56 + int((passage_lines + question_lines) * font_size * line_height) + int(_num(region.get("padding"), 12)) * 2)
    text_lines = max(2, int(len(str(problem_data.get("text", ""))) / 38) + 1)
    solution_lines = int(len(str(problem_data.get("solution", ""))) / 48) + 1 if region.get("type") == "solutionRegion" else 0
    answer_space = 0 if region.get("type") in {"answerRegion", "solutionRegion"} else 42
    image_space = 210 if problem_data.get("visual_url") or problem_data.get("visual_svg") else 0
    padding = int(_num(region.get("padding"), 12))
    return max(int(_num(region.get("minItemHeight"), 120)), 44 + int(text_lines * font_size * line_height) + solution_lines * 18 + answer_space + image_space + padding)


def _region_capacity(region: dict[str, Any], problem_data: list[dict[str, Any]]) -> int:
    columns = max(1, int(_num(region.get("columns"), 1)))
    rows = max(0, int(_num(region.get("rows"), 0)))
    korean_flow = region.get("layoutMode") == "korean-passage-flow"
    if rows and not korean_flow:
        return min(len(problem_data), columns * rows)

    usable_height = max(1, _num(region.get("height"), 100) - _num(region.get("padding"), 0) * 2)
    row_gap = _num(region.get("rowGap"), 10)
    placed = 0
    if korean_flow:
        column_index = 0
        current_height = 0.0
        for problem in problem_data:
            item_height = _estimate_problem_height(problem, region) + row_gap
            if current_height > 0 and current_height + item_height > usable_height:
                column_index += 1
                current_height = 0.0
            if column_index >= columns:
                break
            current_height += item_height
            placed += 1
        return max(1, placed) if problem_data else 0

    column_heights = [0.0 for _ in range(columns)]
    for problem in problem_data:
        item_height = _estimate_problem_height(problem, region) + row_gap
        target = placed % columns if region.get("fillDirection") == "row-first" else column_heights.index(min(column_heights))
        if column_heights[target] + item_height > usable_height and placed >= columns:
            break
        column_heights[target] += item_height
        placed += 1
    return max(1, placed) if problem_data else 0


def _binding_key(region: dict[str, Any]) -> str:
    binding = region.get("binding")
    if binding == "counseling" or region.get("type") == "counselingRegion":
        return "counseling"
    if binding in {"answers", "solutions"} or region.get("type") in {"answerRegion", "solutionRegion"}:
        return "answers"
    return "problems"


def _card_style_css(style: dict[str, Any] | None) -> str:
    return ";".join(
        [
            "overflow:hidden",
            "min-height:128px",
            "padding:12px",
            "background:#ffffff",
            "border:1px solid #e5e7eb",
            "border-radius:10px",
            _style_to_css(style),
        ]
    )


def _problem_number_label(problem: dict[str, Any], region: dict[str, Any]) -> str:
    number = str(problem.get("number") or problem.get("problem_number") or "")
    return str(region.get("numberFormat") or "문 {n}.").replace("{n}", number)


def _render_problem_card(problem: dict[str, Any], region: dict[str, Any], base_data: dict[str, Any]) -> str:
    number_style = _style_to_css(region.get("numberStyle") if isinstance(region.get("numberStyle"), dict) else {})
    body_style = _style_to_css(region.get("bodyStyle") if isinstance(region.get("bodyStyle"), dict) else {})
    answer_space_style = _style_to_css(region.get("answerSpaceStyle") if isinstance(region.get("answerSpaceStyle"), dict) else {})
    padding = max(10, _num(region.get("padding"), 12) * 0.75)
    min_height = _num(region.get("minItemHeight"), 128)
    fixed_slot = int(_num(region.get("rows"), 0)) > 0
    slot_css = "height:100%;min-height:0;display:flex;flex-direction:column" if fixed_slot else f"min-height:{min_height:g}px"
    body_slot_css = "flex:0 0 auto;min-height:0;overflow:visible" if fixed_slot else ""
    answer_space_slot_css = "margin-top:auto" if fixed_slot else ""
    number = escape(str(problem.get("number") or problem.get("problem_number") or ""))
    number_label = escape(_problem_number_label(problem, region))
    visual = ""
    if problem.get("visual_url"):
        visual = f'<img class="problem-visual" src="{escape(str(problem["visual_url"]), quote=True)}" alt="" />'
    elif problem.get("visual_svg"):
        visual = f'<div class="problem-visual problem-structured-visual-wrap">{problem["visual_svg"]}</div>'
    choices = ""
    choice_lines = _choice_lines(problem.get("choices"))
    if choice_lines:
        choices = '<div class="problem-choices">' + "".join(f'<span class="math-text">{escape(line)}</span>' for line in choice_lines) + "</div>"
    solution = ""
    if region.get("type") == "solutionRegion" or base_data.get("include_solution"):
        solution = f'<div class="problem-solution math-text">{escape(str(problem.get("solution") or ""))}</div>'
    answer = ""
    if region.get("type") == "answerRegion":
        answer = f'<div class="problem-answer"><span>{number_label} </span><span class="math-text">{escape(str(problem.get("answer") or ""))}</span></div>'
    answer_space = "" if region.get("type") in {"answerRegion", "solutionRegion"} else f'<div class="answer-space" style="{answer_space_style};{answer_space_slot_css}"></div>'
    visual_class = " has-visual" if visual else ""
    return f"""
<article class="problem-card{visual_class}" style="{_card_style_css(region.get('cardStyle') if isinstance(region.get('cardStyle'), dict) else {})};{slot_css};padding:{padding:g}px">
  <div class="problem-heading"><span class="problem-number" style="{number_style}">{number_label}</span></div>
  <div class="problem-text math-text" style="{body_style};{body_slot_css}">{escape(str(problem.get('text') or ''))}</div>
  {choices}
  {visual}
  {solution}
  {answer}
  {answer_space}
</article>"""


def _render_korean_passage_group_card(item: dict[str, Any], region: dict[str, Any], base_data: dict[str, Any]) -> str:
    number_style = _style_to_css(region.get("numberStyle") if isinstance(region.get("numberStyle"), dict) else {})
    body_style = _style_to_css(region.get("bodyStyle") if isinstance(region.get("bodyStyle"), dict) else {})
    padding = max(10, _num(region.get("padding"), 12) * 0.75)
    passage_parts = [
        str(item.get("passage_instruction") or "").strip(),
        str(item.get("passage_title") or "").strip(),
        str(item.get("passage_text") or "").strip(),
    ]
    passage_html = "\n\n".join(part for part in passage_parts if part)
    questions: list[str] = []
    for question in item.get("questions") if isinstance(item.get("questions"), list) else []:
        if not isinstance(question, dict):
            continue
        number_label = escape(_problem_number_label(question, region))
        choices = "".join(f'<span class="math-text">{escape(line)}</span>' for line in _choice_lines(question.get("choices")))
        choices_html = f'<div class="problem-choices korean-question-choices">{choices}</div>' if choices else ""
        solution = f'<div class="problem-solution math-text">{escape(str(question.get("solution") or ""))}</div>' if region.get("type") == "solutionRegion" or base_data.get("include_solution") else ""
        answer = f'<div class="problem-answer"><span>{number_label} </span><span class="math-text">{escape(str(question.get("answer") or ""))}</span></div>' if region.get("type") == "answerRegion" else ""
        answer_space = "" if region.get("type") in {"answerRegion", "solutionRegion"} else '<div class="answer-space korean-answer-space"></div>'
        questions.append(
            f"""
<section class="korean-question">
  <div class="problem-heading"><span class="problem-number" style="{number_style}">{number_label}</span></div>
  <div class="problem-text math-text" style="{body_style}">{escape(str(question.get("text") or ""))}</div>
  {choices_html}
  {solution}
  {answer}
  {answer_space}
</section>"""
        )
    passage_block = f'<div class="korean-passage math-text" style="{body_style}">{escape(passage_html)}</div>' if passage_html else ""
    return f"""
<article class="problem-card korean-passage-card" style="{_card_style_css(region.get('cardStyle') if isinstance(region.get('cardStyle'), dict) else {})};min-height:{_num(region.get('minItemHeight'), 128):g}px;padding:{padding:g}px">
  {passage_block}
  {"".join(questions)}
</article>"""


def _render_counseling_card(section: dict[str, Any], region: dict[str, Any], base_data: dict[str, Any]) -> str:
    number_style = _style_to_css(region.get("numberStyle") if isinstance(region.get("numberStyle"), dict) else {})
    body_style = _style_to_css(region.get("bodyStyle") if isinstance(region.get("bodyStyle"), dict) else {})
    padding = max(10, _num(region.get("padding"), 12) * 0.75)
    min_height = _num(region.get("minItemHeight"), 96)
    fixed_slot = int(_num(region.get("rows"), 0)) > 0
    slot_css = "height:100%;min-height:0;display:flex;flex-direction:column" if fixed_slot else f"min-height:{min_height:g}px"
    label = escape(str(section.get("label") or "상담 항목"))
    value = escape(str(section.get("value") or "-"))
    return f"""
<article class="counseling-card" style="{_card_style_css(region.get('cardStyle') if isinstance(region.get('cardStyle'), dict) else {})};{slot_css};padding:{padding:g}px">
  <div class="problem-heading"><span class="problem-number" style="{number_style}">{label}</span></div>
  <div class="problem-text counseling-value" style="{body_style};white-space:pre-wrap">{value}</div>
</article>"""


def _pack_korean_flow_columns(items: list[dict[str, Any]], region: dict[str, Any]) -> list[list[dict[str, Any]]]:
    columns = max(1, int(_num(region.get("columns"), 1)))
    usable_height = max(1, _num(region.get("height"), 100) - _num(region.get("padding"), 0) * 2)
    row_gap = _num(region.get("rowGap"), 10)
    packed: list[list[dict[str, Any]]] = [[] for _ in range(columns)]
    column_index = 0
    current_height = 0.0
    for item in items:
        item_height = _estimate_problem_height(item, region) + row_gap
        if current_height > 0 and current_height + item_height > usable_height:
            column_index += 1
            current_height = 0.0
        if column_index >= columns:
            break
        packed[column_index].append(item)
        current_height += item_height
    return packed


def _render_korean_flow_region(element: dict[str, Any], items: list[dict[str, Any]], base_data: dict[str, Any]) -> str:
    columns = max(1, int(_num(element.get("columns"), 1)))
    column_gap = _css_px(element.get("columnGap"), 12)
    row_gap = _css_px(element.get("rowGap"), 12)
    padding = _css_px(element.get("padding"), 12)
    packed = _pack_korean_flow_columns(items, element)
    column_html = []
    for column_items in packed:
        cards = []
        for item in column_items:
            if item.get("layout_type") == "korean_passage_group":
                cards.append(_render_korean_passage_group_card(item, element, base_data))
            else:
                cards.append(_render_problem_card(item, element, base_data))
        column_html.append(f'<div class="korean-flow-column" style="display:flex;flex-direction:column;gap:{row_gap};min-width:0;flex:1;overflow:hidden">{"".join(cards)}</div>')
    dividers = _render_column_dividers(element, columns)
    return f"""
<div class="dynamic-region korean-flow-region" style="position:relative;display:flex;gap:{column_gap};padding:{padding};height:100%;box-sizing:border-box;overflow:hidden">
  {"".join(column_html)}
  {dividers}
</div>"""


def _render_region(element: dict[str, Any], items: list[dict[str, Any]], base_data: dict[str, Any]) -> str:
    columns = max(1, int(_num(element.get("columns"), 1)))
    rows = max(0, int(_num(element.get("rows"), 0)))
    column_gap = _css_px(element.get("columnGap"), 12)
    row_gap = _css_px(element.get("rowGap"), 12)
    padding = _css_px(element.get("padding"), 12)
    row_template = f"grid-template-rows:repeat({rows}, minmax(0, 1fr));" if rows else ""
    grid_flow = "column" if rows and element.get("fillDirection") == "column-first" else "row"
    if element.get("layoutMode") == "korean-passage-flow" and _binding_key(element) == "problems":
        return _render_korean_flow_region(element, items, base_data)
    if element.get("type") == "counselingRegion" or _binding_key(element) == "counseling":
        cards = "\n".join(_render_counseling_card(section, element, base_data) for section in items)
    else:
        cards = "\n".join(_render_problem_card(problem, element, base_data) for problem in items)
    dividers = _render_column_dividers(element, columns)
    return f"""
<div class="dynamic-region" style="position:relative;display:grid;grid-template-columns:repeat({columns}, minmax(0, 1fr));{row_template}grid-auto-flow:{grid_flow};gap:{row_gap} {column_gap};padding:{padding};height:100%;box-sizing:border-box;align-content:{'stretch' if rows else 'start'};align-items:{'stretch' if rows else 'start'};overflow:hidden">
  {cards}
  {dividers}
</div>"""


EXAM_STATS_METRICS = {
    "average": {"label": "응시자 평균", "short": "평균", "color": "#8b5cf6"},
    "highest": {"label": "최고점", "short": "최고", "color": "#10b981"},
    "lowest": {"label": "최저점", "short": "최저", "color": "#f43f5e"},
    "q1": {"label": "Q1", "short": "Q1", "color": "#0ea5e9"},
    "q2": {"label": "Q2 중앙값", "short": "Q2", "color": "#eab308"},
    "q3": {"label": "Q3", "short": "Q3", "color": "#f97316"},
    "stddev": {"label": "표준편차", "short": "σ", "color": "#64748b"},
}
DEFAULT_EXAM_STATS_METRICS = ["average", "q2"]


def _finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return number


def _point_date_key(value: Any) -> str:
    text = str(value or "")
    match = re.search(r"(\d{4})\D*(\d{1,2})\D*(\d{1,2})", text)
    if match:
        year, month, day = match.groups()
        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return ""
    return parsed.strftime("%Y-%m-%d")


def _filter_exam_stats_points(points: list[dict[str, Any]], element: dict[str, Any]) -> list[dict[str, Any]]:
    start = str(element.get("xAxisDateStart") or "")
    end = str(element.get("xAxisDateEnd") or "")
    if not start and not end:
        return points
    filtered: list[dict[str, Any]] = []
    for point in points:
        key = _point_date_key(point.get("date"))
        if not key:
            continue
        if start and key < start:
            continue
        if end and key > end:
            continue
        filtered.append(point)
    return filtered


def _chart_value(value: float, minimum: float, maximum: float) -> float:
    if maximum <= minimum:
        return minimum
    return min(maximum, max(minimum, value))


def _normalize_exam_stats_point(value: Any, index: int) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    point: dict[str, Any] = {
        "title": str(value.get("title") or value.get("label") or f"시험 {index + 1}"),
        "date": str(value.get("date") or ""),
    }
    for key in EXAM_STATS_METRICS:
        number = _finite_number(value.get(key))
        if number is not None:
            point[key] = number
    respondents = _finite_number(value.get("respondents") or value.get("respondent_count"))
    if respondents is not None:
        point["respondents"] = respondents
    return point


def _exam_stats_points(element: dict[str, Any], data: dict[str, Any]) -> list[dict[str, Any]]:
    key = str(element.get("dataVariableKey") or "exam_stats_series_json")
    source = data.get(key)
    raw_points: Any = source
    if isinstance(source, str):
        try:
            raw_points = json.loads(source)
        except json.JSONDecodeError:
            raw_points = None
    points = [
        normalized
        for index, item in enumerate(raw_points if isinstance(raw_points, list) else [])
        if (normalized := _normalize_exam_stats_point(item, index))
    ]
    if points:
        return _filter_exam_stats_points(points, element)

    single_point = {
        "title": data.get("test_title") or data.get("exam_title") or "시험",
        "date": data.get("exam_date") or data.get("date") or "",
        "average": data.get("exam_stats_average"),
        "highest": data.get("exam_stats_highest"),
        "lowest": data.get("exam_stats_lowest"),
        "q1": data.get("exam_stats_q1"),
        "q2": data.get("exam_stats_q2"),
        "q3": data.get("exam_stats_q3"),
        "stddev": data.get("exam_stats_standard_deviation"),
        "respondents": data.get("exam_stats_respondent_count"),
    }
    normalized = _normalize_exam_stats_point(single_point, 0)
    if normalized and any(metric in normalized for metric in EXAM_STATS_METRICS):
        return _filter_exam_stats_points([normalized], element)
    return []


def _render_exam_stats_chart(element: dict[str, Any], data: dict[str, Any]) -> str:
    points = _exam_stats_points(element, data)
    if not points:
        return '<div class="exam-stats-empty">시험 통계 데이터가 연결되면 차트가 표시됩니다.</div>'

    metrics = [
        metric
        for metric in (element.get("metrics") if isinstance(element.get("metrics"), list) else DEFAULT_EXAM_STATS_METRICS)
        if metric in EXAM_STATS_METRICS
    ] or DEFAULT_EXAM_STATS_METRICS
    mode = str(element.get("chartMode") or "line")
    width = max(320.0, _num(element.get("width"), 640))
    height = max(180.0, _num(element.get("height"), 300))
    y_min = _num(element.get("yAxisMin"), 0)
    y_max = _num(element.get("yAxisMax"), 100)
    if y_max <= y_min:
        y_min, y_max = 0, 100
    style = element.get("style") if isinstance(element.get("style"), dict) else {}
    fill = _safe_css_value(style.get("fill"), "#ffffff")
    text_color = _safe_css_value(style.get("color"), "#111827")
    title = _resolve_visual_text(str(element.get("title") or ""), data)
    title_height = 30 if title else 10
    show_point_labels = bool(element.get("showPointLabels", False))
    show_respondents = bool(element.get("showRespondents", False))
    legend_height = 28 if element.get("showLegend", True) else 6
    x_label_height = 32 if show_point_labels else 8
    padding = {"top": title_height + 10, "right": 20, "bottom": x_label_height + legend_height + 8, "left": 38}
    plot_width = max(1.0, width - padding["left"] - padding["right"])
    plot_height = max(1.0, height - padding["top"] - padding["bottom"])
    baseline = padding["top"] + plot_height

    def x_for(index: int) -> float:
        return padding["left"] + (plot_width / 2 if len(points) <= 1 else (index / (len(points) - 1)) * plot_width)

    def y_for(value: float) -> float:
        return padding["top"] + ((y_max - _chart_value(value, y_min, y_max)) / (y_max - y_min)) * plot_height

    parts: list[str] = [
        f'<svg width="100%" height="100%" viewBox="0 0 {width:g} {height:g}" preserveAspectRatio="none" role="img" aria-label="{escape(title or "시험 통계 차트", quote=True)}">'
    ]
    if title:
        parts.append(f'<text x="16" y="24" font-size="15" font-weight="700" fill="{text_color}">{title}</text>')
    if element.get("showGrid", True):
        ticks = [y_max, y_min + (y_max - y_min) * 0.75, y_min + (y_max - y_min) * 0.5, y_min + (y_max - y_min) * 0.25, y_min]
        for tick in ticks:
            y = y_for(tick)
            parts.append(f'<line x1="{padding["left"]:g}" x2="{width - padding["right"]:g}" y1="{y:g}" y2="{y:g}" stroke="rgba(148,163,184,0.26)" />')
            parts.append(f'<text x="{padding["left"] - 8:g}" y="{y + 4:g}" text-anchor="end" font-size="10" fill="#64748b">{round(tick):g}</text>')
    parts.append(f'<line x1="{padding["left"]:g}" x2="{padding["left"]:g}" y1="{padding["top"]:g}" y2="{baseline:g}" stroke="rgba(100,116,139,0.35)" />')
    parts.append(f'<line x1="{padding["left"]:g}" x2="{width - padding["right"]:g}" y1="{baseline:g}" y2="{baseline:g}" stroke="rgba(100,116,139,0.35)" />')

    if mode == "bar":
        for point_index, point in enumerate(points):
            group_width = min(72.0, max(22.0, len(metrics) * 10.0))
            bar_width = max(4.0, min(9.0, (group_width - len(metrics) * 2.0) / max(1, len(metrics))))
            for metric_index, metric in enumerate(metrics):
                value = _finite_number(point.get(metric))
                if value is None:
                    continue
                y = y_for(value)
                x = x_for(point_index) - group_width / 2 + metric_index * (bar_width + 2)
                parts.append(f'<rect x="{x:g}" y="{y:g}" width="{bar_width:g}" height="{max(2, baseline - y):g}" rx="2" fill="{EXAM_STATS_METRICS[metric]["color"]}" opacity="0.9" />')
    else:
        for metric in metrics:
            line_points: list[tuple[float, float]] = []
            for point_index, point in enumerate(points):
                value = _finite_number(point.get(metric))
                if value is not None:
                    line_points.append((x_for(point_index), y_for(value)))
            if len(line_points) > 1:
                polyline = " ".join(f"{x:g},{y:g}" for x, y in line_points)
                parts.append(f'<polyline points="{polyline}" fill="none" stroke="{EXAM_STATS_METRICS[metric]["color"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />')
            for x, y in line_points:
                parts.append(f'<circle cx="{x:g}" cy="{y:g}" r="3.6" fill="{EXAM_STATS_METRICS[metric]["color"]}" stroke="{fill}" stroke-width="1.5" />')

    if show_point_labels:
        for index, point in enumerate(points):
            title_text = str(point.get("title") or "")
            date_text = str(point.get("date") or "")
            respondents = _finite_number(point.get("respondents"))
            caption = f"n={round(respondents)}" if show_respondents and respondents is not None else date_text
            short_title = title_text[:7] + "…" if len(title_text) > 7 else title_text
            x = x_for(index)
            parts.append(f'<text x="{x:g}" y="{height - legend_height - 18:g}" text-anchor="middle" font-size="10" font-weight="700" fill="{text_color}">{escape(short_title)}</text>')
            parts.append(f'<text x="{x:g}" y="{height - legend_height - 4:g}" text-anchor="middle" font-size="9" fill="#64748b">{escape(caption)}</text>')

    if element.get("showLegend", True):
        for index, metric in enumerate(metrics):
            x = padding["left"] + index * 72
            parts.append(f'<g transform="translate({x:g}, {height - 18:g})"><circle cx="0" cy="-3" r="3.4" fill="{EXAM_STATS_METRICS[metric]["color"]}" /><text x="8" y="1" font-size="10" fill="#64748b">{escape(EXAM_STATS_METRICS[metric]["short"])}</text></g>')

    parts.append("</svg>")
    return "".join(parts)


def _render_visual_element(element: dict[str, Any], placements: dict[str, list[dict[str, Any]]], data: dict[str, Any]) -> str:
    if element.get("hidden"):
        return ""
    element_id = str(element.get("id") or "")
    element_type = element.get("type")
    frame = _element_frame_css(element)
    content = ""
    if element_type == "text":
        content = f'<div class="element-content text-element math-text">{_resolve_visual_text(str(element.get("text") or ""), data)}</div>'
    elif element_type == "richText":
        raw = str(element.get("html") or "")
        content = sanitize_template_html(_resolve_visual_markup(raw, data))
    elif element_type == "variable":
        content = f'<div class="variable-fit" data-autofit-text>{_resolve_visual_variable(element, data)}</div>'
    elif element_type == "pageNumber":
        content = f'<div class="centered-element-content">{_resolve_visual_text(str(element.get("format") or "{{page_number}} / {{total_pages}}"), data)}</div>'
    elif element_type == "image":
        src = str(element.get("src") or "")
        fit = str(element.get("objectFit") or "contain")
        content = f'<img src="{escape(src, quote=True)}" alt="" style="width:100%;height:100%;object-fit:{fit}" />' if src else ""
    elif element_type == "shape":
        shape = element.get("shape")
        extra = "border-radius:999px" if shape == "circle" else ""
        if shape == "triangle":
            extra += ";clip-path:polygon(50% 0, 100% 100%, 0 100%)"
        elif shape == "star":
            content = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:64px">★</div>'
        content = content or ""
        frame += f";{extra}"
    elif element_type == "line":
        stroke = _safe_css_value((element.get("style") or {}).get("stroke"), "#111827") if isinstance(element.get("style"), dict) else "#111827"
        stroke_width = _num((element.get("style") or {}).get("strokeWidth"), 1) if isinstance(element.get("style"), dict) else 1
        line_kind = element.get("lineKind")
        border_style = "dotted" if line_kind == "dotted" else "dashed" if line_kind == "dashed" else "solid"
        if line_kind == "double":
            content = f'<div style="height:100%;display:flex;flex-direction:column;justify-content:space-between"><i style="border-top:{stroke_width:g}px solid {stroke}"></i><i style="border-top:{stroke_width:g}px solid {stroke}"></i></div>'
        else:
            content = f'<div style="position:absolute;left:0;right:0;top:50%;border-top:{stroke_width:g}px {border_style} {stroke}"></div>'
    elif element_type == "table":
        rows = max(1, int(_num(element.get("rows"), 3)))
        columns = max(1, int(_num(element.get("columns"), 3)))
        cells = "".join('<span></span>' for _ in range(rows * columns))
        content = f'<div class="visual-table" style="display:grid;grid-template-columns:repeat({columns},1fr);grid-template-rows:repeat({rows},1fr);width:100%;height:100%">{cells}</div>'
    elif element_type == "examStatsChart":
        content = _render_exam_stats_chart(element, data)
    elif element_type == "qr":
        content = '<div class="qr-placeholder">QR</div>'
    elif element_type == "watermark":
        content = escape(str(element.get("text") or ""))
    elif element_type == "headerBlock":
        content = f'<div class="header-block"><strong>{_resolve_visual_text(str(element.get("title") or ""), data)}</strong><span>{_resolve_visual_text(str(element.get("subtitle") or ""), data)}</span></div>'
    elif element_type == "footerBlock":
        content = _resolve_visual_text(str(element.get("text") or ""), data)
    elif element_type in REGION_TYPES:
        content = _render_region(element, placements.get(element_id, []), data)
    return f'<div class="visual-element visual-{escape(str(element_type or "element"), quote=True)}" style="{frame}">{content}</div>'


def _page_size(page: dict[str, Any], template_set: dict[str, Any]) -> dict[str, Any]:
    return page.get("pageSize") if isinstance(page.get("pageSize"), dict) else template_set.get("defaultPageSize") or {"width": 794, "height": 1123}


def _choose_template_page(template_set: dict[str, Any], role: str) -> dict[str, Any] | None:
    pages = [page for page in template_set.get("pages", []) if isinstance(page, dict)]
    if role == "problem":
        for candidate_role in ("problem", "exam", "textbookInner", "textbookLeft", "textbookRight"):
            page = next((item for item in pages if item.get("role") == candidate_role), None)
            if page:
                return page
    return next((item for item in pages if item.get("role") == role), None)


def _render_visual_page(template_set: dict[str, Any], page: dict[str, Any], placements: dict[str, list[dict[str, Any]]], data: dict[str, Any]) -> str:
    size = _page_size(page, template_set)
    width = _num(size.get("width"), 794)
    height = _num(size.get("height"), 1123)
    background = page.get("background") if isinstance(page.get("background"), dict) else {}
    bg_color = _safe_css_value(background.get("color"), "#ffffff")
    bg_image = str(background.get("imageUrl") or "")
    bg_opacity = max(0, min(_num(background.get("opacity"), 1), 1))
    page_data = {**data, "page_number": data.get("page_number", 1), "total_pages": data.get("total_pages", 1)}
    elements = sorted([item for item in page.get("elements", []) if isinstance(item, dict)], key=lambda item: _num(item.get("zIndex"), 0))
    rendered = "\n".join(_render_visual_element(element, placements, page_data) for element in elements)
    background_image = f'<img class="visual-page-bg" src="{escape(bg_image, quote=True)}" alt="" style="opacity:{bg_opacity:g}" />' if bg_image else ""
    return f'<section class="visual-page" style="width:{width:g}px;height:{height:g}px;background:{bg_color}">{background_image}{rendered}</section>'


def _consume_region(region: dict[str, Any], remaining: dict[str, list[dict[str, Any]]], placements: dict[str, list[dict[str, Any]]]) -> bool:
    key = _binding_key(region)
    items = remaining.get(key, [])
    if not items:
        return False
    capacity = _region_capacity(region, items)
    if capacity <= 0:
        return False
    element_id = str(region.get("id") or "")
    placements[element_id] = items[:capacity]
    remaining[key] = items[capacity:]
    return True


def _template_page_by_id(template_set: dict[str, Any], page_id: Any) -> dict[str, Any] | None:
    if not page_id:
        return None
    page_id_text = str(page_id)
    pages = [page for page in template_set.get("pages", []) if isinstance(page, dict)]
    return next((page for page in pages if str(page.get("id") or "") == page_id_text), None)


def _consume_page_for_key(page: dict[str, Any], key: str, remaining: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]] | None:
    placements: dict[str, list[dict[str, Any]]] = {}
    consumed = False
    for region in [
        element
        for element in page.get("elements", [])
        if isinstance(element, dict) and element.get("type") in REGION_TYPES and _binding_key(element) == key
    ]:
        consumed = _consume_region(region, remaining, placements) or consumed
    return placements if consumed else None


def _append_planned_dynamic_pages(
    rendered_pages: list[tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]],
    page_sequence: list[dict[str, Any]],
    key: str,
    remaining: dict[str, list[dict[str, Any]]],
    *,
    first_page: dict[str, Any] | None = None,
) -> None:
    if first_page and remaining.get(key):
        placements = _consume_page_for_key(first_page, key, remaining)
        if placements is not None:
            rendered_pages.append((first_page, placements))

    if not page_sequence:
        return

    safety = 0
    while remaining.get(key) and safety < 80:
        page = page_sequence[safety % len(page_sequence)]
        placements = _consume_page_for_key(page, key, remaining)
        if placements is None:
            break
        rendered_pages.append((page, placements))
        safety += 1


def _build_visual_template_export_pages_with_plan(
    template_set: dict[str, Any],
    problems: list[Problem],
    base_data: dict[str, Any],
    plan: dict[str, Any],
) -> list[dict[str, Any]]:
    total = max(1, len(problems))
    problem_data = [_problem_export_data(problem, index, total, base_data) for index, problem in enumerate(problems, start=1)]
    pages = [page for page in template_set.get("pages", []) if isinstance(page, dict)]
    uses_korean_flow = any(
        isinstance(element, dict)
        and element.get("type") in REGION_TYPES
        and _binding_key(element) == "problems"
        and element.get("layoutMode") == "korean-passage-flow"
        for page in pages
        for element in page.get("elements", [])
    )
    korean_problem_data = _build_korean_passage_flow_items(problems, problem_data) if uses_korean_flow else []
    remaining = {
        "problems": list(korean_problem_data or problem_data),
        "solutions": _solution_items_for_export(problem_data, base_data),
        "answers": list(problem_data),
        "counseling": [],
    }
    rendered_pages: list[tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]] = []

    cover_page = _template_page_by_id(template_set, plan.get("cover_page_id")) if plan.get("include_cover") else None
    if cover_page:
        rendered_pages.append((cover_page, {}))

    document_kind = str(plan.get("document_kind") or "exam")
    first_page = _template_page_by_id(template_set, plan.get("first_problem_page_id"))
    body_page = _template_page_by_id(template_set, plan.get("body_problem_page_id"))
    left_page = _template_page_by_id(template_set, plan.get("left_inner_page_id"))
    right_page = _template_page_by_id(template_set, plan.get("right_inner_page_id"))

    if document_kind == "textbook":
        sequence = [page for page in (left_page, right_page) if page] or [page for page in (body_page,) if page]
        _append_planned_dynamic_pages(rendered_pages, sequence, "problems", remaining)
    else:
        sequence = [page for page in (body_page or first_page,) if page]
        _append_planned_dynamic_pages(rendered_pages, sequence, "problems", remaining, first_page=first_page)

    solution_page = _template_page_by_id(template_set, plan.get("solution_page_id"))
    if solution_page:
        _append_planned_dynamic_pages(rendered_pages, [solution_page], "answers", remaining)

    answer_page = _template_page_by_id(template_set, plan.get("answer_page_id"))
    if answer_page:
        _append_planned_dynamic_pages(rendered_pages, [answer_page], "answers", remaining)

    if not rendered_pages:
        fallback = first_page or body_page or left_page or right_page or cover_page or (pages[0] if pages else {})
        rendered_pages.append((fallback, {}))

    page_count = max(1, len(rendered_pages))
    return [
        {
            "page": page,
            "placements": placements,
            "data": {**base_data, "page_number": index, "total_pages": page_count},
        }
        for index, (page, placements) in enumerate(rendered_pages, start=1)
    ]


def build_visual_template_export_pages(template_set: dict[str, Any], problems: list[Problem], base_data: dict[str, Any]) -> list[dict[str, Any]]:
    visual_page_plan = base_data.get("visual_page_plan")
    if isinstance(visual_page_plan, dict):
        return _build_visual_template_export_pages_with_plan(template_set, problems, base_data, visual_page_plan)

    total = max(1, len(problems))
    problem_data = [_problem_export_data(problem, index, total, base_data) for index, problem in enumerate(problems, start=1)]
    pages = [page for page in template_set.get("pages", []) if isinstance(page, dict)]
    uses_korean_flow = any(
        isinstance(element, dict)
        and element.get("type") in REGION_TYPES
        and _binding_key(element) == "problems"
        and element.get("layoutMode") == "korean-passage-flow"
        for page in pages
        for element in page.get("elements", [])
    )
    korean_problem_data = _build_korean_passage_flow_items(problems, problem_data) if uses_korean_flow else []
    counseling_data = [
        item
        for item in (base_data.get("counseling_sections") if isinstance(base_data.get("counseling_sections"), list) else [])
        if isinstance(item, dict)
    ]
    remaining = {
        "problems": list(korean_problem_data or problem_data),
        "solutions": _solution_items_for_export(problem_data, base_data),
        "answers": list(problem_data),
        "counseling": list(counseling_data),
    }
    rendered_pages: list[tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]] = []

    for page in pages:
        placements: dict[str, list[dict[str, Any]]] = {}
        for region in [element for element in page.get("elements", []) if isinstance(element, dict) and element.get("type") in REGION_TYPES]:
            _consume_region(region, remaining, placements)
        rendered_pages.append((page, placements))

    for role, key in (("problem", "problems"), ("solution", "answers"), ("answer", "answers"), ("report", "counseling")):
        safety = 0
        while remaining.get(key) and safety < 80:
            page = _choose_template_page(template_set, role)
            if not page:
                break
            placements = {}
            consumed = False
            for region in [element for element in page.get("elements", []) if isinstance(element, dict) and element.get("type") in REGION_TYPES and _binding_key(element) == key]:
                consumed = _consume_region(region, remaining, placements) or consumed
            if not consumed:
                break
            rendered_pages.append((page, placements))
            safety += 1

    if remaining.get("counseling"):
        base_page = _choose_template_page(template_set, "report") or (pages[0] if pages else None)
        size = _page_size(base_page or {}, template_set)
        fallback_region = {
            "id": "__auto_counseling_region__",
            "type": "counselingRegion",
            "binding": "counseling",
            "x": 56,
            "y": 120,
            "width": max(240, _num(size.get("width"), 794) - 112),
            "height": max(360, _num(size.get("height"), 1123) - 190),
            "columns": 1,
            "rows": 6,
            "columnGap": 14,
            "rowGap": 12,
            "padding": 12,
            "minItemHeight": 96,
            "numberFormat": "{n}",
            "columnDividerStyle": {"stroke": "#d8dee9", "strokeWidth": 0, "borderStyle": "none"},
            "style": {"fill": "#ffffff", "stroke": "#c4b5fd", "strokeWidth": 1, "borderStyle": "dashed", "radius": 10},
            "cardStyle": {"fill": "#ffffff", "stroke": "#e5e7eb", "strokeWidth": 1, "borderStyle": "solid", "radius": 10},
            "numberStyle": {"color": "#4c1d95", "fontSize": 12, "fontWeight": "bold"},
            "bodyStyle": {"color": "#111827", "fontSize": 12, "lineHeight": 1.65},
            "answerSpaceStyle": {"fill": "#ffffff", "stroke": "#cbd5e1", "strokeWidth": 1, "borderStyle": "dashed", "radius": 8},
        }
        if base_page:
            fallback_page = {**base_page, "elements": [*base_page.get("elements", []), fallback_region]}
        else:
            fallback_page = {
                "id": "__auto_counseling_page__",
                "name": "Counseling Page",
                "role": "report",
                "pageSize": size,
                "background": {"color": "#ffffff"},
                "elements": [fallback_region],
            }
        safety = 0
        while remaining.get("counseling") and safety < 80:
            placements: dict[str, list[dict[str, Any]]] = {}
            if not _consume_region(fallback_region, remaining, placements):
                break
            rendered_pages.append((fallback_page, placements))
            safety += 1

    if remaining.get("problems"):
        base_page = _choose_template_page(template_set, "problem") or (pages[0] if pages else None)
        size = _page_size(base_page or {}, template_set)
        fallback_region = {
            "id": "__auto_problem_region__",
            "type": "problemRegion",
            "binding": "problems",
            "x": 56,
            "y": 120,
            "width": max(240, _num(size.get("width"), 794) - 112),
            "height": max(360, _num(size.get("height"), 1123) - 190),
            "columns": 1,
            "rows": 4,
            "columnGap": 14,
            "rowGap": 12,
            "padding": 12,
            "minItemHeight": 120,
            "numberFormat": "문 {n}.",
            "columnDividerStyle": {"stroke": "#d8dee9", "strokeWidth": 0, "borderStyle": "none"},
            "style": {"fill": "#ffffff", "stroke": "#c4b5fd", "strokeWidth": 1, "borderStyle": "dashed", "radius": 10},
            "cardStyle": {"fill": "#ffffff", "stroke": "#e5e7eb", "strokeWidth": 1, "borderStyle": "solid", "radius": 10},
            "numberStyle": {"color": "#4c1d95", "fontSize": 12, "fontWeight": "bold"},
            "bodyStyle": {"color": "#111827", "fontSize": 12, "lineHeight": 1.65},
            "answerSpaceStyle": {"fill": "#ffffff", "stroke": "#cbd5e1", "strokeWidth": 1, "borderStyle": "dashed", "radius": 8},
        }
        if base_page:
            fallback_page = {**base_page, "elements": [*base_page.get("elements", []), fallback_region]}
        else:
            fallback_page = {
                "id": "__auto_problem_page__",
                "name": "Problem Page",
                "role": "problem",
                "pageSize": size,
                "background": {"color": "#ffffff"},
                "elements": [fallback_region],
            }
        safety = 0
        while remaining.get("problems") and safety < 80:
            placements: dict[str, list[dict[str, Any]]] = {}
            if not _consume_region(fallback_region, remaining, placements):
                break
            rendered_pages.append((fallback_page, placements))
            safety += 1

    page_count = max(1, len(rendered_pages))
    return [
        {
            "page": page,
            "placements": placements,
            "data": {**base_data, "page_number": index, "total_pages": page_count},
        }
        for index, (page, placements) in enumerate(rendered_pages, start=1)
    ]


def _render_visual_template_document(template_set: dict[str, Any], problems: list[Problem], base_data: dict[str, Any]) -> str:
    export_pages = build_visual_template_export_pages(template_set, problems, base_data)
    page_html = [
        _render_visual_page(template_set, item["page"], item["placements"], item["data"])
        for item in export_pages
    ]

    title = escape(str(base_data.get("test_title") or base_data.get("exam_title") or "Tena Forge"))
    first_page = export_pages[0]["page"] if export_pages else {}
    first_size = _page_size(first_page, template_set)
    page_width = _num(first_size.get("width"), 794)
    page_height = _num(first_size.get("height"), 1123)
    katex_css, katex_js = _katex_assets()
    katex_script_tag = f"<script>{katex_js}</script>" if katex_js else ""
    math_render_script = r"""
<script>
(() => {
  if (!window.katex) return;
  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;
  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const underlineTagPattern = /<\/?u>/gi;
  const splitUnderlineSegments = (value) => {
    const segments = [];
    let cursor = 0;
    let underlineDepth = 0;
    for (const match of String(value).matchAll(underlineTagPattern)) {
      const token = match[0];
      const index = match.index || 0;
      if (index > cursor) {
        segments.push({ content: String(value).slice(cursor, index), underline: underlineDepth > 0 });
      }
      underlineDepth = token.startsWith("</") ? Math.max(0, underlineDepth - 1) : underlineDepth + 1;
      cursor = index + token.length;
    }
    if (cursor < String(value).length) {
      segments.push({ content: String(value).slice(cursor), underline: underlineDepth > 0 });
    }
    return segments;
  };
  const withUnderline = (html, underline) => underline ? `<u>${html}</u>` : html;
  const needsBlockMath = (value) => /\\begin\{|\\\\/.test(value);
  const needsDisplayStyle = (value) => {
    const trimmed = String(value).trim();
    if (/\\(?:display|text|script)style\b/.test(trimmed)) return false;
    if (/\\(?:lim|sum|prod|int)\b/.test(trimmed)) return true;
    return /\\(?:frac|dfrac|tfrac)\b/.test(trimmed);
  };
  const hasProminentInlineMath = (value) => {
    const trimmed = String(value).trim();
    if (/\\(?:lim|sum|prod|int)\b/.test(trimmed)) return true;
    return /\\(?:frac|dfrac|tfrac)\b/.test(trimmed);
  };
  const applyCasesDisplayStyle = (value) => String(value).replace(
    /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g,
    (_match, body) => {
      const styledBody = body.replace(
        /(^|\\\\\s*)(?!\s*\\(?:display|text|script)style\b)/g,
        "$1\\displaystyle "
      );
      return `\\begin{cases}${styledBody}\\end{cases}`;
    }
  );
  const normalizeLatex = (value) => {
    const normalized = applyCasesDisplayStyle(String(value)
      .replaceAll("\\dfrac", "\\frac")
      .replaceAll("\\tfrac", "\\frac")
      .replaceAll("\\middle", "")
      .replace(
        /(\\begin\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}[\s\S]*?\\end\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\})/g,
        (block) => block.replace(/(^|[^\\])\\\s+/g, "$1\\\\ ")
      ));
    return needsDisplayStyle(normalized) ? `\\displaystyle ${normalized}` : normalized;
  };
  const renderMathSegment = (raw, underline) => {
    let cursor = 0;
    let html = "";
    for (const match of raw.matchAll(pattern)) {
      const token = match[0];
      const index = match.index || 0;
      html += withUnderline(escapeHtml(raw.slice(cursor, index)), underline);
      let latex = token;
      let display = false;
      if (token.startsWith("$$")) {
        latex = token.slice(2, -2);
        display = true;
      } else if (token.startsWith("\\[")) {
        latex = token.slice(2, -2);
        display = true;
      } else if (token.startsWith("\\(")) {
        latex = token.slice(2, -2);
      } else {
        latex = token.slice(1, -1);
      }
      latex = normalizeLatex(latex);
      display = display || needsBlockMath(latex);
      const rendered = window.katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        trust: false
      });
      const inlineClass = hasProminentInlineMath(latex) ? "math-inline math-inline-prominent" : "math-inline";
      const underlineClass = underline ? " text-underline" : "";
      html += `<span class="${display ? `math-display${underlineClass}` : `${inlineClass}${underlineClass}`}">${rendered}</span>`;
      cursor = index + token.length;
    }
    html += withUnderline(escapeHtml(raw.slice(cursor)), underline);
    return html;
  };
  const renderMathText = (node) => {
    const raw = node.textContent || "";
    node.innerHTML = splitUnderlineSegments(raw)
      .map((segment) => renderMathSegment(segment.content, segment.underline))
      .join("");
  };
  document.querySelectorAll(".math-text").forEach(renderMathText);
})();
</script>
"""
    auto_fit_script = r"""
<script>
(() => {
  const fitText = (node) => {
    node.style.fontSize = "";
    const computed = window.getComputedStyle(node);
    const base = Number.parseFloat(node.dataset.baseFontSize || computed.fontSize || "12");
    if (!Number.isFinite(base) || base <= 0) return;
    const min = Math.min(base, 5);

    const fits = (size) => {
      node.style.fontSize = `${size}px`;
      return node.scrollWidth <= node.clientWidth + 0.5 && node.scrollHeight <= node.clientHeight + 0.5;
    };

    if (fits(base)) {
      node.style.fontSize = `${base}px`;
      return;
    }

    let low = min;
    let high = base;
    let best = min;
    for (let index = 0; index < 12; index += 1) {
      const mid = (low + high) / 2;
      if (fits(mid)) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }
    node.style.fontSize = `${Math.max(min, Math.floor(best * 10) / 10)}px`;
  };

  const run = () => document.querySelectorAll("[data-autofit-text]").forEach(fitText);
  run();
  window.requestAnimationFrame(run);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(run).catch(() => undefined);
  }
})();
</script>
"""
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    {katex_css}
    * {{ box-sizing: border-box; }}
    @page {{ size: {page_width:g}px {page_height:g}px; margin: 0; }}
    html, body {{ margin: 0; background: #ffffff; color: #111827; }}
    body {{ padding: 0; font-family: Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif; }}
    .visual-page {{ position: relative; margin: 0; overflow: hidden; page-break-after: always; break-after: page; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    .visual-page:last-child {{ page-break-after: auto; }}
    .visual-page-bg {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }}
    .element-content {{ width: 100%; height: 100%; white-space: pre-wrap; padding: 4px; }}
    .centered-element-content {{ width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 0 12px; white-space: pre-wrap; }}
    .variable-fit {{ width: 100%; height: 100%; padding: 2px 4px; overflow: hidden; white-space: pre-wrap; overflow-wrap: normal; word-break: normal; text-align: inherit; line-height: inherit; }}
    .problem-heading {{ margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }}
    .problem-number {{ font-weight: 700; }}
    .problem-text {{ white-space: pre-wrap; line-height: 1.65; overflow-wrap: break-word; }}
    .problem-choices {{ display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin-top: 8px; font-size: 11px; color: #334155; }}
    .problem-visual {{ display: block; width: min(100%, 420px); height: auto; max-height: 320px; object-fit: contain; margin: 12px auto 0; flex: 0 0 auto; }}
    .problem-structured-visual-wrap {{ max-height: none; object-fit: initial; }}
    .problem-structured-visual-wrap svg {{ display: block; width: 100%; height: auto; max-height: 320px; }}
    .problem-structured-table {{ width: min(100%, 520px); margin: 0 auto; border-collapse: collapse; background: #fff; font-size: 12px; }}
    .problem-structured-table caption {{ margin-bottom: 6px; font-weight: 700; color: #52525b; }}
    .problem-structured-table th, .problem-structured-table td {{ border: 1px solid #d4d4d8; padding: 6px 8px; text-align: center; vertical-align: middle; }}
    .problem-structured-table th {{ background: #f4f4f5; font-weight: 700; }}
    .problem-solution {{ margin-top: 10px; padding: 10px; border-radius: 8px; background: #f8fafc; color: #334155; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }}
    .problem-answer {{ margin-top: 8px; font-weight: 700; }}
    .answer-space {{ height: 40px; margin-top: 12px; border: 1px dashed #cbd5e1; background: #fff; }}
    .korean-passage {{ margin-bottom: 12px; padding: 10px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; white-space: pre-wrap; }}
    .korean-question {{ padding-top: 10px; margin-top: 10px; border-top: 1px solid #e5e7eb; break-inside: avoid; page-break-inside: avoid; }}
    .korean-answer-space {{ height: 32px; }}
    .korean-flow-column > .problem-card {{ break-inside: avoid; page-break-inside: avoid; }}
    .column-divider {{ position: absolute; width: 0; pointer-events: none; z-index: 2; }}
    .math-text {{ white-space: pre-wrap; overflow-wrap: break-word; }}
    .math-text u {{ text-decoration-thickness: 1px; text-underline-offset: 0.16em; }}
    .math-text .text-underline {{ text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.16em; }}
    .math-text .katex {{ color: currentColor; }}
    .math-inline {{ display: inline-block; max-width: 100%; vertical-align: baseline; }}
    .math-inline-prominent {{ vertical-align: -0.12em; }}
    .math-inline-prominent .katex {{ font-size: 1.14em; line-height: 1.05; }}
    .math-display {{ display: block; max-width: 100%; margin: 8px 0; text-align: center; overflow: hidden; }}
    .math-display > .katex-display {{ margin: 0; }}
    .katex-display {{ margin: 0.35em 0; }}
    .visual-table span {{ border-right: 1px solid #d8dee9; border-bottom: 1px solid #d8dee9; }}
    .exam-stats-empty {{ width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 16px; color: #64748b; font-size: 12px; text-align: center; }}
    .qr-placeholder {{ width: 100%; height: 100%; display: grid; place-items: center; border: 8px solid #111827; font-weight: 800; }}
    .header-block {{ display: flex; align-items: center; justify-content: space-between; width: 100%; height: 100%; border-bottom: 1px solid #111827; }}
    .header-block span {{ font-size: 12px; color: #64748b; }}
    @media print {{
      body {{ padding: 0; background: #fff; }}
      .visual-page {{ margin: 0; box-shadow: none; }}
    }}
  </style>
</head>
<body>
  {"".join(page_html)}
  {katex_script_tag}
  {math_render_script}
  {auto_fit_script}
</body>
</html>"""


def render_hub_template_for_export(template: HubTemplate, problems: list[Problem], base_data: dict[str, Any]) -> str:
    visual = _visual_schema(template)
    if visual:
        return _render_visual_template_document(visual, problems, base_data)
    return render_problems_with_hub_template(template, problems, base_data)


def render_hub_template_for_context(template: HubTemplate, base_data: dict[str, Any]) -> str:
    visual = _visual_schema(template)
    if visual:
        return _render_visual_template_document(visual, [], base_data)
    return render_template_document(template, base_data)


def safe_preview_text(value: Any) -> str:
    return escape(str(value or ""))
