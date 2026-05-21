from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import Batch, BatchStatus, Problem
from services.matcher import match as match_solutions
from services.ownership import current_owner_id
from services.pipeline import apply_solutions_to_existing_problems, has_solution_content, save_results
from services.storage import save_visual_bytes

router = APIRouter(prefix="/api/local-worker", tags=["local worker"])


class LocalWorkerJob(BaseModel):
    id: UUID
    name: str
    has_solution_pdf: bool
    task_type: str = "full"
    subject_candidates: list[str] = Field(default_factory=list)
    unit_candidates: list[str] = Field(default_factory=list)


class LocalWorkerProgress(BaseModel):
    message: str
    current: int | None = None
    total: int | None = None


class LocalWorkerProblem(BaseModel):
    problem_number: int
    problem_text: str
    has_visual: bool = False
    visual_url: str | None = None
    review_page_image_url: str | None = None
    review_page_number: int | None = None
    answer: str | None = None
    solution_steps: str | None = None
    key_concept: str | None = None
    needs_review: bool = True
    subject: str | None = None
    unit: str | None = None
    visual_bbox: Any | None = None
    page_index: int = 0


class LocalWorkerComplete(BaseModel):
    problems: list[LocalWorkerProblem] = Field(default_factory=list)
    solutions: list[dict[str, Any]] | dict[str, dict[str, Any]] = Field(default_factory=list)


class LocalWorkerFail(BaseModel):
    stage: str | None = None
    reason: str
    hint: str | None = None


def _owned_batch(db: Session, batch_id: UUID, owner_id: str) -> Batch:
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id == owner_id)).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")
    return batch


def _file_response(path_value: str | None, filename: str) -> FileResponse:
    if not path_value:
        raise HTTPException(status_code=404, detail="File not found.")
    path = Path(path_value).resolve()
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path, media_type="application/pdf", filename=filename)


def _set_progress(batch: Batch, payload: LocalWorkerProgress) -> None:
    now = datetime.utcnow()
    batch.progress_message = payload.message
    if payload.current is not None:
        previous = int(batch.progress_current or 0)
        batch.progress_current = max(payload.current, previous)
    if payload.total is not None:
        batch.progress_total = payload.total
    if not batch.progress_started_at:
        batch.progress_started_at = now
    batch.progress_updated_at = now


def _normalize_solutions_payload(payload: LocalWorkerComplete) -> list[dict[str, Any]]:
    if isinstance(payload.solutions, list):
        normalized = []
        for value in payload.solutions:
            if isinstance(value, dict):
                solution = dict(value)
                if solution.get("problem_number"):
                    normalized.append(solution)
        return normalized

    normalized = []
    for key, value in payload.solutions.items():
        solution = dict(value or {})
        solution.setdefault("problem_number", str(key))
        normalized.append(solution)
    return normalized


def _embedded_solutions_from_problems(problems: list[dict[str, Any]]) -> list[dict[str, Any]]:
    solutions: list[dict[str, Any]] = []
    for problem in problems:
        solution = {
            "problem_number": str(problem.get("problem_number") or ""),
            "answer": problem.get("answer"),
            "solution_steps": problem.get("solution_steps"),
            "key_concept": problem.get("key_concept"),
            "page_idx": problem.get("page_index", 0),
        }
        if solution["problem_number"] and has_solution_content(solution):
            solutions.append(solution)
    return solutions


@router.get("/jobs/next", response_model=LocalWorkerJob | None)
def next_job(request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    now = datetime.utcnow()
    batch = db.scalars(
        select(Batch)
        .where(Batch.owner_id == owner_id, Batch.status == BatchStatus.pending, Batch.processing_mode == "local")
        .order_by(Batch.created_at.asc())
        .limit(1)
    ).first()
    if not batch:
        stale_before = now - timedelta(minutes=5)
        batch = db.scalars(
            select(Batch)
            .where(
                Batch.owner_id == owner_id,
                Batch.status == BatchStatus.processing,
                Batch.processing_mode == "local",
                (Batch.progress_updated_at.is_(None) | (Batch.progress_updated_at < stale_before)),
            )
            .order_by(Batch.created_at.asc())
            .limit(1)
        ).first()
    if not batch:
        return None
    batch.status = BatchStatus.processing
    task_type = str(batch.processing_task or "full")
    batch.progress_message = "로컬 워커에서 해설 재처리 시작" if task_type == "solution_only" else "로컬 워커에서 처리 시작"
    batch.progress_current = 0
    batch.progress_total = None
    batch.progress_started_at = now
    batch.progress_updated_at = now
    batch.failure_stage = None
    batch.failure_reason = None
    batch.failure_hint = None
    batch.failed_at = None
    db.commit()
    db.refresh(batch)
    return LocalWorkerJob(
        id=batch.id,
        name=batch.name,
        has_solution_pdf=bool(batch.solution_pdf_filename),
        task_type=task_type,
        subject_candidates=batch.subject_candidates or [],
        unit_candidates=batch.unit_candidates or [],
    )


@router.get("/jobs/{batch_id}/files/problem")
def problem_pdf(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = _owned_batch(db, batch_id, current_owner_id(request))
    return _file_response(batch.problem_pdf_filename, f"{batch.name}_problems.pdf")


@router.get("/jobs/{batch_id}/files/solution")
def solution_pdf(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = _owned_batch(db, batch_id, current_owner_id(request))
    return _file_response(batch.solution_pdf_filename, f"{batch.name}_solutions.pdf")


@router.post("/jobs/{batch_id}/progress")
def update_progress(batch_id: UUID, payload: LocalWorkerProgress, request: Request, db: Session = Depends(get_db)):
    batch = _owned_batch(db, batch_id, current_owner_id(request))
    _set_progress(batch, payload)
    db.commit()
    return {"ok": True}


@router.post("/jobs/{batch_id}/visuals")
async def upload_visual(batch_id: UUID, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    batch = _owned_batch(db, batch_id, current_owner_id(request))
    data = await file.read()
    suffix = Path(file.filename or "image.png").suffix.lower() or ".png"
    filename = f"{batch.id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}{suffix}"
    url = save_visual_bytes(data, filename)
    batch.progress_updated_at = datetime.utcnow()
    db.commit()
    return {"url": url}


@router.post("/jobs/{batch_id}/complete")
def complete_job(batch_id: UUID, payload: LocalWorkerComplete, request: Request, db: Session = Depends(get_db)):
    batch = _owned_batch(db, batch_id, current_owner_id(request))
    problems = [problem.model_dump() for problem in payload.problems]
    solutions = _normalize_solutions_payload(payload)
    if not solutions:
        solutions.extend(_embedded_solutions_from_problems(problems))
    if batch.solution_pdf_filename and not any(has_solution_content(solution) for solution in solutions):
        raise HTTPException(status_code=400, detail="Solution PDF was provided, but no answer or solution content was extracted.")
    if str(batch.processing_task or "full") == "solution_only":
        stats = apply_solutions_to_existing_problems(db, batch, solutions)
        batch.status = BatchStatus.done
        batch.processing_task = "full"
        batch.progress_message = f"해설 재처리 완료: {stats['matched_count']}개 매칭, {stats['unmatched_count']}개 확인 필요"
        batch.progress_current = batch.progress_total or stats["problem_count"] or 1
        batch.progress_total = batch.progress_current
        batch.progress_updated_at = datetime.utcnow()
        batch.failure_stage = None
        batch.failure_reason = None
        batch.failure_hint = None
        batch.failed_at = None
        db.commit()
        return {"ok": True, **stats}
    db.query(Problem).filter(Problem.source_batch_id == batch.id).delete(synchronize_session=False)
    matched_problems = match_solutions(problems, solutions)
    save_results(db, batch, matched_problems)
    batch.status = BatchStatus.done
    batch.processing_task = "full"
    batch.progress_message = "완료"
    batch.progress_current = batch.progress_total or len(problems) or 1
    batch.progress_total = batch.progress_current
    batch.progress_updated_at = datetime.utcnow()
    batch.failure_stage = None
    batch.failure_reason = None
    batch.failure_hint = None
    batch.failed_at = None
    db.commit()
    return {"ok": True, "problem_count": len(problems)}


@router.post("/jobs/{batch_id}/fail")
def fail_job(batch_id: UUID, payload: LocalWorkerFail, request: Request, db: Session = Depends(get_db)):
    batch = _owned_batch(db, batch_id, current_owner_id(request))
    batch.status = BatchStatus.error
    batch.processing_task = "full"
    batch.progress_message = "로컬 워커 처리 실패"
    batch.failure_stage = payload.stage or batch.progress_message
    batch.failure_reason = payload.reason
    batch.failure_hint = payload.hint
    batch.failed_at = datetime.utcnow()
    batch.progress_updated_at = batch.failed_at
    db.commit()
    return {"ok": True}
