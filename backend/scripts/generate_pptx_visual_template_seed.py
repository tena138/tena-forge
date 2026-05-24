from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


EMU_PER_PX = 9525
NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def _id(*parts: object) -> str:
    key = ":".join(str(part) for part in parts)
    return uuid.uuid5(uuid.NAMESPACE_URL, f"tena-forge:pptx-template:{key}").hex[:22]


def _template_uuid(*parts: object) -> str:
    key = ":".join(str(part) for part in parts)
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"tena-forge:hub-template:{key}"))


def _read_xml(zip_file: zipfile.ZipFile, path: str) -> ET.Element:
    return ET.fromstring(zip_file.read(path))


def _number(value: str | None, fallback: float = 0) -> float:
    if value is None:
        return fallback
    try:
        return float(value)
    except ValueError:
        return fallback


def _emu_to_px(value: str | int | float | None, fallback: float = 0) -> float:
    return _number(str(value), fallback * EMU_PER_PX) / EMU_PER_PX


def _round(value: float) -> int:
    return int(round(value))


def _first(element: ET.Element | None, path: str) -> ET.Element | None:
    return element.find(path, NS) if element is not None else None


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _normalize_hex(value: str | None) -> str | None:
    if value and re.fullmatch(r"[0-9a-fA-F]{6}", value):
        return f"#{value.upper()}"
    return None


def _parse_theme_colors(zip_file: zipfile.ZipFile) -> dict[str, str]:
    if "ppt/theme/theme1.xml" not in zip_file.namelist():
        return {}
    root = _read_xml(zip_file, "ppt/theme/theme1.xml")
    scheme = _first(root, ".//a:clrScheme")
    colors: dict[str, str] = {}
    if scheme is None:
        return colors
    for child in list(scheme):
        name = _local_name(child.tag)
        srgb = _first(child, ".//a:srgbClr")
        system = _first(child, ".//a:sysClr")
        value = _normalize_hex(srgb.get("val") if srgb is not None else None)
        if not value and system is not None:
            value = _normalize_hex(system.get("lastClr"))
        if value:
            colors[name] = value
    aliases = {
        "tx1": "dk1",
        "tx2": "dk2",
        "bg1": "lt1",
        "bg2": "lt2",
        "accent1": "accent1",
        "accent2": "accent2",
        "accent3": "accent3",
        "accent4": "accent4",
        "accent5": "accent5",
        "accent6": "accent6",
        "hlink": "hlink",
        "folHlink": "folHlink",
    }
    for alias, source in aliases.items():
        if source in colors and alias not in colors:
            colors[alias] = colors[source]
    return colors


def _apply_luminance(color: str, color_node: ET.Element) -> str:
    rgb = [int(color[index : index + 2], 16) for index in (1, 3, 5)]
    lum_mod = 100000
    lum_off = 0
    for child in list(color_node):
        local = _local_name(child.tag)
        if local == "lumMod":
            lum_mod = int(_number(child.get("val"), lum_mod))
        elif local == "lumOff":
            lum_off = int(_number(child.get("val"), lum_off))
    next_rgb = []
    for channel in rgb:
        value = channel * (lum_mod / 100000) + 255 * (lum_off / 100000)
        next_rgb.append(max(0, min(255, int(round(value)))))
    return "#{:02X}{:02X}{:02X}".format(*next_rgb)


def _color_from(fill: ET.Element | None, theme: dict[str, str], fallback: str | None = None) -> str | None:
    if fill is None:
        return fallback
    srgb = _first(fill, ".//a:srgbClr")
    if srgb is not None:
        value = _normalize_hex(srgb.get("val"))
        return _apply_luminance(value, srgb) if value else fallback
    scheme = _first(fill, ".//a:schemeClr")
    if scheme is not None:
        value = theme.get(scheme.get("val") or "")
        return _apply_luminance(value, scheme) if value else fallback
    preset = _first(fill, ".//a:prstClr")
    if preset is not None:
        return {
            "black": "#000000",
            "white": "#FFFFFF",
            "gray": "#808080",
            "red": "#FF0000",
            "blue": "#0000FF",
            "green": "#008000",
        }.get(preset.get("val") or "", fallback)
    return fallback


def _fill_color(container: ET.Element | None, theme: dict[str, str], fallback: str = "transparent") -> str:
    if container is None or _first(container, "./a:noFill") is not None:
        return "transparent"
    return _color_from(_first(container, "./a:solidFill"), theme, fallback) or fallback


def _line_style(line: ET.Element | None, theme: dict[str, str]) -> dict[str, Any]:
    if line is None or _first(line, "./a:noFill") is not None:
        return {"stroke": "transparent", "strokeWidth": 0, "borderStyle": "none"}
    width = _emu_to_px(line.get("w"), 0)
    dash = _first(line, "./a:prstDash")
    dash_value = dash.get("val") if dash is not None else "solid"
    return {
        "stroke": _color_from(_first(line, "./a:solidFill"), theme, "#111827") or "#111827",
        "strokeWidth": max(1, _round(width)) if width else 1,
        "borderStyle": "dashed" if dash_value == "dash" else "dotted" if dash_value == "dot" else "solid",
    }


def _cell_line_style(cell_properties: ET.Element | None, theme: dict[str, str]) -> dict[str, Any]:
    if cell_properties is None:
        return {"stroke": "#D8DEE9", "strokeWidth": 1, "borderStyle": "solid"}
    for path in ("./a:lnL", "./a:lnR", "./a:lnT", "./a:lnB"):
        line = _first(cell_properties, path)
        if line is not None:
            return _line_style(line, theme)
    return {"stroke": "#D8DEE9", "strokeWidth": 1, "borderStyle": "solid"}


def _frame(container: ET.Element) -> dict[str, float]:
    xfrm = _first(container, ".//a:xfrm")
    if xfrm is None:
        xfrm = _first(container, ".//p:xfrm")
    off = _first(xfrm, "./a:off")
    ext = _first(xfrm, "./a:ext")
    return {
        "x": _emu_to_px(off.get("x") if off is not None else None),
        "y": _emu_to_px(off.get("y") if off is not None else None),
        "width": max(1, _emu_to_px(ext.get("cx") if ext is not None else None, 120)),
        "height": max(1, _emu_to_px(ext.get("cy") if ext is not None else None, 60)),
    }


def _transform_frame(frame: dict[str, float], transform: dict[str, float]) -> dict[str, int]:
    scale = transform["scale"]
    return {
        "x": _round(transform["offset_x"] + frame["x"] * scale),
        "y": _round(transform["offset_y"] + frame["y"] * scale),
        "width": max(1, _round(frame["width"] * scale)),
        "height": max(1, _round(frame["height"] * scale)),
    }


def _scaled_style(style: dict[str, Any], scale: float) -> dict[str, Any]:
    next_style = dict(style)
    for key in ("fontSize", "strokeWidth", "radius"):
        if isinstance(next_style.get(key), (int, float)):
            next_style[key] = max(0, round(next_style[key] * scale, 1))
    if next_style.get("fontSize"):
        next_style["fontSize"] = max(6, next_style["fontSize"])
    if next_style.get("strokeWidth"):
        next_style["strokeWidth"] = max(1, next_style["strokeWidth"])
    return next_style


def _text(container: ET.Element) -> str:
    paragraphs = []
    for paragraph in container.findall(".//a:p", NS):
        value = "".join(node.text or "" for node in paragraph.findall(".//a:t", NS)).strip()
        if value:
            paragraphs.append(value)
    return "\n".join(paragraphs).strip()


def _first_run_style(container: ET.Element, theme: dict[str, str]) -> dict[str, Any]:
    run_properties = _first(container, ".//a:rPr")
    if run_properties is None:
        run_properties = _first(container, ".//a:defRPr")
    paragraph_properties = _first(container, ".//a:pPr")
    font_size = _number(run_properties.get("sz") if run_properties is not None else None, 0)
    align = paragraph_properties.get("algn") if paragraph_properties is not None else "l"
    latin = _first(run_properties, "./a:latin") if run_properties is not None else None
    east_asian = _first(run_properties, "./a:ea") if run_properties is not None else None
    font_family = (
        (east_asian.get("typeface") if east_asian is not None else None)
        or (latin.get("typeface") if latin is not None else None)
        or "Pretendard, Noto Sans KR, sans-serif"
    )
    return {
        "fill": "transparent",
        "stroke": "transparent",
        "strokeWidth": 0,
        "borderStyle": "none",
        "color": _color_from(_first(run_properties, "./a:solidFill") if run_properties is not None else None, theme, "#111827") or "#111827",
        "fontFamily": font_family,
        "fontSize": round((font_size / 100) * (96 / 72), 1) if font_size else 14,
        "fontWeight": "bold" if run_properties is not None and run_properties.get("b") == "1" else "normal",
        "fontStyle": "italic" if run_properties is not None and run_properties.get("i") == "1" else "normal",
        "textAlign": "center" if align == "ctr" else "right" if align == "r" else "justify" if align == "just" else "left",
        "lineHeight": 1.25,
        "letterSpacing": 0,
    }


def _base_element(kind: str, name: str, frame: dict[str, int], z_index: int, style: dict[str, Any], group_id: str) -> dict[str, Any]:
    return {
        "id": _id(group_id, kind, z_index, frame["x"], frame["y"], frame["width"], frame["height"], name),
        "type": kind,
        "name": name,
        "x": frame["x"],
        "y": frame["y"],
        "width": frame["width"],
        "height": frame["height"],
        "rotation": 0,
        "opacity": 1,
        "zIndex": z_index,
        "locked": False,
        "hidden": False,
        "style": style,
        "groupId": group_id,
    }


def _shape_element(
    name: str,
    shape: str,
    frame: dict[str, int],
    z_index: int,
    style: dict[str, Any],
    group_id: str,
) -> dict[str, Any]:
    element = _base_element("shape", name, frame, z_index, style, group_id)
    element["shape"] = shape
    return element


def _text_element(name: str, text: str, frame: dict[str, int], z_index: int, style: dict[str, Any], group_id: str) -> dict[str, Any]:
    element = _base_element("text", name, frame, z_index, style, group_id)
    element["text"] = text
    return element


def _image_element(name: str, source: str, frame: dict[str, int], z_index: int, group_id: str) -> dict[str, Any]:
    element = _base_element(
        "image",
        name,
        frame,
        z_index,
        {"fill": "transparent", "stroke": "transparent", "strokeWidth": 0, "radius": 0, "borderStyle": "none"},
        group_id,
    )
    element["src"] = source
    element["objectFit"] = "contain"
    return element


def _shape_preset(shape: ET.Element) -> str:
    preset = _first(shape, ".//a:prstGeom")
    value = preset.get("prst") if preset is not None else "rect"
    if value == "roundRect":
        return "roundRect"
    if value == "ellipse":
        return "circle"
    if value == "triangle":
        return "triangle"
    return "rect"


def _build_shape(shape: ET.Element, theme: dict[str, str], transform: dict[str, float], z_index: int, group_id: str) -> list[dict[str, Any]]:
    shape_properties = _first(shape, "./p:spPr")
    frame = _transform_frame(_frame(shape), transform)
    preset = _shape_preset(shape)
    fill = _fill_color(shape_properties, theme, "transparent")
    style = {
        "fill": fill,
        **_line_style(_first(shape_properties, "./a:ln"), theme),
        "radius": 14 if preset == "roundRect" else 0,
    }
    elements: list[dict[str, Any]] = []
    visible_shape = style.get("fill") != "transparent" or style.get("strokeWidth", 0) > 0
    if visible_shape:
        elements.append(
            _shape_element("PowerPoint shape", preset, frame, z_index + len(elements) + 1, _scaled_style(style, transform["scale"]), group_id)
        )
    text = _text(shape)
    if text:
        text_frame = {
            "x": frame["x"] + 6,
            "y": frame["y"] + 6,
            "width": max(8, frame["width"] - 12),
            "height": max(8, frame["height"] - 12),
        }
        elements.append(
            _text_element(
                "PowerPoint text",
                text,
                text_frame,
                z_index + len(elements) + 1,
                _scaled_style(_first_run_style(shape, theme), transform["scale"]),
                group_id,
            )
        )
    return elements


def _cell_margins(cell_properties: ET.Element | None, scale: float) -> dict[str, int]:
    if cell_properties is None:
        return {"left": 4, "right": 4, "top": 3, "bottom": 3}
    return {
        "left": max(2, _round(_emu_to_px(cell_properties.get("marL"), 4) * scale)),
        "right": max(2, _round(_emu_to_px(cell_properties.get("marR"), 4) * scale)),
        "top": max(2, _round(_emu_to_px(cell_properties.get("marT"), 3) * scale)),
        "bottom": max(2, _round(_emu_to_px(cell_properties.get("marB"), 3) * scale)),
    }


def _build_table(table_frame: ET.Element, theme: dict[str, str], transform: dict[str, float], z_index: int, group_id: str) -> list[dict[str, Any]]:
    table = _first(table_frame, ".//a:tbl")
    if table is None:
        return []
    outer = _transform_frame(_frame(table_frame), transform)
    rows = table.findall("./a:tr", NS)
    col_widths = [_emu_to_px(col.get("w"), 1) for col in table.findall("./a:tblGrid/a:gridCol", NS)]
    if not rows or not col_widths:
        return []
    total_col_width = sum(col_widths) or 1
    row_heights = [_emu_to_px(row.get("h"), 1) for row in rows]
    total_row_height = sum(row_heights) or 1
    col_scale = outer["width"] / total_col_width
    row_scale = outer["height"] / total_row_height
    elements: list[dict[str, Any]] = []
    y = outer["y"]
    for row_index, row in enumerate(rows):
        x = outer["x"]
        row_height = max(1, _round(row_heights[row_index] * row_scale))
        for col_index, cell in enumerate(row.findall("./a:tc", NS)):
            col_width = max(1, _round((col_widths[col_index] if col_index < len(col_widths) else total_col_width / len(col_widths)) * col_scale))
            cell_properties = _first(cell, "./a:tcPr")
            fill = _fill_color(cell_properties, theme, "#FFFFFF")
            line = _cell_line_style(cell_properties, theme)
            cell_frame = {"x": x, "y": y, "width": col_width, "height": row_height}
            cell_style = {
                "fill": fill,
                **line,
                "radius": 0,
            }
            elements.append(
                _shape_element(
                    "PowerPoint table cell",
                    "rect",
                    cell_frame,
                    z_index + len(elements) + 1,
                    _scaled_style(cell_style, 1),
                    group_id,
                )
            )
            text = _text(cell)
            if text:
                margins = _cell_margins(cell_properties, transform["scale"])
                text_frame = {
                    "x": x + margins["left"],
                    "y": y + margins["top"],
                    "width": max(8, col_width - margins["left"] - margins["right"]),
                    "height": max(8, row_height - margins["top"] - margins["bottom"]),
                }
                elements.append(
                    _text_element(
                        "PowerPoint table text",
                        text,
                        text_frame,
                        z_index + len(elements) + 1,
                        _scaled_style(_first_run_style(cell, theme), transform["scale"]),
                        group_id,
                    )
                )
            x += col_width
        y += row_height
    return elements


def _relationship_map(zip_file: zipfile.ZipFile, slide_number: int) -> dict[str, str]:
    rels_path = f"ppt/slides/_rels/slide{slide_number}.xml.rels"
    if rels_path not in zip_file.namelist():
        return {}
    root = _read_xml(zip_file, rels_path)
    relationships: dict[str, str] = {}
    for relationship in root.findall("./rel:Relationship", NS):
        rel_id = relationship.get("Id")
        target = relationship.get("Target")
        if not rel_id or not target:
            continue
        parts: list[str] = []
        for part in f"ppt/slides/{target}".split("/"):
            if part in ("", "."):
                continue
            if part == "..":
                if parts:
                    parts.pop()
            else:
                parts.append(part)
        relationships[rel_id] = "/".join(parts)
    return relationships


def _media_data_url(zip_file: zipfile.ZipFile, path: str) -> str:
    mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return f"data:{mime_type};base64,{base64.b64encode(zip_file.read(path)).decode('ascii')}"


def _build_picture(
    zip_file: zipfile.ZipFile,
    picture: ET.Element,
    relationships: dict[str, str],
    transform: dict[str, float],
    z_index: int,
    group_id: str,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    blip = _first(picture, ".//a:blip")
    embed_id = blip.get(f"{{{NS['r']}}}embed") if blip is not None else None
    path = relationships.get(embed_id or "")
    if not path or path not in zip_file.namelist():
        return None, None
    data_url = _media_data_url(zip_file, path)
    name = Path(path).stem or "PowerPoint image"
    frame = _transform_frame(_frame(picture), transform)
    asset = {"id": _id(group_id, "asset", path), "type": "image", "name": Path(path).name, "url": data_url}
    return asset, _image_element(name, data_url, frame, z_index, group_id)


def _slide_size(zip_file: zipfile.ZipFile) -> dict[str, float]:
    presentation = _read_xml(zip_file, "ppt/presentation.xml")
    size = _first(presentation, ".//p:sldSz")
    return {
        "width": _emu_to_px(size.get("cx") if size is not None else None, 960),
        "height": _emu_to_px(size.get("cy") if size is not None else None, 540),
    }


def _page_size(source_size: dict[str, float]) -> dict[str, Any]:
    width = _round(source_size["width"])
    height = _round(source_size["height"])
    if abs(width - 794) <= 2 and abs(height - 1123) <= 2:
        return {"preset": "A4_PORTRAIT", "width": 794, "height": 1123, "unit": "px"}
    if abs(width - 1123) <= 2 and abs(height - 794) <= 2:
        return {"preset": "A4_LANDSCAPE", "width": 1123, "height": 794, "unit": "px"}
    return {"preset": "CUSTOM", "width": width, "height": height, "unit": "px"}


def _page_transform(source_size: dict[str, float], page_size: dict[str, Any]) -> dict[str, float]:
    scale = min(page_size["width"] / source_size["width"], page_size["height"] / source_size["height"])
    return {
        "scale": scale,
        "offset_x": (page_size["width"] - source_size["width"] * scale) / 2,
        "offset_y": (page_size["height"] - source_size["height"] * scale) / 2,
    }


def build_seed(pptx_path: Path, slide_number: int, title: str, description: str) -> dict[str, Any]:
    with zipfile.ZipFile(pptx_path) as zip_file:
        slide_path = f"ppt/slides/slide{slide_number}.xml"
        if slide_path not in zip_file.namelist():
            raise FileNotFoundError(f"Slide {slide_number} was not found in {pptx_path}.")
        slide = _read_xml(zip_file, slide_path)
        theme = _parse_theme_colors(zip_file)
        source_size = _slide_size(zip_file)
        page_size = _page_size(source_size)
        transform = _page_transform(source_size, page_size)
        group_id = _id(pptx_path.name, "slide", slide_number, "group")
        relationships = _relationship_map(zip_file, slide_number)
        elements: list[dict[str, Any]] = []
        assets: list[dict[str, Any]] = []

        background_fill = _fill_color(_first(slide, ".//p:bgPr"), theme, "#FFFFFF")
        for shape in slide.findall(".//p:sp", NS):
            elements.extend(_build_shape(shape, theme, transform, len(elements), group_id))
        for graphic_frame in slide.findall(".//p:graphicFrame", NS):
            elements.extend(_build_table(graphic_frame, theme, transform, len(elements), group_id))
        for picture in slide.findall(".//p:pic", NS):
            asset, element = _build_picture(zip_file, picture, relationships, transform, len(elements) + 1, group_id)
            if asset and element:
                assets.append(asset)
                elements.append(element)

    now = datetime.fromtimestamp(pptx_path.stat().st_mtime, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    page = {
        "id": _id(pptx_path.name, "slide", slide_number, "page"),
        "name": f"{pptx_path.stem} slide {slide_number}",
        "role": "report",
        "pageSize": page_size,
        "background": {"color": background_fill if background_fill != "transparent" else "#FFFFFF"},
        "safeArea": {"x": 48, "y": 48, "width": max(1, page_size["width"] - 96), "height": max(1, page_size["height"] - 96)},
        "guides": [],
        "elements": elements,
    }
    template_set = {
        "id": _id(pptx_path.name, "slide", slide_number, "template-set"),
        "schemaVersion": 1,
        "title": title,
        "description": description,
        "category": "report",
        "visibility": "private",
        "defaultPageSize": page_size,
        "theme": {
            "primary": theme.get("accent1", "#6D28D9"),
            "graphite": theme.get("tx1", "#111827"),
            "muted": "#6B7280",
            "fontFamily": "Pretendard, Noto Sans KR, sans-serif",
        },
        "pages": [page],
        "assets": assets,
        "createdAt": now,
        "updatedAt": now,
    }
    return {
        "id": _template_uuid(pptx_path.name, "slide", slide_number, title),
        "title": title,
        "description": description,
        "category": "concept_note",
        "visibility": "private",
        "html": "<!-- Visual Template Studio: render from schema_json.visualTemplateSet -->",
        "css": "",
        "schema_json": {"visualTemplateSet": template_set, "schemaVersion": 1},
        "thumbnail_url": None,
        "source_type": "self_created",
        "rights_confirmed": True,
    }


def _resolve_pptx(path: str | None, pattern: str | None) -> Path:
    if path:
        return Path(path).expanduser().resolve()
    root = Path.home() / "OneDrive"
    matches = sorted(root.rglob(pattern or "*.pptx"))
    if not matches:
        raise FileNotFoundError(f"No PPTX found under {root} matching {pattern!r}.")
    return matches[0].resolve()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a Visual Template Studio seed JSON from one PPTX slide.")
    parser.add_argument("--pptx", help="PPTX path. If omitted, --pptx-pattern is searched under the user's OneDrive.")
    parser.add_argument("--pptx-pattern", help="Glob pattern searched under OneDrive when --pptx is omitted.")
    parser.add_argument("--slide", type=int, default=1)
    parser.add_argument("--title", required=True)
    parser.add_argument("--description", default="")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    pptx_path = _resolve_pptx(args.pptx, args.pptx_pattern)
    seed = build_seed(pptx_path, args.slide, args.title, args.description)
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    visual = seed["schema_json"]["visualTemplateSet"]
    page = visual["pages"][0]
    print(f"Wrote {output_path}")
    print(f"Template id: {seed['id']}")
    print(f"Source: {pptx_path}")
    print(f"Slide: {args.slide}")
    print(f"Elements: {len(page['elements'])}, assets: {len(visual['assets'])}")


if __name__ == "__main__":
    main()
