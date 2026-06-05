from __future__ import annotations

from typing import Any

from services.korean_extraction import merge_korean_page_payloads, normalize_korean_page_payload


ENGLISH_EXTRACTION_PROMPT = r"""You are the English Language beta extraction engine for Tena Forge.

Your task is to extract English exam content with maximum fidelity. Many Korean English exams contain
English passages and Korean instructions, stems, choices, explanations, or grammar labels. Preserve both
English and Korean text exactly as visible.

Return raw JSON array only. The array must contain exactly one object:
[
  {
    "document_id": "<document id supplied by the system>",
    "subject": "english",
    "source_file": "<source file name supplied by the system>",
    "passage_groups": [
      {
        "passage_id": "<stable id unique within this document>",
        "source_pages": [<1-based source page numbers>],
        "passage_instruction": "<visible range/instruction such as '[41~42]' or null>",
        "passage_title": "<visible title or null>",
        "passage_text": "<exact shared passage text as visible>",
        "passage_type": "reading" | "grammar" | "vocabulary" | "listening" | "literature" | "unknown",
        "linked_question_ids": ["<question ids>"],
        "extraction_confidence": <0.0 to 1.0>,
        "warnings": []
      }
    ],
    "questions": [
      {
        "question_id": "<stable id unique within this document>",
        "source_pages": [<1-based source page numbers>],
        "question_number": "<visible question number>",
        "linked_passage_id": "<passage_id or null>",
        "question_stem": "<exact question text>",
        "additional_material": "<보기/additional material text or null>",
        "choices": [
          {"choice_label": "①", "choice_text": "<exact choice text>"}
        ],
        "answer": null,
        "solution": null,
        "extraction_confidence": <0.0 to 1.0>,
        "warnings": []
      }
    ],
    "global_warnings": []
  }
]

Rules:
- Do not rewrite, translate, summarize, normalize, modernize, or correct passage text.
- Preserve English punctuation, capitalization, line breaks, blanks, underlines, bracket labels, and Korean annotations.
- For a standalone numbered reading question with no explicit shared range, do not create a passage_group. Keep the visible order inside question_stem: Korean stem, then the English passage/notice/letter/email/article/dialogue block. Extract the ①②③④⑤ lines into choices.
- Example standalone layout: "18. 다음 글의 목적으로..." followed by a boxed "To All Members..." passage followed by ①②③④⑤ choices. Return one question with linked_passage_id null; question_stem must contain the Korean prompt and the English box text in order; choices must contain the five Korean options.
- For shared range layouts such as [41~42], [43-45], 41~42, or instructions that visibly apply to multiple questions, create one passage_group and link every question in that range.
- Before returning, audit every visible shared range. If the source says [41~42], questions 41 and 42 must both be present and linked to that passage.
- Extract 보기 blocks, underlined phrases, blank options, and grammar/vocabulary tables into additional_material when they are part of a question.
- Extract choices ①②③④⑤ exactly, including choices printed below a long passage box. If the source uses 1) 2) 3) 4) 5), preserve those labels and add a warning.
- If uncertain, add warnings instead of guessing.
- Do not extract answers or solutions from the problem file. Only answer/solution files may fill answer and solution later."""


ENGLISH_SOLUTION_PROMPT = r"""You are extracting answers and explanations for English exam questions.

Return raw JSON array only:
[
  {
    "question_number": "<visible question number>",
    "answer": "<final answer label or text, or null>",
    "solution": "<explanation text exactly as visible, preserving Korean and English, or null>",
    "source_pages": [<1-based source page numbers>],
    "warnings": []
  }
]

Rules:
- Preserve Korean and English explanation text exactly as visible.
- Do not invent answers.
- If only an answer key is visible, fill answer and leave solution null.
- If a question number is unclear, include a warning."""


def normalize_english_page_payload(raw: dict[str, Any], document_id: str, source_file: str, fallback_page: int) -> dict[str, Any]:
    return normalize_korean_page_payload(raw, document_id, source_file, fallback_page, subject="english")


def merge_english_page_payloads(document_id: str, source_file: str, page_payloads: list[dict[str, Any]]) -> dict[str, Any]:
    return merge_korean_page_payloads(document_id, source_file, page_payloads, subject="english")
