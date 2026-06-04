import json
import os
import shutil
import traceback
from datetime import datetime
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.orm import Session

from database import get_db, get_settings
from limiter import limiter
from models import Batch, BatchStatus, KoreanExtractionDocument, KoreanPassageGroup, KoreanQuestion, Problem, Tag
from schemas import (
    BatchRead,
    BatchStatusResponse,
    BatchUploadResponse,
    KoreanExtractionRead,
    KoreanPassageGroupRead,
    KoreanPassageReviewUpdate,
    KoreanPassageUpdate,
    KoreanReviewItemsRead,
    ProblemListItem,
    SOURCE_TYPES,
)
from services.batch_jobs import mark_stale_processing_batches, schedule_next_batch
from services.batch_colors import batch_color_for_seed, normalize_batch_color
from services.ownership import current_academy_id, current_owner_id, current_owner_ids
from services.pipeline import CANCEL_FAILURE_STAGE, count_pdf_pages, get_progress_detail
from services.private_files import sign_static_url
from services.saas_security import ensure_subject_engine_access
from services.storage import save_upload
from services.subject_engines import infer_subject_engine_from_subjects, normalize_subject_engine
from services.subject_inference import infer_subject_candidates_from_text
from services.usage_cost_policy import enforce_extraction_preflight, estimate_extraction, record_usage_event

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


def _safe_unlink(path: str | None) -> None:
    if not path:
        return
    try:
        target = Path(path)
        if target.exists() and target.is_file():
            target.unlink()
    except OSError:
        pass


def _file_size_mb(path: str | None) -> float:
    if not path:
        return 0.0
    try:
        return os.path.getsize(path) / (1024 * 1024)
    except OSError:
        return 0.0


def _clear_batch_artifacts(batch_id: UUID) -> None:
    root = Path(get_settings().uploads_dir).resolve()
    target = (root / "batch_artifacts" / str(batch_id)).resolve()
    if root not in target.parents:
        return
    if target.exists() and target.is_dir():
        shutil.rmtree(target, ignore_errors=True)


def _clear_batch_outputs(db: Session, batch: Batch) -> None:
    for problem in list(batch.problems):
        db.delete(problem)
    for document in db.scalars(select(KoreanExtractionDocument).where(KoreanExtractionDocument.batch_id == batch.id)).all():
        db.delete(document)
    _clear_batch_artifacts(batch.id)


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


def _first_source_page(value: list | None) -> int:
    if not value:
        return 10**9
    try:
        return int(value[0])
    except (TypeError, ValueError):
        return 10**9


def _serialize_problem_list_item(problem: Problem, batch: Batch):
    owner_id = str(problem.owner_id or "")
    item = ProblemListItem.model_validate(problem)
    return item.model_copy(
        update={
            "visual_url": sign_static_url(item.visual_url, owner_id),
            "review_page_image_url": sign_static_url(item.review_page_image_url, owner_id),
            "batch_name": batch.name,
            "batch_accent_color": normalize_batch_color(batch.accent_color) or batch_color_for_seed(batch.id or batch.name),
        }
    )


def _korean_review_counts(db: Session, batch: Batch, problem_count: int, review_count: int) -> tuple[int, int]:
    if (batch.subject_engine or "math") != "korean":
        return problem_count, review_count
    document = db.scalar(select(KoreanExtractionDocument).where(KoreanExtractionDocument.batch_id == batch.id))
    if not document:
        return problem_count, review_count
    passage_count = db.scalar(select(func.count(KoreanPassageGroup.id)).where(KoreanPassageGroup.document_id == document.id)) or 0
    passage_review_count = db.scalar(
        select(func.count(KoreanPassageGroup.id)).where(
            KoreanPassageGroup.document_id == document.id,
            KoreanPassageGroup.needs_review.is_(True),
        )
    ) or 0
    return problem_count + int(passage_count or 0), review_count + int(passage_review_count or 0)


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
    review_item_count, pending_review_item_count = _korean_review_counts(db, batch, problem_count, review_count)
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
            "accent_color": normalize_batch_color(batch.accent_color) or batch_color_for_seed(batch.id or batch.name),
            "subject_candidates": batch.subject_candidates,
            "unit_candidates": batch.unit_candidates,
            "subject_engine": batch.subject_engine or "math",
            "processing_task": batch.processing_task or "full",
            "created_at": batch.created_at,
            "problem_count": problem_count,
            "review_count": review_count,
            "review_item_count": review_item_count,
            "pending_review_item_count": pending_review_item_count,
            "tagged_count": tagged_count,
            "untagged_count": max(problem_count - tagged_count, 0),
            **progress,
        }
    )


def _batch_status_payload(batch: Batch) -> dict:
    progress = get_progress_detail(batch)
    raw_status = batch.status.value if isinstance(batch.status, BatchStatus) else str(batch.status or BatchStatus.pending.value)
    status = BatchStatus(raw_status) if raw_status in {item.value for item in BatchStatus} else BatchStatus.pending
    return {
        "batch_id": batch.id,
        "status": status,
        "processing_task": batch.processing_task or "full",
        **progress,
    }


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
    accent_color: str | None = Form(default=None),
    subject_candidates: str | None = Form(default=None),
    unit_candidates: str | None = Form(default=None),
    subject_engine: str | None = Form(default=None),
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
    parsed_subject_candidates = _parse_candidate_list(subject_candidates)
    if not parsed_subject_candidates:
        parsed_subject_candidates = infer_subject_candidates_from_text(problem_pdf.filename, batch_name)
    engine = normalize_subject_engine(subject_engine or infer_subject_engine_from_subjects(parsed_subject_candidates))
    ensure_subject_engine_access(db, owner_id, engine)
    problem_path = save_upload(problem_pdf)
    solution_path = save_upload(solution_pdf) if solution_pdf and solution_pdf.filename else None
    try:
        problem_pages = count_pdf_pages(problem_path)
        solution_pages = count_pdf_pages(solution_path) if solution_path else 0
    except Exception as exc:
        _safe_unlink(problem_path)
        _safe_unlink(solution_path)
        raise HTTPException(status_code=400, detail=f"PDF 페이지 수를 확인하지 못했습니다: {exc}")
    total_pages = problem_pages + solution_pages
    total_upload_mb = _file_size_mb(problem_path) + _file_size_mb(solution_path)
    estimate = estimate_extraction(
        subject_engine=engine,
        problem_pages=problem_pages,
        solution_pages=solution_pages,
        problem_file_mb=_file_size_mb(problem_path),
        solution_file_mb=_file_size_mb(solution_path),
    )
    try:
        enforce_extraction_preflight(db, owner_id, estimate, file_size_mb=total_upload_mb, page_count=total_pages)
    except HTTPException:
        _safe_unlink(problem_path)
        _safe_unlink(solution_path)
        raise
    except Exception:
        _safe_unlink(problem_path)
        _safe_unlink(solution_path)
        raise
    batch = Batch(
        name=batch_name,
        problem_pdf_filename=problem_path,
        solution_pdf_filename=solution_path,
        source_type=source_type,
        source_label=source_label,
        rights_confirmed=True,
        rights_confirmed_at=datetime.utcnow(),
        rights_note=rights_note,
        accent_color=normalize_batch_color(accent_color) or batch_color_for_seed(batch_name),
        subject_candidates=parsed_subject_candidates,
        unit_candidates=_parse_candidate_list(unit_candidates, max_items=80),
        subject_engine=engine,
        processing_task="full",
        owner_id=owner_id,
        academy_id=current_academy_id(request),
        progress_message="처리 대기 중",
    )
    db.add(batch)
    db.flush()
    record_usage_event(db, owner_id, estimate, job_id=batch.id, storage_mb=total_upload_mb)
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
    if mark_stale_processing_batches(db):
        db.commit()
        try:
            schedule_next_batch()
        except Exception:
            traceback.print_exc()
        db.expire_all()
    owner_ids = current_owner_ids(request, db)
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
        .where(Batch.owner_id.in_(owner_ids))
        .group_by(Batch.id)
        .order_by(desc(Batch.created_at))
    ).all()
    result = []
    for batch, problem_count, review_count, tagged_count in rows:
        result.append(_batch_read(db, batch, problem_count, review_count, tagged_count))
    return result


@router.get("/active", response_model=BatchStatusResponse | None)
@limiter.exempt
def active_batch_status(request: Request, db: Session = Depends(get_db)):
    owner_ids = current_owner_ids(request, db)
    if mark_stale_processing_batches(db):
        db.commit()
    try:
        schedule_next_batch()
    except Exception:
        traceback.print_exc()
    db.expire_all()

    batch = db.scalars(
        select(Batch)
        .where(Batch.owner_id.in_(owner_ids), Batch.status == BatchStatus.processing)
        .order_by(desc(Batch.progress_updated_at), desc(Batch.created_at), desc(Batch.id))
        .limit(1)
    ).first()
    if not batch:
        batch = db.scalars(
            select(Batch)
            .where(Batch.owner_id.in_(owner_ids), Batch.status == BatchStatus.pending)
            .order_by(Batch.created_at.asc(), Batch.id.asc())
            .limit(1)
        ).first()
    if not batch:
        return None
    return _batch_status_payload(batch)


@router.get("/{batch_id}", response_model=BatchRead)
@limiter.exempt
def get_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(current_owner_ids(request, db)))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    return _batch_read(db, batch)


@router.get("/{batch_id}/korean", response_model=KoreanExtractionRead)
@limiter.exempt
def get_korean_extraction(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(current_owner_ids(request, db)))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")
    document = db.scalar(select(KoreanExtractionDocument).where(KoreanExtractionDocument.batch_id == batch.id))
    if not document:
        raise HTTPException(status_code=404, detail="Korean extraction result not found.")
    payload = dict(document.payload or {})
    payload.setdefault("document_id", document.document_id)
    payload.setdefault("subject", document.subject)
    payload.setdefault("source_file", document.source_file)
    payload.setdefault("global_warnings", document.global_warnings or [])
    return KoreanExtractionRead.model_validate(payload)


def _owned_batch_or_404(batch_id: UUID, request: Request, db: Session) -> Batch:
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(current_owner_ids(request, db)))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")
    return batch


def _korean_document_or_404(db: Session, batch: Batch) -> KoreanExtractionDocument:
    document = db.scalar(select(KoreanExtractionDocument).where(KoreanExtractionDocument.batch_id == batch.id))
    if not document:
        raise HTTPException(status_code=404, detail="Korean extraction result not found.")
    return document


def _korean_question_number(value: str | None) -> int | None:
    if not value:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def _passage_payload(passage: KoreanPassageGroup) -> dict:
    return {
        "id": passage.id,
        "passage_id": passage.passage_id,
        "source_pages": passage.source_pages or [],
        "passage_instruction": passage.passage_instruction,
        "passage_title": passage.passage_title,
        "passage_text": passage.passage_text or "",
        "passage_type": passage.passage_type or "unknown",
        "linked_question_ids": passage.linked_question_ids or [],
        "extraction_confidence": float(passage.extraction_confidence or 0),
        "warnings": passage.warnings or [],
        "needs_review": bool(passage.needs_review),
    }


@router.get("/{batch_id}/korean/review-items", response_model=KoreanReviewItemsRead)
@limiter.exempt
def get_korean_review_items(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = _owned_batch_or_404(batch_id, request, db)
    document = _korean_document_or_404(db, batch)
    passages = db.scalars(select(KoreanPassageGroup).where(KoreanPassageGroup.document_id == document.id)).all()
    questions = db.scalars(select(KoreanQuestion).where(KoreanQuestion.document_id == document.id)).all()
    problems = db.scalars(
        select(Problem)
        .where(Problem.source_batch_id == batch.id, Problem.deleted_at.is_(None))
        .order_by(Problem.review_page_number.asc(), Problem.problem_number.asc(), Problem.created_at.asc(), Problem.id.asc())
    ).all()

    problem_by_number = {problem.problem_number: problem for problem in problems}
    problem_by_question_id: dict[str, Problem] = {}
    for question in questions:
        number = _korean_question_number(question.question_number)
        if number is not None and number in problem_by_number:
            problem_by_question_id[str(question.question_id)] = problem_by_number[number]

    questions_by_passage: dict[str, list[KoreanQuestion]] = {}
    standalone_questions: list[KoreanQuestion] = []
    for question in questions:
        if question.linked_passage_id:
            questions_by_passage.setdefault(str(question.linked_passage_id), []).append(question)
        else:
            standalone_questions.append(question)

    for grouped in questions_by_passage.values():
        grouped.sort(key=lambda item: (_korean_question_number(item.question_number) or 10**9, item.question_id))
    standalone_questions.sort(key=lambda item: (_first_source_page(item.source_pages), _korean_question_number(item.question_number) or 10**9, item.question_id))

    emitted_problem_ids: set[UUID] = set()
    items: list[dict] = []
    sorted_passages = sorted(passages, key=lambda item: (_first_source_page(item.source_pages), item.passage_id))
    for passage in sorted_passages:
        linked_questions = questions_by_passage.get(str(passage.passage_id), [])
        linked_payloads = []
        first_problem = None
        for question in linked_questions:
            problem = problem_by_question_id.get(str(question.question_id))
            if first_problem is None and problem is not None:
                first_problem = problem
            linked_payloads.append(
                {
                    "question_id": str(question.question_id),
                    "problem_id": problem.id if problem else None,
                    "question_number": question.question_number,
                    "problem_number": problem.problem_number if problem else None,
                    "needs_review": bool(problem.needs_review) if problem else True,
                    "source_pages": question.source_pages or [],
                }
            )
        first_page = _first_source_page(passage.source_pages)
        if first_page == 10**9:
            first_page = first_problem.review_page_number if first_problem else None
        review_url = sign_static_url(first_problem.review_page_image_url, str(first_problem.owner_id or "")) if first_problem else None
        items.append(
            {
                "item_type": "passage",
                "id": passage.id,
                "passage_id": passage.passage_id,
                "source_pages": passage.source_pages or [],
                "passage_instruction": passage.passage_instruction,
                "passage_title": passage.passage_title,
                "passage_text": passage.passage_text or "",
                "passage_type": passage.passage_type or "unknown",
                "linked_questions": linked_payloads,
                "review_page_image_url": review_url,
                "review_page_number": first_page,
                "needs_review": bool(passage.needs_review),
            }
        )
        for question in linked_questions:
            problem = problem_by_question_id.get(str(question.question_id))
            if not problem:
                continue
            emitted_problem_ids.add(problem.id)
            items.append(
                {
                    "item_type": "question",
                    "id": problem.id,
                    "linked_passage_id": question.linked_passage_id,
                    "question_id": question.question_id,
                    "problem": _serialize_problem_list_item(problem, batch),
                }
            )

    for question in standalone_questions:
        problem = problem_by_question_id.get(str(question.question_id))
        if not problem or problem.id in emitted_problem_ids:
            continue
        emitted_problem_ids.add(problem.id)
        items.append(
            {
                "item_type": "question",
                "id": problem.id,
                "linked_passage_id": question.linked_passage_id,
                "question_id": question.question_id,
                "problem": _serialize_problem_list_item(problem, batch),
            }
        )

    orphan_problems = [problem for problem in problems if problem.id not in emitted_problem_ids]
    for problem in orphan_problems:
        items.append(
            {
                "item_type": "question",
                "id": problem.id,
                "linked_passage_id": None,
                "question_id": None,
                "problem": _serialize_problem_list_item(problem, batch),
            }
        )

    pending_review_item_count = sum(1 for item in items if item.get("needs_review") or (item.get("problem") and item["problem"].needs_review))
    return {
        "batch_id": batch.id,
        "review_item_count": len(items),
        "pending_review_item_count": pending_review_item_count,
        "items": items,
    }


@router.patch("/{batch_id}/korean/passages/{passage_id}/review", response_model=KoreanPassageGroupRead)
def update_korean_passage_review(batch_id: UUID, passage_id: UUID, payload: KoreanPassageReviewUpdate, request: Request, db: Session = Depends(get_db)):
    batch = _owned_batch_or_404(batch_id, request, db)
    document = _korean_document_or_404(db, batch)
    passage = db.scalar(select(KoreanPassageGroup).where(KoreanPassageGroup.id == passage_id, KoreanPassageGroup.document_id == document.id))
    if not passage:
        raise HTTPException(status_code=404, detail="Korean passage not found.")
    passage.needs_review = payload.needs_review
    db.commit()
    db.refresh(passage)
    return KoreanPassageGroupRead.model_validate(_passage_payload(passage))


@router.patch("/{batch_id}/korean/passages/{passage_id}", response_model=KoreanPassageGroupRead)
def update_korean_passage(batch_id: UUID, passage_id: UUID, payload: KoreanPassageUpdate, request: Request, db: Session = Depends(get_db)):
    batch = _owned_batch_or_404(batch_id, request, db)
    document = _korean_document_or_404(db, batch)
    passage = db.scalar(select(KoreanPassageGroup).where(KoreanPassageGroup.id == passage_id, KoreanPassageGroup.document_id == document.id))
    if not passage:
        raise HTTPException(status_code=404, detail="Korean passage not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "passage_text" in changes and not str(changes.get("passage_text") or "").strip():
        raise HTTPException(status_code=400, detail="Passage text cannot be empty.")
    for field, value in changes.items():
        if field in {"passage_instruction", "passage_title", "passage_text", "passage_type"}:
            setattr(passage, field, value)
    passage.needs_review = True
    db.commit()
    db.refresh(passage)
    return KoreanPassageGroupRead.model_validate(_passage_payload(passage))


@router.get("/{batch_id}/status", response_model=BatchStatusResponse)
@limiter.exempt
def batch_status(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(current_owner_ids(request, db)))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    if mark_stale_processing_batches(db, batch_id=batch.id):
        db.commit()
        try:
            schedule_next_batch()
        except Exception:
            traceback.print_exc()
        db.refresh(batch)
    raw_status = batch.status.value if isinstance(batch.status, BatchStatus) else str(batch.status or BatchStatus.pending.value)
    status = BatchStatus(raw_status) if raw_status in {item.value for item in BatchStatus} else BatchStatus.pending
    if status == BatchStatus.pending:
        try:
            schedule_next_batch()
            db.refresh(batch)
            raw_status = batch.status.value if isinstance(batch.status, BatchStatus) else str(batch.status or BatchStatus.pending.value)
            status = BatchStatus(raw_status) if raw_status in {item.value for item in BatchStatus} else BatchStatus.pending
        except Exception:
            traceback.print_exc()
    return _batch_status_payload(batch)


@router.post("/{batch_id}/retry", response_model=BatchUploadResponse)
def retry_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(current_owner_ids(request, db)))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    if batch.status == BatchStatus.processing:
        raise HTTPException(status_code=400, detail="처리 중인 배치는 다시 처리할 수 없습니다.")
    problem_pages = count_pdf_pages(batch.problem_pdf_filename)
    solution_pages = count_pdf_pages(batch.solution_pdf_filename) if batch.solution_pdf_filename else 0
    total_upload_mb = _file_size_mb(batch.problem_pdf_filename) + _file_size_mb(batch.solution_pdf_filename)
    estimate = estimate_extraction(
        subject_engine=batch.subject_engine or "math",
        problem_pages=problem_pages,
        solution_pages=solution_pages,
        problem_file_mb=_file_size_mb(batch.problem_pdf_filename),
        solution_file_mb=_file_size_mb(batch.solution_pdf_filename),
        usage_type="batch_retry_estimate",
    )
    enforce_extraction_preflight(db, owner_id, estimate, file_size_mb=total_upload_mb, page_count=problem_pages + solution_pages, upload_mb_to_add=0)
    _clear_batch_outputs(db, batch)
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
    record_usage_event(db, owner_id, estimate, job_id=batch.id)
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


@router.post("/{batch_id}/cancel", response_model=BatchRead)
def cancel_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(current_owner_ids(request, db)))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    if batch.status not in {BatchStatus.pending, BatchStatus.processing}:
        return _batch_read(db, batch)

    _clear_batch_outputs(db, batch)
    now = datetime.utcnow()
    batch.status = BatchStatus.error
    batch.processing_task = batch.processing_task or "full"
    batch.progress_message = "사용자 요청으로 중단했습니다."
    batch.progress_current = 0
    batch.progress_total = None
    batch.progress_updated_at = now
    batch.failure_stage = CANCEL_FAILURE_STAGE
    batch.failure_reason = "사용자가 배치 추출을 중단했습니다."
    batch.failure_hint = "재처리를 누르면 기존 캐시 없이 처음부터 다시 추출합니다."
    batch.failed_at = now
    db.commit()
    db.refresh(batch)
    try:
        schedule_next_batch()
    except Exception:
        traceback.print_exc()
    return _batch_read(db, batch)


@router.post("/{batch_id}/reprocess-solutions", response_model=BatchUploadResponse)
def reprocess_batch_solutions(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    owner_ids = current_owner_ids(request, db)
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(owner_ids))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    if batch.status == BatchStatus.processing:
        raise HTTPException(status_code=400, detail="처리 중인 배치는 해설만 재처리할 수 없습니다.")
    if not batch.solution_pdf_filename:
        raise HTTPException(status_code=400, detail="해설 PDF가 있는 배치만 해설 재처리할 수 있습니다.")
    problem_count = db.scalar(
        select(func.count(Problem.id)).where(
            Problem.source_batch_id == batch.id,
            Problem.owner_id.in_(owner_ids),
            Problem.deleted_at.is_(None),
        )
    ) or 0
    if problem_count <= 0:
        raise HTTPException(status_code=400, detail="기존 문항이 있어야 해설만 재처리할 수 있습니다.")

    solution_pages = count_pdf_pages(batch.solution_pdf_filename)
    solution_file_mb = _file_size_mb(batch.solution_pdf_filename)
    estimate = estimate_extraction(
        subject_engine=batch.subject_engine or "math",
        problem_pages=0,
        solution_pages=solution_pages,
        solution_file_mb=solution_file_mb,
        usage_type="solution_reprocess_estimate",
    )
    enforce_extraction_preflight(db, owner_id, estimate, file_size_mb=solution_file_mb, page_count=solution_pages, upload_mb_to_add=0)

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
    record_usage_event(db, owner_id, estimate, job_id=batch.id)
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
    owner_ids = current_owner_ids(request, db)
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(owner_ids))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    db.query(Problem).filter(
        Problem.source_batch_id == batch.id,
        Problem.owner_id.in_(owner_ids),
        Problem.deleted_at.is_(None),
    ).update({Problem.needs_review: True}, synchronize_session=False)
    batch.progress_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(batch)
    return _batch_read(db, batch)


@router.delete("/{batch_id}", status_code=204)
def delete_batch(batch_id: UUID, request: Request, db: Session = Depends(get_db)):
    batch = db.scalars(select(Batch).where(Batch.id == batch_id, Batch.owner_id.in_(current_owner_ids(request, db)))).first()
    if not batch:
        raise HTTPException(status_code=404, detail="배치를 찾을 수 없습니다.")
    _clear_batch_artifacts(batch.id)
    db.delete(batch)
    db.commit()
    return Response(status_code=204)
