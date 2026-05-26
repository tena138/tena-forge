import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.subscription_pricing import calculate_subscription_price  # noqa: E402


class SubscriptionPricingTests(unittest.TestCase):
    def test_second_subject_engine_adds_fixed_monthly_delta(self):
        pricing = calculate_subscription_price("basic", "monthly", {}, ["math", "korean"])

        self.assertEqual(pricing["enabled_subject_engines"], ["math", "korean"])
        self.assertEqual(pricing["subject_engine_monthly_delta_krw"], 30_000)
        self.assertEqual(pricing["monthly_price_krw"], 78_000)
        self.assertEqual(pricing["amount_krw"], 78_000)

    def test_annual_subject_engine_delta_uses_existing_discount(self):
        pricing = calculate_subscription_price("pro", "annual", {}, ["math", "korean"])

        self.assertEqual(pricing["monthly_price_krw"], 138_000)
        self.assertEqual(pricing["amount_krw"], 110_400 * 12)


if __name__ == "__main__":
    unittest.main()
