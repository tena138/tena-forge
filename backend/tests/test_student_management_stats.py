import sys
import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from routers.student_management import _score_distribution  # noqa: E402


class StudentManagementStatsTests(unittest.TestCase):
    def test_score_distribution_calculates_session_statistics(self):
        results = [
            SimpleNamespace(status="graded", score=Decimal("60")),
            SimpleNamespace(status="graded", score=Decimal("70")),
            SimpleNamespace(status="graded", score=Decimal("80")),
            SimpleNamespace(status="graded", score=Decimal("90")),
            SimpleNamespace(status="pending_grading", score=None),
        ]

        self.assertEqual(
            _score_distribution(results),
            {
                "respondent_count": 4,
                "average_score": 75.0,
                "highest_score": 90.0,
                "lowest_score": 60.0,
                "q1_score": 67.5,
                "q2_score": 75.0,
                "q3_score": 82.5,
                "score_standard_deviation": 11.18,
            },
        )


if __name__ == "__main__":
    unittest.main()
