from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from database import get_db
from models import HubTemplate, MarketplaceListing
from schemas import MarketplaceSubmissionRequest, TemplateCreate, TemplateForkResponse, TemplateResponse, TemplateUpdate
from services.auth_security import decode_access_token
from services.license_service import is_marketplace_publish_allowed
from services.saas_security import ADMIN_ROLES, get_roles, require_admin
from services.template_renderer import sanitize_template_css, sanitize_template_html

router = APIRouter(prefix="/templates", tags=["template-hub"])

LOCAL_OWNER_ID = "local_user"


def _current_owner_id(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = decode_access_token(token)
            if payload.get("type") == "access" and payload.get("sub"):
                return str(payload["sub"])
        except Exception:
            pass
    return LOCAL_OWNER_ID


def _response(template: HubTemplate, owner_id: str) -> TemplateResponse:
    data = TemplateResponse.model_validate(template)
    data.is_owner = template.owner_id == owner_id
    return data


def _ensure_readable(template: HubTemplate, owner_id: str, db: Session | None = None) -> None:
    if template.visibility == "private" and template.owner_id != owner_id:
        raise HTTPException(status_code=404, detail="Template not found.")
    if template.visibility == "marketplace" and template.owner_id != owner_id and not (db and _is_marketplace_admin(db, owner_id)):
        raise HTTPException(status_code=404, detail="Template not found.")


def _ensure_owner(template: HubTemplate, owner_id: str) -> None:
    if template.owner_id != owner_id:
        raise HTTPException(status_code=403, detail="Only the owner can modify this template.")


def _is_marketplace_admin(db: Session, owner_id: str) -> bool:
    return owner_id != LOCAL_OWNER_ID and bool(get_roles(db, owner_id) & ADMIN_ROLES)


@router.post("", response_model=TemplateResponse)
def create_template(payload: TemplateCreate, request: Request, db: Session = Depends(get_db)):
    owner_id = _current_owner_id(request)
    template = HubTemplate(
        owner_id=owner_id,
        title=payload.title.strip(),
        description=payload.description,
        category=payload.category,
        visibility=payload.visibility,
        html=sanitize_template_html(payload.html),
        css=sanitize_template_css(payload.css),
        schema_json=payload.schema_json,
        thumbnail_url=payload.thumbnail_url,
        source_type=payload.source_type,
        rights_confirmed=payload.rights_confirmed,
        rights_confirmed_at=datetime.utcnow() if payload.rights_confirmed else None,
        updated_at=datetime.utcnow(),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _response(template, owner_id)


@router.get("/mine", response_model=list[TemplateResponse])
def list_my_templates(request: Request, db: Session = Depends(get_db)):
    owner_id = _current_owner_id(request)
    templates = db.scalars(
        select(HubTemplate)
        .where(HubTemplate.owner_id == owner_id)
        .order_by(HubTemplate.updated_at.desc())
    ).all()
    return [_response(template, owner_id) for template in templates]


@router.get("/public", response_model=list[TemplateResponse])
def list_public_templates(
    request: Request,
    category: str | None = None,
    keyword: str | None = None,
    sort: str = "recent",
    db: Session = Depends(get_db),
):
    owner_id = _current_owner_id(request)
    visibilities = ["public", "marketplace"] if _is_marketplace_admin(db, owner_id) else ["public"]
    statement = select(HubTemplate).where(HubTemplate.visibility.in_(visibilities))
    if category:
        statement = statement.where(HubTemplate.category == category)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        statement = statement.where(or_(HubTemplate.title.ilike(pattern), HubTemplate.description.ilike(pattern)))
    if sort == "popular":
        statement = statement.order_by(HubTemplate.like_count.desc(), HubTemplate.updated_at.desc())
    elif sort == "most_used":
        statement = statement.order_by(HubTemplate.use_count.desc(), HubTemplate.updated_at.desc())
    else:
        statement = statement.order_by(HubTemplate.updated_at.desc())
    return [_response(template, owner_id) for template in db.scalars(statement).all()]


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = _current_owner_id(request)
    template = db.get(HubTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _ensure_readable(template, owner_id, db)
    return _response(template, owner_id)


@router.patch("/{template_id}", response_model=TemplateResponse)
def update_template(template_id: UUID, payload: TemplateUpdate, request: Request, db: Session = Depends(get_db)):
    owner_id = _current_owner_id(request)
    template = db.get(HubTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _ensure_owner(template, owner_id)
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes and changes["title"] is not None:
        template.title = changes["title"].strip()
    if "description" in changes:
        template.description = changes["description"]
    if "category" in changes and changes["category"] is not None:
        template.category = changes["category"]
    if "visibility" in changes and changes["visibility"] is not None:
        template.visibility = changes["visibility"]
    if "html" in changes and changes["html"] is not None:
        template.html = sanitize_template_html(changes["html"])
    if "css" in changes:
        template.css = sanitize_template_css(changes["css"])
    if "schema_json" in changes:
        template.schema_json = changes["schema_json"]
    if "thumbnail_url" in changes:
        template.thumbnail_url = changes["thumbnail_url"]
    if "source_type" in changes and changes["source_type"] is not None:
        template.source_type = changes["source_type"]
    if "rights_confirmed" in changes:
        template.rights_confirmed = bool(changes["rights_confirmed"])
        template.rights_confirmed_at = datetime.utcnow() if template.rights_confirmed else None
    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)
    return _response(template, owner_id)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = _current_owner_id(request)
    template = db.get(HubTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _ensure_owner(template, owner_id)
    db.delete(template)
    db.commit()
    return Response(status_code=204)


@router.post("/{template_id}/fork", response_model=TemplateForkResponse)
def fork_template(template_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = _current_owner_id(request)
    template = db.get(HubTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _ensure_readable(template, owner_id, db)
    template.use_count += 1
    copied = HubTemplate(
        owner_id=owner_id,
        title=f"{template.title} (복사본)",
        description=template.description,
        category=template.category,
        visibility="private",
        html=template.html,
        css=template.css,
        schema_json=template.schema_json,
        thumbnail_url=template.thumbnail_url,
        source_type=template.source_type,
        rights_confirmed=False,
        forked_from_template_id=template.id,
        updated_at=datetime.utcnow(),
    )
    db.add(copied)
    db.commit()
    db.refresh(template)
    db.refresh(copied)
    return TemplateForkResponse(template=_response(copied, owner_id), source_use_count=template.use_count)


@router.post("/{template_id}/publish", response_model=TemplateResponse)
def publish_template(template_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = _current_owner_id(request)
    template = db.get(HubTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _ensure_owner(template, owner_id)
    template.visibility = "public"
    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)
    return _response(template, owner_id)


@router.post("/{template_id}/unpublish", response_model=TemplateResponse)
def unpublish_template(template_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = _current_owner_id(request)
    template = db.get(HubTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _ensure_owner(template, owner_id)
    template.visibility = "private"
    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)
    return _response(template, owner_id)


@router.post("/{template_id}/submit-to-marketplace")
def submit_template_to_marketplace(template_id: UUID, payload: MarketplaceSubmissionRequest, request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    owner_id = _current_owner_id(request)
    template = db.get(HubTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    _ensure_owner(template, owner_id)
    if not payload.rights_confirmed or not payload.no_unauthorized_copy:
        raise HTTPException(status_code=400, detail="마켓플레이스 등록 전 권리 확인이 필요합니다.")
    template.rights_confirmed = True
    template.rights_confirmed_at = datetime.utcnow()
    allowed, reason = is_marketplace_publish_allowed(template)
    if not allowed:
        raise HTTPException(status_code=400, detail=reason)

    listing = db.scalars(
        select(MarketplaceListing).where(
            MarketplaceListing.content_type == "template",
            MarketplaceListing.content_id == str(template.id),
        )
    ).first()
    if not listing:
        listing = MarketplaceListing(
            seller_id=owner_id,
            content_type="template",
            content_id=str(template.id),
            title=template.title,
            description=template.description,
            category=payload.category or template.category,
            thumbnail_url=template.thumbnail_url,
            pricing_type=payload.pricing_type,
            price_amount=payload.price_amount,
            license_type=payload.license_type,
            status="published",
            rights_confirmed=True,
            rights_confirmed_at=datetime.utcnow(),
        )
        db.add(listing)
    else:
        listing.title = template.title
        listing.description = template.description
        listing.category = payload.category or template.category
        listing.thumbnail_url = template.thumbnail_url
        listing.pricing_type = payload.pricing_type
        listing.price_amount = payload.price_amount
        listing.license_type = payload.license_type
        listing.status = "published"
        listing.rights_confirmed = True
        listing.rights_confirmed_at = datetime.utcnow()
        listing.updated_at = datetime.utcnow()
    template.visibility = "marketplace"
    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(listing)
    return {"listing_id": listing.id, "status": listing.status}
