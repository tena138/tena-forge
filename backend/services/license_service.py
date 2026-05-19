from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import HubTemplate, LicenseEntitlement, MarketplaceListing, ProblemSet

RESTRICTED_MARKETPLACE_SOURCE_TYPES = {"personal_study_only", "unknown"}


def has_active_entitlement(db: Session, user_id: str, content_type: str, content_id: str) -> bool:
    return can_view_content(db, user_id, content_type, content_id)


def get_entitlement_status(db: Session, user_id: str, listing_id) -> str | None:
    entitlement = db.scalars(
        select(LicenseEntitlement)
        .where(LicenseEntitlement.buyer_id == user_id, LicenseEntitlement.listing_id == listing_id)
        .order_by(LicenseEntitlement.created_at.desc())
    ).first()
    if not entitlement:
        return None
    return _effective_status(entitlement)


def can_view_content(db: Session, user_id: str, content_type: str, content_id: str) -> bool:
    return _has_permission(db, user_id, content_type, content_id, "can_view")


def can_export_content(db: Session, user_id: str, content_type: str, content_id: str) -> bool:
    return _has_permission(db, user_id, content_type, content_id, "can_export")


def can_edit_content(db: Session, user_id: str, content_type: str, content_id: str) -> bool:
    return _has_permission(db, user_id, content_type, content_id, "can_edit")


def is_marketplace_publish_allowed(content) -> tuple[bool, str | None]:
    # Future: add optional duplicate/similarity detection as a moderation assist tool.
    # Do not treat problem type similarity as ownership.
    source_type = getattr(content, "source_type", "unknown")
    rights_confirmed = bool(getattr(content, "rights_confirmed", False))
    if not rights_confirmed:
        return False, "마켓플레이스 등록 전 권리 확인이 필요합니다."
    if source_type in RESTRICTED_MARKETPLACE_SOURCE_TYPES:
        return False, "이 출처 유형은 공개 또는 마켓플레이스 등록이 제한됩니다."
    if isinstance(content, ProblemSet) and not getattr(content, "items", []):
        return False, "문항 세트에는 최소 1개 이상의 문항이 필요합니다."
    return True, None


def _has_permission(db: Session, user_id: str, content_type: str, content_id: str, permission: str) -> bool:
    listing = db.scalars(
        select(MarketplaceListing).where(
            MarketplaceListing.content_type == content_type,
            MarketplaceListing.content_id == str(content_id),
            MarketplaceListing.status == "published",
        )
    ).first()
    if listing and listing.seller_id == user_id:
        return True

    entitlement = db.scalars(
        select(LicenseEntitlement)
        .where(
            LicenseEntitlement.buyer_id == user_id,
            LicenseEntitlement.content_type == content_type,
            LicenseEntitlement.content_id == str(content_id),
        )
        .order_by(LicenseEntitlement.created_at.desc())
    ).first()
    if not entitlement or _effective_status(entitlement) != "active":
        return False
    return bool(getattr(entitlement, permission, False))


def _effective_status(entitlement: LicenseEntitlement) -> str:
    if entitlement.status == "active" and entitlement.ends_at and entitlement.ends_at <= datetime.utcnow():
        return "expired"
    return entitlement.status
