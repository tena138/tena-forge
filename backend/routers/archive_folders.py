from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from models import ArchiveFolder, Batch
from schemas import ArchiveFolderCreate, ArchiveFolderRead, ArchiveFolderUpdate
from services.batch_colors import normalize_batch_color
from services.ownership import current_academy_id, current_owner_id, ensure_legacy_archive_claimed_for_request
from services.subject_engines import normalize_subject_engine

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


def _sibling_count(db: Session, owner_id: str, parent_id: UUID | None, subject_engine: str) -> int:
    return int(
        db.scalar(
            select(func.count(ArchiveFolder.id)).where(
                ArchiveFolder.owner_id == owner_id,
                ArchiveFolder.parent_id == parent_id,
                ArchiveFolder.subject_engine == subject_engine,
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


def _normalize_sibling_order(db: Session, owner_id: str, parent_id: UUID | None, subject_engine: str) -> None:
    siblings = db.scalars(
        select(ArchiveFolder)
        .where(ArchiveFolder.owner_id == owner_id, ArchiveFolder.parent_id == parent_id, ArchiveFolder.subject_engine == subject_engine)
        .order_by(ArchiveFolder.order.asc(), ArchiveFolder.created_at.asc(), ArchiveFolder.id.asc())
    ).all()
    for index, folder in enumerate(siblings):
        folder.order = index


def _validate_parent(db: Session, owner_id: str, parent_id: UUID | None, subject_engine: str) -> UUID | None:
    if not parent_id:
        return None
    parent = _owned_folder(db, owner_id, parent_id)
    if normalize_subject_engine(parent.subject_engine) != subject_engine:
        raise HTTPException(status_code=400, detail="다른 과목 엔진의 폴더 아래로 이동할 수 없습니다.")
    return parent.id


@router.get("", response_model=list[ArchiveFolderRead])
def list_archive_folders(request: Request, db: Session = Depends(get_db), subject_engine: str | None = None):
    ensure_legacy_archive_claimed_for_request(request, db)
    owner_id = current_owner_id(request)
    filters = [ArchiveFolder.owner_id == owner_id]
    if subject_engine:
        filters.append(ArchiveFolder.subject_engine == normalize_subject_engine(subject_engine))
    folders = db.scalars(
        select(ArchiveFolder)
        .where(*filters)
        .order_by(ArchiveFolder.subject_engine.asc(), ArchiveFolder.parent_id.is_not(None), ArchiveFolder.parent_id.asc(), ArchiveFolder.order.asc(), ArchiveFolder.created_at.asc())
    ).all()
    return folders


@router.post("", response_model=ArchiveFolderRead)
def create_archive_folder(payload: ArchiveFolderCreate, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    subject_engine = normalize_subject_engine(payload.subject_engine)
    parent_id = _validate_parent(db, owner_id, payload.parent_id, subject_engine)
    order = payload.order if payload.order is not None else _sibling_count(db, owner_id, parent_id, subject_engine)
    folder = ArchiveFolder(
        owner_id=owner_id,
        academy_id=current_academy_id(request),
        subject_engine=subject_engine,
        name=_clean_name(payload.name),
        parent_id=parent_id,
        color=_clean_color(payload.color),
        order=max(int(order or 0), 0),
    )
    db.add(folder)
    db.flush()
    _normalize_sibling_order(db, owner_id, parent_id, subject_engine)
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
        parent_id = _validate_parent(db, owner_id, payload.parent_id, normalize_subject_engine(folder.subject_engine))
        if parent_id == folder.id or _would_create_cycle(db, owner_id, folder.id, parent_id):
            raise HTTPException(status_code=400, detail="폴더를 자기 자신 또는 하위 폴더 안으로 이동할 수 없습니다.")
        folder.parent_id = parent_id
    if "order" in fields:
        folder.order = max(int(payload.order or 0), 0)

    db.flush()
    subject_engine = normalize_subject_engine(folder.subject_engine)
    _normalize_sibling_order(db, owner_id, previous_parent_id, subject_engine)
    _normalize_sibling_order(db, owner_id, folder.parent_id, subject_engine)
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=204)
def delete_archive_folder(folder_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    folder = _owned_folder(db, owner_id, folder_id)
    parent_id = folder.parent_id
    subject_engine = normalize_subject_engine(folder.subject_engine)
    db.query(Batch).filter(Batch.archive_folder_id == folder.id).update(
        {Batch.archive_folder_id: None},
        synchronize_session=False,
    )
    db.query(ArchiveFolder).filter(ArchiveFolder.owner_id == owner_id, ArchiveFolder.parent_id == folder.id).update(
        {ArchiveFolder.parent_id: None},
        synchronize_session=False,
    )
    db.delete(folder)
    _normalize_sibling_order(db, owner_id, parent_id, subject_engine)
    _normalize_sibling_order(db, owner_id, None, subject_engine)
    db.commit()
    return Response(status_code=204)
