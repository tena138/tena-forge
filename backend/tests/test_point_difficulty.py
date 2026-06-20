import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.korean_extraction import normalize_korean_page_payload  # noqa: E402
from services.point_difficulty import apply_point_difficulty_to_payload, clean_text_and_extract_point_difficulty  # noqa: E402


class PointDifficultyTests(unittest.TestCase):
    def test_math_point_label_is_removed_and_saved_as_difficulty(self):
        payload = {"problem_text": "(4점) 함수 $f(x)$의 최댓값을 구하시오."}

        result = apply_point_difficulty_to_payload(payload, subject_engine="math", text_fields=("problem_text",))

        self.assertEqual(result["difficulty"], "4점")
        self.assertEqual(result["problem_text"], "함수 $f(x)$의 최댓값을 구하시오.")

    def test_korean_point_label_is_removed_from_question_stem(self):
        document = normalize_korean_page_payload(
            {
                "questions": [
                    {
                        "question_id": "q1",
                        "source_pages": [1],
                        "question_number": "1",
                        "question_stem": "[3점] 윗글의 내용으로 적절한 것은?",
                        "choices": [],
                        "warnings": [],
                    }
                ]
            },
            "doc",
            "sample.pdf",
            1,
            subject="korean",
        )

        question = document["questions"][0]
        self.assertEqual(question["difficulty"], "3점")
        self.assertEqual(question["question_stem"], "윗글의 내용으로 적절한 것은?")

    def test_score_inside_problem_body_is_not_removed(self):
        text = "A가 4점을 얻었다. 다음 설명으로 옳은 것은?"

        result = clean_text_and_extract_point_difficulty(text, "math")

        self.assertIsNone(result.difficulty)
        self.assertEqual(result.text, text)

    def test_missing_point_label_keeps_difficulty_null(self):
        payload = {"problem_text": "다음 극한값을 구하시오."}

        result = apply_point_difficulty_to_payload(payload, subject_engine="math", text_fields=("problem_text",))

        self.assertIsNone(result["difficulty"])
        self.assertEqual(result["problem_text"], "다음 극한값을 구하시오.")


if __name__ == "__main__":
    unittest.main()
