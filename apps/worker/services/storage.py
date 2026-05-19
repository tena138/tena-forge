from pathlib import Path
from tempfile import NamedTemporaryFile

from .supabase_client import get_settings, get_supabase


def download_source(storage_path: str) -> Path:
    settings = get_settings()
    supabase = get_supabase()
    content = supabase.storage.from_(settings.storage_bucket_source).download(storage_path)
    suffix = Path(storage_path).suffix or ".bin"
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp.write(content)
        return Path(temp.name)


def upload_output(workspace_id: str, filename: str, content: bytes, mime_type: str) -> str:
    settings = get_settings()
    supabase = get_supabase()
    storage_path = f"{workspace_id}/output/{filename}"
    supabase.storage.from_(settings.storage_bucket_output).upload(
        storage_path,
        content,
        {"content-type": mime_type, "upsert": "true"},
    )
    return storage_path
