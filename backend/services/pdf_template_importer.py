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
MAX_ELEMENTS_PER_PAGE = 220
MAX_INLINE_IMAGE_BYTES = 3 * 1024 * 1024


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _safe_name(filename: str | None) -> str:
    name = Path(filename or "pdf-template").name
    return re.sub(r"\s+", " ", name).strip()[:120] or "pdf-template.pdf"


def _stem(filename: str) -> str:
    return Path(filename).stem[:80] or "PDF Template"


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
    if len(compact) < 36 and re.search(r"(이름|성명|학교|학원|날짜|반|점수|page|페이지)", text, re.IGNORECASE):
        return False
    if re.search(r"(^|\n|\s)(\d{1,2}[.)]|문제\s*\d+|[①②③④⑤])", text):
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
            elements.append(
                _base_element(
                    "text",
                    "PDF text",
                    frame,
                    z_index + len(elements) + 1,
                    text=line_text[:1000],
                    style=_span_style(first_span),
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


def _snapshot_element(page: fitz.Page, size: dict[str, Any], z_index: int) -> dict[str, Any]:
    zoom_x = size["width"] / max(1, page.rect.width)
    zoom_y = size["height"] / max(1, page.rect.height)
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom_x, zoom_y), alpha=False)
    src = f"data:image/png;base64,{base64.b64encode(pix.tobytes('png')).decode('ascii')}"
    return _base_element(
        "image",
        "PDF page snapshot",
        {"x": 0, "y": 0, "width": size["width"], "height": size["height"]},
        z_index,
        src=src,
        objectFit="fill",
        locked=True,
        style=_base_style(fill="transparent", stroke="transparent", strokeWidth=0),
    )


def _safe_area(size: dict[str, Any]) -> dict[str, int]:
    margin_x = min(56, max(32, round(size["width"] * 0.06)))
    margin_y = min(56, max(32, round(size["height"] * 0.05)))
    return {"x": margin_x, "y": margin_y, "width": size["width"] - margin_x * 2, "height": size["height"] - margin_y * 2}


def _page_from_pdf(page: fitz.Page, index: int, warnings: list[str]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    size = _page_size(page)
    text_dict = page.get_text("dict")
    blocks = list(text_dict.get("blocks") or [])
    page_assets: list[dict[str, Any]] = []
    elements: list[dict[str, Any]] = []

    drawing_elements = _drawing_elements(page, size, len(elements))
    elements.extend(drawing_elements)

    image_elements, image_assets, skipped_images = _image_elements(blocks, size, len(elements))
    elements.extend(image_elements)
    page_assets.extend(image_assets)
    if skipped_images:
        warnings.append(f"{index + 1}page: {skipped_images} large or full-page image(s) were not converted as separate editable images.")

    text_elements, body_frame, body_block_count = _text_elements(blocks, size, len(elements))
    elements.extend(text_elements)

    if body_frame:
        elements.append(_problem_region(body_frame, size, _estimate_columns(body_frame, body_block_count, size), len(elements) + 1))

    if not elements:
        elements.append(_snapshot_element(page, size, 1))
        fallback_frame = {"x": 64, "y": round(size["height"] * 0.18), "width": size["width"] - 128, "height": round(size["height"] * 0.68)}
        elements.append(_problem_region(fallback_frame, size, 1, 2))
        warnings.append(f"{index + 1}page: no editable structure was detected, so a locked page snapshot was inserted.")

    if len(elements) > MAX_ELEMENTS_PER_PAGE:
        dynamic_regions = [element for element in elements if element.get("type", "").endswith("Region")]
        regular = [element for element in elements if element not in dynamic_regions]
        elements = regular[: MAX_ELEMENTS_PER_PAGE - len(dynamic_regions)] + dynamic_regions
        warnings.append(f"{index + 1}page: too many PDF objects were detected, so the import was limited to {MAX_ELEMENTS_PER_PAGE} elements.")

    return {
        "id": _id("page"),
        "name": f"PDF Page {index + 1}",
        "role": "exam" if index == 0 else "problem",
        "pageSize": size,
        "background": {"color": "#ffffff"},
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
        page_limit = max(1, min(max_pages, MAX_IMPORT_PAGES, doc.page_count))
        if doc.page_count > page_limit:
            warnings.append(f"Only the first {page_limit} pages were imported from a {doc.page_count}-page PDF.")

        pages: list[dict[str, Any]] = []
        assets: list[dict[str, Any]] = []
        for index in range(page_limit):
            page, page_assets = _page_from_pdf(doc[index], index, warnings)
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
                "importedPageCount": page_limit,
                "importedAt": created_at,
                "warnings": warnings,
            },
        }
        return {
            "templateSet": template_set,
            "warnings": warnings,
            "page_count": doc.page_count,
            "imported_page_count": page_limit,
            "source_file": safe_filename,
        }
    finally:
        doc.close()
