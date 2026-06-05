import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.english_extraction import merge_english_page_payloads  # noqa: E402
from services.korean_extraction import map_korean_answers, merge_korean_page_payloads, missing_passage_range_questions, validate_korean_document  # noqa: E402
from services.pipeline import _korean_problem_text  # noqa: E402
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

    def test_passage_range_middle_question_missing_is_reported(self):
        document = validate_korean_document(
            {
                "document_id": "doc",
                "subject": "korean",
                "source_file": "range.pdf",
                "passage_groups": [
                    {
                        "passage_id": "p1",
                        "source_pages": [1],
                        "passage_instruction": "[1~3] 다음 글을 읽고 물음에 답하시오.",
                        "passage_text": "읽기 기능은 글의 내용을 해독한다.",
                        "passage_type": "비문학",
                        "linked_question_ids": ["q1", "q3"],
                        "extraction_confidence": 0.9,
                        "warnings": [],
                    }
                ],
                "questions": [
                    {"question_id": "q1", "source_pages": [1], "question_number": "1", "linked_passage_id": "p1", "question_stem": "윗글의 내용과 일치하는 것은?", "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")], "warnings": []},
                    {"question_id": "q3", "source_pages": [1], "question_number": "3", "linked_passage_id": "p1", "question_stem": "[A]를 이해한 내용으로 적절한 것은?", "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")], "warnings": []},
                ],
                "global_warnings": [],
            }
        )

        self.assertIn("passage_range_unlinked_questions:2", document["passage_groups"][0]["warnings"])
        missing = missing_passage_range_questions(document)
        self.assertEqual(missing[0]["missing_numbers"], ["2"])

    def test_passage_range_questions_are_sorted_and_auto_linked(self):
        document = validate_korean_document(
            {
                "document_id": "doc",
                "subject": "korean",
                "source_file": "range.pdf",
                "passage_groups": [
                    {
                        "passage_id": "p1",
                        "source_pages": [1],
                        "passage_instruction": "[1~3] read the passage.",
                        "passage_text": "shared passage",
                        "passage_type": "reading",
                        "linked_question_ids": ["q1", "q3"],
                        "extraction_confidence": 0.9,
                        "warnings": [],
                    }
                ],
                "questions": [
                    {"question_id": "q1", "source_pages": [1], "question_number": "1", "linked_passage_id": "p1", "question_stem": "question one", "choices": [], "warnings": []},
                    {"question_id": "q3", "source_pages": [1], "question_number": "3", "linked_passage_id": "p1", "question_stem": "question three", "choices": [], "warnings": []},
                    {"question_id": "q2", "source_pages": [1], "question_number": "2", "linked_passage_id": None, "question_stem": "question two", "choices": [], "warnings": []},
                ],
                "global_warnings": [],
            }
        )

        self.assertEqual([question["question_number"] for question in document["questions"]], ["1", "2", "3"])
        self.assertEqual(document["questions"][1]["linked_passage_id"], "p1")
        self.assertIn("linked_from_passage_range", document["questions"][1]["warnings"])
        self.assertEqual(document["passage_groups"][0]["linked_question_ids"], ["q1", "q2", "q3"])
        self.assertNotIn("passage_range_unlinked_questions:2", document["passage_groups"][0]["warnings"])

    def test_first_question_embedded_passage_is_split(self):
        document = validate_korean_document(
            {
                "document_id": "doc",
                "subject": "korean",
                "source_file": "reading.pdf",
                "passage_groups": [
                    {
                        "passage_id": "p1",
                        "source_pages": [1],
                        "passage_instruction": None,
                        "passage_title": None,
                        "passage_text": "",
                        "passage_type": "비문학",
                        "linked_question_ids": [],
                        "extraction_confidence": 0.8,
                        "warnings": [],
                    }
                ],
                "questions": [
                    {
                        "question_id": "q1",
                        "source_pages": [1],
                        "question_number": "1",
                        "linked_passage_id": "p1",
                        "question_stem": "윗글의 내용으로 적절한 것은?\n\n[1~2] 다음 글을 읽고 물음에 답하시오.\n첫 번째 문단이다.\n두 번째 문단이다.",
                        "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")],
                        "warnings": [],
                    }
                ],
                "global_warnings": [],
            }
        )

        self.assertEqual(document["questions"][0]["question_stem"], "윗글의 내용으로 적절한 것은?")
        self.assertEqual(document["passage_groups"][0]["passage_instruction"], "[1~2] 다음 글을 읽고 물음에 답하시오.")
        self.assertIn("첫 번째 문단이다.", document["passage_groups"][0]["passage_text"])
        self.assertIn("split_embedded_passage_from_question_stem", document["questions"][0]["warnings"])

    def test_problem_text_excludes_linked_passage(self):
        passage = {
            "passage_instruction": "[1~2] 다음 글을 읽고 물음에 답하시오.",
            "passage_title": "제목",
            "passage_text": "분리되어야 할 지문 본문",
        }
        question = {
            "question_stem": "윗글의 내용으로 적절한 것은?",
            "additional_material": "<보기>\nㄱ. 내용",
            "choices": [choice("①", "A"), choice("②", "B")],
        }

        text = _korean_problem_text(question, passage)

        self.assertIn("윗글의 내용으로 적절한 것은?", text)
        self.assertIn("<보기>", text)
        self.assertIn("① A", text)
        self.assertNotIn("분리되어야 할 지문 본문", text)
        self.assertNotIn("다음 글을 읽고", text)

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

    def test_english_standalone_boxed_passage_stays_inside_question(self):
        document = merge_english_page_payloads(
            "doc",
            "english.pdf",
            [
                {
                    "document_id": "doc",
                    "subject": "english",
                    "source_file": "english.pdf",
                    "passage_groups": [],
                    "questions": [
                        {
                            "question_id": "q18",
                            "source_pages": [8],
                            "question_number": "18",
                            "linked_passage_id": None,
                            "question_stem": (
                                "18. 다음 글의 목적으로 가장 적절한 것은?\n\n"
                                "To All Members of the Hillside Fitness Club\n"
                                "We would like to let you know about an important change regarding our weekend yoga class. "
                                "The instructor originally assigned to lead the session had a personal emergency and will be unavailable. "
                                "To avoid canceling the class altogether, we have arranged for another certified instructor to take her place.\n"
                                "Hillside Fitness Club Management\n"
                                "① 요가 수업을 위한 준비물을 공지하려고\n"
                                "② 요가 수업의 담당 강사 변경을 알리려고\n"
                                "③ 새로운 요가 수업에 가입할 것을 권유하려고\n"
                                "④ 요가 동아리에 가입할 동기를 조사하려고\n"
                                "⑤ 시설 이용 요금 인상을 발표하려고"
                            ),
                            "choices": [],
                            "warnings": [],
                        }
                    ],
                    "global_warnings": [],
                }
            ],
        )

        question = document["questions"][0]
        self.assertFalse(question["question_stem"].startswith("18."))
        self.assertIn("다음 글의 목적으로 가장 적절한 것은?", question["question_stem"])
        self.assertIn("To All Members", question["question_stem"])
        self.assertEqual(question["linked_passage_id"], None)
        self.assertEqual(document["passage_groups"], [])
        self.assertEqual(len(question["choices"]), 5)
        self.assertIn("담당 강사 변경", question["choices"][1]["choice_text"])

    def test_english_underline_markup_survives_merge(self):
        document = merge_english_page_payloads(
            "doc",
            "english.pdf",
            [
                {
                    "document_id": "doc",
                    "subject": "english",
                    "source_file": "english.pdf",
                    "passage_groups": [],
                    "questions": [
                        {
                            "question_id": "q21",
                            "source_pages": [9],
                            "question_number": "21",
                            "linked_passage_id": None,
                            "question_stem": (
                                "21. <u>every door has become a mirror</u> means what?\n\n"
                                "The focus shifted. <u>every door has become a mirror</u> in a world once offered connection."
                            ),
                            "choices": [choice("1)", "<u>online branding</u> creates a false sense of achievement")],
                            "warnings": [],
                        }
                    ],
                    "global_warnings": [],
                }
            ],
        )

        question = document["questions"][0]
        self.assertFalse(question["question_stem"].startswith("21."))
        self.assertIn("<u>every door has become a mirror</u>", question["question_stem"])
        self.assertIn("<u>online branding</u>", question["choices"][0]["choice_text"])

    def test_english_single_question_passage_group_is_inlined(self):
        document = merge_english_page_payloads(
            "doc",
            "english.pdf",
            [
                {
                    "document_id": "doc",
                    "subject": "english",
                    "source_file": "english.pdf",
                    "passage_groups": [
                        {
                            "passage_id": "p18",
                            "source_pages": [8],
                            "passage_text": "To All Members of the Hillside Fitness Club\nWe would like to let you know about a change.",
                            "passage_type": "reading",
                            "linked_question_ids": ["q18"],
                            "extraction_confidence": 0.9,
                            "warnings": [],
                        }
                    ],
                    "questions": [
                        {
                            "question_id": "q18",
                            "source_pages": [8],
                            "question_number": "18",
                            "linked_passage_id": "p18",
                            "question_stem": "다음 글의 목적으로 가장 적절한 것은?",
                            "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")],
                            "warnings": [],
                        }
                    ],
                    "global_warnings": [],
                }
            ],
        )

        self.assertEqual(document["passage_groups"], [])
        self.assertIsNone(document["questions"][0]["linked_passage_id"])
        self.assertIn("To All Members", document["questions"][0]["question_stem"])
        self.assertIn("inlined_standalone_english_passage", document["questions"][0]["warnings"])

    def test_english_range_passage_group_stays_linked(self):
        document = validate_korean_document(
            {
                "document_id": "doc",
                "subject": "english",
                "source_file": "english.pdf",
                "passage_groups": [
                    {
                        "passage_id": "p41",
                        "source_pages": [12],
                        "passage_instruction": "[41~42] 다음 글을 읽고 물음에 답하시오.",
                        "passage_text": "Shared English passage.",
                        "passage_type": "reading",
                        "linked_question_ids": ["q41", "q42"],
                        "extraction_confidence": 0.9,
                        "warnings": [],
                    }
                ],
                "questions": [
                    {
                        "question_id": "q41",
                        "source_pages": [12],
                        "question_number": "41",
                        "linked_passage_id": "p41",
                        "question_stem": "빈칸에 들어갈 말로 가장 적절한 것은?",
                        "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")],
                        "warnings": [],
                    },
                    {
                        "question_id": "q42",
                        "source_pages": [12],
                        "question_number": "42",
                        "linked_passage_id": "p41",
                        "question_stem": "글의 제목으로 가장 적절한 것은?",
                        "choices": [choice("①", "A"), choice("②", "B"), choice("③", "C"), choice("④", "D"), choice("⑤", "E")],
                        "warnings": [],
                    }
                ],
                "global_warnings": [],
            }
        )

        self.assertEqual(len(document["passage_groups"]), 1)
        self.assertEqual(document["questions"][0]["linked_passage_id"], "p41")
        self.assertEqual(document["questions"][1]["linked_passage_id"], "p41")

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
        self.assertEqual(pricing["subject_engine_monthly_delta_krw"], 79000)
        self.assertEqual(pricing["final_monthly_price"], 158000)


if __name__ == "__main__":
    unittest.main()
