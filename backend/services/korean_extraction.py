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
- When any visible text is underlined, wrap only the exact underlined characters in <u>...</u> in the appropriate field: passage_text, question_stem, additional_material, or choice_text.
- Preserve reference markers such as ㉠, ㉡, ⓐ, ㄱ, ㄴ, (가), (나), (다), [A], [B].
- Put every shared passage body only in passage_groups[].passage_text.
- Never put passage text, passage instructions, or shared reading text inside question_stem.
- For the first question linked to a passage, question_stem must contain only the question asked about the passage, not the passage itself.
- Extract 보기 blocks such as <보기>, 〈보기〉, [보기], or 보기 into additional_material.
- Extract choices ① ② ③ ④ ⑤ exactly. If the source uses 1) 2) 3) 4) 5), preserve those labels and add a warning.
- Link questions to a passage when the page shows a shared passage range such as [1~3], [1-3], 1~3, or an instruction such as 다음 글을 읽고 물음에 답하시오.
- Before returning, audit every visible passage range. If the source says [1~3], questions 1, 2, and 3 must all be present and linked to that passage. Never skip a middle question in a range.
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
- When any visible text is underlined, wrap only the exact underlined characters in <u>...</u>.
- Do not invent answers.
- If only an answer key is visible, fill answer and leave solution null.
- If a question number is unclear, include a warning."""

PASSAGE_RANGE_RE = re.compile(r"(?:\[|\()?0*(\d{1,3})\s*[~\-∼]\s*0*(\d{1,3})(?:\]|\))?")
PASSAGE_INSTRUCTION_RE = re.compile(r"(?:※\s*)?다음\s+글을\s+읽고\s+물음에\s+답하시오")
QUESTION_NUMBER_RE = re.compile(r"(?m)^\s*0*(\d{1,3})\s*[\.\)]")
STANDARD_CHOICE_RE = re.compile(r"[①②③④⑤]")
FALLBACK_CHOICE_RE = re.compile(r"(?m)^\s*[1-5]\)")
TRAILING_CHOICE_LINE_RE = re.compile(r"(?m)^\s*([①②③④⑤]|[1-5][\).])\s*(.+?)\s*$")
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
LATIN_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’-]*")


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


def _question_number_int(value: Any) -> int | None:
    match = re.search(r"\d+", _text(value))
    return int(match.group(0)) if match else None


def _first_source_page_key(value: Any) -> int:
    pages = _as_page_list(value)
    return pages[0] if pages else 10**9


def _question_sort_key(question: dict[str, Any]) -> tuple[int, int, str, str]:
    number = _question_number_int(question.get("question_number"))
    return (
        _first_source_page_key(question.get("source_pages")),
        number if number is not None else 10**9,
        _text(question.get("question_number")),
        _text(question.get("question_id")),
    )


def _sort_document_questions_and_links(doc: dict[str, Any]) -> dict[str, Any]:
    questions = [question for question in _as_list(doc.get("questions")) if isinstance(question, dict)]
    questions.sort(key=_question_sort_key)
    doc["questions"] = questions

    question_by_id = {
        _text(question.get("question_id")): question
        for question in questions
        if _text(question.get("question_id"))
    }

    passages = [passage for passage in _as_list(doc.get("passage_groups")) if isinstance(passage, dict)]
    passages.sort(key=lambda passage: (_first_source_page_key(passage.get("source_pages")), _text(passage.get("passage_id"))))
    for passage in passages:
        linked_ids = list(dict.fromkeys(_as_str_list(passage.get("linked_question_ids"))))
        linked_ids.sort(key=lambda question_id: _question_sort_key(question_by_id.get(question_id, {"question_id": question_id})))
        passage["linked_question_ids"] = linked_ids
    doc["passage_groups"] = passages
    return doc


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


def _choice_label_index(label: str) -> int | None:
    normalized = label.strip()
    if normalized in "①②③④⑤":
        return "①②③④⑤".index(normalized) + 1
    match = re.search(r"[1-5]", normalized)
    return int(match.group(0)) if match else None


def _extract_trailing_choices_from_text(text: str) -> tuple[str, list[dict[str, str]]]:
    matches = list(TRAILING_CHOICE_LINE_RE.finditer(text or ""))
    if len(matches) < 2:
        return text, []

    first_choice_index = next(
        (
            index
            for index, match in enumerate(matches)
            if _choice_label_index(match.group(1)) == 1
        ),
        None,
    )
    if first_choice_index is None:
        return text, []

    choice_matches = matches[first_choice_index:]
    expected = 1
    choices: list[dict[str, str]] = []
    for match in choice_matches:
        label = match.group(1).strip()
        label_index = _choice_label_index(label)
        if label_index != expected:
            break
        choices.append({"choice_label": label, "choice_text": match.group(2).strip()})
        expected += 1
        if expected > 5:
            break

    if len(choices) < 2:
        return text, []

    first_match = choice_matches[0]
    cleaned = _collapse_blank_lines(text[: first_match.start()])
    return cleaned, choices


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


def _latin_ratio(value: str) -> float:
    letters = re.findall(r"[A-Za-z가-힣]", value)
    if not letters:
        return 0.0
    latin = [letter for letter in letters if re.match(r"[A-Za-z]", letter)]
    return len(latin) / len(letters)


def _looks_like_english_passage(value: str) -> bool:
    text = _text(value)
    if len(text) < 40:
        return False
    latin_words = LATIN_WORD_RE.findall(text)
    return len(latin_words) >= 8 and _latin_ratio(text) >= 0.55


def _split_embedded_english_passage_from_question_stem(stem: str) -> tuple[str, str | None, str] | None:
    text, _choices = _extract_trailing_choices_from_text(_collapse_blank_lines(stem))
    if not text:
        return None
    lines = [line.rstrip() for line in text.splitlines()]
    content_indexes = [index for index, line in enumerate(lines) if line.strip()]
    if len(content_indexes) < 2:
        return None

    passage_start_index = None
    for index in content_indexes[1:]:
        line = lines[index].strip()
        if len(LATIN_WORD_RE.findall(line)) >= 2 or _looks_like_english_passage("\n".join(lines[index:])):
            passage_start_index = index
            break
    if passage_start_index is None:
        return None

    question_text = _collapse_blank_lines("\n".join(lines[:passage_start_index]))
    passage_text = _collapse_blank_lines("\n".join(lines[passage_start_index:]))
    if not _looks_like_question_stem(question_text) or not _looks_like_english_passage(passage_text):
        return None
    return question_text, None, passage_text


def _split_any_embedded_passage_from_question_stem(stem: str, subject: str = "korean") -> tuple[str, str | None, str] | None:
    korean_split = _split_embedded_passage_from_question_stem(stem)
    if korean_split:
        return korean_split
    if subject == "english":
        return None
    return _split_embedded_english_passage_from_question_stem(stem)


def _new_embedded_passage_id(question: dict[str, Any]) -> str:
    number = _question_number_key(question.get("question_number"))
    question_id = re.sub(r"[^A-Za-z0-9_]+", "_", _text(question.get("question_id"))).strip("_")
    if number:
        return f"p_q{number}"
    if question_id:
        return f"p_{question_id}"
    return f"p_{uuid.uuid4().hex[:8]}"


def separate_embedded_passages(document: dict[str, Any]) -> dict[str, Any]:
    doc = deepcopy(document)
    subject = _text(doc.get("subject")).lower() or "korean"
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
        question_warnings = _as_str_list(question.get("warnings"))
        if not _as_list(question.get("choices")):
            question_stem, recovered_choices = _extract_trailing_choices_from_text(str(question.get("question_stem") or ""))
            if recovered_choices:
                question["question_stem"] = question_stem
                question["choices"] = recovered_choices
                question_warnings.append("recovered_choices_from_question_stem")
                question["warnings"] = list(dict.fromkeys(question_warnings))
        linked_passage_id = _text(question.get("linked_passage_id"))
        question_warnings = _as_str_list(question.get("warnings"))
        split = _split_any_embedded_passage_from_question_stem(str(question.get("question_stem") or ""), subject)
        if split and not linked_passage_id:
            question_text, instruction, extracted_passage_text = split
            passage_id = _new_embedded_passage_id(question)
            while passage_id in passages_by_id:
                passage_id = f"p_{uuid.uuid4().hex[:8]}"
            question["question_stem"] = question_text
            question["linked_passage_id"] = passage_id
            linked_passage_id = passage_id
            question_id = _text(question.get("question_id"))
            passage = {
                "passage_id": passage_id,
                "source_pages": _as_page_list(question.get("source_pages")),
                "passage_instruction": instruction,
                "passage_title": None,
                "passage_text": extracted_passage_text,
                "passage_type": "reading" if _looks_like_english_passage(extracted_passage_text) else "unknown",
                "linked_question_ids": [question_id] if question_id else [],
                "extraction_confidence": _confidence(question.get("extraction_confidence")),
                "warnings": ["split_embedded_passage_from_question_stem"],
            }
            passages.append(passage)
            passages_by_id[passage_id] = passage
            question_warnings.append("split_embedded_passage_from_question_stem")
            question["warnings"] = list(dict.fromkeys(question_warnings))
        if not linked_passage_id:
            continue
        passage = passages_by_id.get(linked_passage_id)
        if not passage:
            continue

        stem = str(question.get("question_stem") or "")
        passage_warnings = _as_str_list(passage.get("warnings"))
        passage_text = str(passage.get("passage_text") or "")

        if passage_text and passage_text in stem:
            stem = _remove_once(stem, passage_text)
            stem = _remove_once(stem, passage.get("passage_instruction"))
            stem = _remove_once(stem, passage.get("passage_title"))
            question["question_stem"] = _collapse_blank_lines(stem)
            question_warnings.append("removed_passage_text_from_question_stem")

        split = _split_any_embedded_passage_from_question_stem(str(question.get("question_stem") or ""), subject)
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


def inline_standalone_english_passages(document: dict[str, Any]) -> dict[str, Any]:
    doc = deepcopy(document)
    if _text(doc.get("subject")).lower() != "english":
        return doc

    passages = _as_list(doc.get("passage_groups"))
    questions = _as_list(doc.get("questions"))
    questions_by_id = {
        _text(question.get("question_id")): question
        for question in questions
        if isinstance(question, dict) and _text(question.get("question_id"))
    }
    remaining_passages: list[dict[str, Any]] = []

    for passage in passages:
        if not isinstance(passage, dict):
            continue
        passage_id = _text(passage.get("passage_id"))
        expected_numbers = parse_passage_question_range(
            _text(passage.get("passage_instruction")),
            _text(passage.get("passage_title")),
            str(passage.get("passage_text") or "")[:300],
        )
        linked_questions = [
            question
            for question in questions
            if isinstance(question, dict) and _text(question.get("linked_passage_id")) == passage_id
        ]
        for linked_id in _as_str_list(passage.get("linked_question_ids")):
            question = questions_by_id.get(linked_id)
            if question and question not in linked_questions:
                linked_questions.append(question)

        if expected_numbers or len(linked_questions) != 1:
            remaining_passages.append(passage)
            continue

        question = linked_questions[0]
        parts = [
            str(question.get("question_stem") or "").strip(),
            _text(passage.get("passage_instruction")),
            _text(passage.get("passage_title")),
            str(passage.get("passage_text") or "").strip(),
        ]
        question["question_stem"] = _collapse_blank_lines("\n\n".join(part for part in parts if part))
        question["linked_passage_id"] = None
        warnings = _as_str_list(question.get("warnings"))
        warnings.append("inlined_standalone_english_passage")
        question["warnings"] = list(dict.fromkeys(warnings))

    doc["passage_groups"] = remaining_passages
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
        question_stem = str(question.get("question_stem") or "")
        if not choices:
            question_stem, recovered_choices = _extract_trailing_choices_from_text(question_stem)
            if recovered_choices:
                choices = recovered_choices
                warnings.append("recovered_choices_from_question_stem")
        if choices and any(not STANDARD_CHOICE_RE.fullmatch(choice["choice_label"]) for choice in choices):
            warnings.append("nonstandard_choice_labels")
        questions.append(
            {
                "question_id": question_id,
                "source_pages": _as_page_list(question.get("source_pages"), fallback_page),
                "question_number": question_number,
                "linked_passage_id": _text(question.get("linked_passage_id")) or None,
                "question_stem": question_stem,
                "additional_material": str(question.get("additional_material") or "").strip() or None,
                "choices": choices,
                "answer": _text(question.get("answer")) or None,
                "solution": str(question.get("solution") or "").strip() or None,
                "extraction_confidence": confidence,
                "warnings": list(dict.fromkeys(warnings + detect_korean_warnings(question_stem, confidence))),
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
    doc = inline_standalone_english_passages(doc)
    global_warnings = _as_str_list(doc.get("global_warnings"))
    questions = _as_list(doc.get("questions"))
    passages = _as_list(doc.get("passage_groups"))

    questions_by_id = {
        _text(question.get("question_id")): question
        for question in questions
        if isinstance(question, dict) and _text(question.get("question_id"))
    }
    passages_by_id = {
        _text(passage.get("passage_id")): passage
        for passage in passages
        if isinstance(passage, dict) and _text(passage.get("passage_id"))
    }

    for question in questions:
        if not isinstance(question, dict):
            continue
        choices = _as_list(question.get("choices"))
        if not choices:
            question_stem, recovered_choices = _extract_trailing_choices_from_text(str(question.get("question_stem") or ""))
            if recovered_choices:
                question["question_stem"] = question_stem
                question["choices"] = recovered_choices
                warnings = _as_str_list(question.get("warnings"))
                warnings.append("recovered_choices_from_question_stem")
                question["warnings"] = list(dict.fromkeys(warnings))

    for passage in passages:
        if not isinstance(passage, dict):
            continue
        passage_id = _text(passage.get("passage_id"))
        if not passage_id:
            continue
        linked_ids = _as_str_list(passage.get("linked_question_ids"))
        for linked_question_id in linked_ids:
            question = questions_by_id.get(linked_question_id)
            if question and not _text(question.get("linked_passage_id")):
                question["linked_passage_id"] = passage_id
                warnings = _as_str_list(question.get("warnings"))
                warnings.append("linked_from_passage_group")
                question["warnings"] = list(dict.fromkeys(warnings))

    for question in questions:
        if not isinstance(question, dict):
            continue
        linked_passage_id = _text(question.get("linked_passage_id"))
        question_id = _text(question.get("question_id"))
        passage = passages_by_id.get(linked_passage_id)
        if passage and question_id:
            linked_ids = _as_str_list(passage.get("linked_question_ids"))
            if question_id not in linked_ids:
                linked_ids.append(question_id)
                passage["linked_question_ids"] = linked_ids

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
                if question and not _text(question.get("linked_passage_id")):
                    question["linked_passage_id"] = passage_id
                    question_id = _text(question.get("question_id"))
                    if question_id:
                        linked_ids.add(question_id)
                    linked_passage_ids.add(passage_id)
                    question_warnings = _as_str_list(question.get("warnings"))
                    question_warnings.append("linked_from_passage_range")
                    question["warnings"] = list(dict.fromkeys(question_warnings))
                if not question or (_text(question.get("linked_passage_id")) != passage_id and _text(question.get("question_id")) not in linked_ids):
                    missing.append(number)
            if linked_ids:
                passage["linked_question_ids"] = list(dict.fromkeys([*linked_ids]))
            if missing:
                warnings.append(f"passage_range_unlinked_questions:{','.join(missing)}")
        if passage_id in linked_passage_ids and not passage_text.strip():
            warnings.append("empty_passage_text_linked_by_questions")
        if PASSAGE_LABEL_RE.search(passage_text) and not _as_str_list(passage.get("linked_question_ids")):
            warnings.append("passage_labels_detected_without_question_links")
        passage["warnings"] = list(dict.fromkeys(warnings))

    doc["global_warnings"] = list(dict.fromkeys(global_warnings))
    return _sort_document_questions_and_links(doc)


def missing_passage_range_questions(document: dict[str, Any]) -> list[dict[str, Any]]:
    questions = _as_list(document.get("questions"))
    passages = _as_list(document.get("passage_groups"))
    questions_by_number = {
        _question_number_key(question.get("question_number")): question
        for question in questions
        if isinstance(question, dict) and _question_number_key(question.get("question_number"))
    }
    missing_groups: list[dict[str, Any]] = []

    for passage in passages:
        if not isinstance(passage, dict):
            continue
        passage_id = _text(passage.get("passage_id"))
        expected_numbers = parse_passage_question_range(
            _text(passage.get("passage_instruction")),
            _text(passage.get("passage_title")),
            str(passage.get("passage_text") or "")[:300],
        )
        if not passage_id or not expected_numbers:
            continue
        linked_ids = set(_as_str_list(passage.get("linked_question_ids")))
        missing_numbers: list[str] = []
        for number in expected_numbers:
            question = questions_by_number.get(number)
            if not question or (_text(question.get("linked_passage_id")) != passage_id and _text(question.get("question_id")) not in linked_ids):
                missing_numbers.append(number)
        if missing_numbers:
            missing_groups.append(
                {
                    "passage_id": passage_id,
                    "source_pages": _as_page_list(passage.get("source_pages")),
                    "expected_numbers": expected_numbers,
                    "missing_numbers": missing_numbers,
                    "passage_instruction": passage.get("passage_instruction"),
                    "passage_title": passage.get("passage_title"),
                    "passage_text": passage.get("passage_text"),
                }
            )
    return missing_groups


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
