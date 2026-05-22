import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.korean_extraction import map_korean_answers, merge_korean_page_payloads, validate_korean_document  # noqa: E402
from services.subject_engines import subject_engine_pricing  # noqa: E402


def choice(label: str, text: str):
    return {"choice_label": label, "choice_text": text}


class KoreanExtractionTests(unittest.TestCase):
    def test_one_passage_links_three_questions(self):
        document = validate_korean_document(
            {
                "document_id": "doc",
                "subject": "korean",
                "source_file": "sample.pdf",
                "passage_groups": [
                    {
                        "passage_id": "p1",
                        "source_pages": [1],
                        "passage_instruction": "[1~3] 다음 글을 읽고 물음에 답하시오.",
                        "passage_title": None,
                        "passage_text": "긴 지문",
                        "passage_type": "비문학",
                        "linked_question_ids": ["q1", "q2", "q3"],
                        "extraction_confidence": 0.95,
                        "warnings": [],
                    }
                ],
                "questions": [
                    {"question_id": "q1", "source_pages": [1], "question_number": "1", "linked_passage_id": "p1", "question_stem": "윗글의 내용은?", "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")], "warnings": []},
                    {"question_id": "q2", "source_pages": [1], "question_number": "2", "linked_passage_id": "p1", "question_stem": "㉠의 의미는?", "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")], "warnings": []},
                    {"question_id": "q3", "source_pages": [1], "question_number": "3", "linked_passage_id": "p1", "question_stem": "적절한 것은?", "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")], "warnings": []},
                ],
                "global_warnings": [],
            }
        )

        self.assertEqual(document["passage_groups"][0]["warnings"], [])
        self.assertEqual(document["questions"][1]["linked_passage_id"], "p1")

    def test_poem_passage_preserves_line_breaks(self):
        text = "산에는 꽃 피네\n꽃이 피네\n갈 봄 여름 없이\n꽃이 피네"
        document = merge_korean_page_payloads(
            "doc",
            "poem.pdf",
            [
                {
                    "document_id": "doc",
                    "subject": "korean",
                    "source_file": "poem.pdf",
                    "passage_groups": [{"passage_id": "p1", "source_pages": [1], "passage_text": text, "passage_type": "문학", "linked_question_ids": [], "extraction_confidence": 0.9, "warnings": []}],
                    "questions": [],
                    "global_warnings": [],
                }
            ],
        )

        self.assertEqual(document["passage_groups"][0]["passage_text"], text)

    def test_nonfiction_passage_spanning_pages_merges_source_pages(self):
        document = merge_korean_page_payloads(
            "doc",
            "reading.pdf",
            [
                {"passage_groups": [{"passage_id": "p1", "source_pages": [1], "passage_text": "정보 처리 이론", "passage_type": "비문학", "linked_question_ids": [], "extraction_confidence": 0.9, "warnings": []}], "questions": [], "global_warnings": []},
                {"passage_groups": [{"passage_id": "p1", "source_pages": [2], "passage_text": "정보 처리 이론", "passage_type": "비문학", "linked_question_ids": [], "extraction_confidence": 0.9, "warnings": []}], "questions": [], "global_warnings": []},
            ],
        )

        self.assertEqual(document["passage_groups"][0]["source_pages"], [1, 2])

    def test_question_with_bogi_block(self):
        document = validate_korean_document(
            {
                "document_id": "doc",
                "subject": "korean",
                "source_file": "bogi.pdf",
                "passage_groups": [],
                "questions": [
                    {
                        "question_id": "q1",
                        "source_pages": [1],
                        "question_number": "1",
                        "linked_passage_id": None,
                        "question_stem": "다음 <보기>를 참고할 때 적절한 것은?",
                        "additional_material": "<보기>\nㄱ. 자료 A\nㄴ. 자료 B",
                        "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")],
                        "warnings": [],
                    }
                ],
                "global_warnings": [],
            }
        )

        self.assertNotIn("boge_block_may_be_missing", document["questions"][0]["warnings"])

    def test_references_are_preserved_in_question_text(self):
        document = validate_korean_document(
            {
                "document_id": "doc",
                "subject": "korean",
                "source_file": "ref.pdf",
                "passage_groups": [],
                "questions": [{"question_id": "q1", "source_pages": [1], "question_number": "1", "linked_passage_id": None, "question_stem": "㉠과 ㉡에 대한 설명으로 적절한 것은?", "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")], "warnings": []}],
                "global_warnings": [],
            }
        )

        self.assertIn("㉠", document["questions"][0]["question_stem"])
        self.assertIn("㉡", document["questions"][0]["question_stem"])

    def test_choices_circled_one_to_five_are_valid(self):
        document = validate_korean_document(
            {"document_id": "doc", "subject": "korean", "source_file": "choices.pdf", "passage_groups": [], "questions": [{"question_id": "q1", "source_pages": [1], "question_number": "1", "question_stem": "적절한 것은?", "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")], "warnings": []}], "global_warnings": []}
        )

        self.assertEqual(document["questions"][0]["warnings"], [])

    def test_missing_choice_case_adds_warning(self):
        document = validate_korean_document(
            {"document_id": "doc", "subject": "korean", "source_file": "missing.pdf", "passage_groups": [], "questions": [{"question_id": "q1", "source_pages": [1], "question_number": "1", "question_stem": "적절한 것은?", "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C")], "warnings": []}], "global_warnings": []}
        )

        self.assertIn("fewer_than_5_choices", document["questions"][0]["warnings"])

    def test_ocr_corrupted_passage_warning_case(self):
        document = validate_korean_document(
            {"document_id": "doc", "subject": "korean", "source_file": "ocr.pdf", "passage_groups": [{"passage_id": "p1", "source_pages": [1], "passage_text": "□□□ ???", "passage_type": "unknown", "linked_question_ids": [], "extraction_confidence": 0.4, "warnings": ["low_ocr_confidence", "ocr_corruption_suspected"]}], "questions": [], "global_warnings": []}
        )

        self.assertIn("ocr_corruption_suspected", document["passage_groups"][0]["warnings"])

    def test_answer_key_mapping_case(self):
        document = {"document_id": "doc", "subject": "korean", "source_file": "answers.pdf", "passage_groups": [], "questions": [{"question_id": "q1", "source_pages": [1], "question_number": "1", "question_stem": "적절한 것은?", "choices": [], "answer": None, "solution": None, "warnings": []}], "global_warnings": []}

        mapped = map_korean_answers(document, [{"question_number": "1", "answer": "③", "solution": None}])

        self.assertEqual(mapped["questions"][0]["answer"], "③")
        self.assertIsNone(mapped["questions"][0]["solution"])

    def test_explanation_file_mapping_case(self):
        document = {"document_id": "doc", "subject": "korean", "source_file": "solutions.pdf", "passage_groups": [], "questions": [{"question_id": "q1", "source_pages": [1], "question_number": "2", "question_stem": "적절한 것은?", "choices": [], "answer": None, "solution": None, "warnings": []}], "global_warnings": []}

        mapped = map_korean_answers(document, [{"question_number": "2", "answer": "⑤", "solution": "⑤는 윗글의 내용과 일치한다."}])

        self.assertEqual(mapped["questions"][0]["answer"], "⑤")
        self.assertIn("일치", mapped["questions"][0]["solution"])

    def test_subject_engine_pricing_multiplier(self):
        pricing = subject_engine_pricing(79000, ["math", "korean"])

        self.assertEqual(pricing["subject_engine_count"], 2)
        self.assertEqual(pricing["subject_multiplier"], 2.0)
        self.assertEqual(pricing["final_monthly_price"], 158000)


if __name__ == "__main__":
    unittest.main()
