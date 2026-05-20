import mimetypes
import secrets
import time
from pathlib import Path

from fastapi import HTTPException
from jose import JWTError, jwt

from database import get_settings


PRIVATE_FILE_TOKEN_TYPE = "private_static_file"
DEFAULT_EXPIRES_SECONDS = 60 * 60


def static_relative_path(url_or_path: str | None) -> str | None:
    if not url_or_path:
        return None
    value = str(url_or_path).split("?", 1)[0].replace("\\", "/")
    if value.startswith("/static/"):
        value = value.removeprefix("/static/")
    value = value.lstrip("/")
    parts = [part for part in value.split("/") if part and part not in {".", ".."}]
    if not parts or "/".join(parts) != value:
        return None
    return "/".join(parts)


def static_file_path(relative_path: str) -> Path:
    settings = get_settings()
    normalized = static_relative_path(relative_path)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid file path.")
    uploads_root = Path(settings.uploads_dir).resolve()
    path = uploads_root.joinpath(*normalized.split("/")).resolve()
    if uploads_root not in path.parents and path != uploads_root:
        raise HTTPException(status_code=400, detail="Invalid file path.")
    return path


def sign_static_url(url: str | None, owner_id: str | None, expires_seconds: int = DEFAULT_EXPIRES_SECONDS) -> str | None:
    relative_path = static_relative_path(url)
    if not relative_path:
        return url
    settings = get_settings()
    now = int(time.time())
    payload = {
        "type": PRIVATE_FILE_TOKEN_TYPE,
        "path": relative_path,
        "owner_id": str(owner_id or ""),
        "iat": now,
        "exp": now + max(60, expires_seconds),
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return f"/static/{relative_path}?token={token}"


def verify_static_file_token(relative_path: str, token: str | None) -> dict:
    if not token:
        raise HTTPException(status_code=403, detail="File access token is required.")
    settings = get_settings()
    normalized = static_relative_path(relative_path)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid file path.")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=403, detail="Invalid or expired file access token.") from exc
    if payload.get("type") != PRIVATE_FILE_TOKEN_TYPE:
        raise HTTPException(status_code=403, detail="Invalid file access token.")
    if not secrets.compare_digest(str(payload.get("path") or ""), normalized):
        raise HTTPException(status_code=403, detail="File access token does not match this file.")
    return payload


def guess_media_type(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"
