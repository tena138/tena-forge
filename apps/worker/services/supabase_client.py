from functools import lru_cache
from pydantic_settings import BaseSettings
from supabase import create_client, Client


class Settings(BaseSettings):
    next_public_supabase_url: str
    supabase_service_role_key: str
    storage_bucket_source: str = "source"
    storage_bucket_output: str = "output"
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    ai_provider: str = "openai"
    ai_model: str = "gpt-5.4-mini"
    redis_url: str | None = None

    class Config:
        env_file = "../../.env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    return create_client(settings.next_public_supabase_url, settings.supabase_service_role_key)
