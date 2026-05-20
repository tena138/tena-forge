import json
import mimetypes
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database import get_settings
from services.ownership import current_owner_id
from services.private_files import sign_static_url

router = APIRouter(prefix="/api/assets", tags=["assets"])

MAX_SIZE = 10 * 1024 * 1024
ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
ALLOWED_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
}


class AssetRead(BaseModel):
    id: str
    url: str
    filename: str
    size: int
    type: str
    content_type: str
    created_at: str


class AssetRename(BaseModel):
    filename: str


def _safe_owner_id(owner_id: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]+", "_", owner_id).strip("_") or "local_user"


def _asset_root(owner_id: str) -> Path:
    root = Path(get_settings().uploads_dir) / "assets" / _safe_owner_id(owner_id)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _index_path(owner_id: str) -> Path:
    return _asset_root(owner_id) / ".assets.json"


def _read_index(owner_id: str) -> list[dict]:
    path = _index_path(owner_id)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def _write_index(owner_id: str, items: list[dict]) -> None:
    _index_path(owner_id).write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_original_name(filename: str) -> str:
    original = Path(filename or "image").name
    stem = Path(original).stem.strip() or "image"
    suffix = Path(original).suffix.lower()
    stem = re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", stem).strip("._") or "image"
    return f"{stem}{suffix}"


def _stored_name(filename: str) -> str:
    safe = _safe_original_name(filename)
    return f"{Path(safe).stem}_{uuid4().hex}{Path(safe).suffix.lower()}"


def _asset_url(owner_id: str, stored_name: str) -> str:
    return f"/static/assets/{_safe_owner_id(owner_id)}/{stored_name}"


def _asset_type(filename: str) -> str:
    stem = Path(filename).stem.lower()
    if "logo" in stem or "로고" in stem:
        return "logo"
    return "image"


def _normalize_item(owner_id: str, item: dict) -> dict:
    root = _asset_root(owner_id)
    path = root / item.get("stored_name", "")
    if not path.exists():
        return {}
    size = path.stat().st_size
    content_type = item.get("content_type") or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return {
        "id": item["id"],
        "url": sign_static_url(_asset_url(owner_id, path.name), owner_id),
        "filename": item.get("filename") or path.name,
        "size": size,
        "type": item.get("type") or _asset_type(item.get("filename") or path.name),
        "content_type": content_type,
        "created_at": item.get("created_at") or datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
        "stored_name": path.name,
    }


def _public(owner_id: str, item: dict) -> AssetRead:
    normalized = _normalize_item(owner_id, item)
    if not normalized:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return AssetRead(**{key: normalized[key] for key in AssetRead.model_fields})


@router.get("", response_model=list[AssetRead])
def list_assets(request: Request):
    owner_id = current_owner_id(request)
    items = [_normalize_item(owner_id, item) for item in _read_index(owner_id)]
    valid = [item for item in items if item]
    if len(valid) != len(items):
        _write_index(owner_id, valid)
    return [AssetRead(**{key: item[key] for key in AssetRead.model_fields}) for item in sorted(valid, key=lambda item: item["created_at"], reverse=True)]


@router.post("", response_model=AssetRead)
async def upload_asset(request: Request, file: UploadFile):
    owner_id = current_owner_id(request)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="PNG, JPG, JPEG, WebP, SVG 파일만 업로드할 수 있습니다.")
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="지원하지 않는 이미지 형식입니다.")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="파일은 10MB 이하만 업로드할 수 있습니다.")

    root = _asset_root(owner_id)
    stored_name = _stored_name(file.filename or f"image{suffix}")
    path = root / stored_name
    path.write_bytes(data)

    item = {
        "id": uuid4().hex,
        "stored_name": stored_name,
        "filename": _safe_original_name(file.filename or stored_name),
        "size": len(data),
        "type": _asset_type(file.filename or stored_name),
        "content_type": file.content_type or mimetypes.guess_type(stored_name)[0] or "application/octet-stream",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    items = [item, *_read_index(owner_id)]
    _write_index(owner_id, items)
    return _public(owner_id, item)


@router.patch("/{asset_id}", response_model=AssetRead)
def rename_asset(asset_id: str, payload: AssetRename, request: Request):
    owner_id = current_owner_id(request)
    next_name = _safe_original_name(payload.filename)
    if not next_name:
        raise HTTPException(status_code=400, detail="파일명을 입력해 주세요.")
    items = _read_index(owner_id)
    for item in items:
        if item.get("id") == asset_id:
            item["filename"] = next_name
            item["type"] = _asset_type(next_name)
            _write_index(owner_id, items)
            return _public(owner_id, item)
    raise HTTPException(status_code=404, detail="Asset not found.")


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: str, request: Request):
    owner_id = current_owner_id(request)
    items = _read_index(owner_id)
    root = _asset_root(owner_id).resolve()
    next_items = []
    removed = None
    for item in items:
        if item.get("id") == asset_id:
            removed = item
            continue
        next_items.append(item)
    if not removed:
        raise HTTPException(status_code=404, detail="Asset not found.")
    path = (root / removed.get("stored_name", "")).resolve()
    if path.exists() and (root == path.parent or root in path.parents):
        path.unlink()
    _write_index(owner_id, next_items)


@router.get("/{asset_id}/download")
def download_asset(asset_id: str, request: Request):
    owner_id = current_owner_id(request)
    for item in _read_index(owner_id):
        if item.get("id") == asset_id:
            normalized = _normalize_item(owner_id, item)
            if not normalized:
                break
            path = _asset_root(owner_id) / normalized["stored_name"]
            return FileResponse(path, media_type=normalized["content_type"], filename=normalized["filename"])
    raise HTTPException(status_code=404, detail="Asset not found.")
