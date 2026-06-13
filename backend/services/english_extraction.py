from __future__ import annotations

import re
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
- When any visible text is underlined, wrap only the exact underlined characters in <u>...</u> in the appropriate field: passage_text, question_stem, additional_material, or choice_text.
- Preserve vocabulary notes, footnotes, glossary/reference words, and starred definitions printed with a passage, such as "* tenet: 원칙" or "** consensus: 합의". For standalone reading questions, keep these lines in the visible order after the passage and before choices, either inside question_stem or additional_material; for shared passage ranges, keep them with the passage_group passage_text. Never drop starred glossary lines.
- For a standalone numbered reading question with no explicit shared range, do not create a passage_group. Keep the visible order inside question_stem: Korean stem, then the English passage/notice/letter/email/article/dialogue block. Extract the ①②③④⑤ lines into choices.
- Do not include the visible problem number in question_stem. Store it only in question_number. For example, question_stem starts with "다음 글의 목적으로..." rather than "18. 다음 글의 목적으로...".
- Example standalone layout: "18. 다음 글의 목적으로..." followed by a boxed "To All Members..." passage followed by ①②③④⑤ choices. Return one question with linked_passage_id null; question_stem must contain the Korean prompt and the English box text in order; choices must contain the five Korean options.
- For shared range layouts such as [41~42], [43-45], 41~42, or instructions that visibly apply to multiple questions, create one passage_group and link every question in that range.
- Before returning, audit every visible shared range. If the source says [41~42], questions 41 and 42 must both be present and linked to that passage.
- Extract 보기 blocks, underlined phrases, blank options, and grammar/vocabulary tables into additional_material when they are part of a question.
- Extract choices ①②③④⑤ exactly, including choices printed below a long passage box. If the source uses 1) 2) 3) 4) 5), preserve those labels and add a warning.
- If uncertain, add warnings instead of guessing.
- Do not extract answers from the problem file. Only answer files may fill answer later. Keep solution null."""


ENGLISH_SOLUTION_PROMPT = r"""You are extracting answers for English exam questions.

Return raw JSON array only:
[
  {
    "question_number": "<visible question number>",
    "answer": "<final answer choice label/number, or null>",
    "solution": null,
    "source_pages": [<1-based source page numbers>],
    "warnings": []
  }
]

Rules:
- For objective questions, keep the visible choice label or number as the answer.
- When any visible text is underlined, wrap only the exact underlined characters in <u>...</u>.
- Do not invent answers.
- Do not transcribe, summarize, or return explanations. Always leave solution null.
- If a question number is unclear, include a warning."""


def strip_english_question_number_prefix(text: Any, question_number: Any) -> str:
    value = str(text or "").lstrip()
    number_match = re.search(r"\d+", str(question_number or ""))
    if not value or not number_match:
        return value
    number = re.escape(str(int(number_match.group(0))))
    return re.sub(rf"^(?:문항\s*)?#?\s*0*{number}\s*(?:번|[\.\):：])\s*", "", value, count=1).lstrip()


def _strip_question_number_prefixes(document: dict[str, Any]) -> dict[str, Any]:
    for question in document.get("questions") or []:
        if not isinstance(question, dict):
            continue
        question["question_stem"] = strip_english_question_number_prefix(
            question.get("question_stem"),
            question.get("question_number"),
        )
    return document


def normalize_english_page_payload(raw: dict[str, Any], document_id: str, source_file: str, fallback_page: int) -> dict[str, Any]:
    return _strip_question_number_prefixes(normalize_korean_page_payload(raw, document_id, source_file, fallback_page, subject="english"))


def merge_english_page_payloads(document_id: str, source_file: str, page_payloads: list[dict[str, Any]]) -> dict[str, Any]:
    return _strip_question_number_prefixes(merge_korean_page_payloads(document_id, source_file, page_payloads, subject="english"))
