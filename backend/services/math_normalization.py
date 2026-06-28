from __future__ import annotations

import re


SIGMA_LATEX_PATTERN = re.compile(r"(?:\\sum(?![A-Za-z])|\\Sigma(?![A-Za-z])|∑)")


def _uses_sigma_math(latex: str) -> bool:
    return bool(SIGMA_LATEX_PATTERN.search(latex))


def _normalize_sigma_display_delimiters(value: str) -> str:
    """Promote inline sigma/summation math to display math delimiters."""

    output: list[str] = []
    index = 0
    length = len(value)

    while index < length:
        if value.startswith("$$", index):
            end = value.find("$$", index + 2)
            if end == -1:
                output.append(value[index:])
                break
            output.append(value[index : end + 2])
            index = end + 2
            continue

        if value[index] == "$" and (index == 0 or value[index - 1] != "\\"):
            end = index + 1
            while True:
                end = value.find("$", end)
                if end == -1:
                    break
                if value[end - 1] != "\\":
                    break
                end += 1
            if end == -1:
                output.append(value[index])
                index += 1
                continue
            latex = value[index + 1 : end]
            if _uses_sigma_math(latex):
                output.append(f"$${latex.strip()}$$")
            else:
                output.append(value[index : end + 1])
            index = end + 1
            continue

        if value.startswith(r"\(", index):
            end = value.find(r"\)", index + 2)
            if end == -1:
                output.append(value[index:])
                break
            latex = value[index + 2 : end]
            if _uses_sigma_math(latex):
                output.append(f"$${latex.strip()}$$")
            else:
                output.append(value[index : end + 2])
            index = end + 2
            continue

        output.append(value[index])
        index += 1

    return "".join(output)


def normalize_geometry_notation(value: str | None) -> str:
    """Preserve geometry notation while normalizing safe math delimiter rules.

    Extraction prompts should encode a drawn symbol, such as an overbar over BC,
    as LaTeX. Plain Korean text like "직선 AB" or "선분 BC" must not be inferred
    into a symbol after the fact because that changes the meaning.
    """
    if not value:
        return ""
    return _normalize_sigma_display_delimiters(value)
