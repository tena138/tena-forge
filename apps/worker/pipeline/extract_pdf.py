from pathlib import Path

from models.schemas import SourcePage


def extract_pdf_pages(path: Path) -> list[SourcePage]:
    if path.suffix.lower() != ".pdf":
        return [SourcePage(page_number=1, text="", image_paths=[])]

    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        pages = []
        for index, page in enumerate(reader.pages, start=1):
            pages.append(SourcePage(page_number=index, text=page.extract_text() or "", image_paths=[]))
        return pages or [SourcePage(page_number=1, text="", image_paths=[])]
    except Exception as exc:
        return [SourcePage(page_number=1, text=f"PDF text extraction failed: {exc}", image_paths=[])]
