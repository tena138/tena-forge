from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from models import ArchiveFolder, Batch
from schemas import ArchiveFolderCreate, ArchiveFolderRead, ArchiveFolderUpdate
from services.batch_colors import normalize_batch_color
from services.ownership import current_academy_id, current_owner_id

router = APIRouter(prefix="/api/archive-folders", tags=["archive-folders"])


def _clean_name(value: str | None) -> str:
    name = " ".join(str(value or "").split()).strip()
    if not name:
        raise HTTPException(status_code=400, detail="폴더 이름을 입력해주세요.")
    return name[:120]


def _clean_color(value: str | None) -> str | None:
    return normalize_batch_color(value) if value else None


def _owned_folder(db: Session, owner_id: str, folder_id: UUID) -> ArchiveFolder:
    folder = db.scalar(select(ArchiveFolder).where(ArchiveFolder.id == folder_id, ArchiveFolder.owner_id == owner_id))
    if not folder:
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")
    return folder


def _sibling_count(db: Session, owner_id: str, parent_id: UUID | None) -> int:
    return int(
        db.scalar(
            select(func.count(ArchiveFolder.id)).where(
                ArchiveFolder.owner_id == owner_id,
                ArchiveFolder.parent_id == parent_id,
            )
        )
        or 0
    )


def _would_create_cycle(db: Session, owner_id: str, folder_id: UUID, parent_id: UUID | None) -> bool:
    current_id = parent_id
    seen: set[UUID] = set()
    while current_id:
        if current_id == folder_id:
            return True
        if current_id in seen:
            return True
        seen.add(current_id)
        current = db.scalar(select(ArchiveFolder).where(ArchiveFolder.id == current_id, ArchiveFolder.owner_id == owner_id))
        current_id = current.parent_id if current else None
    return False


def _normalize_sibling_order(db: Session, owner_id: str, parent_id: UUID | None) -> None:
    siblings = db.scalars(
        select(ArchiveFolder)
        .where(ArchiveFolder.owner_id == owner_id, ArchiveFolder.parent_id == parent_id)
        .order_by(ArchiveFolder.order.asc(), ArchiveFolder.created_at.asc(), ArchiveFolder.id.asc())
    ).all()
    for index, folder in enumerate(siblings):
        folder.order = index


def _validate_parent(db: Session, owner_id: str, parent_id: UUID | None) -> UUID | None:
    if not parent_id:
        return None
    return _owned_folder(db, owner_id, parent_id).id


@router.get("", response_model=list[ArchiveFolderRead])
def list_archive_folders(request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    folders = db.scalars(
        select(ArchiveFolder)
        .where(ArchiveFolder.owner_id == owner_id)
        .order_by(ArchiveFolder.parent_id.is_not(None), ArchiveFolder.parent_id.asc(), ArchiveFolder.order.asc(), ArchiveFolder.created_at.asc())
    ).all()
    return folders


@router.post("", response_model=ArchiveFolderRead)
def create_archive_folder(payload: ArchiveFolderCreate, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    parent_id = _validate_parent(db, owner_id, payload.parent_id)
    order = payload.order if payload.order is not None else _sibling_count(db, owner_id, parent_id)
    folder = ArchiveFolder(
        owner_id=owner_id,
        academy_id=current_academy_id(request),
        name=_clean_name(payload.name),
        parent_id=parent_id,
        color=_clean_color(payload.color),
        order=max(int(order or 0), 0),
    )
    db.add(folder)
    db.flush()
    _normalize_sibling_order(db, owner_id, parent_id)
    db.commit()
    db.refresh(folder)
    return folder


@router.patch("/{folder_id}", response_model=ArchiveFolderRead)
def update_archive_folder(folder_id: UUID, payload: ArchiveFolderUpdate, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    folder = _owned_folder(db, owner_id, folder_id)
    previous_parent_id = folder.parent_id
    fields = payload.model_fields_set

    if "name" in fields:
        folder.name = _clean_name(payload.name)
    if "color" in fields:
        folder.color = _clean_color(payload.color)
    if "parent_id" in fields:
        parent_id = _validate_parent(db, owner_id, payload.parent_id)
        if parent_id == folder.id or _would_create_cycle(db, owner_id, folder.id, parent_id):
            raise HTTPException(status_code=400, detail="폴더를 자기 자신 또는 하위 폴더 안으로 이동할 수 없습니다.")
        folder.parent_id = parent_id
    if "order" in fields:
        folder.order = max(int(payload.order or 0), 0)

    db.flush()
    _normalize_sibling_order(db, owner_id, previous_parent_id)
    _normalize_sibling_order(db, owner_id, folder.parent_id)
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=204)
def delete_archive_folder(folder_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    folder = _owned_folder(db, owner_id, folder_id)
    parent_id = folder.parent_id
    db.query(Batch).filter(Batch.archive_folder_id == folder.id).update(
        {Batch.archive_folder_id: None},
        synchronize_session=False,
    )
    db.query(ArchiveFolder).filter(ArchiveFolder.owner_id == owner_id, ArchiveFolder.parent_id == folder.id).update(
        {ArchiveFolder.parent_id: None},
        synchronize_session=False,
    )
    db.delete(folder)
    _normalize_sibling_order(db, owner_id, parent_id)
    _normalize_sibling_order(db, owner_id, None)
    db.commit()
    return Response(status_code=204)
