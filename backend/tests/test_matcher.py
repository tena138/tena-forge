import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.matcher import _canonical_number, match, match_with_summary  # noqa: E402


class MatcherTests(unittest.TestCase):
    def test_canonical_number_accepts_common_korean_ocr_variants(self):
        self.assertEqual(_canonical_number("1번"), "1")
        self.assertEqual(_canonical_number("문제 01"), "1")
        self.assertEqual(_canonical_number("#12."), "12")
        self.assertEqual(_canonical_number("①"), "1")

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
        self.assertEqual(matched[1]["match_flags"]["matched_via"], "global_order")

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
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "section_number")

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
        self.assertEqual(matched[1]["match_flags"]["matched_via"], "global_order")

    def test_global_order_rescues_remaining_solution_number_ocr_mismatch(self):
        problems = [
            {
                "problem_number": 1,
                "problem_text": "problem one",
                "unit": "unit A",
                "page_index": 1,
            }
        ]
        solutions = [
            {
                "problem_number": "I",
                "answer": "A",
                "solution_steps": "solution one",
                "section_label": "unit B",
                "page_idx": 1,
            }
        ]

        matched = match(problems, solutions)

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertFalse(matched[0]["match_flags"]["needs_review"])
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "global_order")

    def test_section_number_match_is_confident_and_deterministic(self):
        result = match_with_summary(
            [
                {"problem_number": "01", "problem_text": "day one first", "section_label": "DAY 01", "page_index": 1},
                {"problem_number": "02", "problem_text": "day one second", "section_label": "DAY 01", "page_index": 1},
            ],
            [
                {"problem_number": "01", "answer": "A", "solution_steps": "first solution", "section_label": "DAY 01", "page_idx": 10},
                {"problem_number": "02", "answer": "B", "solution_steps": "second solution", "section_label": "DAY 01", "page_idx": 10},
            ],
        )

        matched = result["problems"]
        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertEqual(matched[1]["solution"]["answer"], "B")
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "section_number")
        self.assertEqual(matched[0]["match_confidence"], 0.99)
        self.assertEqual(result["summary"]["matched_count"], 2)
        self.assertEqual(result["summary"]["sections"][0]["status"], "ok")

    def test_section_order_matches_when_numbers_are_missing(self):
        matched = match(
            [
                {"problem_number": "01", "problem_text": "first", "section_label": "DAY 02", "page_index": 2},
                {"problem_number": "02", "problem_text": "second", "section_label": "DAY 02", "page_index": 2},
            ],
            [
                {"problem_number": "", "answer": "A", "solution_steps": "first solution", "section_label": "DAY 02", "page_idx": 20},
                {"problem_number": "", "answer": "B", "solution_steps": "second solution", "section_label": "DAY 02", "page_idx": 20},
            ],
        )

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertEqual(matched[1]["solution"]["answer"], "B")
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "section_order")
        self.assertEqual(matched[0]["match_confidence"], 0.95)

    def test_structural_match_is_not_overridden_by_semantic_similarity(self):
        problems = [
            {"problem_number": "01", "problem_text": "alpha problem", "section_label": "DAY 01", "page_index": 1},
            {"problem_number": "02", "problem_text": "beta problem", "section_label": "DAY 01", "page_index": 1},
        ]
        solutions = [
            {
                "problem_number": "01",
                "answer": "A",
                "solution_steps": "beta looking solution",
                "section_label": "DAY 01",
                "page_idx": 10,
                "referenced_problem_snippet": "beta problem",
            },
            {
                "problem_number": "02",
                "answer": "B",
                "solution_steps": "alpha looking solution",
                "section_label": "DAY 01",
                "page_idx": 10,
                "referenced_problem_snippet": "alpha problem",
            },
        ]

        def fake_similarity(left, right):
            return 0.95 if left.split()[0] in right else 0.2

        with patch("services.matcher.cosine_similarity", side_effect=fake_similarity):
            matched = match(problems, solutions)

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertEqual(matched[1]["solution"]["answer"], "B")
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "section_number")
        self.assertIn("semantic_conflict", matched[0]["match_flags"]["warnings"])

if __name__ == "__main__":
    unittest.main()
