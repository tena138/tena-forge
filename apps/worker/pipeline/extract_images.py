from pathlib import Path

from models.schemas import SourcePage


def extract_image_pages(path: Path) -> list[SourcePage]:
    if path.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
        return []
    return [SourcePage(page_number=1, text="", image_paths=[str(path)])]
