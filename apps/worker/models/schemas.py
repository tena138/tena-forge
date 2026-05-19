from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class ExtractedItem(BaseModel):
    item_type: Literal["problem", "explanation", "passage", "solution", "other"] = "problem"
    source_page: int | None = None
    content_text: str = ""
    content_html: str | None = None
    math_latex: str | None = None
    images: list[str] = Field(default_factory=list)
    subject: str | None = None
    unit: str | None = None
    difficulty: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExtractionResult(BaseModel):
    items: list[ExtractedItem] = Field(default_factory=list)


class SourcePage(BaseModel):
    page_number: int
    text: str = ""
    image_paths: list[str] = Field(default_factory=list)


class WorkerSettings(BaseModel):
    supabase_url: str
    supabase_service_role_key: str
    source_bucket: str = "source"
    output_bucket: str = "output"
    ai_provider: str = "openai"
    ai_model: str = "gpt-5.4-mini"
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
