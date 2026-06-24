from services.problem_visuals import (
    is_high_confidence_problem_visual_schema,
    normalize_math_model,
    normalize_problem_visual_schema,
    problem_visual_schema_confidence,
    problem_visual_schema_to_svg,
)


def test_problem_visual_schema_renders_referenced_expression_svg():
    math_model = normalize_math_model({"expressions": {"f": "x^2 - 1"}})
    schema = normalize_problem_visual_schema(
        {
            "type": "cartesian_graph",
            "viewport": {"xMin": -2, "xMax": 2, "yMin": -2, "yMax": 4},
            "objects": [
                {"kind": "function", "ref": "expressions.f", "domain": [-2, 2]},
                {"kind": "point", "x": 1, "y": 0, "label": "A"},
            ],
        }
    )

    svg = problem_visual_schema_to_svg(schema, math_model)

    assert schema is not None
    assert math_model is not None
    assert '<svg class="problem-graph-visual"' in svg
    assert "<path" in svg
    assert ">A</text>" in svg


def test_problem_visual_schema_rejects_unsupported_or_empty_visuals():
    assert normalize_problem_visual_schema({"type": "geometry_diagram", "objects": []}) is None
    assert normalize_problem_visual_schema({"type": "cartesian_graph", "objects": [{"kind": "unknown"}]}) is None


def test_problem_visual_schema_renders_structured_table():
    schema = normalize_problem_visual_schema(
        {
            "type": "structured_table",
            "caption": "values",
            "source": "visual_and_problem_text",
            "headerRows": 1,
            "rows": [
                [{"text": "x", "header": True}, {"text": "$f(x)$", "header": True}],
                ["1", "2"],
            ],
        }
    )

    html = problem_visual_schema_to_svg(schema)

    assert schema is not None
    assert schema["source"] == "visual_and_problem_text"
    assert 'class="problem-structured-table"' in html
    assert "<th" in html
    assert "$f(x)$" in html


def test_problem_visual_schema_renders_shape_diagram():
    schema = normalize_problem_visual_schema(
        {
            "type": "shape_diagram",
            "source_basis": "visual_and_problem_text",
            "viewport": {"width": 100, "height": 100},
            "objects": [
                {"kind": "segment", "x1": 10, "y1": 80, "x2": 90, "y2": 80, "label": "AB"},
                {"kind": "circle", "cx": 50, "cy": 45, "r": 20},
            ],
        }
    )

    svg = problem_visual_schema_to_svg(schema)

    assert schema is not None
    assert schema["source"] == "visual_and_problem_text"
    assert 'class="problem-shape-visual"' in svg
    assert "<line" in svg
    assert "<circle" in svg


def test_problem_visual_schema_confidence_gate_prefers_crops_without_confidence():
    low_confidence = normalize_problem_visual_schema(
        {
            "type": "shape_diagram",
            "objects": [
                {"kind": "segment", "x1": 10, "y1": 80, "x2": 90, "y2": 80},
                {"kind": "segment", "x1": 10, "y1": 80, "x2": 10, "y2": 20},
            ],
        }
    )
    high_confidence = normalize_problem_visual_schema(
        {
            "type": "structured_table",
            "confidence": 0.91,
            "rows": [["A", "B"], ["1", "2"]],
        }
    )

    assert low_confidence is not None
    assert problem_visual_schema_confidence(low_confidence) == 0.0
    assert not is_high_confidence_problem_visual_schema(low_confidence)
    assert is_high_confidence_problem_visual_schema(high_confidence)
