from models.schemas import ExtractedItem


def score_quality(items: list[ExtractedItem]) -> dict:
    if not items:
        return {"status": "empty", "average_confidence": 0}
    confidences = [float(item.metadata.get("confidence", 0.5)) for item in items]
    return {"status": "ok", "average_confidence": sum(confidences) / len(confidences), "item_count": len(items)}
