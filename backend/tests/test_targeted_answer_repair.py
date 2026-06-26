import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.pipeline import (  # noqa: E402
    _answer_match_score,
    _targeted_answer_repair_page_indexes,
    _targeted_answer_repair_prompt_note,
    repair_missing_answer_matches_with_targeted_recovery,
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

    def test_targeted_page_indexes_include_answer_candidates_when_only_problem_page_matches(self):
        metadata = [
            {"page_index": 1, "page_type": "problem_page", "detected_problem_headers": ["20"]},
            {"page_index": 8, "page_type": "solution_page", "detected_solution_headers": ["1", "2", "3"]},
        ]

        indexes = _targeted_answer_repair_page_indexes(metadata, 10, ["20"])

        self.assertEqual(indexes, [0, 1, 2, 8])

    def test_final_targeted_page_indexes_can_include_all_answer_candidates(self):
        metadata = [
            {"page_index": 1, "page_type": "problem_page", "detected_problem_headers": ["20"]},
            {"page_index": 6, "page_type": "solution_page", "detected_solution_headers": ["18"]},
            {"page_index": 8, "page_type": "solution_page", "detected_solution_headers": ["19"]},
            {"page_index": 9, "page_type": "solution_page", "detected_solution_headers": ["20"]},
        ]

        indexes = _targeted_answer_repair_page_indexes(
            metadata,
            10,
            ["20"],
            fallback_tail_pages=1,
            include_all_answer_candidates=True,
        )

        self.assertEqual(indexes, [0, 1, 2, 6, 8, 9])

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
        self.assertIn("Repair attempt 1 of 1", note)

    def test_targeted_repair_retries_until_all_missing_answers_match(self):
        problems = [
            {"problem_number": 1, "problem_no": "1", "problem_text": "Problem 1", "global_index": 1},
            {"problem_number": 2, "problem_no": "2", "problem_text": "Problem 2", "global_index": 2},
            {"problem_number": 3, "problem_no": "3", "problem_text": "Problem 3", "global_index": 3},
        ]
        solutions = [{"problem_number": "1", "answer": "3", "solution_steps": None}]
        metadata = [
            {"page_index": 0, "page_type": "solution_page", "detected_solution_headers": ["2"]},
            {"page_index": 3, "page_type": "solution_page", "detected_solution_headers": ["3"]},
        ]

        with (
            patch("services.pipeline.set_progress"),
            patch(
                "services.pipeline.extract_mixed_pdf_answer_recovery",
                side_effect=[
                    [{"problem_number": "2", "answer": "5", "solution_steps": "final"}],
                    [{"problem_number": "3", "answer": "7", "solution_steps": "final"}],
                ],
            ) as extract_mock,
        ):
            repaired, report, total_units = repair_missing_answer_matches_with_targeted_recovery(
                "sample.pdf",
                5,
                180,
                uuid4(),
                0,
                1,
                metadata,
                problems,
                solutions,
                max_attempts=3,
            )

        score = _answer_match_score(problems, repaired)

        self.assertEqual(score["missing_answer_count"], 0)
        self.assertTrue(report["fully_matched"])
        self.assertEqual(report["attempt_count"], 2)
        self.assertEqual(total_units, 9)
        self.assertEqual(extract_mock.call_count, 2)

    def test_targeted_repair_runs_full_document_fallback_after_targeted_attempts_fail(self):
        problems = [
            {"problem_number": 1, "problem_no": "1", "problem_text": "Problem 1", "global_index": 1},
            {"problem_number": 2, "problem_no": "2", "problem_text": "Problem 2", "global_index": 2},
        ]
        solutions = [{"problem_number": "1", "answer": "3", "solution_steps": None}]
        metadata = [
            {"page_index": 0, "page_type": "problem_page", "detected_problem_headers": ["2"]},
            {"page_index": 1, "page_type": "problem_page", "detected_problem_headers": []},
            {"page_index": 2, "page_type": "problem_page", "detected_problem_headers": []},
            {"page_index": 3, "page_type": "problem_page", "detected_problem_headers": []},
        ]

        with (
            patch("services.pipeline.set_progress"),
            patch(
                "services.pipeline.extract_mixed_pdf_answer_recovery",
                side_effect=[
                    [],
                    [{"problem_number": "2", "answer": "7", "solution_steps": "final"}],
                ],
            ) as extract_mock,
        ):
            repaired, report, total_units = repair_missing_answer_matches_with_targeted_recovery(
                "sample.pdf",
                4,
                180,
                uuid4(),
                0,
                1,
                metadata,
                problems,
                solutions,
                max_attempts=1,
            )

        score = _answer_match_score(problems, repaired)
        fallback_kwargs = extract_mock.call_args_list[1].kwargs

        self.assertEqual(score["missing_answer_count"], 0)
        self.assertTrue(report["fully_matched"])
        self.assertTrue(report["full_document_fallback_attempted"])
        self.assertEqual(report["attempts"][-1]["mode"], "full_document_fallback")
        self.assertEqual(total_units, 8)
        self.assertEqual(extract_mock.call_count, 2)
        self.assertIn("Full-document fallback", fallback_kwargs["target_repair_scope_note"])

    def test_targeted_repair_replaces_sectioned_blank_candidate_with_answerful_number_candidate(self):
        problems = [
            {
                "problem_number": 1,
                "problem_no": "1",
                "problem_text": "Problem 1",
                "section_id": "A",
                "global_index": 1,
            },
            {
                "problem_number": 2,
                "problem_no": "2",
                "problem_text": "Problem 2",
                "section_id": "A",
                "global_index": 2,
            },
        ]
        solutions = [
            {"problem_number": "1", "answer": "3", "solution_steps": None, "section_id": "A"},
            {"problem_number": "2", "answer": "", "solution_steps": None, "section_id": "A"},
        ]
        metadata = [
            {"page_index": 1, "page_type": "solution_page", "detected_solution_headers": ["2"]},
        ]

        with (
            patch("services.pipeline.set_progress"),
            patch(
                "services.pipeline.extract_mixed_pdf_answer_recovery",
                return_value=[{"problem_number": "2", "answer": "7", "solution_steps": "final"}],
            ),
        ):
            repaired, report, _total_units = repair_missing_answer_matches_with_targeted_recovery(
                "sample.pdf",
                3,
                180,
                uuid4(),
                0,
                1,
                metadata,
                problems,
                solutions,
                max_attempts=1,
            )

        score = _answer_match_score(problems, repaired)
        number_two_candidates = [item for item in repaired if str(item.get("problem_number")) == "2"]

        self.assertEqual(score["missing_answer_count"], 0)
        self.assertTrue(report["fully_matched"])
        self.assertEqual(len(number_two_candidates), 1)
        self.assertEqual(number_two_candidates[0]["answer"], "7")


if __name__ == "__main__":
    unittest.main()
