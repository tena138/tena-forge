import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.orm import Session

from database import get_db
from models import Batch, BatchStatus, Problem, Tag
from schemas import BatchRead, BatchStatusResponse, BatchUploadResponse, SOURCE_TYPES
from services.batch_jobs import launch_batch_worker
from services.ownership import current_academy_id, current_owner_id
from services.pipeline import get_progress_detail
from services.saas_security import has_cloud_processing
from services.storage import save_upload

router = APIRouter(prefix="/api/batches", tags=["batches"])


def _default_processing_mode() -> str:
    from database import get_settings

    configured = str(get_settings().batch_processing_mode or "local").strip().lower()
    return "cloud" if configured == "cloud" else "local"


def _normalize_processing_mode(raw: str | None) -> str:
    value = str(raw or _default_processing_mode()).strip().lower()
    if value not in {"local", "cloud"}:
        raise HTTPException(status_code=400, detail="지원하지 않는 처리 방식입니다.")
    return value


def _ensure_processing_mode_allowed(db: Session, owner_id: str, processing_mode: str) -> None:
    if processing_mode == "cloud" and not has_cloud_processing(db, owner_id):
        raise HTTPException(status_code=402, detail="클라우드 처리는 Cloud Processing 애드온 또는 상위 플랜에서 사용할 수 있습니다.")


def _should_launch_cloud_worker(processing_mode: str | None) -> bool:
    return _normalize_processing_mode(processing_mode) == "cloud"


def _parse_candidate_list(raw: str | None, max_items: int = 24) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        value = [raw]
    if not isinstance(value, list):
        value = [value]

    candidates: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        candidates.append(text[:120])
        seen.add(text)
        if len(candidates) >= max_items:
            break
    return candidates


@router.post("/upload", response_model=BatchUploadResponse)
def upload_batch(
    request: Request,
    problem_pdf: UploadFile = File(...),
    solution_pdf: UploadFile | None = File(default=None),
    batch_name: str = Form(...),
    source_type: str = Form(...),
    source_label: str | None = Form(default=None),
    rights_confirmed: bool = Form(False),
    rights_note: str | None = Form(default=None),
    subject_candidates: str | None = Form(default=None),
    unit_candidates: str | None = Form(default=None),
    processing_mode: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    if not problem_pdf.filename or not problem_pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="문항 자료는 PDF 파일만 업로드할 수 있습니다.")
    if solution_pdf and solution_pdf.filename and not solution_pdf.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="해설 자료는 PDF 파일만 업로드할 수 있습니다.")
    if source_type not in SOURCE_TYPES:
        raise HTTPException(status_code=400, detail="지원하지 않는 출처 유형입니다.")
    if not rights_confirmed:
        raise HTTPException(status_code=400, detail="자료 업로드 및 아카이빙 권리 확인이 필요합니다.")

    owner_id = current_owner_id(request)
    selected_processing_mode = _normalize_processing_mode(processing_mode)
    _ensure_processing_mode_allowed(db, owner_id, selected_processing_mode)

    problem_path = save_upload(problem_pdf)
    solution_path = save_upload(solution_pdf) if solution_pdf and solution_pdf.filename else None
    batch = Batch(
        name=batch_name,
        problem_pdf_filename=problem_path,
        solution_pdf_filename=solution_path,
        source_type=source_type,
        source_label=source_label,
        rights_confirmed=True,
        rights_confirmed_at=datetime.utcnow(),
        rights_note=rights_note,
        subject_candidates=_parse_candidate_list(subject_candidates),
        unit_candidates=_parse_candidate_list(unit_candidates, max_items=80),
        processing_mode=selected_processing_mode,
        owner_id=owner_id,
        academy_id=current_academy_id(request),
        progress_message="처리 대기 중",
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    if not _should_launch_cloud_worker(batch.processing_mode):
        batch.progress_message = "로컬 워커 대기 중"
        batch.progress_updated_at = datetime.utcnow()
        db.commit()
        return {"batch_id": batch.id, "status": batch.status}

    try:
        launch_batch_worker(batch.id)
    except Exception as exc:
        batch.status = BatchStatus.error
        batch.progress_message = "처리 작업을 시작하지 못했습니다."
        batch.failure_stage = "작업 시작"
        batch.failure_reason = str(exc)
        batch.failure_hint = "서버 실행 환경과 작업 로그 디렉터리 권한을 확인하세요."
        db.commit()
        raise HTTPException(status_code=500, detail="처리 작업을 시작하지 못했습니다.")
    return {"batch_id": batch.id, "status": batch.status}


@router.get("", response_model=list[BatchRead])
def list_batches(request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    tagged_expression = case(
        (
            or_(
                Tag.subject.is_not(None),
                Tag.unit.is_not(None),
                Tag.difficulty.is_not(None),
                Tag.problem_type.is_not(None),
                Tag.source.is_not(None),
            ),
            1,
        ),
        else_=0,
    )
    rows = db.execute(
        select(
            Batch,
            func.count(Problem.id).label("problem_count"),
            func.coalesce(func.sum(case((Problem.needs_review.is_(True), 1), else_=0)), 0).label("review_count"),
            func.coalesce(func.sum(tagged_expression), 0).label("tagged_count"),
        )
        .select_from(Batch)
        .outerjoin(Problem, Problem.source_batch_id == Batch.id)
        .outerjoin(Tag, Tag.problem_id == Problem.id)
        .where(Batch.owner_id == owner_id)
        .group_by(Batch.id)
        .order_by(desc(Batch.created_at))
    ).all()
    result = []
    for batch, problem_count, review_count, tagged_count in rows:
        progress = get_progress_detail(batch)
        result.append(
            BatchRead.model_validate(batch).model_copy(
                update={
                    "problem_count": problem_count,
                    "review_count": review_count,
                    "tagged_count": tagged_count,
                    "untagged_count": max(problem_count - tagged_count, 0),
                    **progress,
                }
            )
        )
    return result


@router.get("/{batch_id}/status", response_model=BatchStatusResponse)
def batch_status(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == current_owner_id(request))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    progress = get_progress_detail(batch)
    return {"batch_id": batch.id, "status": batch.status, **progress}


@router.post("/{batch_id}/retry", response_model=BatchUploadResponse)
def retry_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == owner_id)).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    if batch.status == BatchStatus.processing:
        raise HTTPException(status_code=400, detail="처리 중인 배치는 다시 처리할 수 없습니다.")
    processing_mode = _normalize_processing_mode(batch.processing_mode)
    _ensure_processing_mode_allowed(db, owner_id, processing_mode)

    for problem in list(batch.problems):
        db.delete(problem)
    batch.status = BatchStatus.pending
    batch.processing_mode = processing_mode
    batch.progress_message = "처리 대기 중"
    batch.progress_current = 0
    batch.progress_total = None
    batch.progress_started_at = None
    batch.progress_updated_at = datetime.utcnow()
    batch.failure_stage = None
    batch.failure_reason = None
    batch.failure_hint = None
    batch.failed_at = None
    db.commit()
    db.refresh(batch)

    if not _should_launch_cloud_worker(batch.processing_mode):
        batch.progress_message = "로컬 워커 대기 중"
        batch.progress_updated_at = datetime.utcnow()
        db.commit()
        return {"batch_id": batch.id, "status": batch.status}

    try:
        launch_batch_worker(batch.id)
    except Exception as exc:
        batch.status = BatchStatus.error
        batch.progress_message = "처리 작업을 시작하지 못했습니다."
        batch.failure_stage = "작업 시작"
        batch.failure_reason = str(exc)
        batch.failure_hint = "서버 실행 환경과 작업 로그 디렉터리 권한을 확인하세요."
        db.commit()
        raise HTTPException(status_code=500, detail="처리 작업을 시작하지 못했습니다.")
    return {"batch_id": batch.id, "status": batch.status}


@router.delete("/{batch_id}", status_code=204)
def delete_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == current_owner_id(request))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    db.delete(batch)
    db.commit()
    return Response(status_code=204)
