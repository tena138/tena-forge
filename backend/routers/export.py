import re
from datetime import datetime
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import ExamTemplate, HubTemplate, Problem, ProblemSet, ProblemSetItem
from schemas import ExportPreviewRequest, ExportRequest
from services.export_service import generate_canvas_preview_pdf, generate_exam_pdf, generate_hub_template_pdf
from services.ownership import current_owner_id
from services.template_renderer import render_hub_template_for_export

router = APIRouter(prefix="/api/export", tags=["export"])


def _safe_filename(value: str) -> str:
    return re.sub(r"[\\/:*?\"<>|]+", "_", value).strip() or "exam"


def _date_label(value: str) -> str:
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value or ""):
        return value.replace("-", ".")
    return value or ""


def _time_label(start_time: str | None, end_time: str | None, explicit: str | None = None) -> str:
    if explicit:
        return explicit.strip()
    start = (start_time or "").strip()
    end = (end_time or "").strip()
    if start and end:
        return f"{start} ~ {end}"
    return start or end


def _date_parts(value: str) -> tuple[str, str, str]:
    match = re.search(r"(\d{4})\D*(\d{1,2})\D*(\d{1,2})", value or "")
    if match:
        year, month, day = match.groups()
        return year, month.zfill(2), day.zfill(2)
    today = datetime.now()
    return f"{today.year:04d}", f"{today.month:02d}", f"{today.day:02d}"


def _export_values(payload: ExportRequest) -> dict[str, str | bool]:
    exam_date = _date_label(payload.date)
    exam_time = _time_label(payload.exam_start_time, payload.exam_end_time, payload.exam_time)
    exam_datetime = (payload.exam_datetime or " ".join(part for part in [exam_date, exam_time] if part)).strip()
    year, month, day = _date_parts(payload.date or exam_date)
    values: dict[str, str | bool] = {
        "exam_title": payload.exam_title,
        "test_title": payload.exam_title,
        "class_name": payload.class_name or "",
        "student_name": payload.student_name or "",
        "date": payload.date,
        "exam_date": exam_date,
        "year": year,
        "month": month,
        "day": day,
        "exam_start_time": payload.exam_start_time or "",
        "exam_end_time": payload.exam_end_time or "",
        "exam_time": exam_time,
        "exam_datetime": exam_datetime,
        "printed_at": datetime.now().strftime("%Y.%m.%d %H:%M"),
        "include_solution": payload.include_solution,
    }
    for key, value in (payload.custom_variables or {}).items():
        clean_key = str(key).strip()
        if clean_key:
            values[clean_key] = str(value or "")
    return values


def _load_problems_from_ids(db: Session, problem_ids: list[UUID], owner_id: str) -> list[Problem]:
    if not problem_ids:
        raise HTTPException(status_code=400, detail="내보낼 문항을 선택하세요.")
    rows = db.scalars(
        select(Problem)
        .where(Problem.id.in_(problem_ids), Problem.owner_id == owner_id)
        .options(joinedload(Problem.tags))
    ).unique().all()
    by_id = {problem.id: problem for problem in rows}
    missing = [str(problem_id) for problem_id in problem_ids if problem_id not in by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"문항을 찾을 수 없습니다: {', '.join(missing)}")
    return [by_id[problem_id] for problem_id in problem_ids]


def _load_requested_problems(payload: ExportRequest, db: Session, owner_id: str) -> list[Problem]:
    if payload.source == "set":
        if not payload.problem_set_id:
            raise HTTPException(status_code=400, detail="문제 세트 ID가 필요합니다.")
        problem_set = db.scalars(
            select(ProblemSet)
            .where(ProblemSet.id == payload.problem_set_id, ProblemSet.owner_id == owner_id)
            .options(joinedload(ProblemSet.items).joinedload(ProblemSetItem.problem).joinedload(Problem.tags))
        ).unique().first()
        if not problem_set:
            raise HTTPException(status_code=404, detail="문제 세트를 찾을 수 없습니다.")
        return [item.problem for item in sorted(problem_set.items, key=lambda item: item.order_index)]
    if payload.source == "selection":
        return _load_problems_from_ids(db, payload.problem_ids or [], owner_id)
    raise HTTPException(status_code=400, detail="source는 set 또는 selection이어야 합니다.")


@router.post("")
def export_pdf(payload: ExportRequest, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    problems = _load_requested_problems(payload, db, owner_id)

    # Template Hub export path: render archived problems through a shared HTML/CSS template.
    if payload.hub_template_id:
        hub_template = db.get(HubTemplate, payload.hub_template_id)
        if not hub_template or (hub_template.visibility == "private" and hub_template.owner_id != owner_id):
            raise HTTPException(status_code=404, detail="템플릿 허브 템플릿을 찾을 수 없습니다.")
        hub_template.use_count += 1
        export_values = _export_values(payload)
        db.commit()
        if isinstance(hub_template.schema_json, dict) and isinstance(hub_template.schema_json.get("visualTemplateSet"), dict):
            buffer = generate_hub_template_pdf(hub_template, problems, export_values)
            filename = f"{_safe_filename(payload.exam_title)}_{_safe_filename(payload.date)}.pdf"
            encoded_filename = quote(filename, safe="")
            return StreamingResponse(
                buffer,
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=template.pdf; filename*=UTF-8''{encoded_filename}"},
            )
        html = render_hub_template_for_export(hub_template, problems, export_values)
        filename = f"{_safe_filename(payload.exam_title)}_{_safe_filename(payload.date)}.html"
        encoded_filename = quote(filename, safe="")
        return StreamingResponse(
            iter([html.encode("utf-8")]),
            media_type="text/html; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=template.html; filename*=UTF-8''{encoded_filename}"},
        )

    if not payload.template_id:
        raise HTTPException(status_code=400, detail="템플릿을 선택해주세요.")
    template = db.get(ExamTemplate, payload.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="템플릿을 찾을 수 없습니다.")

    include_solution = payload.include_solution or template.include_solution
    export_values = _export_values(payload)
    buffer = generate_exam_pdf(
        problems,
        template,
        export_values,
        include_solution=include_solution,
    )
    filename = f"{_safe_filename(payload.exam_title)}_{_safe_filename(payload.date)}.pdf"
    encoded_filename = quote(filename, safe="")
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=exam.pdf; filename*=UTF-8''{encoded_filename}"},
    )


@router.post("/preview")
def export_preview(payload: ExportPreviewRequest):
    buffer = generate_canvas_preview_pdf(payload.canvas_json)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=preview.pdf"},
    )
