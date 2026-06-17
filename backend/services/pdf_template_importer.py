from __future__ import annotations

import base64
import math
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz

PDF_POINT_TO_PX = 96 / 72
MAX_IMPORT_PAGES = 6
MAX_ANALYSIS_PAGES = 120
MAX_ELEMENTS_PER_PAGE = 220
MAX_INLINE_IMAGE_BYTES = 3 * 1024 * 1024
MAX_TEXT_MASKS_PER_PAGE = 80

ROLE_PRIORITY = {
    "cover": 0,
    "toc": 1,
    "unitDivider": 2,
    "textbookLeft": 3,
    "textbookRight": 4,
    "problem": 5,
    "exam": 6,
    "solution": 7,
    "answer": 8,
    "custom": 9,
}


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _safe_name(filename: str | None) -> str:
    name = Path(filename or "pdf-template").name
    return re.sub(r"\s+", " ", name).strip()[:120] or "pdf-template.pdf"


def _stem(filename: str) -> str:
    return Path(filename).stem[:80] or "PDF Template"


def _compact_text(value: str) -> str:
    return re.sub(r"\s+", "", value or "").lower()


def _has_any(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def _hex_from_int(value: int | None, fallback = "#111827") -> str:
    if value is None:
        return fallback
    return f"#{value & 0xFFFFFF:06x}"


def _hex_from_seq(value: Any, fallback = "transparent") -> str:
    if value is None:
        return fallback
    try:
        parts = list(value)
    except TypeError:
        return fallback
    if len(parts) < 3:
        return fallback
    rgb: list[int] = []
    for part in parts[:3]:
        number = float(part)
        if number <= 1:
            number *= 255
        rgb.append(max(0, min(255, int(round(number)))))
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def _point_xy(point: Any) -> tuple[float, float] | None:
    if hasattr(point, "x") and hasattr(point, "y"):
        return float(point.x), float(point.y)
    if isinstance(point, (tuple, list)) and len(point) >= 2:
        return float(point[0]), float(point[1])
    return None


def _rect_tuple(rect: Any) -> tuple[float, float, float, float] | None:
    if hasattr(rect, "x0") and hasattr(rect, "y0") and hasattr(rect, "x1") and hasattr(rect, "y1"):
        return float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1)
    if isinstance(rect, (tuple, list)) and len(rect) >= 4:
        return float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])
    return None


def _scale_rect(rect: Any) -> dict[str, int] | None:
    values = _rect_tuple(rect)
    if not values:
        return None
    x0, y0, x1, y1 = values
    x = round(min(x0, x1) * PDF_POINT_TO_PX)
    y = round(min(y0, y1) * PDF_POINT_TO_PX)
    width = max(1, round(abs(x1 - x0) * PDF_POINT_TO_PX))
    height = max(1, round(abs(y1 - y0) * PDF_POINT_TO_PX))
    return {"x": x, "y": y, "width": width, "height": height}


def _union_rect(rects: list[dict[str, int]]) -> dict[str, int] | None:
    if not rects:
        return None
    x0 = min(rect["x"] for rect in rects)
    y0 = min(rect["y"] for rect in rects)
    x1 = max(rect["x"] + rect["width"] for rect in rects)
    y1 = max(rect["y"] + rect["height"] for rect in rects)
    return {"x": x0, "y": y0, "width": max(1, x1 - x0), "height": max(1, y1 - y0)}


def _page_size(page: fitz.Page) -> dict[str, Any]:
    width = max(1, round(float(page.rect.width) * PDF_POINT_TO_PX))
    height = max(1, round(float(page.rect.height) * PDF_POINT_TO_PX))
    if abs(width - 794) < 24 and abs(height - 1123) < 32:
        preset = "A4_PORTRAIT"
        width, height = 794, 1123
    elif abs(width - 1123) < 32 and abs(height - 794) < 24:
        preset = "A4_LANDSCAPE"
        width, height = 1123, 794
    else:
        preset = "CUSTOM"
    return {"preset": preset, "width": width, "height": height, "unit": "px"}


def _base_style(**overrides: Any) -> dict[str, Any]:
    style = {
        "fill": "transparent",
        "stroke": "transparent",
        "strokeWidth": 0,
        "borderStyle": "none",
        "radius": 0,
        "color": "#111827",
        "fontFamily": "Pretendard, Noto Sans KR, sans-serif",
        "fontSize": 12,
        "fontWeight": "normal",
        "fontStyle": "normal",
        "textAlign": "left",
        "lineHeight": 1.35,
        "letterSpacing": 0,
    }
    style.update(overrides)
    return style


def _base_element(element_type: str, name: str, frame: dict[str, int], z_index: int, **extra: Any) -> dict[str, Any]:
    return {
        "id": _id("el"),
        "type": element_type,
        "name": name,
        "x": frame["x"],
        "y": frame["y"],
        "width": frame["width"],
        "height": frame["height"],
        "rotation": extra.pop("rotation", 0),
        "opacity": extra.pop("opacity", 1),
        "zIndex": z_index,
        "locked": extra.pop("locked", False),
        "hidden": extra.pop("hidden", False),
        "style": extra.pop("style", _base_style()),
        **extra,
    }


def _looks_like_full_page(frame: dict[str, int], size: dict[str, Any]) -> bool:
    return frame["x"] <= 8 and frame["y"] <= 8 and frame["width"] >= size["width"] * 0.94 and frame["height"] >= size["height"] * 0.94


def _line_element(p1: Any, p2: Any, style: dict[str, Any], z_index: int) -> dict[str, Any] | None:
    start = _point_xy(p1)
    end = _point_xy(p2)
    if not start or not end:
        return None
    x0, y0 = start
    x1, y1 = end
    dx = (x1 - x0) * PDF_POINT_TO_PX
    dy = (y1 - y0) * PDF_POINT_TO_PX
    length = math.hypot(dx, dy)
    if length < 3:
        return None
    stroke_width = max(1, float(style.get("strokeWidth") or 1))
    frame = {
        "x": round(x0 * PDF_POINT_TO_PX),
        "y": round(y0 * PDF_POINT_TO_PX - stroke_width),
        "width": max(3, round(length)),
        "height": max(2, round(stroke_width * 2)),
    }
    return _base_element(
        "line",
        "PDF line",
        frame,
        z_index,
        rotation=round(math.degrees(math.atan2(dy, dx)), 2),
        lineKind="dashed" if style.get("borderStyle") == "dashed" else "solid",
        style=style,
    )


def _drawing_elements(page: fitz.Page, size: dict[str, Any], z_index: int) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []
    try:
        drawings = page.get_drawings()
    except Exception:
        return elements

    for drawing in drawings:
        stroke_width = max(0, round(float(drawing.get("width") or 0) * PDF_POINT_TO_PX, 2))
        style = _base_style(
            fill=_hex_from_seq(drawing.get("fill")),
            stroke=_hex_from_seq(drawing.get("color")),
            strokeWidth=stroke_width,
            borderStyle="dashed" if str(drawing.get("dashes") or "").strip() not in {"", "[] 0"} else ("solid" if stroke_width > 0 else "none"),
            radius=0,
        )
        if style["fill"] == "transparent" and (style["strokeWidth"] <= 0 or style["stroke"] == "transparent"):
            continue

        items = list(drawing.get("items") or [])
        handled = False
        for item in items:
            if not item:
                continue
            kind = item[0]
            if kind == "l" and len(item) >= 3:
                element = _line_element(item[1], item[2], style, z_index + len(elements) + 1)
                if element:
                    elements.append(element)
                    handled = True
            elif kind == "re" and len(item) >= 2:
                frame = _scale_rect(item[1])
                if not frame or _looks_like_full_page(frame, size):
                    continue
                if frame["width"] <= 3 or frame["height"] <= 3:
                    continue
                elements.append(
                    _base_element(
                        "shape",
                        "PDF rectangle",
                        frame,
                        z_index + len(elements) + 1,
                        shape="rect",
                        style=style,
                    )
                )
                handled = True

        if handled:
            continue

        frame = _scale_rect(drawing.get("rect"))
        if not frame or _looks_like_full_page(frame, size):
            continue
        if frame["width"] <= 3 or frame["height"] <= 3:
            continue
        elements.append(
            _base_element(
                "shape",
                "PDF shape",
                frame,
                z_index + len(elements) + 1,
                shape="rect",
                style=style,
            )
        )
    return elements


def _block_text(block: dict[str, Any]) -> str:
    chunks: list[str] = []
    for line in block.get("lines") or []:
        line_text = "".join(str(span.get("text") or "") for span in line.get("spans") or []).strip()
        if line_text:
            chunks.append(line_text)
    return "\n".join(chunks).strip()


def _is_body_text(text: str, frame: dict[str, int], size: dict[str, Any]) -> bool:
    compact = re.sub(r"\s+", "", text)
    if len(compact) < 18:
        return False
    if frame["y"] < size["height"] * 0.15 or frame["y"] + frame["height"] > size["height"] * 0.94:
        return False
    if len(compact) < 36 and _has_any(
        compact,
        [
            "name",
            "student",
            "school",
            "academy",
            "date",
            "page",
            "\uc774\ub984",
            "\uc131\uba85",
            "\ud559\uad50",
            "\ud559\uc6d0",
            "\ub0a0\uc9dc",
            "\uc810\uc218",
            "\ud398\uc774\uc9c0",
        ],
    ):
        return False
    if re.search("(^|\\n|\\s)(\\d{1,2}[.)]|\ubb38\uc81c\\s*\\d+|[\u2460-\u2468])", text):
        return True
    return len(compact) >= 42 or frame["height"] >= size["height"] * 0.08


def _span_style(span: dict[str, Any]) -> dict[str, Any]:
    font = str(span.get("font") or "")
    font_size = max(6, round(float(span.get("size") or 9) * PDF_POINT_TO_PX, 1))
    return _base_style(
        fill="transparent",
        stroke="transparent",
        strokeWidth=0,
        borderStyle="none",
        radius=0,
        color=_hex_from_int(span.get("color"), "#111827"),
        fontFamily="Pretendard, Noto Sans KR, sans-serif",
        fontSize=font_size,
        fontWeight="bold" if re.search(r"bold|black|heavy", font, re.IGNORECASE) else "normal",
        fontStyle="italic" if re.search(r"italic|oblique", font, re.IGNORECASE) else "normal",
        lineHeight=1.25,
    )


def _variable_key_for_text(text: str, frame: dict[str, int], style: dict[str, Any], size: dict[str, Any]) -> str | None:
    compact = _compact_text(text)
    top_band = frame["y"] < size["height"] * 0.24
    font_size = float(style.get("fontSize") or 12)

    if _has_any(compact, ["student", "name", "\uc774\ub984", "\uc131\uba85", "\ud559\uc0dd"]):
        if not _has_any(compact, ["academy", "\ud559\uc6d0"]):
            return "student_name"
    if _has_any(compact, ["class", "grade", "\ud559\ub144", "\ubc18"]):
        return "class_name"
    if _has_any(compact, ["teacher", "instructor", "\uc120\uc0dd", "\uad50\uc0ac", "\uac15\uc0ac"]):
        return "teacher_name"
    if _has_any(compact, ["date", "day", "\ub0a0\uc9dc", "\uc77c\uc790", r"\d{4}[./-]\d{1,2}[./-]\d{1,2}"]):
        return "exam_date"
    if _has_any(compact, ["academy", "school", "institute", "\ud559\uc6d0", "\ud559\uad50", "\uc5b4\ud559\uc6d0"]):
        return "academy_name"
    if _has_any(compact, ["subject", "\uacfc\ubaa9", "\uc218\ud559", "\uc601\uc5b4", "\uad6d\uc5b4", "\uacfc\ud559", "\uc0ac\ud68c"]):
        return "subject"
    if _has_any(compact, ["chapter", "unit", "lesson", "\ub2e8\uc6d0", "\ucc28\uc2dc", "\uc720\ub2db"]):
        return "chapter_title"
    if _has_any(compact, ["book", "textbook", "workbook", "\uad50\uc7ac", "\ubb38\uc81c\uc9d1"]):
        return "book_title"
    if top_band and (font_size >= 15 or _has_any(compact, ["exam", "test", "quiz", "midterm", "final", "practice", "\uc2dc\ud5d8", "\ud3c9\uac00", "\ubaa8\uc758", "\uc911\uac04", "\uae30\ub9d0"])):
        return "test_title"
    return None


def _variable_element(text: str, frame: dict[str, int], style: dict[str, Any], key: str, z_index: int) -> dict[str, Any]:
    return _base_element(
        "variable",
        f"PDF variable: {key}",
        frame,
        z_index,
        variableKey=key,
        fallback=text[:160],
        style={**style, "fill": "transparent", "stroke": "transparent", "strokeWidth": 0, "borderStyle": "none"},
    )


def _text_elements(blocks: list[dict[str, Any]], size: dict[str, Any], z_index: int) -> tuple[list[dict[str, Any]], dict[str, int] | None, int]:
    elements: list[dict[str, Any]] = []
    body_frames: list[dict[str, int]] = []
    body_block_count = 0

    for block in blocks:
        if block.get("type") != 0:
            continue
        block_frame = _scale_rect(block.get("bbox"))
        text = _block_text(block)
        if not block_frame or not text:
            continue
        if _is_body_text(text, block_frame, size):
            body_frames.append(block_frame)
            body_block_count += 1
            continue

        for line in block.get("lines") or []:
            line_text = "".join(str(span.get("text") or "") for span in line.get("spans") or []).strip()
            if not line_text:
                continue
            frame = _scale_rect(line.get("bbox")) or block_frame
            if frame["width"] <= 2 or frame["height"] <= 2:
                continue
            first_span = (line.get("spans") or [{}])[0]
            frame = {**frame, "height": max(frame["height"], round(float(first_span.get("size") or 9) * PDF_POINT_TO_PX * 1.35))}
            style = _span_style(first_span)
            variable_key = _variable_key_for_text(line_text, frame, style, size)
            if variable_key:
                elements.append(_variable_element(line_text, frame, style, variable_key, z_index + len(elements) + 1))
                continue
            elements.append(
                _base_element(
                    "text",
                    "PDF text",
                    frame,
                    z_index + len(elements) + 1,
                    text=line_text[:1000],
                    style=style,
                )
            )

    return elements, _union_rect(body_frames), body_block_count


def _mime_for_ext(ext: str | None) -> str:
    normalized = (ext or "").lower().lstrip(".")
    if normalized in {"jpg", "jpeg"}:
        return "image/jpeg"
    if normalized == "webp":
        return "image/webp"
    if normalized == "gif":
        return "image/gif"
    return "image/png"


def _image_elements(blocks: list[dict[str, Any]], size: dict[str, Any], z_index: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    elements: list[dict[str, Any]] = []
    assets: list[dict[str, Any]] = []
    skipped = 0

    for block in blocks:
        if block.get("type") != 1:
            continue
        frame = _scale_rect(block.get("bbox"))
        image_bytes = block.get("image")
        if not frame or not image_bytes:
            continue
        if _looks_like_full_page(frame, size):
            skipped += 1
            continue
        if len(image_bytes) > MAX_INLINE_IMAGE_BYTES:
            skipped += 1
            continue
        ext = str(block.get("ext") or "png")
        mime = _mime_for_ext(ext)
        src = f"data:{mime};base64,{base64.b64encode(image_bytes).decode('ascii')}"
        asset = {"id": _id("asset"), "type": "image", "name": f"PDF image {len(assets) + 1}.{ext}", "url": src}
        assets.append(asset)
        elements.append(
            _base_element(
                "image",
                "PDF image",
                frame,
                z_index + len(elements) + 1,
                src=src,
                objectFit="contain",
                style=_base_style(fill="transparent", stroke="transparent", strokeWidth=0),
            )
        )
    return elements, assets, skipped


def _estimate_columns(body_frame: dict[str, int], body_blocks: int, size: dict[str, Any]) -> int:
    if body_blocks >= 4 and body_frame["width"] >= size["width"] * 0.62:
        return 2
    return 1


def _problem_region(frame: dict[str, int], size: dict[str, Any], columns: int, z_index: int) -> dict[str, Any]:
    padding = 12
    x = max(32, frame["x"] - padding)
    y = max(round(size["height"] * 0.12), frame["y"] - padding)
    width = min(size["width"] - x - 32, frame["width"] + padding * 2)
    height = min(size["height"] - y - 72, frame["height"] + padding * 2)
    return _base_element(
        "problemRegion",
        "Imported PDF dynamic problem region",
        {"x": x, "y": y, "width": max(120, width), "height": max(160, height)},
        z_index,
        binding="problems",
        layoutMode="grid",
        columns=max(1, min(3, columns)),
        columnGap=24,
        rowGap=18,
        padding=14,
        fillDirection="column-first",
        keepTogether=True,
        allowSplit=False,
        overflowStrategy="create-next-page",
        nextPageRolePreference="problem",
        minItemHeight=128,
        maxItemHeight=360,
        showContinuationMarker=True,
        numberFormat="{n}.",
        columnDividerStyle={"stroke": "#d8dee9", "strokeWidth": 0, "borderStyle": "none"},
        cardStyle={"fill": "#ffffff", "stroke": "#e5e7eb", "strokeWidth": 1, "borderStyle": "solid", "radius": 8},
        numberStyle={"color": "#4f46e5", "fontWeight": "bold", "fontSize": 12},
        bodyStyle={"color": "#111827", "fontSize": 12, "lineHeight": 1.65},
        answerSpaceStyle={"fill": "#ffffff", "stroke": "#cbd5e1", "strokeWidth": 1, "borderStyle": "dashed", "radius": 8},
        style={"fill": "transparent", "stroke": "#8b5cf6", "strokeWidth": 1, "borderStyle": "dashed", "radius": 8},
    )


def _page_snapshot_data_url(page: fitz.Page, size: dict[str, Any]) -> str:
    zoom_x = size["width"] / max(1, page.rect.width)
    zoom_y = size["height"] / max(1, page.rect.height)
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom_x, zoom_y), alpha=False)
    return f"data:image/png;base64,{base64.b64encode(pix.tobytes('png')).decode('ascii')}"


def _content_mask(frame: dict[str, int], size: dict[str, Any], name: str, z_index: int, padding: int = 3) -> dict[str, Any] | None:
    x = max(0, frame["x"] - padding)
    y = max(0, frame["y"] - padding)
    width = min(size["width"] - x, frame["width"] + padding * 2)
    height = min(size["height"] - y, frame["height"] + padding * 2)
    if width <= 2 or height <= 2:
        return None
    return _base_element(
        "shape",
        name,
        {"x": x, "y": y, "width": width, "height": height},
        z_index,
        shape="rect",
        locked=True,
        style=_base_style(fill="#ffffff", stroke="transparent", strokeWidth=0, borderStyle="none"),
    )


def _renumber_z_indexes(elements: list[dict[str, Any]]) -> None:
    for index, element in enumerate(elements, start=1):
        element["zIndex"] = index


def _safe_area(size: dict[str, Any]) -> dict[str, int]:
    margin_x = min(56, max(32, round(size["width"] * 0.06)))
    margin_y = min(56, max(32, round(size["height"] * 0.05)))
    return {"x": margin_x, "y": margin_y, "width": size["width"] - margin_x * 2, "height": size["height"] - margin_y * 2}


def _analysis_indexes(page_count: int) -> list[int]:
    if page_count <= MAX_ANALYSIS_PAGES:
        return list(range(page_count))
    indexes = {0, page_count - 1}
    for slot in range(MAX_ANALYSIS_PAGES):
        indexes.add(round(slot * (page_count - 1) / max(1, MAX_ANALYSIS_PAGES - 1)))
    return sorted(indexes)[:MAX_ANALYSIS_PAGES]


def _page_plain_text(blocks: list[dict[str, Any]]) -> str:
    return "\n".join(_block_text(block) for block in blocks if block.get("type") == 0).strip()


def _body_metrics(blocks: list[dict[str, Any]], size: dict[str, Any]) -> tuple[dict[str, int] | None, int]:
    body_frames: list[dict[str, int]] = []
    body_block_count = 0
    for block in blocks:
        if block.get("type") != 0:
            continue
        frame = _scale_rect(block.get("bbox"))
        text = _block_text(block)
        if frame and text and _is_body_text(text, frame, size):
            body_frames.append(frame)
            body_block_count += 1
    return _union_rect(body_frames), body_block_count


def _max_top_font_size(blocks: list[dict[str, Any]], size: dict[str, Any]) -> float:
    maximum = 0.0
    for block in blocks:
        if block.get("type") != 0:
            continue
        for line in block.get("lines") or []:
            frame = _scale_rect(line.get("bbox"))
            if not frame or frame["y"] > size["height"] * 0.32:
                continue
            for span in line.get("spans") or []:
                maximum = max(maximum, float(span.get("size") or 0) * PDF_POINT_TO_PX)
    return maximum


def _layout_signature(size: dict[str, Any], body_frame: dict[str, int] | None, body_count: int, drawing_count: int, image_count: int) -> tuple[Any, ...]:
    if body_frame:
        body_bucket = (
            round(body_frame["x"] / 40),
            round(body_frame["y"] / 40),
            round(body_frame["width"] / 60),
            round(body_frame["height"] / 60),
        )
    else:
        body_bucket = (0, 0, 0, 0)
    return (
        size.get("preset"),
        round(size["width"] / 80),
        round(size["height"] / 80),
        body_bucket,
        min(8, body_count),
        min(12, round(drawing_count / 4)),
        min(6, image_count),
    )


def _role_display(role_key: str, source_page_number: int) -> tuple[str, str]:
    if role_key == "cover":
        return "cover", "PDF Cover"
    if role_key == "toc":
        return "toc", "PDF Table of Contents"
    if role_key == "unitDivider":
        return "custom", "PDF Unit Divider"
    if role_key == "textbookLeft":
        return "textbookLeft", "PDF Left Inner Page"
    if role_key == "textbookRight":
        return "textbookRight", "PDF Right Inner Page"
    if role_key == "solution":
        return "solution", "PDF Solution Page"
    if role_key == "answer":
        return "answer", "PDF Answer Page"
    if role_key == "exam":
        return "exam", "PDF Exam Page"
    if role_key == "problemVariant":
        return "problem", f"PDF Problem Variant {source_page_number}"
    return "problem", "PDF Problem Page"


def _classify_page_role(index: int, text: str, body_frame: dict[str, int] | None, body_count: int, word_count: int, max_top_font: float) -> str:
    compact = _compact_text(text)
    if _has_any(compact, ["contents", "tableofcontents", "\ubaa9\ucc28", "\ucc28\ub840"]):
        return "toc"
    if index == 0 and (word_count < 160 or max_top_font >= 26):
        return "cover"
    if _has_any(compact, ["answersheet", "\ub2f5\uc548\uc9c0", "\uc815\ub2f5\ud45c"]):
        return "answer"
    if _has_any(compact, ["solution", "answers", "\ud574\uc124", "\ud480\uc774", "\uc815\ub2f5"]):
        return "solution"
    if word_count < 110 and _has_any(compact, ["chapter", "unit", "lesson", "part", "\ub2e8\uc6d0", "\ucc55\ud130", "\ud30c\ud2b8"]):
        return "unitDivider"
    if body_frame or body_count:
        return "textbookLeft" if (index + 1) % 2 == 0 else "textbookRight"
    if max_top_font >= 18:
        return "unitDivider"
    return "custom"


def _analyze_page(page: fitz.Page, index: int) -> dict[str, Any]:
    size = _page_size(page)
    text_dict = page.get_text("dict")
    blocks = list(text_dict.get("blocks") or [])
    text = _page_plain_text(blocks)
    body_frame, body_count = _body_metrics(blocks, size)
    word_count = len(re.findall(r"[A-Za-z0-9_]+|[\uac00-\ud7a3]+", text))
    try:
        drawing_count = len(page.get_drawings())
    except Exception:
        drawing_count = 0
    image_count = sum(1 for block in blocks if block.get("type") == 1)
    max_top_font = _max_top_font_size(blocks, size)
    role_key = _classify_page_role(index, text, body_frame, body_count, word_count, max_top_font)
    return {
        "index": index,
        "role_key": role_key,
        "source_page_number": index + 1,
        "size": size,
        "text": text,
        "body_frame": body_frame,
        "body_count": body_count,
        "word_count": word_count,
        "drawing_count": drawing_count,
        "image_count": image_count,
        "max_top_font": max_top_font,
        "signature": _layout_signature(size, body_frame, body_count, drawing_count, image_count),
    }


def _analysis_score(analysis: dict[str, Any]) -> tuple[Any, ...]:
    return (
        -int(analysis.get("body_count") or 0),
        -int(analysis.get("drawing_count") or 0),
        -int(analysis.get("image_count") or 0),
        int(analysis.get("index") or 0),
    )


def _select_representative_pages(analyses: list[dict[str, Any]], max_pages: int) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    selected_indexes: set[int] = set()
    selected_role_signatures: set[tuple[str, tuple[Any, ...]]] = set()

    def add_candidate(candidate: dict[str, Any], role_override: str | None = None) -> bool:
        if len(selected) >= max_pages:
            return False
        index = int(candidate["index"])
        role_key = role_override or str(candidate["role_key"])
        signature = tuple(candidate["signature"])
        role_signature = (role_key, signature)
        if index in selected_indexes or role_signature in selected_role_signatures:
            return False
        chosen = {**candidate, "role_key": role_key}
        selected.append(chosen)
        selected_indexes.add(index)
        selected_role_signatures.add(role_signature)
        return True

    for role_key in sorted(ROLE_PRIORITY, key=lambda key: ROLE_PRIORITY[key]):
        if role_key == "problemVariant":
            continue
        candidates = [analysis for analysis in analyses if analysis["role_key"] == role_key]
        if not candidates:
            continue
        add_candidate(sorted(candidates, key=_analysis_score)[0])

    problem_like = [
        analysis
        for analysis in analyses
        if analysis["role_key"] in {"textbookLeft", "textbookRight", "problem", "exam"}
        and int(analysis["index"]) not in selected_indexes
    ]
    seen_signatures = {tuple(item["signature"]) for item in selected}
    for candidate in sorted(problem_like, key=_analysis_score):
        if len(selected) >= max_pages:
            break
        signature = tuple(candidate["signature"])
        if signature in seen_signatures:
            continue
        if add_candidate(candidate, "problemVariant"):
            seen_signatures.add(signature)

    if not selected and analyses:
        add_candidate(analyses[0], "custom")

    return sorted(selected, key=lambda item: (ROLE_PRIORITY.get(str(item["role_key"]), 99), int(item["index"])))


def _page_from_pdf(page: fitz.Page, index: int, warnings: list[str], role_key: str | None = None, name: str | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    size = _page_size(page)
    text_dict = page.get_text("dict")
    blocks = list(text_dict.get("blocks") or [])
    page_assets: list[dict[str, Any]] = []

    drawing_elements = _drawing_elements(page, size, 0)

    image_elements, image_assets, skipped_images = _image_elements(blocks, size, len(drawing_elements))
    page_assets.extend(image_assets)
    if skipped_images:
        warnings.append(f"{index + 1}page: {skipped_images} large or full-page image(s) were not converted as separate editable images.")

    text_elements, body_frame, body_block_count = _text_elements(blocks, size, len(drawing_elements) + len(image_elements))

    region_element: dict[str, Any] | None = None
    if body_frame:
        region_element = _problem_region(body_frame, size, _estimate_columns(body_frame, body_block_count, size), 0)

    masks: list[dict[str, Any]] = []
    text_mask_candidates = text_elements if len(text_elements) <= MAX_TEXT_MASKS_PER_PAGE else [element for element in text_elements if element.get("type") == "variable"]
    for text_element in text_mask_candidates[:MAX_TEXT_MASKS_PER_PAGE]:
        mask = _content_mask(text_element, size, "PDF editable text mask", 0)
        if mask:
            masks.append(mask)
    if len(text_elements) > MAX_TEXT_MASKS_PER_PAGE:
        warnings.append(f"{index + 1}page: text masks were limited to variable fields to keep the imported template responsive.")
    if body_frame:
        mask = _content_mask(body_frame, size, "PDF dynamic content mask", 0, padding=12)
        if mask:
            masks.append(mask)

    elements = [*drawing_elements, *image_elements, *masks, *text_elements]
    if region_element:
        elements.append(region_element)

    if not elements:
        fallback_frame = {"x": 64, "y": round(size["height"] * 0.18), "width": size["width"] - 128, "height": round(size["height"] * 0.68)}
        elements.append(_problem_region(fallback_frame, size, 1, 1))
        warnings.append(f"{index + 1}page: no editable structure was detected, so the rendered PDF page was preserved as the background.")

    if len(elements) > MAX_ELEMENTS_PER_PAGE:
        dynamic_regions = [element for element in elements if element.get("type", "").endswith("Region")]
        regular = [element for element in elements if element not in dynamic_regions]
        elements = regular[: MAX_ELEMENTS_PER_PAGE - len(dynamic_regions)] + dynamic_regions
        warnings.append(f"{index + 1}page: too many PDF objects were detected, so the import was limited to {MAX_ELEMENTS_PER_PAGE} elements.")

    page_role, page_name = _role_display(role_key or ("exam" if index == 0 else "problem"), index + 1)
    if name:
        page_name = name

    _renumber_z_indexes(elements)
    snapshot_url = _page_snapshot_data_url(page, size)

    return {
        "id": _id("page"),
        "name": page_name,
        "role": page_role,
        "sourcePageNumber": index + 1,
        "sourceRole": role_key or page_role,
        "pageSize": size,
        "background": {"color": "#ffffff", "imageUrl": snapshot_url, "opacity": 1},
        "safeArea": _safe_area(size),
        "guides": [],
        "elements": elements,
    }, page_assets


def build_visual_template_set_from_pdf(pdf_bytes: bytes, filename: str | None = None, max_pages: int = MAX_IMPORT_PAGES) -> dict[str, Any]:
    safe_filename = _safe_name(filename)
    if not pdf_bytes:
        raise ValueError("PDF file is empty.")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if doc.page_count < 1:
            raise ValueError("PDF has no pages.")

        warnings: list[str] = []
        page_limit = max(1, min(max_pages, MAX_IMPORT_PAGES))
        analysis_indexes = _analysis_indexes(doc.page_count)
        if doc.page_count > len(analysis_indexes):
            warnings.append(f"{len(analysis_indexes)} representative positions were scanned across a {doc.page_count}-page PDF.")

        analyses = [_analyze_page(doc[index], index) for index in analysis_indexes]
        selected_analyses = _select_representative_pages(analyses, page_limit)
        selected_indexes = [analysis["index"] + 1 for analysis in selected_analyses]
        if doc.page_count > len(selected_analyses):
            warnings.append(f"Selected {len(selected_analyses)} representative design page(s), not the first {len(selected_analyses)} page(s): {selected_indexes}.")

        pages: list[dict[str, Any]] = []
        assets: list[dict[str, Any]] = []
        for analysis in selected_analyses:
            index = int(analysis["index"])
            page_role, page_name = _role_display(str(analysis["role_key"]), index + 1)
            page, page_assets = _page_from_pdf(doc[index], index, warnings, str(analysis["role_key"]), page_name)
            pages.append(page)
            assets.extend(page_assets)

        created_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        first_size = pages[0]["pageSize"]
        title = f"{_stem(safe_filename)} PDF Template"
        template_set = {
            "id": _id("template"),
            "schemaVersion": 1,
            "title": title,
            "description": "Imported from a PDF design. Review dynamic regions before publishing or exporting.",
            "category": "exam",
            "visibility": "private",
            "defaultPageSize": first_size,
            "theme": {
                "primary": "#4f46e5",
                "graphite": "#111827",
                "muted": "#6b7280",
                "fontFamily": "Pretendard, Noto Sans KR, sans-serif",
            },
            "pages": pages,
            "assets": assets,
            "createdAt": created_at,
            "updatedAt": created_at,
            "sourceType": "unknown",
            "rightsConfirmed": False,
            "importMeta": {
                "source": "pdf",
                "sourceFile": safe_filename,
                "pageCount": doc.page_count,
                "importedPageCount": len(pages),
                "selectedPageNumbers": selected_indexes,
                "importedAt": created_at,
                "warnings": warnings,
            },
        }
        return {
            "templateSet": template_set,
            "warnings": warnings,
            "page_count": doc.page_count,
            "imported_page_count": len(pages),
            "source_file": safe_filename,
        }
    finally:
        doc.close()
