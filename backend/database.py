import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Settings(BaseSettings):
    database_url: str = "postgresql://user:password@localhost:5432/tenaforge"
    openai_api_key: str = ""
    storage_type: str = "local"
    uploads_dir: str = "uploads"
    aws_bucket_name: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    cors_origin: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3001"
    public_api_url: str = ""
    portone_store_id: str = ""
    portone_channel_key: str = ""
    portone_channel_key_inicis: str = ""
    portone_channel_key_nice: str = ""
    portone_billing_channel_key_inicis: str = ""
    portone_general_channel_key_inicis: str = ""
    portone_billing_channel_key_toss: str = ""
    portone_general_channel_key_toss: str = ""
    portone_api_secret: str = ""
    portone_webhook_secret: str = ""
    portone_primary_pg_provider: str = "inicis"
    portone_billing_key_method: str = "CARD"
    portone_easy_pay_provider: str = ""
    portone_easy_pay_available_methods: str = ""
    portone_is_test_channel: bool = False
    secret_key: str = "dev-secret-key-change-me-dev-secret-key-change-me-dev-secret-key-change-me-64"
    refresh_secret_key: str = "dev-refresh-secret-change-me-dev-refresh-secret-change-me-dev-refresh-secret-64"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    algorithm: str = "HS256"
    google_client_id: str = ""
    google_client_secret: str = ""
    kakao_client_id: str = ""
    kakao_client_secret: str = ""
    naver_client_id: str = ""
    naver_client_secret: str = ""
    redis_url: str = ""
    redis_password: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "noreply@tenaforge.com"
    email_from_name: str = "Tena Forge"
    encryption_key: str = ""
    refresh_cookie_name: str = "refresh_token"
    refresh_cookie_secure: bool = False
    refresh_cookie_samesite: str = "strict"
    admin_emails: str = "admin@tenaforge.com,admin@tena.local"
    ai_model: str = "gpt-5.4-mini"
    ai_model_pool: str = "gpt-5.4-mini,gpt-5-mini"
    ai_solution_model_pool: str = "gpt-5.4-mini,gpt-5-mini"
    ai_reextract_model: str = "gpt-5.4-mini"
    ai_image_detail: str = "high"
    ai_requests_per_minute: int = 20
    ai_concurrent_requests: int = 8
    ai_request_max_retries: int = 12
    ai_request_max_sleep_seconds: int = 300
    ai_request_timeout_seconds: int = 180
    ai_progress_heartbeat_seconds: int = 15
    ai_max_output_tokens: int = 4096
    ai_extraction_passes: int = 1
    ai_solution_mode: str = "full"
    ai_solution_max_output_tokens: int = 8192
    ai_solution_image_detail: str = "high"
    ai_image_format: str = "jpeg"
    ai_image_jpeg_quality: int = 82
    pdf_render_dpi: int = 180
    pdf_solution_render_dpi: int = 180
    pdf_large_file_dpi: int = 160

    class Config:
        env_file = (".env", str(Path(__file__).resolve().parents[1] / ".env"))
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    os.makedirs(settings.uploads_dir, exist_ok=True)
    os.makedirs(os.path.join(settings.uploads_dir, "visuals"), exist_ok=True)
    return settings


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
