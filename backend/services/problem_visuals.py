from __future__ import annotations

import ast
import html
import math
import re
from typing import Any


MAX_OBJECTS = 48
MAX_LABELS = 48
MAX_EXPR_LENGTH = 240
MAX_TABLE_ROWS = 28
MAX_TABLE_COLUMNS = 14
MAX_TABLE_CELL_LENGTH = 400
DEFAULT_GRAPH_VIEWPORT = {"xMin": -5.0, "xMax": 5.0, "yMin": -5.0, "yMax": 5.0, "xStep": 1.0, "yStep": 1.0}
DEFAULT_SHAPE_VIEWPORT = {"width": 100.0, "height": 100.0}
STRUCTURED_VISUAL_CONFIDENCE_THRESHOLD = 0.82
GRAPH_OBJECT_KINDS = {"function", "point", "segment", "line", "polyline", "vertical_line", "horizontal_line", "label"}
SHAPE_OBJECT_KINDS = {"point", "segment", "line", "polyline", "polygon", "circle", "ellipse", "rect", "arc", "angle", "label"}
ALLOWED_STYLE_KEYS = {"stroke", "fill", "strokeWidth", "dash", "radius", "opacity"}
ALLOWED_AXES_KEYS = {"x", "y", "grid", "arrowheads", "labels", "ticks"}
ALLOWED_MATH_FUNCS = {
    "abs": abs,
    "acos": math.acos,
    "asin": math.asin,
    "atan": math.atan,
    "cos": math.cos,
    "exp": math.exp,
    "ln": math.log,
    "log": math.log10,
    "sin": math.sin,
    "sqrt": math.sqrt,
    "tan": math.tan,
}
ALLOWED_MATH_CONSTS = {"e": math.e, "pi": math.pi}


def _num(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _clean_text(value: Any, max_length: int) -> str | None:
    text = str(value or "").strip()
    return text[:max_length] if text else None


def _clean_string_map(value: Any, *, max_items: int = 32, max_value_length: int = 300) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    cleaned: dict[str, str] = {}
    for key, raw_value in value.items():
        clean_key = re.sub(r"[^A-Za-z0-9_.-]+", "", str(key or "").strip())[:80]
        clean_value = _clean_text(raw_value, max_value_length)
        if clean_key and clean_value:
            cleaned[clean_key] = clean_value
        if len(cleaned) >= max_items:
            break
    return cleaned


def normalize_math_model(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    expressions = _clean_string_map(value.get("expressions"))
    parameters: dict[str, float | str] = {}
    if isinstance(value.get("parameters"), dict):
        for key, raw_value in value["parameters"].items():
            clean_key = re.sub(r"[^A-Za-z0-9_.-]+", "", str(key or "").strip())[:80]
            if not clean_key:
                continue
            number = _num(raw_value)
            parameters[clean_key] = number if number is not None else str(raw_value or "").strip()[:120]
            if len(parameters) >= 32:
                break
    if not expressions and not parameters:
        return None
    result: dict[str, Any] = {}
    if expressions:
        result["expressions"] = expressions
    if parameters:
        result["parameters"] = parameters
    return result


def _normalize_graph_viewport(value: Any) -> dict[str, float]:
    viewport = dict(DEFAULT_GRAPH_VIEWPORT)
    if isinstance(value, dict):
        for key in ("xMin", "xMax", "yMin", "yMax", "xStep", "yStep"):
            number = _num(value.get(key))
            if number is not None:
                viewport[key] = number
    if viewport["xMax"] <= viewport["xMin"]:
        viewport["xMin"], viewport["xMax"] = DEFAULT_GRAPH_VIEWPORT["xMin"], DEFAULT_GRAPH_VIEWPORT["xMax"]
    if viewport["yMax"] <= viewport["yMin"]:
        viewport["yMin"], viewport["yMax"] = DEFAULT_GRAPH_VIEWPORT["yMin"], DEFAULT_GRAPH_VIEWPORT["yMax"]
    if viewport["xStep"] <= 0:
        viewport["xStep"] = 1.0
    if viewport["yStep"] <= 0:
        viewport["yStep"] = 1.0
    return viewport


def _normalize_shape_viewport(value: Any) -> dict[str, float]:
    viewport = dict(DEFAULT_SHAPE_VIEWPORT)
    if isinstance(value, dict):
        width = _num(value.get("width"))
        height = _num(value.get("height"))
        if width is not None:
            viewport["width"] = max(1.0, min(width, 10000.0))
        if height is not None:
            viewport["height"] = max(1.0, min(height, 10000.0))
    return viewport


def _normalize_point(value: Any) -> dict[str, float] | None:
    if not isinstance(value, dict):
        return None
    x = _num(value.get("x"))
    y = _num(value.get("y"))
    if x is None or y is None:
        return None
    return {"x": x, "y": y}


def _normalize_points(value: Any, *, max_points: int = 240) -> list[dict[str, float]]:
    if not isinstance(value, list):
        return []
    points: list[dict[str, float]] = []
    for item in value[:max_points]:
        point = _normalize_point(item)
        if point:
            points.append(point)
    return points


def _normalize_domain(value: Any) -> list[float] | None:
    if not isinstance(value, list) or len(value) < 2:
        return None
    left = _num(value[0])
    right = _num(value[1])
    if left is None or right is None or right <= left:
        return None
    return [left, right]


def _normalize_style(target: dict[str, Any], source: dict[str, Any]) -> None:
    for key in ALLOWED_STYLE_KEYS:
        if key not in source:
            continue
        if key in {"strokeWidth", "radius", "opacity"}:
            number = _num(source.get(key))
            if number is not None:
                upper = 1.0 if key == "opacity" else 18.0
                target[key] = max(0.0, min(number, upper))
        else:
            text = _clean_text(source.get(key), 48)
            if text:
                target[key] = text


def _normalize_graph_object(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    kind = str(value.get("kind") or "").strip()
    if kind not in GRAPH_OBJECT_KINDS:
        return None
    result: dict[str, Any] = {"kind": kind}
    _normalize_style(result, value)
    label = _clean_text(value.get("label"), 80)
    if label:
        result["label"] = label
    if kind == "function":
        expr = _clean_text(value.get("expr"), MAX_EXPR_LENGTH)
        ref = _clean_text(value.get("ref"), 120)
        if not expr and not ref:
            return None
        if expr:
            result["expr"] = expr
        if ref:
            result["ref"] = ref
        domain = _normalize_domain(value.get("domain"))
        if domain:
            result["domain"] = domain
        return result
    if kind == "point":
        point = _normalize_point(value)
        if not point:
            return None
        result.update(point)
        return result
    if kind in {"segment", "line"}:
        for key in ("x1", "y1", "x2", "y2"):
            number = _num(value.get(key))
            if number is None:
                return None
            result[key] = number
        return result
    if kind == "polyline":
        points = _normalize_points(value.get("points"))
        if len(points) < 2:
            return None
        result["points"] = points
        return result
    if kind == "vertical_line":
        x = _num(value.get("x"))
        if x is None:
            return None
        result["x"] = x
        return result
    if kind == "horizontal_line":
        y = _num(value.get("y"))
        if y is None:
            return None
        result["y"] = y
        return result
    if kind == "label":
        point = _normalize_point(value)
        text = _clean_text(value.get("text") or value.get("label"), 100)
        if not point or not text:
            return None
        result.update(point)
        result["text"] = text
        return result
    return None


def _normalize_shape_object(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    kind = str(value.get("kind") or "").strip()
    if kind not in SHAPE_OBJECT_KINDS:
        return None
    result: dict[str, Any] = {"kind": kind}
    _normalize_style(result, value)
    label = _clean_text(value.get("label"), 100)
    if label:
        result["label"] = label
    if kind in {"point", "label"}:
        point = _normalize_point(value)
        text = _clean_text(value.get("text") or value.get("label"), 100)
        if not point:
            return None
        result.update(point)
        if kind == "label":
            if not text:
                return None
            result["text"] = text
        return result
    if kind in {"segment", "line"}:
        for key in ("x1", "y1", "x2", "y2"):
            number = _num(value.get(key))
            if number is None:
                return None
            result[key] = number
        return result
    if kind in {"polyline", "polygon"}:
        points = _normalize_points(value.get("points"))
        if len(points) < (3 if kind == "polygon" else 2):
            return None
        result["points"] = points
        return result
    if kind == "circle":
        cx = _num(value.get("cx"))
        cy = _num(value.get("cy"))
        radius = _num(value.get("r") or value.get("radius"))
        if cx is None or cy is None or radius is None or radius <= 0:
            return None
        result.update({"cx": cx, "cy": cy, "r": radius})
        return result
    if kind == "ellipse":
        cx = _num(value.get("cx"))
        cy = _num(value.get("cy"))
        rx = _num(value.get("rx"))
        ry = _num(value.get("ry"))
        if cx is None or cy is None or rx is None or ry is None or rx <= 0 or ry <= 0:
            return None
        result.update({"cx": cx, "cy": cy, "rx": rx, "ry": ry})
        return result
    if kind == "rect":
        x = _num(value.get("x"))
        y = _num(value.get("y"))
        width = _num(value.get("width"))
        height = _num(value.get("height"))
        if x is None or y is None or width is None or height is None or width <= 0 or height <= 0:
            return None
        result.update({"x": x, "y": y, "width": width, "height": height})
        radius = _num(value.get("radius"))
        if radius is not None:
            result["radius"] = max(0.0, min(radius, min(width, height) / 2))
        return result
    if kind == "arc":
        cx = _num(value.get("cx"))
        cy = _num(value.get("cy"))
        radius = _num(value.get("r") or value.get("radius"))
        start = _num(value.get("startAngle"))
        end = _num(value.get("endAngle"))
        if cx is None or cy is None or radius is None or start is None or end is None or radius <= 0:
            return None
        result.update({"cx": cx, "cy": cy, "r": radius, "startAngle": start, "endAngle": end})
        return result
    if kind == "angle":
        vertex = _normalize_point(value.get("vertex"))
        p1 = _normalize_point(value.get("p1"))
        p2 = _normalize_point(value.get("p2"))
        if not vertex or not p1 or not p2:
            return None
        radius = _num(value.get("radius"), 10.0) or 10.0
        result.update({"vertex": vertex, "p1": p1, "p2": p2, "radius": max(1.0, min(radius, 200.0))})
        return result
    return None


def _normalize_table_cell(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        cell: dict[str, Any] = {"text": _clean_text(value.get("text"), MAX_TABLE_CELL_LENGTH) or ""}
        for key in ("header", "emphasis"):
            if key in value:
                cell[key] = bool(value.get(key))
        for key in ("align", "valign"):
            text = _clean_text(value.get(key), 12)
            if text in {"left", "center", "right", "top", "middle", "bottom"}:
                cell[key] = text
        for key in ("colSpan", "rowSpan"):
            number = _num(value.get(key))
            if number is not None and number >= 1:
                cell[key] = int(min(number, 12))
        return cell
    return {"text": _clean_text(value, MAX_TABLE_CELL_LENGTH) or ""}


def _normalize_structured_table(value: dict[str, Any]) -> dict[str, Any] | None:
    raw_rows = value.get("rows")
    if not isinstance(raw_rows, list):
        return None
    rows: list[list[dict[str, Any]]] = []
    for raw_row in raw_rows[:MAX_TABLE_ROWS]:
        if not isinstance(raw_row, list):
            continue
        row = [_normalize_table_cell(cell) for cell in raw_row[:MAX_TABLE_COLUMNS]]
        if row:
            rows.append(row)
    if not rows:
        return None
    result: dict[str, Any] = {"type": "structured_table", "version": 1, "rows": rows}
    caption = _clean_text(value.get("caption"), 160)
    if caption:
        result["caption"] = caption
    for key in ("headerRows", "headerCols"):
        number = _num(value.get(key))
        if number is not None and number >= 0:
            result[key] = int(min(number, 8))
    confidence = _num(value.get("confidence"))
    if confidence is not None:
        result["confidence"] = max(0.0, min(confidence, 1.0))
    return result


def _normalize_cartesian_graph(value: dict[str, Any]) -> dict[str, Any] | None:
    objects = [_normalize_graph_object(item) for item in value.get("objects", []) if isinstance(value.get("objects"), list)]
    objects = [item for item in objects if item][:MAX_OBJECTS]
    labels = [_normalize_graph_object({"kind": "label", **item}) for item in value.get("labels", []) if isinstance(item, dict)] if isinstance(value.get("labels"), list) else []
    labels = [item for item in labels if item][:MAX_LABELS]
    if not objects and not labels:
        return None
    axes_source = value.get("axes") if isinstance(value.get("axes"), dict) else {}
    axes = {key: bool(axes_source[key]) for key in ALLOWED_AXES_KEYS if key in axes_source}
    result: dict[str, Any] = {
        "type": "cartesian_graph",
        "version": 1,
        "viewport": _normalize_graph_viewport(value.get("viewport")),
        "axes": axes,
        "objects": objects,
    }
    if labels:
        result["labels"] = labels
    confidence = _num(value.get("confidence"))
    if confidence is not None:
        result["confidence"] = max(0.0, min(confidence, 1.0))
    source = _clean_text(value.get("source"), 80)
    if source:
        result["source"] = source
    return result


def _normalize_shape_diagram(value: dict[str, Any]) -> dict[str, Any] | None:
    objects = [_normalize_shape_object(item) for item in value.get("objects", []) if isinstance(value.get("objects"), list)]
    objects = [item for item in objects if item][:MAX_OBJECTS]
    if not objects:
        return None
    result: dict[str, Any] = {
        "type": "shape_diagram",
        "version": 1,
        "viewport": _normalize_shape_viewport(value.get("viewport")),
        "objects": objects,
    }
    caption = _clean_text(value.get("caption"), 160)
    if caption:
        result["caption"] = caption
    confidence = _num(value.get("confidence"))
    if confidence is not None:
        result["confidence"] = max(0.0, min(confidence, 1.0))
    return result


def normalize_problem_visual_schema(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    schema_type = str(value.get("type") or "").strip()
    if schema_type == "cartesian_graph":
        return _normalize_cartesian_graph(value)
    if schema_type == "structured_table":
        return _normalize_structured_table(value)
    if schema_type == "shape_diagram":
        return _normalize_shape_diagram(value)
    return None


def problem_visual_schema_confidence(value: Any) -> float:
    if not isinstance(value, dict):
        return 0.0
    confidence = _num(value.get("confidence"))
    if confidence is None:
        return 0.0
    return max(0.0, min(confidence, 1.0))


def is_high_confidence_problem_visual_schema(value: Any, *, threshold: float = STRUCTURED_VISUAL_CONFIDENCE_THRESHOLD) -> bool:
    schema = normalize_problem_visual_schema(value)
    if not schema:
        return False
    return problem_visual_schema_confidence(schema) >= threshold


def _resolve_expression(obj: dict[str, Any], math_model: dict[str, Any] | None) -> str | None:
    expr = _clean_text(obj.get("expr"), MAX_EXPR_LENGTH)
    if expr:
        return expr
    ref = _clean_text(obj.get("ref"), 120)
    expressions = math_model.get("expressions") if isinstance(math_model, dict) else None
    if not ref or not isinstance(expressions, dict):
        return None
    for key in (ref, ref.removeprefix("expressions.")):
        if key in expressions:
            return _clean_text(expressions.get(key), MAX_EXPR_LENGTH)
    return None


def _replace_latex_frac(expr: str) -> str:
    pattern = re.compile(r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}")
    previous = None
    while previous != expr:
        previous = expr
        expr = pattern.sub(r"((\1)/(\2))", expr)
    return expr


def _normalize_expression(expr: str) -> str:
    value = expr.strip().strip("$")
    value = re.sub(r"^[A-Za-z]\s*\(\s*x\s*\)\s*=", "", value)
    value = re.sub(r"^y\s*=", "", value)
    value = value.replace("−", "-").replace("π", "pi")
    value = value.replace("\\left", "").replace("\\right", "")
    value = _replace_latex_frac(value)
    replacements = {
        "\\sqrt": "sqrt",
        "\\sin": "sin",
        "\\cos": "cos",
        "\\tan": "tan",
        "\\log": "log",
        "\\ln": "ln",
        "\\pi": "pi",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    value = value.replace("{", "(").replace("}", ")").replace("^", "**")
    value = re.sub(r"(\d)(x|\()", r"\1*\2", value)
    value = re.sub(r"(x|\))(\d|x|\()", r"\1*\2", value)
    return value


def _safe_eval_expression(expr: str, x: float) -> float:
    source = _normalize_expression(expr)
    tree = ast.parse(source, mode="eval")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in ALLOWED_MATH_FUNCS:
                raise ValueError("unsupported function")
        elif isinstance(node, ast.Name):
            if node.id != "x" and node.id not in ALLOWED_MATH_CONSTS:
                raise ValueError("unsupported name")
        elif not isinstance(
            node,
            (
                ast.Expression,
                ast.BinOp,
                ast.UnaryOp,
                ast.Add,
                ast.Sub,
                ast.Mult,
                ast.Div,
                ast.Pow,
                ast.Mod,
                ast.USub,
                ast.UAdd,
                ast.Load,
                ast.Constant,
                ast.Name,
            ),
        ):
            raise ValueError("unsupported expression")
    env = {"__builtins__": {}, "x": x, **ALLOWED_MATH_CONSTS, **ALLOWED_MATH_FUNCS}
    value = eval(compile(tree, "<graph-expression>", "eval"), env, {})
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("non-finite expression result")
    return float(value)


def _svg_point(x: float, y: float, viewport: dict[str, float], width: int, height: int, margin: int) -> tuple[float, float]:
    plot_w = width - margin * 2
    plot_h = height - margin * 2
    sx = margin + ((x - viewport["xMin"]) / (viewport["xMax"] - viewport["xMin"])) * plot_w
    sy = margin + ((viewport["yMax"] - y) / (viewport["yMax"] - viewport["yMin"])) * plot_h
    return sx, sy


def _sample_function_path(obj: dict[str, Any], viewport: dict[str, float], math_model: dict[str, Any] | None, width: int, height: int, margin: int) -> str:
    expr = _resolve_expression(obj, math_model)
    if not expr:
        return ""
    domain = obj.get("domain") if isinstance(obj.get("domain"), list) and len(obj["domain"]) >= 2 else [viewport["xMin"], viewport["xMax"]]
    left = max(viewport["xMin"], float(domain[0]))
    right = min(viewport["xMax"], float(domain[1]))
    if right <= left:
        return ""
    points: list[str] = []
    segment_open = False
    samples = 180
    for index in range(samples + 1):
        x = left + (right - left) * index / samples
        try:
            y = _safe_eval_expression(expr, x)
        except Exception:
            segment_open = False
            continue
        if y < viewport["yMin"] - 100 or y > viewport["yMax"] + 100:
            segment_open = False
            continue
        sx, sy = _svg_point(x, y, viewport, width, height, margin)
        points.append(f'{"M" if not segment_open else "L"}{sx:.2f},{sy:.2f}')
        segment_open = True
    return " ".join(points)


def _svg_shape_point(x: float, y: float, viewport: dict[str, float], width: int, height: int, margin: int) -> tuple[float, float]:
    plot_w = width - margin * 2
    plot_h = height - margin * 2
    sx = margin + (x / viewport["width"]) * plot_w
    sy = margin + (y / viewport["height"]) * plot_h
    return sx, sy


def _shape_scale(viewport: dict[str, float], width: int, height: int, margin: int) -> float:
    return min((width - margin * 2) / viewport["width"], (height - margin * 2) / viewport["height"])


def _shape_style(obj: dict[str, Any], *, fill_default: str = "none") -> str:
    stroke = html.escape(str(obj.get("stroke") or "#111827"), quote=True)
    fill = html.escape(str(obj.get("fill") or fill_default), quote=True)
    stroke_width = obj.get("strokeWidth") or 2
    opacity = obj.get("opacity")
    opacity_attr = f' opacity="{max(0, min(float(opacity), 1)):.3f}"' if opacity is not None else ""
    dash = ' stroke-dasharray="5 4"' if obj.get("dash") else ""
    return f'stroke="{stroke}" fill="{fill}" stroke-width="{stroke_width}"{opacity_attr}{dash}'


def _arc_path(cx: float, cy: float, radius: float, start: float, end: float, viewport: dict[str, float], width: int, height: int, margin: int) -> str:
    scale = _shape_scale(viewport, width, height, margin)
    start_rad = math.radians(start)
    end_rad = math.radians(end)
    start_x, start_y = _svg_shape_point(cx + math.cos(start_rad) * radius, cy + math.sin(start_rad) * radius, viewport, width, height, margin)
    end_x, end_y = _svg_shape_point(cx + math.cos(end_rad) * radius, cy + math.sin(end_rad) * radius, viewport, width, height, margin)
    sweep = 1 if end >= start else 0
    large_arc = 1 if abs(end - start) % 360 > 180 else 0
    return f"M{start_x:.2f},{start_y:.2f} A{radius * scale:.2f},{radius * scale:.2f} 0 {large_arc} {sweep} {end_x:.2f},{end_y:.2f}"


def _angle_path(obj: dict[str, Any], viewport: dict[str, float], width: int, height: int, margin: int) -> str:
    vertex = obj["vertex"]
    p1 = obj["p1"]
    p2 = obj["p2"]
    radius = float(obj.get("radius") or 10)
    a1 = math.degrees(math.atan2(float(p1["y"]) - float(vertex["y"]), float(p1["x"]) - float(vertex["x"])))
    a2 = math.degrees(math.atan2(float(p2["y"]) - float(vertex["y"]), float(p2["x"]) - float(vertex["x"])))
    return _arc_path(float(vertex["x"]), float(vertex["y"]), radius, a1, a2, viewport, width, height, margin)


def _render_cartesian_graph(schema: dict[str, Any], math_model: dict[str, Any] | None, *, width: int, height: int) -> str:
    viewport = schema["viewport"]
    margin = 30
    axes = schema.get("axes") or {}
    pieces: list[str] = [
        f'<svg class="problem-graph-visual" viewBox="0 0 {width} {height}" role="img" aria-label="Problem graph" xmlns="http://www.w3.org/2000/svg">',
        f'<rect x="0" y="0" width="{width}" height="{height}" rx="10" fill="#fff"/>',
    ]
    if axes.get("grid", True):
        x_step = viewport.get("xStep") or 1
        y_step = viewport.get("yStep") or 1
        x_value = math.ceil(viewport["xMin"] / x_step) * x_step
        while x_value <= viewport["xMax"]:
            sx, _ = _svg_point(x_value, 0, viewport, width, height, margin)
            pieces.append(f'<line x1="{sx:.2f}" y1="{margin}" x2="{sx:.2f}" y2="{height - margin}" stroke="#e4e4e7" stroke-width="1"/>')
            x_value += x_step
        y_value = math.ceil(viewport["yMin"] / y_step) * y_step
        while y_value <= viewport["yMax"]:
            _, sy = _svg_point(0, y_value, viewport, width, height, margin)
            pieces.append(f'<line x1="{margin}" y1="{sy:.2f}" x2="{width - margin}" y2="{sy:.2f}" stroke="#e4e4e7" stroke-width="1"/>')
            y_value += y_step
    if axes.get("x", True) and viewport["yMin"] <= 0 <= viewport["yMax"]:
        _, y0 = _svg_point(0, 0, viewport, width, height, margin)
        pieces.append(f'<line x1="{margin}" y1="{y0:.2f}" x2="{width - margin}" y2="{y0:.2f}" stroke="#18181b" stroke-width="1.5"/>')
    if axes.get("y", True) and viewport["xMin"] <= 0 <= viewport["xMax"]:
        x0, _ = _svg_point(0, 0, viewport, width, height, margin)
        pieces.append(f'<line x1="{x0:.2f}" y1="{margin}" x2="{x0:.2f}" y2="{height - margin}" stroke="#18181b" stroke-width="1.5"/>')
    for obj in schema.get("objects", []) + schema.get("labels", []):
        kind = obj.get("kind")
        stroke = html.escape(str(obj.get("stroke") or "#111827"), quote=True)
        stroke_width = obj.get("strokeWidth") or 2
        if kind == "function":
            path = _sample_function_path(obj, viewport, math_model, width, height, margin)
            if path:
                pieces.append(f'<path d="{html.escape(path, quote=True)}" fill="none" stroke="{stroke}" stroke-width="{stroke_width}" stroke-linecap="round" stroke-linejoin="round"/>')
        elif kind in {"segment", "line"}:
            x1, y1 = _svg_point(float(obj["x1"]), float(obj["y1"]), viewport, width, height, margin)
            x2, y2 = _svg_point(float(obj["x2"]), float(obj["y2"]), viewport, width, height, margin)
            pieces.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{stroke}" stroke-width="{stroke_width}" stroke-linecap="round"/>')
        elif kind == "polyline":
            points = [_svg_point(float(point["x"]), float(point["y"]), viewport, width, height, margin) for point in obj.get("points", [])]
            points_attr = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
            pieces.append(f'<polyline points="{points_attr}" fill="none" stroke="{stroke}" stroke-width="{stroke_width}" stroke-linecap="round" stroke-linejoin="round"/>')
        elif kind == "vertical_line":
            x1, y1 = _svg_point(float(obj["x"]), viewport["yMin"], viewport, width, height, margin)
            x2, y2 = _svg_point(float(obj["x"]), viewport["yMax"], viewport, width, height, margin)
            pieces.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{stroke}" stroke-width="{stroke_width}"/>')
        elif kind == "horizontal_line":
            x1, y1 = _svg_point(viewport["xMin"], float(obj["y"]), viewport, width, height, margin)
            x2, y2 = _svg_point(viewport["xMax"], float(obj["y"]), viewport, width, height, margin)
            pieces.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{stroke}" stroke-width="{stroke_width}"/>')
        elif kind == "point":
            x, y = _svg_point(float(obj["x"]), float(obj["y"]), viewport, width, height, margin)
            radius = obj.get("radius") or 3.5
            pieces.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{radius}" fill="{html.escape(str(obj.get("fill") or stroke), quote=True)}"/>')
            if obj.get("label"):
                pieces.append(f'<text x="{x + 7:.2f}" y="{y - 7:.2f}" font-size="13" font-weight="700" fill="#111827">{html.escape(str(obj["label"]))}</text>')
        elif kind == "label":
            x, y = _svg_point(float(obj["x"]), float(obj["y"]), viewport, width, height, margin)
            pieces.append(f'<text x="{x:.2f}" y="{y:.2f}" font-size="13" font-weight="700" fill="#111827">{html.escape(str(obj.get("text") or ""))}</text>')
    pieces.append("</svg>")
    return "".join(pieces)


def _render_shape_diagram(schema: dict[str, Any], *, width: int, height: int) -> str:
    viewport = schema["viewport"]
    margin = 20
    scale = _shape_scale(viewport, width, height, margin)
    pieces: list[str] = [
        f'<svg class="problem-shape-visual" viewBox="0 0 {width} {height}" role="img" aria-label="Problem diagram" xmlns="http://www.w3.org/2000/svg">',
        f'<rect x="0" y="0" width="{width}" height="{height}" rx="10" fill="#fff"/>',
    ]
    for obj in schema.get("objects", []):
        kind = obj.get("kind")
        style = _shape_style(obj)
        if kind in {"segment", "line"}:
            x1, y1 = _svg_shape_point(float(obj["x1"]), float(obj["y1"]), viewport, width, height, margin)
            x2, y2 = _svg_shape_point(float(obj["x2"]), float(obj["y2"]), viewport, width, height, margin)
            pieces.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" {style} stroke-linecap="round"/>')
        elif kind in {"polyline", "polygon"}:
            points = [_svg_shape_point(float(point["x"]), float(point["y"]), viewport, width, height, margin) for point in obj.get("points", [])]
            points_attr = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
            tag = "polygon" if kind == "polygon" else "polyline"
            fill_default = "#f8fafc" if kind == "polygon" else "none"
            pieces.append(f'<{tag} points="{points_attr}" {_shape_style(obj, fill_default=fill_default)} stroke-linecap="round" stroke-linejoin="round"/>')
        elif kind == "circle":
            cx, cy = _svg_shape_point(float(obj["cx"]), float(obj["cy"]), viewport, width, height, margin)
            pieces.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{float(obj["r"]) * scale:.2f}" {_shape_style(obj)}/>')
        elif kind == "ellipse":
            cx, cy = _svg_shape_point(float(obj["cx"]), float(obj["cy"]), viewport, width, height, margin)
            pieces.append(f'<ellipse cx="{cx:.2f}" cy="{cy:.2f}" rx="{float(obj["rx"]) * scale:.2f}" ry="{float(obj["ry"]) * scale:.2f}" {_shape_style(obj)}/>')
        elif kind == "rect":
            x, y = _svg_shape_point(float(obj["x"]), float(obj["y"]), viewport, width, height, margin)
            rect_w = float(obj["width"]) * scale
            rect_h = float(obj["height"]) * scale
            radius = float(obj.get("radius") or 0) * scale
            pieces.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{rect_w:.2f}" height="{rect_h:.2f}" rx="{radius:.2f}" {_shape_style(obj, fill_default="#fff")}/>')
        elif kind == "arc":
            path = _arc_path(float(obj["cx"]), float(obj["cy"]), float(obj["r"]), float(obj["startAngle"]), float(obj["endAngle"]), viewport, width, height, margin)
            pieces.append(f'<path d="{path}" {_shape_style(obj)} stroke-linecap="round"/>')
        elif kind == "angle":
            path = _angle_path(obj, viewport, width, height, margin)
            pieces.append(f'<path d="{path}" {_shape_style(obj)} stroke-linecap="round"/>')
        elif kind == "point":
            x, y = _svg_shape_point(float(obj["x"]), float(obj["y"]), viewport, width, height, margin)
            pieces.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{float(obj.get("radius") or 3.5):.2f}" fill="{html.escape(str(obj.get("fill") or obj.get("stroke") or "#111827"), quote=True)}"/>')
        if obj.get("label") and kind != "label":
            label_x = obj.get("x", obj.get("cx", obj.get("x1")))
            label_y = obj.get("y", obj.get("cy", obj.get("y1")))
            if label_x is not None and label_y is not None:
                x, y = _svg_shape_point(float(label_x), float(label_y), viewport, width, height, margin)
                pieces.append(f'<text x="{x + 7:.2f}" y="{y - 7:.2f}" font-size="13" font-weight="700" fill="#111827">{html.escape(str(obj["label"]))}</text>')
        if kind == "label":
            x, y = _svg_shape_point(float(obj["x"]), float(obj["y"]), viewport, width, height, margin)
            pieces.append(f'<text x="{x:.2f}" y="{y:.2f}" font-size="13" font-weight="700" fill="#111827">{html.escape(str(obj.get("text") or ""))}</text>')
    pieces.append("</svg>")
    if schema.get("caption"):
        return f'<figure class="problem-shape-figure">{"".join(pieces)}<figcaption>{html.escape(str(schema["caption"]))}</figcaption></figure>'
    return "".join(pieces)


def _render_structured_table(schema: dict[str, Any]) -> str:
    rows = schema.get("rows") or []
    header_rows = int(schema.get("headerRows") or 0)
    header_cols = int(schema.get("headerCols") or 0)
    parts: list[str] = ['<table class="problem-structured-table">']
    if schema.get("caption"):
        parts.append(f'<caption>{html.escape(str(schema["caption"]))}</caption>')
    for row_index, row in enumerate(rows):
        parts.append("<tr>")
        for col_index, cell in enumerate(row):
            tag = "th" if row_index < header_rows or col_index < header_cols or cell.get("header") else "td"
            attrs: list[str] = []
            if cell.get("colSpan"):
                attrs.append(f'colspan="{int(cell["colSpan"])}"')
            if cell.get("rowSpan"):
                attrs.append(f'rowspan="{int(cell["rowSpan"])}"')
            align = cell.get("align")
            if align:
                attrs.append(f'style="text-align:{html.escape(str(align), quote=True)}"')
            attr_text = " " + " ".join(attrs) if attrs else ""
            parts.append(f'<{tag}{attr_text}><span class="math-text">{html.escape(str(cell.get("text") or ""))}</span></{tag}>')
        parts.append("</tr>")
    parts.append("</table>")
    return "".join(parts)


def problem_visual_schema_to_html(schema: dict[str, Any] | None, math_model: dict[str, Any] | None = None, *, width: int = 420, height: int = 300) -> str:
    normalized = normalize_problem_visual_schema(schema)
    if not normalized:
        return ""
    if normalized["type"] == "cartesian_graph":
        return _render_cartesian_graph(normalized, normalize_math_model(math_model), width=width, height=height)
    if normalized["type"] == "shape_diagram":
        return _render_shape_diagram(normalized, width=width, height=height)
    if normalized["type"] == "structured_table":
        return _render_structured_table(normalized)
    return ""


def problem_visual_schema_to_svg(schema: dict[str, Any] | None, math_model: dict[str, Any] | None = None, *, width: int = 420, height: int = 300) -> str:
    return problem_visual_schema_to_html(schema, math_model, width=width, height=height)
