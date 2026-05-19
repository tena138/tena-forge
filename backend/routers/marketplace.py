from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import LicenseEntitlement, MarketplaceListing, Report
from schemas import (
    LicenseEntitlementRead,
    MarketplaceListingCreate,
    MarketplaceListingRead,
    MarketplaceListingUpdate,
    ReportCreate,
    ReportRead,
)
from services.auth_security import decode_access_token

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

LOCAL_OWNER_ID = "local_user"


def current_owner_id(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        try:
            payload = decode_access_token(authorization.split(" ", 1)[1].strip())
            if payload.get("type") == "access" and payload.get("sub"):
                return str(payload["sub"])
        except Exception:
            pass
    return LOCAL_OWNER_ID


def _query_listings(
    content_type: str | None,
    category: str | None,
    subject: str | None,
    grade: str | None,
    pricing_type: str | None,
    license_type: str | None,
    keyword: str | None,
    sort: str,
):
    statement = select(MarketplaceListing).where(MarketplaceListing.status == "published")
    if content_type:
        statement = statement.where(MarketplaceListing.content_type == content_type)
    if category:
        statement = statement.where(MarketplaceListing.category == category)
    if subject:
        statement = statement.where(MarketplaceListing.subject == subject)
    if grade:
        statement = statement.where(MarketplaceListing.grade == grade)
    if pricing_type:
        statement = statement.where(MarketplaceListing.pricing_type == pricing_type)
    if license_type:
        statement = statement.where(MarketplaceListing.license_type == license_type)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        statement = statement.where(or_(MarketplaceListing.title.ilike(pattern), MarketplaceListing.description.ilike(pattern)))
    if sort == "popular":
        return statement.order_by(MarketplaceListing.save_count.desc(), MarketplaceListing.view_count.desc(), MarketplaceListing.updated_at.desc())
    if sort == "most_used":
        return statement.order_by(MarketplaceListing.use_count.desc(), MarketplaceListing.updated_at.desc())
    return statement.order_by(MarketplaceListing.updated_at.desc())


@router.get("/listings", response_model=list[MarketplaceListingRead])
def list_marketplace_listings(
    content_type: str | None = None,
    category: str | None = None,
    subject: str | None = None,
    grade: str | None = None,
    pricing_type: str | None = None,
    license_type: str | None = None,
    keyword: str | None = None,
    sort: str = "recent",
    db: Session = Depends(get_db),
):
    return db.scalars(_query_listings(content_type, category, subject, grade, pricing_type, license_type, keyword, sort)).all()


@router.get("/listings/{listing_id}", response_model=MarketplaceListingRead)
def get_marketplace_listing(listing_id: UUID, db: Session = Depends(get_db)):
    listing = db.get(MarketplaceListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    if listing.status == "published":
        listing.view_count += 1
        db.commit()
        db.refresh(listing)
    return listing


@router.post("/listings", response_model=MarketplaceListingRead)
def create_marketplace_listing(payload: MarketplaceListingCreate, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    if not payload.rights_confirmed:
        raise HTTPException(status_code=400, detail="마켓플레이스 등록 전 권리 확인이 필요합니다.")
    listing = MarketplaceListing(
        seller_id=owner_id,
        content_type=payload.content_type,
        content_id=payload.content_id,
        title=payload.title.strip(),
        subtitle=payload.subtitle,
        description=payload.description,
        category=payload.category,
        subject=payload.subject,
        grade=payload.grade,
        unit=payload.unit,
        thumbnail_url=payload.thumbnail_url,
        pricing_type=payload.pricing_type,
        price_amount=payload.price_amount,
        price_currency=payload.price_currency,
        subscription_period=payload.subscription_period,
        license_type=payload.license_type,
        status=payload.status,
        rights_confirmed=True,
        rights_confirmed_at=datetime.utcnow(),
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


@router.patch("/listings/{listing_id}", response_model=MarketplaceListingRead)
def update_marketplace_listing(listing_id: UUID, payload: MarketplaceListingUpdate, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    listing = db.get(MarketplaceListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    if listing.seller_id != owner_id:
        raise HTTPException(status_code=403, detail="Only the seller can update this listing.")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if key == "rights_confirmed" and value:
            listing.rights_confirmed_at = datetime.utcnow()
        setattr(listing, key, value)
    listing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(listing)
    return listing


@router.post("/listings/{listing_id}/publish", response_model=MarketplaceListingRead)
def publish_marketplace_listing(listing_id: UUID, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    listing = db.get(MarketplaceListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    if listing.seller_id != owner_id:
        raise HTTPException(status_code=403, detail="Only the seller can publish this listing.")
    if not listing.rights_confirmed:
        raise HTTPException(status_code=400, detail="마켓플레이스 등록 전 권리 확인이 필요합니다.")
    listing.status = "published"
    listing.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(listing)
    return listing


@router.post("/listings/{listing_id}/save", response_model=MarketplaceListingRead)
def save_marketplace_listing(listing_id: UUID, db: Session = Depends(get_db)):
    listing = db.get(MarketplaceListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    listing.save_count += 1
    db.commit()
    db.refresh(listing)
    return listing


@router.post("/listings/{listing_id}/unsave", response_model=MarketplaceListingRead)
def unsave_marketplace_listing(listing_id: UUID, db: Session = Depends(get_db)):
    listing = db.get(MarketplaceListing, listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found.")
    listing.save_count = max(0, listing.save_count - 1)
    db.commit()
    db.refresh(listing)
    return listing


@router.post("/listings/{listing_id}/report", response_model=ReportRead)
def report_marketplace_listing(listing_id: UUID, payload: ReportCreate, request: Request, db: Session = Depends(get_db)):
    if not db.get(MarketplaceListing, listing_id):
        raise HTTPException(status_code=404, detail="Listing not found.")
    report = Report(
        reporter_id=current_owner_id(request),
        target_type="listing",
        target_id=str(listing_id),
        reason=payload.reason,
        description=payload.description,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def _create_entitlement(db: Session, request: Request, listing_id: UUID, license_type: str, ends_at: datetime | None):
    listing = db.get(MarketplaceListing, listing_id)
    if not listing or listing.status != "published":
        raise HTTPException(status_code=404, detail="Listing not found.")
    buyer_id = current_owner_id(request)
    entitlement = LicenseEntitlement(
        buyer_id=buyer_id,
        seller_id=listing.seller_id,
        listing_id=listing.id,
        content_type=listing.content_type,
        content_id=listing.content_id,
        license_type=license_type,
        status="active",
        starts_at=datetime.utcnow(),
        ends_at=ends_at,
        can_view=True,
        can_export=True,
        can_edit=license_type in {"editable_permanent", "institutional"},
        can_publish=False,
        can_permanently_save=license_type in {"permanent_use", "editable_permanent", "institutional"},
    )
    listing.use_count += 1
    db.add(entitlement)
    db.commit()
    db.refresh(entitlement)
    return entitlement


@router.post("/listings/{listing_id}/claim-free", response_model=LicenseEntitlementRead)
def claim_free_listing(listing_id: UUID, request: Request, db: Session = Depends(get_db)):
    # Development entitlement route. Replace with real checkout/payment integration later.
    return _create_entitlement(db, request, listing_id, "free_use", None)


@router.post("/listings/{listing_id}/simulate-subscribe", response_model=LicenseEntitlementRead)
def simulate_subscribe_listing(listing_id: UUID, request: Request, db: Session = Depends(get_db)):
    # Development entitlement route. A simulated subscription lasts 30 days.
    return _create_entitlement(db, request, listing_id, "subscription_use", datetime.utcnow() + timedelta(days=30))


@router.post("/listings/{listing_id}/simulate-permanent-license", response_model=LicenseEntitlementRead)
def simulate_permanent_license_listing(listing_id: UUID, request: Request, db: Session = Depends(get_db)):
    # Development entitlement route. Permanent license has no expiration.
    return _create_entitlement(db, request, listing_id, "permanent_use", None)
