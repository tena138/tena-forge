from uuid import UUID
from copy import deepcopy
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import ExamTemplate, TemplateVersion
from schemas import ExamTemplateRead, TemplateVersionRead, TemplateVisualSave
from services.storage import save_logo_upload

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _header_fields(exam_title_field: bool, class_field: bool, student_name_field: bool, date_field: bool) -> dict:
    return {
        "exam_title": exam_title_field,
        "class_name": class_field,
        "student_name": student_name_field,
        "date": date_field,
    }


def _bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "on"}


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _validate_layout(font_size: int, problems_per_page: int) -> None:
    if font_size < 9 or font_size > 28:
        raise HTTPException(status_code=400, detail="Font size must be between 9 and 28.")
    if problems_per_page not in {1, 2}:
        raise HTTPException(status_code=400, detail="Problems per page must be 1 or 2.")


def _academy_from_canvas(canvas_json: dict, fallback: str | None = None) -> str | None:
    for element in _canvas_elements(canvas_json):
        if element.get("type") == "dynamic_field" and element.get("fieldKey") == "academy_name":
            text = element.get("previewValue") or element.get("text")
            if text:
                return str(text).strip() or fallback
    return fallback


def _canvas_elements(canvas_json: dict | None) -> list[dict]:
    if not canvas_json:
        return []
    pages = canvas_json.get("pages")
    if isinstance(pages, list) and pages:
        elements: list[dict] = []
        for page in pages:
            page_elements = page.get("elements", []) if isinstance(page, dict) else []
            if isinstance(page_elements, list):
                elements.extend([element for element in page_elements if isinstance(element, dict)])
        return elements
    elements = canvas_json.get("elements", [])
    return [element for element in elements if isinstance(element, dict)] if isinstance(elements, list) else []


def _extract_canvas_defaults(payload: TemplateVisualSave) -> tuple[str | None, int, int, bool]:
    elements = _canvas_elements(payload.canvas_json)
    question_area = next((element for element in elements if element.get("type") == "question_area"), None)
    solution_area = next((element for element in elements if element.get("type") == "solution_area"), None)
    academy_name = _academy_from_canvas(payload.canvas_json, payload.academy_name)
    font_size = int(question_area.get("questionFontSize", payload.font_size)) if question_area else payload.font_size
    problems_per_page = int(question_area.get("columns", payload.problems_per_page)) if question_area else payload.problems_per_page
    include_solution = bool(solution_area or payload.include_solution)
    return academy_name, font_size, problems_per_page, include_solution


def _element_count(canvas_json: dict | None) -> int:
    return len(_canvas_elements(canvas_json))


def _record_version(db: Session, template: ExamTemplate) -> None:
    if not template.canvas_json:
        return
    latest_number = db.scalars(
        select(TemplateVersion.version_number)
        .where(TemplateVersion.template_id == template.id)
        .order_by(TemplateVersion.version_number.desc())
        .limit(1)
    ).first()
    version = TemplateVersion(
        template_id=template.id,
        canvas_json=deepcopy(template.canvas_json),
        saved_at=datetime.utcnow(),
        version_number=(latest_number or 0) + 1,
        element_count=_element_count(template.canvas_json),
    )
    db.add(version)
    db.flush()
    old_versions = db.scalars(
        select(TemplateVersion)
        .where(TemplateVersion.template_id == template.id)
        .order_by(TemplateVersion.version_number.desc())
        .offset(20)
    ).all()
    for old_version in old_versions:
        db.delete(old_version)


@router.post("", response_model=ExamTemplateRead)
async def create_template(request: Request, db: Session = Depends(get_db)):
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = TemplateVisualSave.model_validate(await request.json())
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Template name is required.")
        academy_name, font_size, problems_per_page, include_solution = _extract_canvas_defaults(payload)
        _validate_layout(font_size, problems_per_page)
        template = ExamTemplate(
            name=payload.name.strip(),
            academy_name=academy_name,
            canvas_json=payload.canvas_json,
            header_fields=_header_fields(True, True, True, True),
            footer_text=payload.footer_text,
            font_size=font_size,
            problems_per_page=problems_per_page,
            include_solution=include_solution,
        )
    else:
        form = await request.form()
        name = str(form.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Template name is required.")
        font_size = _int(form.get("font_size"), 11)
        problems_per_page = _int(form.get("problems_per_page"), 2)
        _validate_layout(font_size, problems_per_page)
        logo = form.get("logo")
        logo_url = save_logo_upload(logo) if hasattr(logo, "filename") and logo.filename else None
        template = ExamTemplate(
            name=name,
            academy_name=str(form.get("academy_name") or "").strip() or None,
            logo_url=logo_url,
            header_fields=_header_fields(
                _bool(form.get("exam_title_field"), True),
                _bool(form.get("class_field"), True),
                _bool(form.get("student_name_field"), True),
                _bool(form.get("date_field"), True),
            ),
            footer_text=str(form.get("footer_text") or "").strip() or None,
            font_size=font_size,
            problems_per_page=problems_per_page,
            include_solution=_bool(form.get("include_solution")),
        )

    template.updated_at = datetime.utcnow()
    db.add(template)
    db.flush()
    _record_version(db, template)
    db.commit()
    db.refresh(template)
    return template


@router.get("", response_model=list[ExamTemplateRead])
def list_templates(db: Session = Depends(get_db)):
    return db.scalars(select(ExamTemplate).order_by(ExamTemplate.created_at.desc())).all()


@router.get("/{template_id}", response_model=ExamTemplateRead)
def get_template(template_id: UUID, db: Session = Depends(get_db)):
    template = db.get(ExamTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template


@router.patch("/{template_id}", response_model=ExamTemplateRead)
async def update_template(template_id: UUID, request: Request, db: Session = Depends(get_db)):
    template = db.get(ExamTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = TemplateVisualSave.model_validate(await request.json())
        if not payload.name.strip():
            raise HTTPException(status_code=400, detail="Template name is required.")
        academy_name, font_size, problems_per_page, include_solution = _extract_canvas_defaults(payload)
        _validate_layout(font_size, problems_per_page)
        template.name = payload.name.strip()
        template.academy_name = academy_name
        template.canvas_json = payload.canvas_json
        template.footer_text = payload.footer_text
        template.font_size = font_size
        template.problems_per_page = problems_per_page
        template.include_solution = include_solution
        template.updated_at = datetime.utcnow()
        _record_version(db, template)
    else:
        form = await request.form()
        next_font_size = _int(form.get("font_size"), template.font_size)
        next_problems_per_page = _int(form.get("problems_per_page"), template.problems_per_page)
        _validate_layout(next_font_size, next_problems_per_page)
        if "name" in form:
            name = str(form.get("name") or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Template name is required.")
            template.name = name
        if "academy_name" in form:
            template.academy_name = str(form.get("academy_name") or "").strip() or None
        logo = form.get("logo")
        if hasattr(logo, "filename") and logo.filename:
            template.logo_url = save_logo_upload(logo)
        fields = dict(template.header_fields or {})
        if "exam_title_field" in form:
            fields["exam_title"] = _bool(form.get("exam_title_field"))
        if "class_field" in form:
            fields["class_name"] = _bool(form.get("class_field"))
        if "student_name_field" in form:
            fields["student_name"] = _bool(form.get("student_name_field"))
        if "date_field" in form:
            fields["date"] = _bool(form.get("date_field"))
        template.header_fields = fields
        if "footer_text" in form:
            template.footer_text = str(form.get("footer_text") or "").strip() or None
        template.font_size = next_font_size
        template.problems_per_page = next_problems_per_page
        if "include_solution" in form:
            template.include_solution = _bool(form.get("include_solution"))
        template.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/duplicate", response_model=ExamTemplateRead)
def duplicate_template(template_id: UUID, db: Session = Depends(get_db)):
    template = db.get(ExamTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    copied = ExamTemplate(
        name=f"{template.name} (복사본)",
        academy_name=template.academy_name,
        logo_url=template.logo_url,
        canvas_json=deepcopy(template.canvas_json),
        header_fields=deepcopy(template.header_fields or {}),
        footer_text=template.footer_text,
        font_size=template.font_size,
        problems_per_page=template.problems_per_page,
        include_solution=template.include_solution,
        updated_at=datetime.utcnow(),
    )
    db.add(copied)
    db.flush()
    _record_version(db, copied)
    db.commit()
    db.refresh(copied)
    return copied


@router.get("/{template_id}/versions", response_model=list[TemplateVersionRead])
def list_template_versions(template_id: UUID, db: Session = Depends(get_db)):
    template = db.get(ExamTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    return db.scalars(
        select(TemplateVersion)
        .where(TemplateVersion.template_id == template_id)
        .order_by(TemplateVersion.version_number.desc())
        .limit(20)
    ).all()


@router.post("/{template_id}/versions/{version_id}/restore", response_model=ExamTemplateRead)
def restore_template_version(template_id: UUID, version_id: UUID, db: Session = Depends(get_db)):
    template = db.get(ExamTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    version = db.get(TemplateVersion, version_id)
    if not version or version.template_id != template_id:
        raise HTTPException(status_code=404, detail="Version not found.")
    template.canvas_json = deepcopy(version.canvas_json)
    academy_name, font_size, problems_per_page, include_solution = _extract_canvas_defaults(
        TemplateVisualSave(
            name=template.name,
            canvas_json=template.canvas_json,
            academy_name=template.academy_name,
            font_size=template.font_size,
            problems_per_page=template.problems_per_page,
            include_solution=template.include_solution,
            footer_text=template.footer_text,
        )
    )
    template.academy_name = academy_name
    template.font_size = font_size
    template.problems_per_page = problems_per_page
    template.include_solution = include_solution
    template.updated_at = datetime.utcnow()
    _record_version(db, template)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: UUID, db: Session = Depends(get_db)):
    template = db.get(ExamTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    db.delete(template)
    db.commit()
    return Response(status_code=204)
