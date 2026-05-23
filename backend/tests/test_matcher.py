import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.matcher import _canonical_number, _lexical_similarity, match, match_with_summary  # noqa: E402


class MatcherTests(unittest.TestCase):
    def test_canonical_number_accepts_common_korean_ocr_variants(self):
        self.assertEqual(_canonical_number("1번"), "1")
        self.assertEqual(_canonical_number("문제 01"), "1")
        self.assertEqual(_canonical_number("#12."), "12")
        self.assertEqual(_canonical_number("①"), "1")

    def test_repeated_numbers_do_not_cross_match_when_sections_disagree(self):
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

        result = match_with_summary(problems, solutions)
        matched = result["problems"]

        self.assertIsNone(matched[0]["solution"])
        self.assertIsNone(matched[1]["solution"])
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "unmatched")
        self.assertEqual(matched[1]["match_flags"]["matched_via"], "unmatched")
        self.assertIn("global_order_disabled", result["summary"]["warnings"])

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

        with patch.dict("os.environ", {"SEMANTIC_MATCHING_ENABLED": "true"}), patch("services.matcher.cosine_similarity", return_value=0.2):
            matched = match(problems, solutions)

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertTrue(matched[0]["match_flags"]["needs_review"])
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "section_number")

    def test_number_order_skips_solution_when_snippet_similarity_conflicts(self):
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

        with patch.dict("os.environ", {"SEMANTIC_MATCHING_ENABLED": "true"}), patch("services.matcher.cosine_similarity", return_value=0.2):
            matched = match(problems, solutions)

        self.assertIsNone(matched[0]["solution"])
        self.assertIsNone(matched[1]["solution"])
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "unmatched")
        self.assertEqual(matched[1]["match_flags"]["matched_via"], "unmatched")

    def test_global_order_does_not_cross_conflicting_sections(self):
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

        result = match_with_summary(problems, solutions)
        matched = result["problems"]

        self.assertIsNone(matched[0]["solution"])
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "unmatched")
        self.assertFalse(result["validation_report"]["global_order_allowed"])

    def test_small_unsectioned_books_can_still_use_global_order(self):
        matched = match(
            [
                {"problem_number": "1", "problem_text": "problem one", "page_index": 1},
                {"problem_number": "2", "problem_text": "problem two", "page_index": 1},
            ],
            [
                {"problem_number": "1", "answer": "A", "solution_steps": "solution one", "page_idx": 10},
                {"problem_number": "2", "answer": "B", "solution_steps": "solution two", "page_idx": 10},
            ],
        )

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertEqual(matched[1]["solution"]["answer"], "B")
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "global_order")

    def test_large_unsectioned_books_do_not_use_global_order(self):
        result = match_with_summary(
            [{"problem_number": str(index), "problem_text": f"problem {index}", "page_index": index} for index in range(1, 42)],
            [{"problem_number": str(index), "answer": str(index), "solution_steps": f"solution {index}", "page_idx": index} for index in range(1, 42)],
        )

        self.assertEqual(result["summary"]["matched_count"], 41)
        self.assertFalse(result["validation_report"]["global_order_allowed"])
        self.assertIn("global_order_disabled", result["summary"]["warnings"])
        self.assertEqual(result["validation_report"]["method_counts"]["unique_number"], 41)

    def test_large_unsectioned_repeated_numbers_still_do_not_guess(self):
        result = match_with_summary(
            [
                {"problem_number": "1", "problem_text": "day one first", "page_index": 1},
                {"problem_number": "1", "problem_text": "day two first", "page_index": 10},
            ],
            [
                {"problem_number": "1", "answer": "A", "solution_steps": "first solution", "page_idx": 20},
                {"problem_number": "1", "answer": "B", "solution_steps": "second solution", "page_idx": 21},
            ],
        )

        self.assertEqual(result["summary"]["matched_count"], 0)
        self.assertEqual(result["validation_report"]["method_counts"]["unique_number"], 0)

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

    def test_solution_sections_with_ocr_different_labels_align_by_anchors(self):
        result = match_with_summary(
            [
                {"problem_number": "01", "problem_text": "day one first", "section_label": "DAY 01", "page_index": 1},
                {"problem_number": "02", "problem_text": "day one second", "section_label": "DAY 01", "page_index": 1},
                {"problem_number": "01", "problem_text": "day two first", "section_label": "DAY 02", "page_index": 2},
                {"problem_number": "02", "problem_text": "day two second", "section_label": "DAY 02", "page_index": 2},
            ],
            [
                {"problem_number": "01", "answer": "A", "solution_steps": "first solution", "section_label": "LESSON 1", "page_idx": 10},
                {"problem_number": "02", "answer": "B", "solution_steps": "second solution", "section_label": "LESSON 1", "page_idx": 10},
                {"problem_number": "01", "answer": "C", "solution_steps": "third solution", "section_label": "LESSON 2", "page_idx": 11},
                {"problem_number": "02", "answer": "D", "solution_steps": "fourth solution", "section_label": "LESSON 2", "page_idx": 11},
            ],
        )

        matched = result["problems"]
        self.assertEqual([item["solution"]["answer"] for item in matched], ["A", "B", "C", "D"])
        self.assertIn("solution_sections_aligned_by_anchor", result["summary"]["warnings"])

    def test_unsectioned_solutions_partition_by_problem_section_anchors(self):
        result = match_with_summary(
            [
                {"problem_number": "01", "problem_text": "day one first", "section_label": "DAY 01", "page_index": 1},
                {"problem_number": "02", "problem_text": "day one second", "section_label": "DAY 01", "page_index": 1},
                {"problem_number": "01", "problem_text": "day two first", "section_label": "DAY 02", "page_index": 2},
                {"problem_number": "02", "problem_text": "day two second", "section_label": "DAY 02", "page_index": 2},
            ],
            [
                {"problem_number": "01", "answer": "A", "solution_steps": "first solution", "page_idx": 10},
                {"problem_number": "02", "answer": "B", "solution_steps": "second solution", "page_idx": 10},
                {"problem_number": "01", "answer": "C", "solution_steps": "third solution", "page_idx": 11},
                {"problem_number": "02", "answer": "D", "solution_steps": "fourth solution", "page_idx": 11},
            ],
        )

        self.assertEqual([item["solution"]["answer"] for item in result["problems"]], ["A", "B", "C", "D"])
        self.assertIn("unsectioned_solutions_partitioned_by_problem_sections", result["summary"]["warnings"])

    def test_missing_solution_numbers_use_review_semantic_fallback(self):
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
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "semantic_section")
        self.assertTrue(matched[0]["match_flags"]["needs_review"])

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

        with patch.dict("os.environ", {"SEMANTIC_MATCHING_ENABLED": "true"}), patch("services.matcher.cosine_similarity", side_effect=fake_similarity):
            matched = match(problems, solutions)

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertEqual(matched[1]["solution"]["answer"], "B")
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "section_number")
        self.assertIn("semantic_conflict", matched[0]["match_flags"]["warnings"])

    def test_structural_match_does_not_load_embedding_model_by_default(self):
        problems = [
            {"problem_number": "01", "problem_text": "alpha problem", "section_label": "DAY 01", "page_index": 1},
        ]
        solutions = [
            {
                "problem_number": "01",
                "answer": "A",
                "solution_steps": "alpha solution",
                "section_label": "DAY 01",
                "page_idx": 10,
                "referenced_problem_snippet": "alpha problem",
            },
        ]

        with patch.dict("os.environ", {"SEMANTIC_MATCHING_ENABLED": ""}, clear=False), patch(
            "services.matcher._model",
            side_effect=AssertionError("embedding model should not load during default batch matching"),
        ):
            matched = match(problems, solutions)

        self.assertEqual(matched[0]["solution"]["answer"], "A")
        self.assertEqual(matched[0]["match_flags"]["matched_via"], "section_number")

    def test_number_order_does_not_match_repeated_numbers_when_sections_differ(self):
        matched = match(
            [
                {"problem_number": "1", "problem_text": "first one", "section_label": "problem A", "page_index": 1},
                {"problem_number": "2", "problem_text": "extra two", "section_label": "problem A", "page_index": 1},
                {"problem_number": "1", "problem_text": "second one", "section_label": "problem B", "page_index": 2},
            ],
            [
                {"problem_number": "1", "answer": "A", "solution_steps": "first solution", "section_label": "solution X", "page_idx": 10},
                {"problem_number": "1", "answer": "B", "solution_steps": "second solution", "section_label": "solution Y", "page_idx": 11},
            ],
        )

        self.assertIsNone(matched[0]["solution"])
        self.assertIsNone(matched[2]["solution"])
        self.assertEqual(matched[2]["match_flags"]["matched_via"], "unmatched")
        self.assertEqual(matched[1]["match_flags"]["matched_via"], "unmatched")

    def test_lexical_similarity_rewards_snippet_containment(self):
        score = _lexical_similarity("alpha beta gamma", "intro alpha beta gamma with more problem text")
        unrelated = _lexical_similarity("theta kappa", "intro alpha beta gamma with more problem text")

        self.assertIsNotNone(score)
        self.assertGreater(score, 0.8)
        self.assertLess(unrelated or 0.0, 0.4)

if __name__ == "__main__":
    unittest.main()
