import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.subscription_pricing import calculate_subscription_price  # noqa: E402


class SubscriptionPricingTests(unittest.TestCase):
    def test_second_subject_engine_doubles_single_engine_monthly_price(self):
        pricing = calculate_subscription_price("basic", "monthly", {}, ["math", "korean"])

        self.assertEqual(pricing["enabled_subject_engines"], ["math", "korean"])
        self.assertEqual(pricing["subject_engine_monthly_delta_krw"], 48_000)
        self.assertEqual(pricing["monthly_price_krw"], 96_000)
        self.assertEqual(pricing["amount_krw"], 96_000)

    def test_subject_engine_multiplier_applies_after_package_addons(self):
        pricing = calculate_subscription_price("basic", "monthly", {"ai": "basic-ai-plus"}, ["math", "korean"])

        self.assertEqual(pricing["subject_engine_monthly_delta_krw"], 76_000)
        self.assertEqual(pricing["monthly_price_krw"], 152_000)
        self.assertEqual(pricing["amount_krw"], 152_000)

    def test_english_engine_counts_as_third_subject_engine(self):
        pricing = calculate_subscription_price("basic", "monthly", {}, ["math", "korean", "english"])

        self.assertEqual(pricing["enabled_subject_engines"], ["math", "korean", "english"])
        self.assertEqual(pricing["subject_engine_count"], 3)
        self.assertEqual(pricing["subject_engine_monthly_delta_krw"], 96_000)
        self.assertEqual(pricing["monthly_price_krw"], 144_000)

    def test_annual_subject_engine_delta_uses_existing_discount(self):
        pricing = calculate_subscription_price("pro", "annual", {}, ["math", "korean"])

        self.assertEqual(pricing["monthly_price_krw"], 216_000)
        self.assertEqual(pricing["amount_krw"], 172_800 * 12)

    def test_student_key_addons_are_per_seat_with_plan_caps(self):
        basic = calculate_subscription_price("basic", "monthly", {"student": "basic-student-10"}, ["math"])
        pro = calculate_subscription_price("pro", "monthly", {"student": "pro-student-100"}, ["math"])

        self.assertEqual(basic["monthly_price_krw"], 88_000)
        self.assertEqual(pro["monthly_price_krw"], 828_000)


if __name__ == "__main__":
    unittest.main()
