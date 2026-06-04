from __future__ import annotations

import re
import uuid
from collections import Counter
from copy import deepcopy
from typing import Any


KOREAN_EXTRACTION_PROMPT = r"""You are the Korean Language extraction engine for Tena Forge.

Your task is to extract Korean Language exam content with maximum fidelity.
The passage is the primary unit. A passage can be linked to multiple questions.

Return raw JSON array only. The array must contain exactly one object:
[
  {
    "document_id": "<document id supplied by the system>",
    "subject": "korean",
    "source_file": "<source file name supplied by the system>",
    "passage_groups": [
      {
        "passage_id": "<stable id unique within this document>",
        "source_pages": [<1-based source page numbers>],
        "passage_instruction": "<instruction such as '다음 글을 읽고 물음에 답하시오.' or null>",
        "passage_title": "<visible title or null>",
        "passage_text": "<exact passage text as visible>",
        "passage_type": "문학" | "비문학" | "문법" | "화법과작문" | "언어와매체" | "unknown",
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
        "question_stem": "<exact question stem text>",
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
- Do not rewrite, summarize, normalize, modernize, or correct passage text.
- Preserve line breaks in poems and line-sensitive passages.
- Preserve reference markers such as ㉠, ㉡, ⓐ, ㄱ, ㄴ, (가), (나), (다), [A], [B].
- Put every shared passage body only in passage_groups[].passage_text.
- Never put passage text, passage instructions, or shared reading text inside question_stem.
- For the first question linked to a passage, question_stem must contain only the question asked about the passage, not the passage itself.
- Extract 보기 blocks such as <보기>, 〈보기〉, [보기], or 보기 into additional_material.
- Extract choices ① ② ③ ④ ⑤ exactly. If the source uses 1) 2) 3) 4) 5), preserve those labels and add a warning.
- Link questions to a passage when the page shows a shared passage range such as [1~3], [1-3], 1~3, or an instruction such as 다음 글을 읽고 물음에 답하시오.
- If uncertain, add warnings instead of guessing.
- Do not extract answers or solutions from the problem file. Only answer/solution files may fill answer and solution later."""


KOREAN_SOLUTION_PROMPT = r"""You are extracting answers and explanations for Korean Language exam questions.

Return raw JSON array only:
[
  {
    "question_number": "<visible question number>",
    "answer": "<final answer label or text, or null>",
    "solution": "<explanation text exactly as visible, or null>",
    "source_pages": [<1-based source page numbers>],
    "warnings": []
  }
]

Rules:
- Preserve Korean explanation text as visible.
- Do not invent answers.
- If only an answer key is visible, fill answer and leave solution null.
- If a question number is unclear, include a warning."""


ENGLISH_EXTRACTION_PROMPT = r"""You are the English Language beta extraction engine for Tena Forge.

Your task is to extract English exam content with maximum fidelity. Many Korean English exams contain
English passages and Korean instructions, stems, choices, explanations, or grammar labels. Preserve both
English and Korean text exactly as visible.

The passage is the primary unit. A passage can be linked to multiple questions.

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
        "passage_instruction": "<visible instruction in Korean or English, or null>",
        "passage_title": "<visible title or null>",
        "passage_text": "<exact passage text as visible>",
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
        "question_stem": "<exact question stem text>",
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
- Put every shared passage body only in passage_groups[].passage_text.
- Never put passage text, passage instructions, or shared reading text inside question_stem.
- Extract 보기 blocks, underlined phrases, blank options, and grammar/vocabulary tables into additional_material when they are part of a question.
- Extract choices ①②③④⑤ exactly. If the source uses 1) 2) 3) 4) 5), preserve those labels and add a warning.
- Link questions to a passage when the page shows a shared passage range such as [1~3], [1-3], 1~3, or an instruction that says to read the following passage.
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


PASSAGE_RANGE_RE = re.compile(r"(?:\[|\()?0*(\d{1,3})\s*[~\-∼]\s*0*(\d{1,3})(?:\]|\))?")
PASSAGE_INSTRUCTION_RE = re.compile(r"(?:※\s*)?다음\s+글을\s+읽고\s+물음에\s+답하시오")
QUESTION_NUMBER_RE = re.compile(r"(?m)^\s*0*(\d{1,3})\s*[\.\)]")
STANDARD_CHOICE_RE = re.compile(r"[①②③④⑤]")
FALLBACK_CHOICE_RE = re.compile(r"(?m)^\s*[1-5]\)")
BOGI_RE = re.compile(r"(?:<보기>|〈보기〉|\[보기\]|^\s*보기\s*$)", re.MULTILINE)
PASSAGE_LABEL_RE = re.compile(r"(?:\([가-힣]\)|\[[A-Z]\])")
UPPER_PASSAGE_REF_RE = re.compile(r"윗글|위\s+글|앞\s*글")
OCR_CORRUPTION_RE = re.compile(r"[�□]{2,}|\?{4,}")
PASSAGE_START_LINE_RE = re.compile(
    r"(?m)^\s*(?:"
    r"(?:\[|\()?0*\d{1,3}\s*[~\-∼–—]\s*0*\d{1,3}(?:\]|\))?.*|"
    r"※?\s*다음\s+글을\s+읽고\s+물음에\s+답하시오\.?.*"
    r")\s*$"
)
QUESTION_LIKE_RE = re.compile(
    r"(?:\?|？|고르시오|찾으시오|적절|알맞|옳은|옳지|않은|설명|내용|이해|반응|의미|이유|관계)"
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_str_list(value: Any) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in _as_list(value):
        text = _text(item)
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def _as_page_list(value: Any, fallback_page: int | None = None) -> list[int]:
    pages: list[int] = []
    for item in _as_list(value):
        try:
            page = int(item)
        except (TypeError, ValueError):
            continue
        if page > 0 and page not in pages:
            pages.append(page)
    if not pages and fallback_page:
        pages.append(int(fallback_page))
    return pages


def _confidence(value: Any, fallback: float = 0.75) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return fallback


def _question_number_key(value: Any) -> str:
    match = re.search(r"\d+", _text(value))
    return str(int(match.group(0))) if match else _text(value)


def parse_passage_question_range(*texts: str | None) -> list[str]:
    for text in texts:
        match = PASSAGE_RANGE_RE.search(_text(text))
        if not match:
            continue
        start, end = int(match.group(1)), int(match.group(2))
        if start <= end and end - start <= 80:
            return [str(number) for number in range(start, end + 1)]
    return []


def detect_korean_warnings(text: str, confidence: float) -> list[str]:
    warnings: list[str] = []
    if confidence < 0.6:
        warnings.append("low_ocr_confidence")
    if OCR_CORRUPTION_RE.search(text):
        warnings.append("ocr_corruption_suspected")
    return warnings


def normalize_korean_choice(raw: dict[str, Any]) -> dict[str, str]:
    label = _text(raw.get("choice_label") or raw.get("label"))
    text = _text(raw.get("choice_text") or raw.get("text"))
    return {"choice_label": label, "choice_text": text}


def _collapse_blank_lines(value: str) -> str:
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _remove_once(text: str, needle: Any) -> str:
    target = str(needle or "").strip()
    if not target or target not in text:
        return text
    return text.replace(target, "", 1)


def _looks_like_question_stem(value: str) -> bool:
    text = _text(value)
    return bool(text and len(text) <= 260 and QUESTION_LIKE_RE.search(text))


def _split_embedded_passage_from_question_stem(stem: str) -> tuple[str, str | None, str] | None:
    text = _collapse_blank_lines(stem)
    if not text:
        return None
    match = PASSAGE_START_LINE_RE.search(text)
    if not match or match.start() <= 0:
        return None
    question_text = _collapse_blank_lines(text[: match.start()])
    if not _looks_like_question_stem(question_text):
        return None

    passage_block = _collapse_blank_lines(text[match.start() :])
    lines = [line.rstrip() for line in passage_block.splitlines()]
    first_content_index = next((index for index, line in enumerate(lines) if line.strip()), None)
    if first_content_index is None:
        return None
    instruction = lines[first_content_index].strip()
    body = _collapse_blank_lines("\n".join(lines[first_content_index + 1 :]))
    if len(body) < 12:
        return None
    return question_text, instruction, body


def separate_embedded_passages(document: dict[str, Any]) -> dict[str, Any]:
    doc = deepcopy(document)
    passages = _as_list(doc.get("passage_groups"))
    questions = _as_list(doc.get("questions"))
    passages_by_id = {
        _text(passage.get("passage_id")): passage
        for passage in passages
        if isinstance(passage, dict) and _text(passage.get("passage_id"))
    }

    for question in questions:
        if not isinstance(question, dict):
            continue
        linked_passage_id = _text(question.get("linked_passage_id"))
        if not linked_passage_id:
            continue
        passage = passages_by_id.get(linked_passage_id)
        if not passage:
            continue

        stem = str(question.get("question_stem") or "")
        question_warnings = _as_str_list(question.get("warnings"))
        passage_warnings = _as_str_list(passage.get("warnings"))
        passage_text = str(passage.get("passage_text") or "")

        if passage_text and passage_text in stem:
            stem = _remove_once(stem, passage_text)
            stem = _remove_once(stem, passage.get("passage_instruction"))
            stem = _remove_once(stem, passage.get("passage_title"))
            question["question_stem"] = _collapse_blank_lines(stem)
            question_warnings.append("removed_passage_text_from_question_stem")

        split = _split_embedded_passage_from_question_stem(str(question.get("question_stem") or ""))
        if split:
            question_text, instruction, extracted_passage_text = split
            question["question_stem"] = question_text
            if not _text(passage.get("passage_instruction")) and instruction:
                passage["passage_instruction"] = instruction
            if not _text(passage.get("passage_text")):
                passage["passage_text"] = extracted_passage_text
            elif extracted_passage_text not in str(passage.get("passage_text") or ""):
                passage_warnings.append("question_stem_embedded_passage_conflict")
            linked_ids = _as_str_list(passage.get("linked_question_ids"))
            question_id = _text(question.get("question_id"))
            if question_id and question_id not in linked_ids:
                linked_ids.append(question_id)
            passage["linked_question_ids"] = linked_ids
            question_warnings.append("split_embedded_passage_from_question_stem")

        question["warnings"] = list(dict.fromkeys(question_warnings))
        passage["warnings"] = list(dict.fromkeys(passage_warnings))

    doc["passage_groups"] = passages
    doc["questions"] = questions
    return doc


def normalize_korean_page_payload(raw: dict[str, Any], document_id: str, source_file: str, fallback_page: int, subject: str = "korean") -> dict[str, Any]:
    payload = raw if isinstance(raw, dict) else {}
    passage_groups: list[dict[str, Any]] = []
    questions: list[dict[str, Any]] = []

    for index, passage in enumerate(_as_list(payload.get("passage_groups"))):
        if not isinstance(passage, dict):
            continue
        confidence = _confidence(passage.get("extraction_confidence"))
        passage_id = _text(passage.get("passage_id")) or f"p{fallback_page}_{index + 1}"
        passage_text = str(passage.get("passage_text") or "")
        warnings = _as_str_list(passage.get("warnings"))
        warnings.extend(detect_korean_warnings(passage_text, confidence))
        passage_groups.append(
            {
                "passage_id": passage_id,
                "source_pages": _as_page_list(passage.get("source_pages"), fallback_page),
                "passage_instruction": _text(passage.get("passage_instruction")) or None,
                "passage_title": _text(passage.get("passage_title")) or None,
                "passage_text": passage_text,
                "passage_type": _text(passage.get("passage_type")) or "unknown",
                "linked_question_ids": _as_str_list(passage.get("linked_question_ids")),
                "extraction_confidence": confidence,
                "warnings": list(dict.fromkeys(warnings)),
            }
        )

    for index, question in enumerate(_as_list(payload.get("questions"))):
        if not isinstance(question, dict):
            continue
        confidence = _confidence(question.get("extraction_confidence"))
        question_number = _text(question.get("question_number"))
        question_id = _text(question.get("question_id")) or f"q{question_number or fallback_page}_{index + 1}"
        choices = [normalize_korean_choice(choice) for choice in _as_list(question.get("choices")) if isinstance(choice, dict)]
        warnings = _as_str_list(question.get("warnings"))
        if choices and any(not STANDARD_CHOICE_RE.fullmatch(choice["choice_label"]) for choice in choices):
            warnings.append("nonstandard_choice_labels")
        questions.append(
            {
                "question_id": question_id,
                "source_pages": _as_page_list(question.get("source_pages"), fallback_page),
                "question_number": question_number,
                "linked_passage_id": _text(question.get("linked_passage_id")) or None,
                "question_stem": str(question.get("question_stem") or ""),
                "additional_material": str(question.get("additional_material") or "").strip() or None,
                "choices": choices,
                "answer": _text(question.get("answer")) or None,
                "solution": str(question.get("solution") or "").strip() or None,
                "extraction_confidence": confidence,
                "warnings": list(dict.fromkeys(warnings + detect_korean_warnings(str(question.get("question_stem") or ""), confidence))),
            }
        )

    return {
        "document_id": _text(payload.get("document_id")) or document_id,
        "subject": subject,
        "source_file": _text(payload.get("source_file")) or source_file,
        "passage_groups": passage_groups,
        "questions": questions,
        "global_warnings": _as_str_list(payload.get("global_warnings")),
    }


def merge_korean_page_payloads(document_id: str, source_file: str, page_payloads: list[dict[str, Any]], subject: str = "korean") -> dict[str, Any]:
    document = {
        "document_id": document_id,
        "subject": subject,
        "source_file": source_file,
        "passage_groups": [],
        "questions": [],
        "global_warnings": [],
    }
    passages_by_id: dict[str, dict[str, Any]] = {}
    questions_by_id: dict[str, dict[str, Any]] = {}

    for payload in page_payloads:
        document["global_warnings"].extend(_as_str_list(payload.get("global_warnings")))
        for passage in _as_list(payload.get("passage_groups")):
            passage_id = _text(passage.get("passage_id")) or f"p_{uuid.uuid4().hex[:8]}"
            if passage_id not in passages_by_id:
                passages_by_id[passage_id] = deepcopy(passage)
                passages_by_id[passage_id]["passage_id"] = passage_id
                continue
            target = passages_by_id[passage_id]
            for page in _as_page_list(passage.get("source_pages")):
                if page not in target["source_pages"]:
                    target["source_pages"].append(page)
            if _text(passage.get("passage_text")) and _text(passage.get("passage_text")) != _text(target.get("passage_text")):
                target["warnings"] = list(dict.fromkeys(_as_str_list(target.get("warnings")) + ["duplicate_passage_id_text_conflict"]))
            target["linked_question_ids"] = list(dict.fromkeys(_as_str_list(target.get("linked_question_ids")) + _as_str_list(passage.get("linked_question_ids"))))

        for question in _as_list(payload.get("questions")):
            question_id = _text(question.get("question_id")) or f"q_{uuid.uuid4().hex[:8]}"
            if question_id not in questions_by_id:
                questions_by_id[question_id] = deepcopy(question)
                questions_by_id[question_id]["question_id"] = question_id
                continue
            target = questions_by_id[question_id]
            for page in _as_page_list(question.get("source_pages")):
                if page not in target["source_pages"]:
                    target["source_pages"].append(page)
            if _text(question.get("question_stem")) and _text(question.get("question_stem")) != _text(target.get("question_stem")):
                target["warnings"] = list(dict.fromkeys(_as_str_list(target.get("warnings")) + ["duplicate_question_id_text_conflict"]))

    document["passage_groups"] = list(passages_by_id.values())
    document["questions"] = list(questions_by_id.values())
    return validate_korean_document(document)


def validate_korean_document(document: dict[str, Any]) -> dict[str, Any]:
    doc = separate_embedded_passages(document)
    global_warnings = _as_str_list(doc.get("global_warnings"))
    questions = _as_list(doc.get("questions"))
    passages = _as_list(doc.get("passage_groups"))

    number_counts = Counter(_question_number_key(question.get("question_number")) for question in questions if _question_number_key(question.get("question_number")))
    duplicate_numbers = {number for number, count in number_counts.items() if count > 1}
    if duplicate_numbers:
        global_warnings.append("duplicate_question_numbers")

    questions_by_number = {
        _question_number_key(question.get("question_number")): question
        for question in questions
        if _question_number_key(question.get("question_number"))
    }

    for question in questions:
        warnings = _as_str_list(question.get("warnings"))
        if not _text(question.get("question_id")):
            question["question_id"] = f"q_{uuid.uuid4().hex[:8]}"
            warnings.append("generated_question_id")
        if not _text(question.get("question_number")):
            warnings.append("missing_question_number")
        choices = _as_list(question.get("choices"))
        if choices and len(choices) < 5:
            warnings.append("fewer_than_5_choices")
        if choices and any(not STANDARD_CHOICE_RE.fullmatch(_text(choice.get("choice_label"))) for choice in choices if isinstance(choice, dict)):
            warnings.append("nonstandard_choice_labels")
        if UPPER_PASSAGE_REF_RE.search(_text(question.get("question_stem"))) and not _text(question.get("linked_passage_id")):
            warnings.append("passage_reference_without_link")
        if _question_number_key(question.get("question_number")) in duplicate_numbers:
            warnings.append("duplicate_question_number")
        if BOGI_RE.search(_text(question.get("question_stem"))) and not _text(question.get("additional_material")):
            warnings.append("boge_block_may_be_missing")
        question["warnings"] = list(dict.fromkeys(warnings))

    linked_passage_ids = {_text(question.get("linked_passage_id")) for question in questions if _text(question.get("linked_passage_id"))}
    for passage in passages:
        warnings = _as_str_list(passage.get("warnings"))
        passage_id = _text(passage.get("passage_id"))
        passage_text = str(passage.get("passage_text") or "")
        expected_numbers = parse_passage_question_range(
            _text(passage.get("passage_instruction")),
            _text(passage.get("passage_title")),
            passage_text[:300],
        )
        if expected_numbers:
            missing = []
            linked_ids = set(_as_str_list(passage.get("linked_question_ids")))
            for number in expected_numbers:
                question = questions_by_number.get(number)
                if not question or (_text(question.get("linked_passage_id")) != passage_id and _text(question.get("question_id")) not in linked_ids):
                    missing.append(number)
            if missing:
                warnings.append(f"passage_range_unlinked_questions:{','.join(missing)}")
        if passage_id in linked_passage_ids and not passage_text.strip():
            warnings.append("empty_passage_text_linked_by_questions")
        if PASSAGE_LABEL_RE.search(passage_text) and not _as_str_list(passage.get("linked_question_ids")):
            warnings.append("passage_labels_detected_without_question_links")
        passage["warnings"] = list(dict.fromkeys(warnings))

    doc["global_warnings"] = list(dict.fromkeys(global_warnings))
    return doc


def map_korean_answers(document: dict[str, Any], answer_items: list[dict[str, Any]]) -> dict[str, Any]:
    doc = deepcopy(document)
    by_number: dict[str, dict[str, Any]] = {}
    for item in answer_items:
        number = _question_number_key(item.get("question_number"))
        if number:
            by_number[number] = item
    for question in _as_list(doc.get("questions")):
        number = _question_number_key(question.get("question_number"))
        match = by_number.get(number)
        if not match:
            continue
        answer = _text(match.get("answer"))
        solution = str(match.get("solution") or "").strip()
        if answer:
            question["answer"] = answer
        if solution:
            question["solution"] = solution
    return validate_korean_document(doc)
