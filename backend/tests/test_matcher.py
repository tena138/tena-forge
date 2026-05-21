import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routers.local_worker import LocalWorkerComplete, _embedded_solutions_from_problems, _normalize_solutions_payload  # noqa: E402
from services.matcher import match  # noqa: E402


class MatcherTests(unittest.TestCase):
    def test_repeated_numbers_match_by_remaining_order_when_sections_disagree(self):
        problems = [
            {
                "problem_number": 1,
                "problem_text": "first section problem one",
                "unit": "unit A",
                "page_index": 3,
            },
            {
                "problem_number": 1,
                "problem_text": "page twenty two problem one",
                "unit": "unit B",
                "page_index": 21,
            },
        ]
        solutions = [
            {
                "problem_number": "1",
                "answer": "A",
                "solution_steps": "first section solution one",
                "section_label": "solution section X",
                "page_idx": 5,
            },
            {
                "problem_number": "1",
                "answer": "B",
                "solution_steps": "page twenty two solution one",
                "section_label": "solution section Y",
                "page_idx": 18,
            },
        ]

        matched = match(problems, solutions)

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertEqual(matched[1]["solution"]["answer"], "B")
        self.assertEqual(matched[1]["match_flags"]["matched_via"], "number_order")

    def test_local_worker_complete_accepts_duplicate_solution_numbers_as_list(self):
        payload = LocalWorkerComplete(
            problems=[],
            solutions=[
                {"problem_number": "1", "answer": "first"},
                {"problem_number": "1", "answer": "second"},
            ],
        )

        self.assertIsInstance(payload.solutions, list)
        self.assertEqual(len(payload.solutions), 2)
        self.assertEqual(payload.solutions[0]["answer"], "first")
        self.assertEqual(payload.solutions[1]["answer"], "second")
        self.assertEqual(len(_normalize_solutions_payload(payload)), 2)

    def test_primary_match_keeps_solution_when_snippet_similarity_is_low(self):
        problems = [
            {
                "problem_number": 1,
                "problem_text": "source problem text",
                "unit": "unit A",
                "page_index": 1,
            }
        ]
        solutions = [
            {
                "problem_number": "1",
                "answer": "A",
                "solution_steps": "solution body",
                "section_label": "unit A",
                "page_idx": 1,
                "referenced_problem_snippet": "unrelated snippet",
            }
        ]

        with patch("services.matcher.cosine_similarity", return_value=0.2):
            matched = match(problems, solutions)

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertTrue(matched[0]["match_flags"]["needs_review"])
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "primary")

    def test_number_order_match_keeps_solution_when_snippet_similarity_is_low(self):
        problems = [
            {
                "problem_number": 1,
                "problem_text": "first section problem one",
                "unit": "problem section A",
                "page_index": 3,
            },
            {
                "problem_number": 1,
                "problem_text": "page twenty two problem one",
                "unit": "problem section B",
                "page_index": 21,
            },
        ]
        solutions = [
            {
                "problem_number": "1",
                "answer": "A",
                "solution_steps": "first section solution one",
                "section_label": "solution section X",
                "page_idx": 5,
                "referenced_problem_snippet": "unrelated first snippet",
            },
            {
                "problem_number": "1",
                "answer": "B",
                "solution_steps": "page twenty two solution one",
                "section_label": "solution section Y",
                "page_idx": 18,
                "referenced_problem_snippet": "unrelated second snippet",
            },
        ]

        with patch("services.matcher.cosine_similarity", return_value=0.2):
            matched = match(problems, solutions)

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertEqual(matched[1]["solution"]["answer"], "B")
        self.assertEqual(matched[1]["match_flags"]["matched_via"], "number_order")

    def test_embedded_solution_fallback_ignores_empty_solution_fields(self):
        solutions = _embedded_solutions_from_problems(
            [
                {"problem_number": 1, "answer": "", "solution_steps": "", "key_concept": None, "page_index": 0},
                {"problem_number": 2, "answer": "x=1", "solution_steps": "", "key_concept": None, "page_index": 1},
            ]
        )

        self.assertEqual(len(solutions), 1)
        self.assertEqual(solutions[0]["problem_number"], "2")


if __name__ == "__main__":
    unittest.main()
