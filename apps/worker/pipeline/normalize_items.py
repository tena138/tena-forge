from models.schemas import ExtractedItem, ExtractionResult


def normalize_items(result: ExtractionResult) -> list[ExtractedItem]:
    normalized: list[ExtractedItem] = []
    for item in result.items:
        content_html = item.content_html or f"<p>{item.content_text}</p>"
        normalized.append(item.model_copy(update={"content_html": content_html, "tags": item.tags or []}))
    return normalized
