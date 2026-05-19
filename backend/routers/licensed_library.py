from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import LicenseEntitlement
from schemas import LicenseEntitlementRead
from routers.marketplace import current_owner_id

router = APIRouter(prefix="/licensed-library", tags=["licensed-library"])


def _list_entitlements(request: Request, db: Session, status: str | None = None):
    owner_id = current_owner_id(request)
    rows = db.scalars(
        select(LicenseEntitlement)
        .where(LicenseEntitlement.buyer_id == owner_id)
        .options(joinedload(LicenseEntitlement.listing))
        .order_by(LicenseEntitlement.updated_at.desc())
    ).all()
    for entitlement in rows:
        if entitlement.status == "active" and entitlement.ends_at and entitlement.ends_at <= datetime.utcnow():
            entitlement.status = "expired"
    db.commit()
    if status:
        rows = [entitlement for entitlement in rows if entitlement.status == status]
    return rows


@router.get("", response_model=list[LicenseEntitlementRead])
def licensed_library(request: Request, db: Session = Depends(get_db)):
    return _list_entitlements(request, db)


@router.get("/active", response_model=list[LicenseEntitlementRead])
def active_licensed_library(request: Request, db: Session = Depends(get_db)):
    return _list_entitlements(request, db, "active")


@router.get("/expired", response_model=list[LicenseEntitlementRead])
def expired_licensed_library(request: Request, db: Session = Depends(get_db)):
    return _list_entitlements(request, db, "expired")
