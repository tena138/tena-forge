import os
import shutil
from pathlib import Path
from uuid import uuid4

import boto3
from fastapi import UploadFile

from database import get_settings


def _safe_name(filename: str) -> str:
    stem = Path(filename).stem.replace(" ", "_")
    suffix = Path(filename).suffix.lower() or ".pdf"
    return f"{stem}_{uuid4().hex}{suffix}"


def save_upload(file: UploadFile, subdir: str = "") -> str:
    settings = get_settings()
    target_dir = Path(settings.uploads_dir) / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = _safe_name(file.filename or "upload.pdf")
    path = target_dir / filename
    with path.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    return str(path)


def save_visual_bytes(data: bytes, filename: str) -> str:
    settings = get_settings()
    key = f"visuals/{filename}"
    if settings.storage_type == "s3":
        client = boto3.client(
            "s3",
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
        )
        client.put_object(Bucket=settings.aws_bucket_name, Key=key, Body=data, ContentType="image/png")
        return f"https://{settings.aws_bucket_name}.s3.amazonaws.com/{key}"

    target = Path(settings.uploads_dir) / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return f"/static/{key.replace(os.sep, '/')}"


def save_logo_upload(file: UploadFile) -> str:
    if not file.filename:
        raise ValueError("missing filename")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg"}:
        raise ValueError("logo must be PNG or JPG")
    return save_upload(file, "logos").replace("\\", "/").replace(str(Path(get_settings().uploads_dir)).replace("\\", "/"), "/static", 1)
