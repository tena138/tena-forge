import base64
import math
import io
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from openai import OpenAI
from PIL import Image, ImageChops
from pydantic import BaseModel, Field
from sqlalchemy import String, and_, cast, delete as sa_delete, distinct, func, or_, select
from sqlalchemy.orm import Session, joinedload

from database import get_db, get_settings
from models import Batch, Problem, ProblemSet, ProblemSetItem, Tag
from schemas import FacetsResponse, Paginated, ProblemListItem, ProblemNavigation, ProblemRead, ProblemStats, ProblemUpdate, ReviewUpdate, TagBase, TagRead, VisualCropUpdate
from services.math_normalization import normalize_geometry_notation
from services.batch_colors import batch_color_for_seed, normalize_batch_color
from services.ownership import current_owner_id, current_owner_ids
from services.pipeline import strip_answer_choices, vision_json
from services.private_files import sign_static_url
from services.storage import save_visual_bytes
from services.usage_cost_policy import enforce_extraction_preflight, estimate_single_reextract, record_usage_event

router = APIRouter(prefix="/api/problems", tags=["problems"])


class BulkProblemDeleteRequest(BaseModel):
    problem_ids: list[UUID] = Field(min_length=1, max_length=500)


class BulkProblemDeleteResponse(BaseModel):
    deleted_count: int


def _trim_visual_whitespace(image: Image.Image, padding: int = 16, threshold: int = 18) -> Image.Image:
    """Tighten manual visual crops while preserving a small readable margin."""
    if image.width < 20 or image.height < 20:
        return image.copy()

    rgb = image.convert("RGB")
    corners = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((rgb.width - 1, 0)),
        rgb.getpixel((0, rgb.height - 1)),
        rgb.getpixel((rgb.width - 1, rgb.height - 1)),
    ]
    background = max(corners, key=lambda color: color[0] + color[1] + color[2])
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, background)).convert("L")
    mask = diff.point(lambda value: 255 if value > threshold else 0)
    bbox = mask.getbbox()
    if not bbox:
        return image.copy()

    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    if right - left < 5 or bottom - top < 5:
        return image.copy()
    return image.crop((left, top, right, bottom))


def _problem_source_order():
    return (
        Batch.created_at.desc(),
        Problem.source_batch_id.asc(),
        Problem.review_page_number.is_(None).asc(),
        Problem.review_page_number.asc(),
        Problem.problem_number.asc(),
        Problem.created_at.asc(),
        Problem.id.asc(),
    )


def _problem_order(sort: str | None):
    value = (sort or "source_order").strip()
    if value == "newest":
        return (Problem.created_at.desc(), Problem.id.asc())
    if value == "oldest":
        return (Problem.created_at.asc(), Problem.id.asc())
    if value == "number_asc":
        return (Problem.problem_number.asc(), Problem.created_at.asc(), Problem.id.asc())
    if value == "number_desc":
        return (Problem.problem_number.desc(), Problem.created_at.desc(), Problem.id.asc())
    return _problem_source_order()


def _search_terms(search: str | None) -> list[str]:
    if not search:
        return []
    return [term.strip() for term in search.split(",") if term.strip()]


def _problem_search_condition(term: str):
    like = f"%{term}%"
    return or_(
        Problem.problem_text.ilike(like),
        Problem.answer.ilike(like),
        Problem.solution_steps.ilike(like),
        Problem.key_concept.ilike(like),
        Problem.source_label.ilike(like),
        Problem.source_type.ilike(like),
        cast(Problem.problem_number, String).ilike(like),
        Tag.subject.ilike(like),
        Tag.unit.ilike(like),
        Tag.difficulty.ilike(like),
        Tag.problem_type.ilike(like),
        Tag.source.ilike(like),
        Batch.name.ilike(like),
        Batch.problem_pdf_filename.ilike(like),
        Batch.solution_pdf_filename.ilike(like),
        Batch.source_label.ilike(like),
        Batch.source_type.ilike(like),
    )


def _serialize_problem(problem: Problem, schema=ProblemRead):
    owner_id = str(problem.owner_id or "")
    item = schema.model_validate(problem)
    batch = getattr(problem, "batch", None)
    return item.model_copy(
        update={
            "visual_url": sign_static_url(item.visual_url, owner_id),
            "review_page_image_url": sign_static_url(getattr(item, "review_page_image_url", None), owner_id),
            "batch_name": getattr(batch, "name", None),
            "batch_accent_color": normalize_batch_color(getattr(batch, "accent_color", None)) or batch_color_for_seed(getattr(batch, "id", None) or problem.source_batch_id),
        }
    )


def _read_review_page_image(problem: Problem) -> bytes:
    url = problem.review_page_image_url
    if not url:
        raise HTTPException(status_code=400, detail="검토용 원본 페이지 이미지가 없습니다. 이 문항은 새로 재처리해야 합니다.")

    if url.startswith("/static/"):
        relative_key = url.split("?", 1)[0].removeprefix("/static/")
        source_path = (Path(get_settings().uploads_dir).joinpath(*relative_key.split("/"))).resolve()
        uploads_root = Path(get_settings().uploads_dir).resolve()
        if uploads_root not in source_path.parents and source_path != uploads_root:
            raise HTTPException(status_code=400, detail="검토용 이미지 경로가 올바르지 않습니다.")
        if not source_path.exists():
            raise HTTPException(status_code=404, detail="검토용 원본 페이지 이미지 파일을 찾을 수 없습니다.")
        return source_path.read_bytes()

    if url.startswith("http://") or url.startswith("https://"):
        with urlopen(url, timeout=20) as response:
            return response.read()

    raise HTTPException(status_code=400, detail="지원하지 않는 검토용 이미지 경로입니다.")

def _local_static_path(url: str | None) -> Path | None:
    if not url or not url.startswith("/static/"):
        return None
    relative_key = url.split("?", 1)[0].removeprefix("/static/")
    source_path = (Path(get_settings().uploads_dir).joinpath(*relative_key.split("/"))).resolve()
    uploads_root = Path(get_settings().uploads_dir).resolve()
    if uploads_root not in source_path.parents and source_path != uploads_root:
        raise HTTPException(status_code=400, detail="잘못된 이미지 경로입니다.")
    return source_path


def _single_problem_reextract_prompt(problem: Problem) -> str:
    page_label = f"{problem.review_page_number}페이지" if problem.review_page_number else "이 페이지"
    existing_text = json.dumps(problem.problem_text or "", ensure_ascii=False)
    existing_visual = "true" if problem.has_visual or problem.visual_url else "false"
    return f"""You are re-extracting one Korean math/education problem from a source page image.

Target:
- Source page: {page_label}
- Problem number: {problem.problem_number}

Existing extraction to use as context:
{{
  "problem_number": {problem.problem_number},
  "problem_text": {existing_text},
  "has_visual": {existing_visual}
}}

Return a JSON array with exactly one object:
[
  {{
    "problem_number": {problem.problem_number},
    "problem_text": "<the full visible question stem for this problem only, excluding answer choices>",
    "has_visual": <true if this problem uses a figure, graph, table, diagram, or image>
  }}
]

Rules:
- Treat the existing extraction as the first draft and source image as the authority.
- Preserve correct parts of the existing extraction; fix OCR errors, missing Korean text, broken LaTeX, wrong math notation, and incorrect has_visual.
- Use the existing text to anchor the target problem location. Do not drift to neighboring problems.
- Extract only problem {problem.problem_number}. Do not include neighboring problems.
- If the problem number is not clearly visible, extract the problem visually closest to the existing target area/number and still return problem_number {problem.problem_number}.
- Preserve Korean text faithfully.
- Remove answer choices such as ①②③④⑤ or numbered options from problem_text.
- Include all condition text that belongs to the problem, even when it is inside a bordered box, shaded callout, rounded rectangle, table-like condition block, or region labeled (가), (나), ㄱ, ㄴ, etc. A text-only box is part of problem_text, not a separate visual asset. Preserve its labels, order, and line breaks.
- Convert mathematical expressions into LaTeX with $...$ or $$...$$.
- When the source image visibly draws a geometric symbol over letters, encode only that drawn symbol as LaTeX, for example an overbar over BC as $\\overline{{BC}}$. Do not infer symbols from ordinary Korean words such as 선분 BC, 변 BC, 직선 BC, 반직선 BC, or 호 BC; preserve those words as plain text unless the symbol itself is drawn.
- If an expression was already correctly converted in the existing extraction, keep it unless the source image contradicts it.
- Do not invent answers or solutions.
- Return raw JSON only. No markdown."""


@router.get("/facets", response_model=FacetsResponse)
def facets(request: Request, db: Session = Depends(get_db)):
    owner_ids = current_owner_ids(request, db)

    def problem_values(column):
        return [
            row[0]
            for row in db.execute(
                select(distinct(column))
                .where(Problem.owner_id.in_(owner_ids), Problem.deleted_at.is_(None), column.is_not(None))
                .order_by(column)
            ).all()
            if row[0]
        ]

    def tag_values(column):
        return [
            row[0]
            for row in db.execute(
                select(distinct(column))
                .select_from(Tag)
                .join(Problem, Tag.problem_id == Problem.id)
                .where(Problem.owner_id.in_(owner_ids), Problem.deleted_at.is_(None), column.is_not(None))
                .order_by(column)
            ).all()
            if row[0]
        ]

    return {
        "subjects": tag_values(Tag.subject),
        "units": tag_values(Tag.unit),
        "problem_types": tag_values(Tag.problem_type),
        "sources": tag_values(Tag.source),
        "source_types": problem_values(Problem.source_type),
        "visibilities": problem_values(Problem.visibility),
        "origin_types": problem_values(Problem.origin_type),
    }


@router.get("/stats", response_model=ProblemStats)
def problem_stats(request: Request, db: Session = Depends(get_db)):
    owner_ids = current_owner_ids(request, db)
    total = db.scalar(select(func.count(Problem.id)).where(Problem.owner_id.in_(owner_ids), Problem.deleted_at.is_(None))) or 0
    needs_review = db.scalar(
        select(func.count(Problem.id)).where(Problem.owner_id.in_(owner_ids), Problem.deleted_at.is_(None), Problem.needs_review.is_(True))
    ) or 0
    tagged_condition = or_(Tag.subject.is_not(None), Tag.unit.is_not(None), Tag.difficulty.is_not(None), Tag.problem_type.is_not(None), Tag.source.is_not(None))
    tagged = db.scalar(
        select(func.count(Problem.id))
        .join(Tag)
        .where(Problem.owner_id.in_(owner_ids), Problem.deleted_at.is_(None), tagged_condition)
    ) or 0
    return {"total": total, "needs_review": needs_review, "tagged": tagged, "untagged": max(total - tagged, 0)}


def _problem_filter_conditions(
    request: Request,
    db: Session,
    subject: list[str] | None = None,
    unit: str | None = None,
    difficulty: list[str] | None = None,
    problem_type: list[str] | None = None,
    needs_review: bool | None = None,
    source_type: list[str] | None = None,
    visibility: list[str] | None = None,
    origin_type: list[str] | None = None,
    search: str | None = None,
    batch_id: UUID | None = None,
):
    filters = [Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None)]
    if subject:
        filters.append(Tag.subject.in_(subject))
    if unit:
        filters.append(Tag.unit.ilike(f"%{unit}%"))
    if difficulty:
        filters.append(Tag.difficulty.in_(difficulty))
    if problem_type:
        filters.append(Tag.problem_type.in_(problem_type))
    if needs_review is not None:
        filters.append(Problem.needs_review == needs_review)
    if source_type:
        filters.append(Problem.source_type.in_(source_type))
    if visibility:
        filters.append(Problem.visibility.in_(visibility))
    if origin_type:
        filters.append(Problem.origin_type.in_(origin_type))
    for term in _search_terms(search):
        filters.append(_problem_search_condition(term))
    if batch_id:
        filters.append(Problem.source_batch_id == batch_id)
    return filters


@router.get("", response_model=Paginated[ProblemListItem])
def list_problems(
    request: Request,
    subject: list[str] | None = Query(default=None),
    unit: str | None = None,
    difficulty: list[str] | None = Query(default=None),
    problem_type: list[str] | None = Query(default=None),
    needs_review: bool | None = None,
    source_type: list[str] | None = Query(default=None),
    visibility: list[str] | None = Query(default=None),
    origin_type: list[str] | None = Query(default=None),
    search: str | None = None,
    batch_id: UUID | None = None,
    sort: str = "source_order",
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    filters = _problem_filter_conditions(
        request,
        db,
        subject=subject,
        unit=unit,
        difficulty=difficulty,
        problem_type=problem_type,
        needs_review=needs_review,
        source_type=source_type,
        visibility=visibility,
        origin_type=origin_type,
        search=search,
        batch_id=batch_id,
    )

    base = select(Problem).outerjoin(Tag).outerjoin(Batch, Problem.source_batch_id == Batch.id).options(joinedload(Problem.tags), joinedload(Problem.batch))
    count_query = select(func.count(distinct(Problem.id))).outerjoin(Tag).outerjoin(Batch, Problem.source_batch_id == Batch.id)
    if filters:
        condition = and_(*filters)
        base = base.where(condition)
        count_query = count_query.where(condition)

    total = db.scalar(count_query) or 0
    items = db.scalars(
        base.order_by(*_problem_order(sort))
        .offset((page - 1) * limit)
        .limit(limit)
    ).unique().all()
    return {"items": [_serialize_problem(item, ProblemListItem) for item in items], "total": total, "page": page, "limit": limit, "pages": math.ceil(total / limit) if total else 1}


@router.get("/{problem_id}/navigation", response_model=ProblemNavigation)
def problem_navigation(
    problem_id: UUID,
    request: Request,
    subject: list[str] | None = Query(default=None),
    unit: str | None = None,
    difficulty: list[str] | None = Query(default=None),
    problem_type: list[str] | None = Query(default=None),
    needs_review: bool | None = None,
    source_type: list[str] | None = Query(default=None),
    visibility: list[str] | None = Query(default=None),
    origin_type: list[str] | None = Query(default=None),
    search: str | None = None,
    batch_id: UUID | None = None,
    sort: str = "source_order",
    db: Session = Depends(get_db),
):
    exists = db.scalar(
        select(Problem.id).where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))
    )
    if not exists:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")

    filters = _problem_filter_conditions(
        request,
        db,
        subject=subject,
        unit=unit,
        difficulty=difficulty,
        problem_type=problem_type,
        needs_review=needs_review,
        source_type=source_type,
        visibility=visibility,
        origin_type=origin_type,
        search=search,
        batch_id=batch_id,
    )
    ids = db.scalars(
        select(Problem.id)
        .outerjoin(Tag)
        .outerjoin(Batch, Problem.source_batch_id == Batch.id)
        .where(and_(*filters))
        .order_by(*_problem_order(sort))
    ).unique().all()
    current_index = next((index for index, item_id in enumerate(ids) if str(item_id) == str(problem_id)), None)
    if current_index is None:
        return {"previous_id": None, "next_id": None, "position": None, "total": len(ids)}
    return {
        "previous_id": ids[current_index - 1] if current_index > 0 else None,
        "next_id": ids[current_index + 1] if current_index < len(ids) - 1 else None,
        "position": current_index + 1,
        "total": len(ids),
    }


@router.get("/{problem_id}", response_model=ProblemRead)
def problem_detail(problem_id: UUID, request: Request, db: Session = Depends(get_db)):
    problem = db.scalars(
        select(Problem)
        .where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags), joinedload(Problem.batch))
    ).first()
    if not problem:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    return _serialize_problem(problem)


@router.patch("/{problem_id}/tags", response_model=TagRead)
def update_tags(problem_id: UUID, payload: TagBase, request: Request, db: Session = Depends(get_db)):
    problem = db.scalars(
        select(Problem)
        .where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags), joinedload(Problem.batch))
    ).first()
    if not problem:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    tag = problem.tags or Tag(problem_id=problem.id)
    tag.subject = payload.subject
    tag.unit = payload.unit
    tag.difficulty = payload.difficulty
    tag.problem_type = payload.problem_type
    tag.source = payload.source
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.patch("/{problem_id}", response_model=ProblemRead)
def update_problem(problem_id: UUID, payload: ProblemUpdate, request: Request, db: Session = Depends(get_db)):
    problem = db.scalars(
        select(Problem)
        .where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags), joinedload(Problem.batch))
    ).first()
    if not problem:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    if not payload.problem_text.strip():
        raise HTTPException(status_code=400, detail="Problem text cannot be empty.")
    problem.problem_text = normalize_geometry_notation(payload.problem_text)
    problem.needs_review = True
    db.commit()
    db.refresh(problem)
    return _serialize_problem(problem)


@router.post("/{problem_id}/reextract", response_model=ProblemRead)
def reextract_problem(problem_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problem = db.scalars(
        select(Problem)
        .where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags), joinedload(Problem.batch))
    ).first()
    if not problem:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="AI 재추출을 위한 OPENAI_API_KEY가 설정되어 있지 않습니다.")

    estimate = estimate_single_reextract()
    enforce_extraction_preflight(db, owner_id, estimate, file_size_mb=0, page_count=1, upload_mb_to_add=0)

    image_bytes = _read_review_page_image(problem)
    base64_image = base64.b64encode(image_bytes).decode("ascii")
    client = OpenAI(api_key=settings.openai_api_key)
    items = vision_json(client, base64_image, _single_problem_reextract_prompt(problem), model=settings.ai_reextract_model)
    candidates = [
        item
        for item in items
        if str(item.get("problem_text") or "").strip()
    ]
    if not candidates:
        raise HTTPException(status_code=502, detail="AI가 이 원본 페이지에서 문항 텍스트를 다시 추출하지 못했습니다.")

    matching = [
        item
        for item in candidates
        if str(item.get("problem_number") or "").strip() == str(problem.problem_number)
    ]
    selected = max(matching or candidates, key=lambda item: len(str(item.get("problem_text") or "")))
    cleaned, suspicious = strip_answer_choices(str(selected.get("problem_text") or ""))
    problem.problem_text = normalize_geometry_notation(cleaned)
    problem.has_visual = bool(selected.get("has_visual", problem.has_visual))
    problem.needs_review = True if suspicious else problem.needs_review
    record_usage_event(db, owner_id, estimate, job_id=problem.source_batch_id)
    db.commit()
    db.refresh(problem)
    return _serialize_problem(problem)


@router.patch("/{problem_id}/visual-crop", response_model=ProblemRead)
def crop_visual(problem_id: UUID, payload: VisualCropUpdate, request: Request, db: Session = Depends(get_db)):
    problem = db.scalars(
        select(Problem)
        .where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags), joinedload(Problem.batch))
    ).first()
    if not problem:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    crop_source_url = problem.review_page_image_url or problem.visual_url
    if crop_source_url:
        problem.visual_url = crop_source_url
    if not problem.visual_url or not problem.visual_url.startswith("/static/"):
        raise HTTPException(status_code=400, detail="로컬 시각자료만 자를 수 있습니다.")

    relative_key = problem.visual_url.split("?", 1)[0].removeprefix("/static/")
    source_path = (Path(get_settings().uploads_dir).joinpath(*relative_key.split("/"))).resolve()
    uploads_root = Path(get_settings().uploads_dir).resolve()
    if uploads_root not in source_path.parents and source_path != uploads_root:
        raise HTTPException(status_code=400, detail="잘못된 시각자료 경로입니다.")
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="시각자료 파일을 찾을 수 없습니다.")

    with Image.open(source_path) as image:
        width, height = image.size
        left = max(0, min(payload.x, width - 1))
        top = max(0, min(payload.y, height - 1))
        right = max(left + 1, min(payload.x + payload.width, width))
        bottom = max(top + 1, min(payload.y + payload.height, height))
        if right - left < 5 or bottom - top < 5:
            raise HTTPException(status_code=400, detail="자를 영역이 너무 작습니다.")
        cropped = _trim_visual_whitespace(image.crop((left, top, right, bottom)))
        buffer = io.BytesIO()
        cropped.save(buffer, format="PNG")

    filename = f"{problem.id}_visual_crop_{int(time.time())}.png"
    problem.visual_url = save_visual_bytes(buffer.getvalue(), filename)
    problem.has_visual = True
    problem.needs_review = True
    db.commit()
    db.refresh(problem)
    return _serialize_problem(problem)


@router.delete("/{problem_id}/visual", response_model=ProblemRead)
def delete_visual(problem_id: UUID, request: Request, db: Session = Depends(get_db)):
    problem = db.scalars(
        select(Problem)
        .where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))
        .options(joinedload(Problem.tags), joinedload(Problem.batch))
    ).first()
    if not problem:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    problem.visual_url = None
    problem.has_visual = False
    problem.needs_review = True
    db.commit()
    db.refresh(problem)
    return _serialize_problem(problem)


@router.patch("/{problem_id}/review", response_model=ProblemRead)
def update_review(problem_id: UUID, payload: ReviewUpdate, request: Request, db: Session = Depends(get_db)):
    problem = db.scalars(
        select(Problem)
        .where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))
        .options(joinedload(Problem.batch))
    ).first()
    if not problem:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    problem.needs_review = payload.needs_review
    db.commit()
    db.refresh(problem)
    return _serialize_problem(problem)


@router.delete("/bulk", response_model=BulkProblemDeleteResponse)
def delete_problems_bulk(payload: BulkProblemDeleteRequest, request: Request, db: Session = Depends(get_db)):
    owner_ids = current_owner_ids(request, db)
    problem_ids = list(dict.fromkeys(payload.problem_ids))
    problems = db.scalars(
        select(Problem).where(
            Problem.id.in_(problem_ids),
            Problem.owner_id.in_(owner_ids),
            Problem.deleted_at.is_(None),
        )
    ).all()
    if not problems:
        return {"deleted_count": 0}

    found_ids = [problem.id for problem in problems]
    affected_set_ids = db.scalars(
        select(distinct(ProblemSetItem.problem_set_id)).where(ProblemSetItem.problem_id.in_(found_ids))
    ).all()
    db.execute(sa_delete(ProblemSetItem).where(ProblemSetItem.problem_id.in_(found_ids)))

    deleted_at = datetime.utcnow()
    for problem in problems:
        problem.deleted_at = deleted_at
        problem.delete_scheduled_at = deleted_at + timedelta(days=3)
        problem.needs_review = False

    for set_id in affected_set_ids:
        count = db.scalar(select(func.count(ProblemSetItem.id)).where(ProblemSetItem.problem_set_id == set_id)) or 0
        db.query(ProblemSet).filter(ProblemSet.id == set_id, ProblemSet.owner_id.in_(owner_ids)).update(
            {ProblemSet.problem_count: int(count), ProblemSet.updated_at: datetime.utcnow()},
            synchronize_session=False,
        )

    db.commit()
    return {"deleted_count": len(problems)}


@router.delete("/{problem_id}", status_code=204)
def delete_problem(problem_id: UUID, request: Request, db: Session = Depends(get_db)):
    problem = db.scalars(select(Problem).where(Problem.id == problem_id, Problem.owner_id.in_(current_owner_ids(request, db)), Problem.deleted_at.is_(None))).first()
    if not problem:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    db.execute(sa_delete(ProblemSetItem).where(ProblemSetItem.problem_id == problem_id))
    problem.deleted_at = datetime.utcnow()
    problem.delete_scheduled_at = problem.deleted_at + timedelta(days=3)
    problem.needs_review = False
    db.commit()
