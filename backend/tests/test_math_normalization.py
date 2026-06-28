import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.math_normalization import normalize_geometry_notation  # noqa: E402
from services.pipeline import RenderedPage, _normalize_extracted_items  # noqa: E402


class MathNormalizationTests(unittest.TestCase):
    def test_inline_sum_uses_display_delimiters(self):
        text = r"다음 값을 구하시오. $\sum_{k=1}^{n} k$"

        self.assertEqual(
            normalize_geometry_notation(text),
            r"다음 값을 구하시오. $$\sum_{k=1}^{n} k$$",
        )

    def test_non_sigma_inline_math_stays_inline(self):
        text = r"$f(x)=x^2$의 최솟값"

        self.assertEqual(normalize_geometry_notation(text), text)

    def test_existing_display_sum_stays_display(self):
        text = r"조건 $$\sum_{k=1}^{n} a_k=10$$을 만족한다."

        self.assertEqual(normalize_geometry_notation(text), text)

    def test_parenthesized_inline_sum_uses_display_delimiters(self):
        text = r"값은 \(\sum_{k=1}^{n} k\)이다."

        self.assertEqual(
            normalize_geometry_notation(text),
            r"값은 $$\sum_{k=1}^{n} k$$이다.",
        )

    def test_extracted_problem_and_choices_normalize_sigma(self):
        page = RenderedPage(page_index=0, base64_png="", png_bytes=b"")
        items = _normalize_extracted_items(
            [
                {
                    "problem_number": 1,
                    "problem_text": r"수열의 합 $\sum_{k=1}^{n} a_k$를 구하시오.",
                    "choices": [{"label": "①", "text": r"$\sum_{k=1}^{3} k$"}],
                    "is_exercise": True,
                }
            ],
            page,
        )

        self.assertEqual(items[0]["problem_text"], r"수열의 합 $$\sum_{k=1}^{n} a_k$$를 구하시오.")
        self.assertEqual(items[0]["choices"][0]["text"], r"$$\sum_{k=1}^{3} k$$")


if __name__ == "__main__":
    unittest.main()
