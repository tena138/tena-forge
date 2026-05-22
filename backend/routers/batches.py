import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.orm import Session

from database import get_db
from limiter import limiter
from models import Batch, BatchStatus, Problem, Tag
from schemas import BatchRead, BatchStatusResponse, BatchUploadResponse, SOURCE_TYPES
from services.batch_jobs import schedule_next_batch
from services.ownership import current_academy_id, current_owner_id
from services.pipeline import get_progress_detail
from services.storage import save_upload

router = APIRouter(prefix="/api/batches", tags=["batches"])


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


def _tagged_expression():
    return case(
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


def _batch_read(
    db: Session,
    batch: Batch,
    problem_count: int | None = None,
    review_count: int | None = None,
    tagged_count: int | None = None,
) -> BatchRead:
    tagged_expression = _tagged_expression()
    if problem_count is None:
        problem_count = db.scalar(select(func.count(Problem.id)).where(Problem.source_batch_id == batch.id)) or 0
    if review_count is None:
        review_count = db.scalar(
            select(func.count(Problem.id)).where(
                Problem.source_batch_id == batch.id,
                Problem.needs_review.is_(True),
            )
        ) or 0
    if tagged_count is None:
        tagged_count = db.scalar(
            select(func.coalesce(func.sum(tagged_expression), 0))
            .select_from(Problem)
            .outerjoin(Tag, Tag.problem_id == Problem.id)
            .where(Problem.source_batch_id == batch.id)
        ) or 0
    problem_count = int(problem_count or 0)
    review_count = int(review_count or 0)
    tagged_count = int(tagged_count or 0)
    progress = get_progress_detail(batch)
    return BatchRead.model_validate(
        {
            "id": batch.id,
            "name": batch.name or "아카이빙 배치",
            "problem_pdf_filename": batch.problem_pdf_filename or "",
            "solution_pdf_filename": batch.solution_pdf_filename,
            "status": batch.status or BatchStatus.pending,
            "source_type": batch.source_type or "self_created",
            "source_label": batch.source_label,
            "rights_confirmed": bool(batch.rights_confirmed),
            "rights_note": batch.rights_note,
            "subject_candidates": batch.subject_candidates,
            "unit_candidates": batch.unit_candidates,
            "processing_task": batch.processing_task or "full",
            "created_at": batch.created_at,
            "problem_count": problem_count,
            "review_count": review_count,
            "tagged_count": tagged_count,
            "untagged_count": max(problem_count - tagged_count, 0),
            **progress,
        }
    )


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
        processing_task="full",
        owner_id=owner_id,
        academy_id=current_academy_id(request),
        progress_message="처리 대기 중",
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    try:
        schedule_next_batch()
    except Exception as exc:
        batch.status = BatchStatus.error
        batch.progress_message = "처리 작업을 시작하지 못했습니다."
        batch.failure_stage = "작업 시작"
        batch.failure_reason = str(exc)
        batch.failure_hint = "서버 실행 환경과 작업 로그 디렉터리 권한을 확인하세요."
        db.commit()
        raise HTTPException(status_code=500, detail="처리 작업을 시작하지 못했습니다.")
    db.refresh(batch)
    return {"batch_id": batch.id, "status": batch.status}


@router.get("", response_model=list[BatchRead])
@limiter.exempt
def list_batches(request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    tagged_expression = _tagged_expression()
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
        result.append(_batch_read(db, batch, problem_count, review_count, tagged_count))
    return result


@router.get("/{batch_id}", response_model=BatchRead)
@limiter.exempt
def get_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == current_owner_id(request))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    return _batch_read(db, batch)


@router.get("/{batch_id}/status", response_model=BatchStatusResponse)
@limiter.exempt
def batch_status(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == current_owner_id(request))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    progress = get_progress_detail(batch)
    raw_status = batch.status.value if isinstance(batch.status, BatchStatus) else str(batch.status or BatchStatus.pending.value)
    status = BatchStatus(raw_status) if raw_status in {item.value for item in BatchStatus} else BatchStatus.pending
    return {
        "batch_id": batch.id,
        "status": status,
        "processing_task": batch.processing_task or "full",
        **progress,
    }


@router.post("/{batch_id}/retry", response_model=BatchUploadResponse)
def retry_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == owner_id)).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    if batch.status == BatchStatus.processing:
        raise HTTPException(status_code=400, detail="처리 중인 배치는 다시 처리할 수 없습니다.")
    for problem in list(batch.problems):
        db.delete(problem)
    batch.status = BatchStatus.pending
    batch.processing_task = "full"
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

    try:
        schedule_next_batch()
    except Exception as exc:
        batch.status = BatchStatus.error
        batch.progress_message = "처리 작업을 시작하지 못했습니다."
        batch.failure_stage = "작업 시작"
        batch.failure_reason = str(exc)
        batch.failure_hint = "서버 실행 환경과 작업 로그 디렉터리 권한을 확인하세요."
        db.commit()
        raise HTTPException(status_code=500, detail="처리 작업을 시작하지 못했습니다.")
    db.refresh(batch)
    return {"batch_id": batch.id, "status": batch.status}


@router.post("/{batch_id}/reprocess-solutions", response_model=BatchUploadResponse)
def reprocess_batch_solutions(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == owner_id)).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    if batch.status == BatchStatus.processing:
        raise HTTPException(status_code=400, detail="처리 중인 배치는 해설만 재처리할 수 없습니다.")
    if not batch.solution_pdf_filename:
        raise HTTPException(status_code=400, detail="해설 PDF가 있는 배치만 해설 재처리할 수 있습니다.")
    problem_count = db.scalar(
        select(func.count(Problem.id)).where(
            Problem.source_batch_id == batch.id,
            Problem.owner_id == owner_id,
            Problem.deleted_at.is_(None),
        )
    ) or 0
    if problem_count <= 0:
        raise HTTPException(status_code=400, detail="기존 문항이 있어야 해설만 재처리할 수 있습니다.")

    batch.status = BatchStatus.pending
    batch.processing_task = "solution_only"
    batch.progress_message = "해설 재처리 대기 중"
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

    try:
        schedule_next_batch()
    except Exception as exc:
        batch.status = BatchStatus.error
        batch.processing_task = "full"
        batch.progress_message = "해설 재처리 작업을 시작하지 못했습니다."
        batch.failure_stage = "해설 재처리 시작"
        batch.failure_reason = str(exc)
        batch.failure_hint = "서버 실행 환경과 작업 로그 디렉터리 권한을 확인하세요."
        batch.failed_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=500, detail="해설 재처리 작업을 시작하지 못했습니다.")
    db.refresh(batch)
    return {"batch_id": batch.id, "status": batch.status}


@router.post("/{batch_id}/review-needed", response_model=BatchRead)
def mark_batch_review_needed(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == owner_id)).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    db.query(Problem).filter(
        Problem.source_batch_id == batch.id,
        Problem.owner_id == owner_id,
        Problem.deleted_at.is_(None),
    ).update({Problem.needs_review: True}, synchronize_session=False)
    batch.progress_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(batch)
    return _batch_read(db, batch)


@router.delete("/{batch_id}", status_code=204)
def delete_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == current_owner_id(request))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    db.delete(batch)
    db.commit()
    return Response(status_code=204)
