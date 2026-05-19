import json
import httpx

from models.schemas import ExtractionResult, SourcePage
from .supabase_client import get_settings


SYSTEM_PROMPT = """You extract Korean education content faithfully.
Return JSON only with this shape:
{"items":[{"item_type":"problem","source_page":1,"content_text":"","content_html":"","math_latex":"","images":[],"subject":"","unit":"","difficulty":null,"tags":[],"metadata":{"confidence":0.0,"notes":""}}]}
Do not hallucinate answers or choices. Keep uncertain fields empty and lower confidence."""


async def extract_with_ai(pages: list[SourcePage]) -> ExtractionResult:
    settings = get_settings()
    joined = "\n\n".join(f"[page {page.page_number}]\n{page.text}" for page in pages if page.text)
    if not settings.openai_api_key or not joined.strip():
        return heuristic_extract(pages)

    payload = {
        "model": settings.ai_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": joined[:80_000]},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            f"{settings.openai_base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json=payload,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return ExtractionResult.model_validate(json.loads(content))


def heuristic_extract(pages: list[SourcePage]) -> ExtractionResult:
    items = []
    for page in pages:
        text = page.text.strip() or "Image-based page. Configure OCR/AI to extract detailed content."
        items.append({
            "item_type": "problem",
            "source_page": page.page_number,
            "content_text": text,
            "content_html": f"<p>{text}</p>",
            "images": page.image_paths,
            "tags": [],
            "metadata": {"confidence": 0.25, "notes": "Heuristic fallback without AI provider."},
        })
    return ExtractionResult.model_validate({"items": items})
