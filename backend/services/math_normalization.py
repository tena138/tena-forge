def normalize_geometry_notation(value: str | None) -> str:
    """Preserve geometry notation exactly as stored.

    Extraction prompts should encode a drawn symbol, such as an overbar over BC,
    as LaTeX. Plain Korean text like "직선 AB" or "선분 BC" must not be inferred
    into a symbol after the fact because that changes the meaning.
    """
    return value or ""
