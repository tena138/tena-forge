import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.pipeline import (  # noqa: E402
    EXTRACTION_PROMPT,
    PROBLEM_PREVIEW_QA_PROMPT,
    QUICK_ANSWER_TABLE_EXTRACTION_PROMPT,
    QUICK_ANSWER_TABLE_SCAN_PROMPT,
    RESCUE_EXTRACTION_PROMPT,
    RenderedPage,
    _apply_section_ranges_to_items,
    _apply_elective_page_sections_to_problem_payloads,
    _answer_inventory_prompt_note,
    _choose_solution_candidates,
    _document_type_hints_include_mixed,
    _embedded_solution_page_indexes,
    _extracted_problem_merge_key,
    _is_structural_section_label,
    _mixed_answer_recovery_page_indexes,
    _normalize_extracted_items,
    _normalize_page_metadata,
    _problem_page_indexes_from_metadata,
    _quick_answer_candidate_page_indexes,
    _select_quick_answer_table_page_indexes,
    _overlay_quick_answer_solutions,
    _should_run_mixed_answer_recovery,
    _sort_number_keys,
    answer_for_subject,
    build_extraction_prompt,
    build_problem_inventory_report,
    build_section_ranges_from_metadata,
    build_structure_validation_report,
    clean_solution_answer,
    repair_solution_numbers_from_inventory,
)


class PipelineMergeKeyTests(unittest.TestCase):
    def test_math_visual_prompts_reconstruct_from_problem_text(self):
        for prompt in (EXTRACTION_PROMPT, RESCUE_EXTRACTION_PROMPT, PROBLEM_PREVIEW_QA_PROMPT):
            self.assertIn("Do not merely trace pixels", prompt)
            self.assertIn("visual_and_problem_text", prompt)
            self.assertIn("problem_text supplies explicit constraints", prompt)

    def test_quick_answer_prompts_allow_tables_with_explanations(self):
        self.assertIn("may also contain worked solutions", QUICK_ANSWER_TABLE_SCAN_PROMPT)
        self.assertIn("visible anywhere on the page", QUICK_ANSWER_TABLE_SCAN_PROMPT)
        self.assertIn("ignore those areas", QUICK_ANSWER_TABLE_EXTRACTION_PROMPT)
        self.assertIn("Preserve full elective labels", QUICK_ANSWER_TABLE_EXTRACTION_PROMPT)

    def test_number_sort_ignores_choice_markers(self):
        self.assertEqual(_sort_number_keys(["1", "①", "2", "②", "10"]), ["1", "2", "10"])

    def test_quick_answer_candidates_include_middle_boundary_pages(self):
        indexes = _quick_answer_candidate_page_indexes(14)

        self.assertIn(7, indexes)

    def test_quick_answer_selection_keeps_low_count_elective_tables(self):
        selected = _select_quick_answer_table_page_indexes(
            [
                {
                    "page_index": 9,
                    "is_quick_answer_table": True,
                    "confidence": 0.92,
                    "answer_count_estimate": 8,
                    "strong_candidate": True,
                    "weak_candidate": True,
                },
                {
                    "page_index": 13,
                    "is_quick_answer_table": True,
                    "confidence": 0.86,
                    "answer_count_estimate": 2,
                    "strong_candidate": False,
                    "weak_candidate": False,
                    "section_labels": ["elective calculus"],
                },
                {
                    "page_index": 15,
                    "is_quick_answer_table": False,
                    "confidence": 0.1,
                    "answer_count_estimate": 0,
                    "strong_candidate": False,
                    "weak_candidate": False,
                },
            ]
        )

        self.assertEqual(selected, [9, 13])

    def test_solution_reprocess_distinguishes_structural_section_from_unit_tag(self):
        self.assertTrue(_is_structural_section_label("DAY 03"))
        self.assertTrue(_is_structural_section_label("UNIT 12"))
        self.assertTrue(_is_structural_section_label("제1회"))
        self.assertTrue(_is_structural_section_label("1회"))
        self.assertTrue(_is_structural_section_label("수학Ⅰ / 지수함수와 로그함수"))
        self.assertFalse(_is_structural_section_label("singleconnection 수학 1"))
        self.assertFalse(_is_structural_section_label("수학Ⅰ / singleconnection 수학 1"))
        self.assertFalse(_is_structural_section_label("수열"))
        self.assertFalse(_is_structural_section_label("지수로그함수"))

    def test_page_metadata_normalizes_day_and_toc_entries(self):
        page = RenderedPage(page_index=0, base64_png="", png_bytes=b"")
        normalized = _normalize_page_metadata(
            {
                "detected_section_ids": ["day1"],
                "toc_entries": [
                    {
                        "section_id": "day2",
                        "page_number": "7",
                    }
                ],
                "page_type": "toc",
                "section_confidence": 0.9,
            },
            page,
            "problem",
        )

        self.assertEqual(normalized["detected_section_ids"], ["DAY 01"])
        self.assertEqual(normalized["toc_entries"][0]["section_id"], "DAY 02")
        self.assertEqual(normalized["toc_entries"][0]["page_number"], 7)
        self.assertEqual(normalized["page_type"], "toc")

    def test_page_metadata_accepts_solution_type_aliases(self):
        page = RenderedPage(page_index=2, base64_png="", png_bytes=b"")
        normalized = _normalize_page_metadata(
            {
                "page_type": "answer",
                "detected_solution_headers": ["01", "02"],
            },
            page,
            "problem",
        )

        self.assertEqual(normalized["page_type"], "solution_page")

    def test_problem_metadata_falls_back_to_unknown_for_mixed_detection(self):
        page = RenderedPage(page_index=3, base64_png="", png_bytes=b"")
        normalized = _normalize_page_metadata({}, page, "problem")

        self.assertEqual(normalized["page_type"], "unknown")

    def test_problem_extraction_uses_skip_page_instead_of_design_roles(self):
        page = RenderedPage(page_index=4, base64_png="", png_bytes=b"")
        normalized = _normalize_page_metadata({"page_type": "cover"}, page, "problem")

        self.assertEqual(normalized["page_type"], "skip_page")
        self.assertEqual(_problem_page_indexes_from_metadata([normalized], 5), [])

    def test_mixed_hint_with_solution_headers_marks_embedded_solution_page(self):
        indexes = _embedded_solution_page_indexes(
            [
                {
                    "page_index": 5,
                    "page_type": "problem_page",
                    "document_type_hint": "mixed",
                    "detected_problem_headers": [],
                    "detected_solution_headers": ["01", "02", "03"],
                }
            ]
        )

        self.assertEqual(indexes, [5])

    def test_mixed_answer_recovery_prefers_answer_candidate_pages(self):
        indexes = _mixed_answer_recovery_page_indexes(
            [
                {"page_index": 0, "page_type": "toc", "detected_solution_headers": ["0"]},
                {"page_index": 1, "page_type": "problem_page", "detected_problem_headers": ["1"], "detected_solution_headers": []},
                {"page_index": 2, "page_type": "unknown", "detected_problem_headers": [], "detected_solution_headers": []},
                {"page_index": 3, "page_type": "solution_page", "detected_problem_headers": [], "detected_solution_headers": ["1", "2"]},
                {"page_index": 4, "page_type": "skip_page", "detected_solution_headers": ["3"]},
            ],
            5,
        )

        self.assertEqual(indexes, [3])

    def test_mixed_answer_recovery_uses_tail_when_no_answer_candidate_exists(self):
        metadata = [
            {"page_index": index, "page_type": "problem_page", "detected_problem_headers": [str(index + 1)], "detected_solution_headers": []}
            for index in range(10)
        ]

        self.assertEqual(_mixed_answer_recovery_page_indexes(metadata, 10), [6, 7, 8, 9])

    def test_mixed_answer_recovery_runs_when_answers_do_not_cover_problems(self):
        problems = [
            {"problem_number": "1", "problem_text": "first", "page_index": 0},
            {"problem_number": "2", "problem_text": "second", "page_index": 0},
        ]
        solutions = [{"problem_number": "1", "answer": "A", "page_idx": 3}]

        self.assertTrue(_should_run_mixed_answer_recovery(problems, solutions))

    def test_document_type_hints_include_mixed(self):
        self.assertTrue(_document_type_hints_include_mixed([{"type": "mixed"}]))
        self.assertFalse(_document_type_hints_include_mixed([{"type": "problem"}, {"type": "solution"}]))

    def test_problem_inventory_builds_before_full_text_extraction(self):
        metadata = [
            {
                "page_index": 0,
                "page_number": 1,
                "document_kind": "problem",
                "page_type": "problem_page",
                "detected_problem_headers": ["1", "2"],
                "detected_solution_headers": [],
            },
            {
                "page_index": 1,
                "page_number": 2,
                "document_kind": "problem",
                "page_type": "problem_page",
                "detected_problem_headers": ["3"],
                "detected_solution_headers": ["1", "2", "3"],
            },
        ]
        sections = [
            {
                "section_id": "UNSECTIONED",
                "page_start": 1,
                "page_end": 2,
                "expected_problem_start": 1,
                "expected_problem_end": 3,
                "expected_problem_count": 3,
            }
        ]
        solutions = [
            {"problem_number": "1", "answer": "A"},
            {"problem_number": "2", "answer": "B"},
        ]

        report = build_problem_inventory_report(metadata, sections, [], solutions, 2)

        self.assertEqual(report["expected_problem_count"], 3)
        self.assertEqual(report["expected_problem_numbers"], ["1", "2", "3"])
        self.assertEqual(report["answer_candidate_numbers"], ["1", "2"])
        self.assertEqual(report["missing_answer_numbers"], ["3"])
        self.assertEqual(report["pages"][1]["solution_numbers"], ["1", "2", "3"])

    def test_extraction_prompt_includes_first_pass_inventory_scaffold(self):
        prompt = build_extraction_prompt(
            ["수학Ⅰ"],
            ["수열"],
            "mixed",
            {
                "expected_problem_count": 3,
                "expected_problem_numbers": ["1", "2", "3"],
                "answer_candidate_numbers": ["1", "2"],
                "pages": [{"page_index": 0, "problem_numbers": ["1", "2"], "solution_numbers": []}],
            },
            0,
        )

        self.assertIn("First-pass PDF inventory scaffold", prompt)
        self.assertIn("Expected total problem slots: 3", prompt)
        self.assertIn("Current page first-pass problem numbers: 1, 2", prompt)
        self.assertIn("do not perform final answer matching in this text extraction pass", prompt)

    def test_solution_number_repair_uses_inventory_when_numbers_are_missing(self):
        repaired = repair_solution_numbers_from_inventory(
            [
                {"problem_number": "1", "answer": "①"},
                {"problem_number": "", "answer": "②"},
                {"answer": "③"},
            ],
            {"expected_problem_numbers": ["1", "2", "3"]},
        )

        self.assertEqual([item["problem_number"] for item in repaired], ["1", "2", "3"])
        self.assertEqual(repaired[1]["problem_number_repaired_from"], "")
        self.assertIn("problem_number_repaired_from_inventory_order", repaired[2]["matching_warnings"])

    def test_solution_number_repair_corrects_choice_number_misread_as_problem_number(self):
        repaired = repair_solution_numbers_from_inventory(
            [
                {"problem_number": "②", "answer": "②"},
                {"problem_number": "④", "answer": "④"},
                {"problem_number": "①", "answer": "①"},
            ],
            {"expected_problem_numbers": ["1", "2", "3"]},
        )

        self.assertEqual([item["problem_number"] for item in repaired], ["1", "2", "3"])
        self.assertEqual(repaired[0]["problem_number_repaired_from"], "②")

    def test_recovered_solution_candidates_replace_weaker_current_set(self):
        problems = [
            {"problem_number": "1", "problem_text": "first", "page_index": 0},
            {"problem_number": "2", "problem_text": "second", "page_index": 0},
        ]
        current = [{"problem_number": "1", "answer": "A", "page_idx": 3}]
        recovered = [
            {"problem_number": "1", "answer": "A", "page_idx": 3},
            {"problem_number": "2", "answer": "B", "page_idx": 3},
        ]

        chosen, report = _choose_solution_candidates(problems, current, recovered)

        self.assertIs(chosen, recovered)
        self.assertEqual(report["chosen"], "recovered")

    def test_recovered_solution_candidates_prefer_more_matches_over_warning_count(self):
        problems = [
            {
                "problem_number": "1",
                "problem_text": "first",
                "page_index": 0,
                "choices": [{"label": "①", "text": "$x=1$"}, {"label": "②", "text": "$x=2$"}],
            },
            {
                "problem_number": "2",
                "problem_text": "second",
                "page_index": 0,
                "choices": [{"label": "①", "text": "$y=1$"}, {"label": "②", "text": "$y=2$"}],
            },
        ]
        current = [{"problem_number": "1", "answer": "$x=1$", "page_idx": 3}]
        recovered = [
            {"problem_number": "1", "answer": "①", "page_idx": 3},
            {"problem_number": "2", "answer": "②", "page_idx": 3},
        ]

        chosen, report = _choose_solution_candidates(problems, current, recovered)

        self.assertIs(chosen, recovered)
        self.assertEqual(report["chosen"], "recovered")
        self.assertGreater(report["recovered"]["matched_count"], report["current"]["matched_count"])

    def test_quick_answer_overlay_precedes_duplicate_recovered_solution(self):
        combined = _overlay_quick_answer_solutions(
            [
                {
                    "problem_number": "28",
                    "answer": "30",
                    "section_label": "선택과목 / 미적분",
                    "page_idx": 15,
                    "_source_order": 10,
                }
            ],
            [
                {
                    "problem_number": "28",
                    "answer": "h(t)=...",
                    "section_label": "선택과목 / 미적분",
                    "page_idx": 15,
                    "_source_order": 1,
                },
                {
                    "problem_number": "29",
                    "answer": "30",
                    "section_label": "선택과목 / 미적분",
                    "page_idx": 15,
                    "_source_order": 2,
                },
            ],
        )

        self.assertEqual([(item["problem_number"], item["answer"]) for item in combined], [("28", "30"), ("29", "30")])
        self.assertEqual(combined[0]["extraction_source"], "quick_answer_table")

    def test_answer_inventory_prompt_keeps_choice_markers_out_of_problem_number(self):
        note = _answer_inventory_prompt_note(
            {
                "expected_problem_count": 3,
                "expected_problem_numbers": ["1", "2", "3"],
                "pages": [{"page_index": 1, "solution_numbers": ["1", "2"]}],
            },
            1,
        )

        self.assertIn("Expected problem numbers across the PDF: 1, 2, 3", note)
        self.assertIn("Never put circled choice markers", note)
        self.assertIn("those symbols are answers", note)

    def test_answer_inventory_prompt_preserves_repeated_problem_slots(self):
        note = _answer_inventory_prompt_note(
            {
                "expected_problem_count": 6,
                "expected_problem_numbers": ["28", "29"],
                "expected_problem_slots": [
                    {"problem_number": "28", "page_number": 7},
                    {"problem_number": "29", "page_number": 7},
                    {"problem_number": "28", "page_number": 8},
                    {"problem_number": "29", "page_number": 8},
                    {"problem_number": "28", "page_number": 9},
                    {"problem_number": "29", "page_number": 9},
                ],
            }
        )

        self.assertIn("28(p.7), 29(p.7), 28#2(p.8), 29#2(p.8), 28#3(p.9), 29#3(p.9)", note)
        self.assertIn("return one answer object for each occurrence", note)

    def test_solution_number_repair_uses_duplicate_inventory_slots(self):
        repaired = repair_solution_numbers_from_inventory(
            [
                {"problem_number": "", "answer": "A"},
                {"problem_number": "", "answer": "B"},
                {"problem_number": "", "answer": "C"},
                {"problem_number": "", "answer": "D"},
                {"problem_number": "", "answer": "E"},
                {"problem_number": "", "answer": "F"},
            ],
            {
                "expected_problem_slots": [
                    {"problem_number": "28"},
                    {"problem_number": "29"},
                    {"problem_number": "28"},
                    {"problem_number": "29"},
                    {"problem_number": "28"},
                    {"problem_number": "29"},
                ]
            },
        )

        self.assertEqual([item["problem_number"] for item in repaired], ["28", "29", "28", "29", "28", "29"])

    def test_repeated_elective_math_pages_get_distinct_sections(self):
        payloads = [
            {"problem_number": "28", "page_index": 6},
            {"problem_number": "29", "page_index": 6},
            {"problem_number": "28", "page_index": 7},
            {"problem_number": "29", "page_index": 7},
            {"problem_number": "28", "page_index": 8},
            {"problem_number": "29", "page_index": 8},
        ]
        metadata = [
            {
                "document_kind": "problem",
                "page_type": "problem_page",
                "page_index": 6,
                "detected_units": ["영역(확률과 통계)"],
                "detected_problem_headers": ["28", "29"],
            },
            {
                "document_kind": "problem",
                "page_type": "problem_page",
                "page_index": 7,
                "detected_units": [],
                "detected_problem_headers": ["28", "29"],
            },
            {
                "document_kind": "problem",
                "page_type": "problem_page",
                "page_index": 8,
                "detected_units": ["수학 영역(기하)"],
                "detected_problem_headers": ["28", "29"],
            },
        ]

        _apply_elective_page_sections_to_problem_payloads(payloads, metadata)

        self.assertEqual(
            [item["section_label"] for item in payloads],
            [
                "선택과목 / 확률과 통계",
                "선택과목 / 확률과 통계",
                "선택과목 / 미적분",
                "선택과목 / 미적분",
                "선택과목 / 기하",
                "선택과목 / 기하",
            ],
        )
        self.assertTrue(all(item["section_from_page_context"] for item in payloads))

    def test_page_metadata_prefers_exam_round_over_single_connection_title(self):
        page = RenderedPage(page_index=0, base64_png="", png_bytes=b"")
        normalized = _normalize_page_metadata(
            {
                "detected_section_ids": ["2026 singleconnection 수학 1 제1회", "singleconnection 수학 1"],
                "detected_subjects": ["수학Ⅰ"],
                "detected_units": ["singleconnection 수학 1"],
                "page_type": "problem_page",
                "section_confidence": 0.9,
            },
            page,
            "problem",
        )

        self.assertEqual(normalized["detected_section_ids"], ["회차 01"])
        sections = build_section_ranges_from_metadata([normalized], "problem", 3)
        self.assertEqual(sections[0]["section_id"], "회차 01")

    def test_page_metadata_does_not_promote_single_connection_subject_as_unit(self):
        page = RenderedPage(page_index=0, base64_png="", png_bytes=b"")
        normalized = _normalize_page_metadata(
            {
                "detected_section_ids": ["singleconnection 수학 1"],
                "detected_subjects": ["수학Ⅰ"],
                "detected_units": ["singleconnection 수학 1"],
                "page_type": "problem_page",
                "section_confidence": 0.9,
            },
            page,
            "problem",
        )

        self.assertEqual(normalized["detected_section_ids"], [])
        sections = build_section_ranges_from_metadata([normalized], "problem", 3)
        self.assertEqual(sections[0]["section_id"], "UNSECTIONED")
        self.assertEqual(sections[0]["status"], "needs_review")

    def test_toc_entries_keep_problem_count_scaffold(self):
        page = RenderedPage(page_index=0, base64_png="", png_bytes=b"")
        normalized = _normalize_page_metadata(
            {
                "toc_entries": [
                    {
                        "section_id": "DAY 03",
                        "page_number": "11",
                        "problem_number_start": "01",
                        "problem_number_end": "08",
                    }
                ],
                "page_type": "toc",
            },
            page,
            "problem",
        )

        entry = normalized["toc_entries"][0]
        self.assertEqual(entry["section_id"], "DAY 03")
        self.assertEqual(entry["problem_number_start"], 1)
        self.assertEqual(entry["problem_number_end"], 8)
        self.assertEqual(entry["problem_count"], 8)

    def test_build_section_ranges_uses_toc_when_headers_are_missing(self):
        metadata = [
            {
                "document_kind": "problem",
                "page_number": 1,
                "page_index": 0,
                "page_type": "toc",
                "toc_entries": [
                    {"section_id": "수학Ⅰ / 지수함수와 로그함수", "page_number": 3},
                    {"section_id": "수학Ⅰ / 수열", "page_number": 7},
                ],
            },
            {"document_kind": "problem", "page_number": 3, "page_index": 2, "page_type": "problem_page"},
            {"document_kind": "problem", "page_number": 6, "page_index": 5, "page_type": "problem_page"},
            {"document_kind": "problem", "page_number": 7, "page_index": 6, "page_type": "problem_page"},
            {"document_kind": "problem", "page_number": 9, "page_index": 8, "page_type": "problem_page"},
        ]

        sections = build_section_ranges_from_metadata(metadata, "problem", 9)

        self.assertEqual(
            [(item["section_id"], item["page_start"], item["page_end"], item["source"]) for item in sections],
            [
                ("수학Ⅰ / 지수함수와 로그함수", 3, 6, "toc"),
                ("수학Ⅰ / 수열", 7, 9, "toc"),
            ],
        )

    def test_build_section_ranges_offsets_printed_toc_page_numbers(self):
        metadata = [
            {
                "document_kind": "problem",
                "page_number": 2,
                "page_index": 1,
                "page_type": "toc",
                "toc_entries": [
                    {"section_id": "DAY 01", "page_number": 1},
                    {"section_id": "DAY 02", "page_number": 5},
                ],
            },
            {"document_kind": "problem", "page_number": 4, "page_index": 3, "page_type": "problem_page"},
            {"document_kind": "problem", "page_number": 8, "page_index": 7, "page_type": "problem_page"},
            {"document_kind": "problem", "page_number": 10, "page_index": 9, "page_type": "problem_page"},
        ]

        sections = build_section_ranges_from_metadata(metadata, "problem", 10)

        self.assertEqual(
            [(item["section_id"], item["page_start"], item["page_end"]) for item in sections],
            [("DAY 01", 4, 7), ("DAY 02", 8, 10)],
        )

    def test_build_section_ranges_uses_subject_unit_metadata(self):
        metadata = [
            {
                "document_kind": "problem",
                "page_number": 3,
                "page_index": 2,
                "page_type": "problem_page",
                "detected_subjects": ["수학Ⅰ"],
                "detected_units": ["지수함수와 로그함수"],
                "section_confidence": 0.8,
            },
            {
                "document_kind": "problem",
                "page_number": 7,
                "page_index": 6,
                "page_type": "problem_page",
                "detected_subjects": ["수학Ⅰ"],
                "detected_units": ["수열"],
                "section_confidence": 0.8,
            },
        ]

        sections = build_section_ranges_from_metadata(metadata, "problem", 9)

        self.assertEqual(
            [(item["section_id"], item["page_start"], item["page_end"]) for item in sections],
            [("수학Ⅰ / 지수함수와 로그함수", 3, 6), ("수학Ⅰ / 수열", 7, 7)],
        )

    def test_structure_validation_flags_toc_extraction_count_mismatch(self):
        metadata = [
            {
                "document_kind": "problem",
                "page_number": 1,
                "page_index": 0,
                "page_type": "toc",
                "toc_entries": [
                    {
                        "section_id": "DAY 01",
                        "page_number": 2,
                        "problem_number_start": 1,
                        "problem_number_end": 3,
                        "problem_count": 3,
                    }
                ],
            },
            {
                "document_kind": "problem",
                "page_number": 2,
                "page_index": 1,
                "page_type": "problem_page",
                "detected_problem_headers": ["01", "02", "03"],
            },
        ]
        sections = build_section_ranges_from_metadata(metadata, "problem", 2)
        report = build_structure_validation_report(
            metadata,
            sections,
            [],
            [
                {"section_id": "DAY 01", "problem_number": 1},
                {"section_id": "DAY 01", "problem_number": 2},
            ],
            [],
        )

        self.assertEqual(report["status"], "needs_review")
        self.assertEqual(report["sections"][0]["expected_problem_anchor"]["count"], 3)
        self.assertIn("toc_expected_problem_count 3 but extracted_problem_count 2", report["sections"][0]["reasons"])
        self.assertIn("page_header_problem_count 3 but extracted_problem_count 2", report["sections"][0]["reasons"])

    def test_same_page_same_number_different_sections_stay_distinct(self):
        page = RenderedPage(page_index=4, base64_png="", png_bytes=b"")
        normalized = _normalize_extracted_items(
            [
                {"problem_number": "1", "problem_text": "first section problem", "section_label": "type A"},
                {"problem_number": "1", "problem_text": "second section problem", "section_label": "type B"},
            ],
            page,
        )

        keys = [_extracted_problem_merge_key(page.page_index, item) for item in normalized]

        self.assertEqual(len(normalized), 2)
        self.assertNotEqual(keys[0], keys[1])
        self.assertEqual(normalized[0]["page_number_occurrence"], 0)
        self.assertEqual(normalized[1]["page_number_occurrence"], 0)

    def test_same_page_same_number_same_section_tracks_occurrence(self):
        page = RenderedPage(page_index=2, base64_png="", png_bytes=b"")
        normalized = _normalize_extracted_items(
            [
                {"problem_number": "1", "problem_text": "first problem", "section_label": "unit A"},
                {"problem_number": "1", "problem_text": "second problem", "section_label": "unit A"},
            ],
            page,
        )

        keys = [_extracted_problem_merge_key(page.page_index, item) for item in normalized]

        self.assertEqual([item["page_number_occurrence"] for item in normalized], [0, 1])
        self.assertNotEqual(keys[0], keys[1])

    def test_extracted_choices_are_preserved_for_matching(self):
        page = RenderedPage(page_index=1, base64_png="", png_bytes=b"")
        normalized = _normalize_extracted_items(
            [
                {
                    "problem_number": "1",
                    "problem_text": "다음 중 옳은 것을 고르시오.\n① $x=1$\n② $x=2$",
                    "choices": [{"label": "①", "text": "$x=1$"}, {"label": "②", "text": "$x=2$"}],
                }
            ],
            page,
        )

        self.assertEqual(normalized[0]["choices"], [{"label": "①", "text": "$x=1$"}, {"label": "②", "text": "$x=2$"}])

    def test_inline_choices_are_recovered_when_model_omits_choices(self):
        page = RenderedPage(page_index=1, base64_png="", png_bytes=b"")
        normalized = _normalize_extracted_items(
            [
                {
                    "problem_number": "1",
                    "problem_text": "다음 중 옳은 것을 고르시오.\n① $x=1$\n② $x=2$",
                }
            ],
            page,
        )

        self.assertEqual(normalized[0]["choices"], [{"label": "①", "text": "$x=1$"}, {"label": "②", "text": "$x=2$"}])

    def test_source_title_unit_does_not_become_section_label(self):
        page = RenderedPage(page_index=2, base64_png="", png_bytes=b"")
        normalized = _normalize_extracted_items(
            [
                {"problem_number": "1", "problem_text": "first problem", "unit": "singleconnection 수학 1"},
            ],
            page,
        )

        self.assertEqual(normalized[0]["unit"], None)
        self.assertEqual(normalized[0]["section_label"], None)

    def test_section_ranges_correct_stale_inferred_solution_section(self):
        items = [
            {"problem_number": "1", "section_label": "CHAPTER 01", "section_inferred": True, "page_idx": 4},
            {"problem_number": "2", "section_label": "CHAPTER 01", "section_inferred": True, "page_idx": 4},
        ]
        sections = [
            {"section_id": "CHAPTER 01", "page_start": 1, "page_end": 3},
            {"section_id": "CHAPTER 02", "page_start": 4, "page_end": 6},
        ]

        _apply_section_ranges_to_items(items, sections, "page_idx")

        self.assertEqual([item["section_label"] for item in items], ["CHAPTER 02", "CHAPTER 02"])
        self.assertEqual([item["section_overridden_from"] for item in items], ["CHAPTER 01", "CHAPTER 01"])

    def test_choice_answer_is_preserved_when_value_is_not_resolved(self):
        self.assertEqual(clean_solution_answer("정답: ③"), "③")
        self.assertEqual(clean_solution_answer("답 5"), "5")
        self.assertIsNone(clean_solution_answer(""))

    def test_math_choice_answer_resolves_to_choice_text(self):
        choices = [
            {"label": "①", "text": "$x=1$"},
            {"label": "②", "text": "$x=2$"},
            {"label": "③", "text": "$x=3$"},
        ]

        self.assertEqual(answer_for_subject("정답: ③", choices, "math"), "$x=3$")
        self.assertEqual(answer_for_subject("답 2", choices, "math"), "$x=2$")

    def test_language_choice_answer_keeps_choice_label(self):
        choices = [
            {"label": "①", "text": "first"},
            {"label": "②", "text": "second"},
        ]

        self.assertEqual(answer_for_subject("정답: ②", choices, "korean"), "②")
        self.assertEqual(answer_for_subject("답 2", choices, "english"), "2")


if __name__ == "__main__":
    unittest.main()
