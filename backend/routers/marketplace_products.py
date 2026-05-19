from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CreatorBalanceLedger,
    MarketplaceOrder,
    MarketplaceOrderItem,
    MarketplacePayment,
    Product,
    ProductAsset,
    ProductLicense,
    ProductLicenseTier,
    ProductVersion,
)
from schemas import MarketplaceOrderRead, ProductLicenseRead, ProductRead, PurchaseRequest, SignedUrlResponse
from services.ownership import current_owner_id
from services.saas_security import audit, calculate_order_amounts, create_signed_url, ensure_buyer_license, platform_commission_rate

router = APIRouter(prefix="/api/market", tags=["curated-marketplace"])


@router.get("/products", response_model=list[ProductRead])
def list_published_products(
    subject: str | None = None,
    grade_level: str | None = None,
    curriculum: str | None = None,
    difficulty: str | None = None,
    exam_type: str | None = None,
    keyword: str | None = None,
    db: Session = Depends(get_db),
):
    query = select(Product).where(Product.status == "published", Product.deleted_at.is_(None))
    if subject:
        query = query.where(Product.subject == subject)
    if grade_level:
        query = query.where(Product.grade_level == grade_level)
    if curriculum:
        query = query.where(Product.curriculum == curriculum)
    if difficulty:
        query = query.where(Product.difficulty == difficulty)
    if exam_type:
        query = query.where(Product.exam_type == exam_type)
    if keyword:
        query = query.where(Product.title.ilike(f"%{keyword}%"))
    return db.scalars(query.order_by(Product.published_at.desc(), Product.created_at.desc())).all()


@router.get("/products/{slug}", response_model=ProductRead)
def product_detail(slug: str, db: Session = Depends(get_db)):
    product = db.scalar(select(Product).where(Product.slug == slug, Product.status == "published", Product.deleted_at.is_(None)))
    if not product:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다.")
    return product


@router.post("/products/{product_id}/purchase", response_model=MarketplaceOrderRead)
def purchase_product(product_id: UUID, payload: PurchaseRequest, request: Request, db: Session = Depends(get_db)):
    buyer_id = current_owner_id(request)
    product = db.scalar(select(Product).where(Product.id == product_id, Product.status == "published"))
    if not product:
        raise HTTPException(status_code=404, detail="구매 가능한 제품을 찾을 수 없습니다.")
    tier = db.scalar(select(ProductLicenseTier).where(ProductLicenseTier.id == payload.license_tier_id, ProductLicenseTier.product_id == product_id))
    if not tier:
        raise HTTPException(status_code=404, detail="라이선스 티어를 찾을 수 없습니다.")
    version = db.scalar(select(ProductVersion).where(ProductVersion.product_id == product_id, ProductVersion.status.in_(["approved", "published"])).order_by(ProductVersion.version_number.desc()))
    commission_rate = platform_commission_rate(db, product.creator_id)
    gross, fee, commission, net = calculate_order_amounts(tier.price or product.price, commission_rate)
    order = MarketplaceOrder(
        buyer_user_id=buyer_id,
        status="paid",
        gross_amount=gross,
        payment_fee_amount=fee,
        platform_commission_amount=commission,
        creator_net_amount=net,
        commission_rate_snapshot=commission_rate,
        payment_provider="mock",
        payment_provider_order_id=f"mock-{datetime.utcnow().timestamp()}",
    )
    db.add(order)
    db.flush()
    db.add(MarketplaceOrderItem(order_id=order.id, product_id=product.id, product_version_id=version.id if version else None, license_tier_id=tier.id, creator_id=product.creator_id, unit_amount=gross))
    db.add(MarketplacePayment(order_id=order.id, provider="mock", provider_payment_id=f"mock-pay-{order.id}", amount=gross, status="paid", raw_event={"mode": "development"}))
    license_record = ProductLicense(
        buyer_user_id=buyer_id,
        product_id=product.id,
        product_version_id=version.id if version else None,
        creator_id=product.creator_id,
        license_tier_id=tier.id,
        order_id=order.id,
        terms_snapshot=tier.license_terms_text,
    )
    db.add(license_record)
    db.add(CreatorBalanceLedger(creator_id=product.creator_id, order_id=order.id, entry_type="sale", amount=net, description=f"{product.title} 판매"))
    audit(db, buyer_id, "marketplace.order.paid", "order", str(order.id), {"product_id": str(product.id), "license_tier_id": str(tier.id)})
    db.commit()
    db.refresh(order)
    return order


@router.get("/library", response_model=list[ProductLicenseRead])
def buyer_library(request: Request, db: Session = Depends(get_db)):
    return db.scalars(select(ProductLicense).where(ProductLicense.buyer_user_id == current_owner_id(request)).order_by(ProductLicense.created_at.desc())).all()


@router.post("/licenses/{license_id}/download", response_model=SignedUrlResponse)
def signed_product_download(license_id: UUID, request: Request, db: Session = Depends(get_db)):
    buyer_id = current_owner_id(request)
    license_record = db.scalar(select(ProductLicense).where(ProductLicense.id == license_id, ProductLicense.buyer_user_id == buyer_id, ProductLicense.status == "active"))
    if not license_record:
        raise HTTPException(status_code=404, detail="라이선스를 찾을 수 없습니다.")
    asset = db.scalar(select(ProductAsset).where(ProductAsset.product_id == license_record.product_id).order_by(ProductAsset.created_at.desc()))
    if not asset:
        raise HTTPException(status_code=404, detail="다운로드 가능한 파일이 없습니다.")
    url, expires_at = create_signed_url(asset.storage_path)
    audit(db, buyer_id, "marketplace.download_url.created", "product", str(license_record.product_id), {"license_id": str(license_id), "asset_id": str(asset.id)})
    db.commit()
    return {"url": url, "expires_at": expires_at}
