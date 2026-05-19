from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from models import Product, ProductAsset, ProductLicenseTier, ProductVersion
from schemas import LicenseTierCreate, LicenseTierRead, ProductCreate, ProductRead, ProductUpdate, ProductVersionCreate, ProductVersionRead
from services.saas_security import audit, product_owned_by_creator, require_creator

router = APIRouter(prefix="/api/creator/products", tags=["creator-products"])


@router.get("", response_model=list[ProductRead])
def my_products(request: Request, db: Session = Depends(get_db)):
    creator_id = require_creator(request, db)
    return db.scalars(select(Product).where(Product.creator_id == creator_id, Product.deleted_at.is_(None)).order_by(Product.updated_at.desc())).all()


@router.post("", response_model=ProductRead)
def create_product(payload: ProductCreate, request: Request, db: Session = Depends(get_db)):
    creator_id = require_creator(request, db)
    if db.scalar(select(Product).where(Product.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="이미 사용 중인 slug입니다.")
    product = Product(creator_id=creator_id, status="draft", **payload.model_dump())
    db.add(product)
    audit(db, creator_id, "product.draft.created", "product", str(product.id), {"title": product.title})
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductRead)
def get_product(product_id: UUID, request: Request, db: Session = Depends(get_db)):
    return product_owned_by_creator(db, product_id, require_creator(request, db))


@router.patch("/{product_id}", response_model=ProductRead)
def update_product(product_id: UUID, payload: ProductUpdate, request: Request, db: Session = Depends(get_db)):
    creator_id = require_creator(request, db)
    product = product_owned_by_creator(db, product_id, creator_id)
    if product.status not in {"draft", "changes_requested", "unpublished", "approved"}:
        raise HTTPException(status_code=400, detail="현재 상태에서는 제품 정보를 수정할 수 없습니다.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    audit(db, creator_id, "product.updated", "product", str(product.id))
    db.commit()
    db.refresh(product)
    return product


@router.post("/{product_id}/versions", response_model=ProductVersionRead)
def create_version(product_id: UUID, payload: ProductVersionCreate, request: Request, db: Session = Depends(get_db)):
    creator_id = require_creator(request, db)
    product_owned_by_creator(db, product_id, creator_id)
    next_version = (db.scalar(select(func.max(ProductVersion.version_number)).where(ProductVersion.product_id == product_id)) or 0) + 1
    version = ProductVersion(product_id=product_id, version_number=next_version, changelog=payload.changelog, preview_url=payload.preview_url)
    db.add(version)
    audit(db, creator_id, "product.version.created", "product", str(product_id), {"version": next_version})
    db.commit()
    db.refresh(version)
    return version


@router.post("/{product_id}/license-tiers", response_model=LicenseTierRead)
def create_license_tier(product_id: UUID, payload: LicenseTierCreate, request: Request, db: Session = Depends(get_db)):
    creator_id = require_creator(request, db)
    product_owned_by_creator(db, product_id, creator_id)
    tier = ProductLicenseTier(product_id=product_id, **payload.model_dump())
    db.add(tier)
    audit(db, creator_id, "product.license_tier.created", "product", str(product_id), {"code": tier.code})
    db.commit()
    db.refresh(tier)
    return tier


@router.post("/{product_id}/submit", response_model=ProductRead)
def submit_for_review(product_id: UUID, request: Request, db: Session = Depends(get_db)):
    creator_id = require_creator(request, db)
    product = product_owned_by_creator(db, product_id, creator_id)
    if not product.rights_declared:
        raise HTTPException(status_code=400, detail="마켓 등록 전 권리 확인이 필요합니다.")
    if not db.scalar(select(ProductLicenseTier).where(ProductLicenseTier.product_id == product_id)):
        raise HTTPException(status_code=400, detail="최소 1개 이상의 라이선스 티어가 필요합니다.")
    product.status = "submitted_for_review"
    audit(db, creator_id, "product.submitted_for_review", "product", str(product.id))
    db.commit()
    db.refresh(product)
    return product


@router.post("/{product_id}/publish", response_model=ProductRead)
def publish_approved_product(product_id: UUID, request: Request, db: Session = Depends(get_db)):
    creator_id = require_creator(request, db)
    product = product_owned_by_creator(db, product_id, creator_id)
    if product.status != "approved":
        raise HTTPException(status_code=403, detail="관리자 승인된 제품만 게시할 수 있습니다.")
    product.status = "published"
    product.published_at = datetime.utcnow()
    audit(db, creator_id, "product.published", "product", str(product.id))
    db.commit()
    db.refresh(product)
    return product


@router.post("/{product_id}/unpublish", response_model=ProductRead)
def unpublish_product(product_id: UUID, request: Request, db: Session = Depends(get_db)):
    creator_id = require_creator(request, db)
    product = product_owned_by_creator(db, product_id, creator_id)
    product.status = "unpublished"
    audit(db, creator_id, "product.unpublished", "product", str(product.id))
    db.commit()
    db.refresh(product)
    return product
