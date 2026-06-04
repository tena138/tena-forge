import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.usage_cost_policy import estimate_extraction, estimate_single_reextract, plan_cost_policy, scaled_plan_cost_policy  # noqa: E402


class UsageCostPolicyTests(unittest.TestCase):
    def test_basic_limit_uses_13000_krw_cap_formula(self):
        policy = plan_cost_policy(None, "basic")

        self.assertEqual(policy.monthly_cost_cap_krw, 13_000)
        self.assertEqual(policy.monthly_credit_limit, 400)
        self.assertEqual(policy.max_file_size_mb, 300)
        self.assertEqual(policy.max_pages_per_job, 500)

    def test_pro_uses_same_formula_with_higher_cap(self):
        policy = plan_cost_policy(None, "pro")

        self.assertEqual(policy.monthly_cost_cap_krw, 30_000)
        self.assertEqual(policy.monthly_credit_limit, 923)
        self.assertEqual(policy.max_file_size_mb, 1000)
        self.assertEqual(policy.max_pages_per_job, 1500)

    def test_subject_engine_multiplier_scales_capacity_limits(self):
        policy = scaled_plan_cost_policy(plan_cost_policy(None, "basic"), 2)

        self.assertEqual(policy.monthly_cost_cap_krw, 26_000)
        self.assertEqual(policy.monthly_credit_limit, 800)
        self.assertEqual(policy.monthly_upload_mb_limit, 1000)
        self.assertEqual(policy.storage_quota_mb, 2048)

    def test_clean_math_and_solution_credits(self):
        estimate = estimate_extraction(subject_engine="math", problem_pages=100, solution_pages=20, problem_file_mb=10, solution_file_mb=2)

        self.assertEqual(estimate.metadata["category"], "math_with_solution")
        self.assertEqual(estimate.credits, 127)
        self.assertEqual(estimate.estimated_cost_krw, 3302)

    def test_korean_hard_scan_uses_larger_multiplier(self):
        estimate = estimate_extraction(subject_engine="korean", problem_pages=20, problem_file_mb=30)

        self.assertEqual(estimate.metadata["category"], "korean_hard_scan")
        self.assertEqual(estimate.credits, 80)

    def test_english_clean_scan_uses_language_multiplier(self):
        estimate = estimate_extraction(subject_engine="english", problem_pages=20, problem_file_mb=10)

        self.assertEqual(estimate.metadata["category"], "english_long_passage")
        self.assertEqual(estimate.credits, 60)

    def test_single_reextract_consumes_fractional_credit(self):
        estimate = estimate_single_reextract()

        self.assertEqual(estimate.credits, 0.7)
        self.assertEqual(estimate.credits_milli, 700)


if __name__ == "__main__":
    unittest.main()
