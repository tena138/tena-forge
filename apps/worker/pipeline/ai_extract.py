from models.schemas import ExtractionResult, SourcePage
from services.ai_client import extract_with_ai


async def run_ai_extraction(pages: list[SourcePage]) -> ExtractionResult:
    return await extract_with_ai(pages)
