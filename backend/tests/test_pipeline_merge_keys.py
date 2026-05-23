import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.pipeline import RenderedPage, _extracted_problem_merge_key, _is_structural_section_label, _normalize_extracted_items, clean_solution_answer  # noqa: E402


class PipelineMergeKeyTests(unittest.TestCase):
    def test_solution_reprocess_distinguishes_structural_section_from_unit_tag(self):
        self.assertTrue(_is_structural_section_label("DAY 03"))
        self.assertTrue(_is_structural_section_label("UNIT 12"))
        self.assertFalse(_is_structural_section_label("수열"))
        self.assertFalse(_is_structural_section_label("지수로그함수"))

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
