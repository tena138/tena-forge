from datetime import datetime
import re
from pathlib import Path
from uuid import uuid4
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from database import get_db, get_settings
from models import Academy, DashboardAnnouncement
from schemas import DashboardAnnouncementCreate, DashboardAnnouncementRead, DashboardAnnouncementUpdate
from services.auth_security import get_current_academy

router = APIRouter(tags=["dashboard-announcements"])

MAX_MEDIA_SIZE = 50 * 1024 * 1024
ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".webm", ".mov"}
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}


def _active_statement():
    now = datetime.utcnow()
    return (
        select(DashboardAnnouncement)
        .where(DashboardAnnouncement.is_active.is_(True))
        .where(or_(DashboardAnnouncement.starts_at.is_(None), DashboardAnnouncement.starts_at <= now))
        .where(or_(DashboardAnnouncement.ends_at.is_(None), DashboardAnnouncement.ends_at >= now))
        .order_by(DashboardAnnouncement.priority.desc(), DashboardAnnouncement.updated_at.desc())
    )


def _is_admin(academy: Academy) -> bool:
    admins = {email.strip().lower() for email in get_settings().admin_emails.split(",") if email.strip()}
    return academy.email.lower() in admins


def _require_admin(academy: Academy = Depends(get_current_academy)) -> Academy:
    if not _is_admin(academy):
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return academy


def _safe_media_name(filename: str) -> str:
    original = Path(filename or "announcement-media").name
    stem = re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", Path(original).stem).strip("._") or "announcement"
    suffix = Path(original).suffix.lower()
    return f"{stem}_{uuid4().hex}{suffix}"


@router.get("/api/dashboard-announcements/active", response_model=DashboardAnnouncementRead | None)
def get_active_dashboard_announcement(db: Session = Depends(get_db)):
    return db.scalars(_active_statement().limit(1)).first()


@router.get("/api/dashboard-announcements/active-list", response_model=list[DashboardAnnouncementRead])
def list_active_dashboard_announcements(
    limit: int = Query(default=5, ge=1, le=12),
    db: Session = Depends(get_db),
):
    return db.scalars(_active_statement().limit(limit)).all()


@router.get("/api/dashboard-announcements/access")
def get_dashboard_announcement_access(academy: Academy = Depends(get_current_academy)):
    return {"can_manage": _is_admin(academy)}


@router.get("/api/admin/dashboard-announcements", response_model=list[DashboardAnnouncementRead])
def list_dashboard_announcements(
    _: Academy = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    return db.scalars(select(DashboardAnnouncement).order_by(DashboardAnnouncement.updated_at.desc())).all()


@router.post("/api/admin/dashboard-announcements/media")
async def upload_dashboard_announcement_media(
    file: UploadFile = File(...),
    _: Academy = Depends(_require_admin),
):
    suffix = Path(file.filename or "").suffix.lower()
    content_type = file.content_type or ""
    if suffix in ALLOWED_IMAGE_SUFFIXES:
        media_type = "image"
        allowed_content_types = ALLOWED_IMAGE_TYPES
        type_error = "PNG, JPG, WebP, GIF 이미지만 업로드할 수 있습니다."
    elif suffix in ALLOWED_VIDEO_SUFFIXES:
        media_type = "video"
        allowed_content_types = ALLOWED_VIDEO_TYPES
        type_error = "MP4, WebM, MOV 영상만 업로드할 수 있습니다."
    else:
        raise HTTPException(status_code=400, detail="이미지(PNG/JPG/WebP/GIF) 또는 짧은 영상(MP4/WebM/MOV)만 업로드할 수 있습니다.")
    if content_type and content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail=type_error)

    data = await file.read()
    if len(data) > MAX_MEDIA_SIZE:
        raise HTTPException(status_code=413, detail="소식 미디어는 50MB 이하만 업로드할 수 있습니다.")

    root = Path(get_settings().uploads_dir) / "announcements"
    root.mkdir(parents=True, exist_ok=True)
    stored_name = _safe_media_name(file.filename or f"announcement{suffix}")
    (root / stored_name).write_bytes(data)
    return {
        "url": f"/static/announcements/{stored_name}",
        "media_type": media_type,
        "filename": Path(file.filename or stored_name).name,
        "content_type": content_type,
        "size": len(data),
    }


@router.post("/api/admin/dashboard-announcements", response_model=DashboardAnnouncementRead)
def create_dashboard_announcement(
    payload: DashboardAnnouncementCreate,
    academy: Academy = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    announcement = DashboardAnnouncement(**payload.model_dump(), created_by=str(academy.id))
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return announcement


@router.patch("/api/admin/dashboard-announcements/{announcement_id}", response_model=DashboardAnnouncementRead)
def update_dashboard_announcement(
    announcement_id: UUID,
    payload: DashboardAnnouncementUpdate,
    _: Academy = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    announcement = db.get(DashboardAnnouncement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="대시보드 소식을 찾을 수 없습니다.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(announcement, key, value)
    announcement.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(announcement)
    return announcement


@router.delete("/api/admin/dashboard-announcements/{announcement_id}", status_code=204)
def delete_dashboard_announcement(
    announcement_id: UUID,
    _: Academy = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    announcement = db.get(DashboardAnnouncement, announcement_id)
    if not announcement:
        raise HTTPException(status_code=404, detail="대시보드 소식을 찾을 수 없습니다.")
    db.delete(announcement)
    db.commit()
