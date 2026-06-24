import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.pipeline import (  # noqa: E402
    EXTRACTION_PROMPT,
    PROBLEM_PREVIEW_QA_PROMPT,
    RESCUE_EXTRACTION_PROMPT,
    RenderedPage,
    _apply_section_ranges_to_items,
    _choose_solution_candidates,
    _document_type_hints_include_mixed,
    _embedded_solution_page_indexes,
    _extracted_problem_merge_key,
    _is_structural_section_label,
    _mixed_answer_recovery_page_indexes,
    _normalize_extracted_items,
    _normalize_page_metadata,
    _problem_page_indexes_from_metadata,
    _should_run_mixed_answer_recovery,
    answer_for_subject,
    build_section_ranges_from_metadata,
    build_structure_validation_report,
    clean_solution_answer,
)


class PipelineMergeKeyTests(unittest.TestCase):
    def test_math_visual_prompts_reconstruct_from_problem_text(self):
        for prompt in (EXTRACTION_PROMPT, RESCUE_EXTRACTION_PROMPT, PROBLEM_PREVIEW_QA_PROMPT):
            self.assertIn("Do not merely trace pixels", prompt)
            self.assertIn("visual_and_problem_text", prompt)
            self.assertIn("problem_text supplies explicit constraints", prompt)

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

    def test_mixed_answer_recovery_scans_extractable_pages(self):
        indexes = _mixed_answer_recovery_page_indexes(
            [
                {"page_index": 0, "page_type": "toc"},
                {"page_index": 1, "page_type": "problem_page"},
                {"page_index": 2, "page_type": "unknown"},
                {"page_index": 3, "page_type": "solution_page"},
                {"page_index": 4, "page_type": "skip_page"},
            ],
            5,
        )

        self.assertEqual(indexes, [1, 2, 3])

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
