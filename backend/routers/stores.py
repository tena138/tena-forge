from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import CreatorProfile, MarketplaceListing
from routers.marketplace import current_owner_id
from schemas import CreatorProfileCreate, CreatorProfileRead, CreatorProfileUpdate, MarketplaceListingRead

router = APIRouter(prefix="/stores", tags=["stores"])


@router.get("", response_model=list[CreatorProfileRead])
def list_stores(db: Session = Depends(get_db)):
    return db.scalars(select(CreatorProfile).order_by(CreatorProfile.updated_at.desc())).all()


@router.get("/{slug}", response_model=CreatorProfileRead)
def get_store(slug: str, db: Session = Depends(get_db)):
    profile = db.scalars(select(CreatorProfile).where(CreatorProfile.slug == slug)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Store not found.")
    return profile


@router.get("/{slug}/listings", response_model=list[MarketplaceListingRead])
def get_store_listings(slug: str, db: Session = Depends(get_db)):
    profile = db.scalars(select(CreatorProfile).where(CreatorProfile.slug == slug)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Store not found.")
    return db.scalars(
        select(MarketplaceListing)
        .where(MarketplaceListing.seller_id == profile.owner_id, MarketplaceListing.status == "published")
        .order_by(MarketplaceListing.updated_at.desc())
    ).all()


@router.post("/me", response_model=CreatorProfileRead)
def create_my_store(payload: CreatorProfileCreate, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    existing = db.scalars(select(CreatorProfile).where(CreatorProfile.owner_id == owner_id)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Store profile already exists.")
    if db.scalars(select(CreatorProfile).where(CreatorProfile.slug == payload.slug)).first():
        raise HTTPException(status_code=400, detail="Slug is already in use.")
    profile = CreatorProfile(
        owner_id=owner_id,
        display_name=payload.display_name.strip(),
        slug=payload.slug.strip(),
        bio=payload.bio,
        profile_image_url=payload.profile_image_url,
        cover_image_url=payload.cover_image_url,
        specialties=payload.specialties,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.patch("/me", response_model=CreatorProfileRead)
def update_my_store(payload: CreatorProfileUpdate, request: Request, db: Session = Depends(get_db)):
    owner_id = current_owner_id(request)
    profile = db.scalars(select(CreatorProfile).where(CreatorProfile.owner_id == owner_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Store profile not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "slug" in changes and changes["slug"] and changes["slug"] != profile.slug:
        if db.scalars(select(CreatorProfile).where(CreatorProfile.slug == changes["slug"])).first():
            raise HTTPException(status_code=400, detail="Slug is already in use.")
    for key, value in changes.items():
        setattr(profile, key, value)
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile
