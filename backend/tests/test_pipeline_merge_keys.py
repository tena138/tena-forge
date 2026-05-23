import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.pipeline import (  # noqa: E402
    RenderedPage,
    _extracted_problem_merge_key,
    _is_structural_section_label,
    _normalize_extracted_items,
    _normalize_page_metadata,
    build_section_ranges_from_metadata,
    clean_solution_answer,
)


class PipelineMergeKeyTests(unittest.TestCase):
    def test_solution_reprocess_distinguishes_structural_section_from_unit_tag(self):
        self.assertTrue(_is_structural_section_label("DAY 03"))
        self.assertTrue(_is_structural_section_label("UNIT 12"))
        self.assertTrue(_is_structural_section_label("수학Ⅰ / 지수함수와 로그함수"))
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

    def test_choice_answer_is_preserved_when_value_is_not_resolved(self):
        self.assertEqual(clean_solution_answer("정답: ③"), "③")
        self.assertEqual(clean_solution_answer("답 5"), "5")
        self.assertIsNone(clean_solution_answer(""))


if __name__ == "__main__":
    unittest.main()
