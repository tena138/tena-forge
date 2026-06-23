from services.problem_visuals import normalize_math_model, normalize_problem_visual_schema, problem_visual_schema_to_svg


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
