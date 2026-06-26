import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.pipeline import (  # noqa: E402
    _answer_match_score,
    _targeted_answer_repair_page_indexes,
    _targeted_answer_repair_prompt_note,
)


class TargetedAnswerRepairTests(unittest.TestCase):
    def test_answer_match_score_reports_problem_without_answer(self):
        problems = [
            {"problem_number": 1, "problem_no": "1", "problem_text": "Problem 1", "global_index": 1},
            {"problem_number": 2, "problem_no": "2", "problem_text": "Problem 2", "global_index": 2},
        ]
        solutions = [
            {"problem_number": "1", "answer": "3", "solution_steps": None, "global_index": 1},
        ]

        score = _answer_match_score(problems, solutions)

        self.assertEqual(score["matched_answer_count"], 1)
        self.assertEqual(score["missing_answer_count"], 1)
        self.assertEqual(score["missing_answer_numbers"], ["2"])
        self.assertEqual(score["missing_answer_problems"][0]["problem_number"], "2")

    def test_targeted_page_indexes_expand_around_visible_missing_number(self):
        metadata = [
            {"page_index": 0, "page_type": "problem_page", "detected_problem_headers": ["1", "2"]},
            {"page_index": 4, "page_type": "solution_page", "detected_solution_headers": ["20"]},
            {"page_index": 7, "page_type": "solution_page", "detected_solution_headers": ["30"]},
        ]

        indexes = _targeted_answer_repair_page_indexes(metadata, 8, ["20"])

        self.assertEqual(indexes, [3, 4, 5])

    def test_targeted_prompt_mentions_only_missing_numbers(self):
        note = _targeted_answer_repair_prompt_note(
            [
                {
                    "problem_number": "20",
                    "section_id": "Final",
                    "page_number": 7,
                    "problem_text": "Find the final value.",
                }
            ],
            page_index=6,
        )

        self.assertIn("20", note)
        self.assertIn("Current rendered page index: 6", note)
        self.assertIn("Find the final value", note)


if __name__ == "__main__":
    unittest.main()
