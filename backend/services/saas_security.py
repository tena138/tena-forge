from datetime import datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_settings
from models import (
    Academy,
    AuditLog,
    CreatorApplication,
    CreatorBalanceLedger,
    CreatorProfile,
    MarketplaceOrder,
    Plan,
    Product,
    ProductLicense,
    Subscription,
    UsageLog,
    UserRole,
)
from services.ownership import current_owner_id
from services.subject_engines import KOREAN_ENGINE, SUBJECT_ENGINES, normalize_subject_engine, normalize_subject_engines, subject_engine_pricing

ADMIN_ROLES = {"admin", "super_admin"}
CREATOR_ROLES = {"creator"}
CLOUD_PROCESSING_PLAN_CODES = {"basic_cloud", "pro_cloud", "team", "enterprise"}


def audit(db: Session, actor_id: str | None, action: str, target_type: str | None = None, target_id: str | None = None, metadata: dict | None = None) -> None:
    db.add(AuditLog(actor_id=actor_id, action=action, target_type=target_type, target_id=target_id, metadata_json=metadata or {}))


def get_roles(db: Session, user_id: str) -> set[str]:
    roles = set(db.scalars(select(UserRole.role).where(UserRole.user_id == user_id)).all())
    academy = db.get(Academy, user_id)
    settings = get_settings()
    admin_emails = {email.strip().lower() for email in settings.admin_emails.split(",") if email.strip()}
    if academy and academy.email.lower() in admin_emails:
        roles.add("admin")
    return roles or {"user"}


def grant_role(db: Session, user_id: str, role: str, granted_by: str | None = None) -> None:
    existing = db.scalar(select(UserRole).where(UserRole.user_id == user_id, UserRole.role == role))
    if not existing:
        db.add(UserRole(user_id=user_id, role=role, granted_by=granted_by))


def require_admin(request: Request, db: Session) -> str:
    user_id = current_owner_id(request)
    if not (get_roles(db, user_id) & ADMIN_ROLES):
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return user_id


def require_creator(request: Request, db: Session) -> str:
    user_id = current_owner_id(request)
    roles = get_roles(db, user_id)
    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.owner_id == user_id, CreatorProfile.verified_status.in_(["verified", "official_partner"])))
    if "creator" not in roles or not profile:
        raise HTTPException(status_code=403, detail="승인된 크리에이터만 이용할 수 있습니다.")
    return user_id


def ensure_default_plans(db: Session) -> None:
    defaults = [
        ("free", "Free", 0, 3, 30, 100, 100_000),
        ("basic_local", "Basic Local", 48000, 100, 1000, 20480, 5_000_000),
        ("basic_cloud", "Basic Cloud", 79000, 100, 1000, 20480, 5_000_000),
        ("pro", "Pro", 29000, 100, 1000, 5120, 5_000_000),
        ("pro_cloud", "Pro Cloud", 157000, 500, 10000, 51200, 50_000_000),
        ("team", "Team", 99000, 500, 10000, 51200, 50_000_000),
        ("enterprise", "Enterprise", 0, 999999, 999999, 999999, 999999999),
    ]
    for code, name, price, uploads, pages, storage, tokens in defaults:
        pricing = subject_engine_pricing(price, ["math"])
        plan = db.scalar(select(Plan).where(Plan.code == code))
        if not plan:
            db.add(
                Plan(
                    code=code,
                    name=name,
                    monthly_price=price,
                    monthly_upload_count=uploads,
                    monthly_processed_pages=pages,
                    storage_quota_mb=storage,
                    monthly_ai_tokens=tokens,
                    enabled_subject_engines=pricing["enabled_subject_engines"],
                    subject_engine_count=int(pricing["subject_engine_count"]),
                    subject_multiplier=float(pricing["subject_multiplier"]),
                    final_monthly_price=int(pricing["final_monthly_price"]),
                    final_annual_price=int(pricing["final_annual_price"]),
                )
            )
        else:
            engines = normalize_subject_engines(getattr(plan, "enabled_subject_engines", None))
            pricing = subject_engine_pricing(plan.monthly_price, engines)
            plan.enabled_subject_engines = pricing["enabled_subject_engines"]
            plan.subject_engine_count = int(pricing["subject_engine_count"])
            plan.subject_multiplier = float(pricing["subject_multiplier"])
            plan.final_monthly_price = int(pricing["final_monthly_price"])
            plan.final_annual_price = int(pricing["final_annual_price"])


def active_subscription(db: Session, user_id: str) -> Subscription | None:
    return db.scalar(
        select(Subscription)
        .where(Subscription.user_id == user_id, Subscription.status.in_(["trialing", "active"]))
        .order_by(Subscription.created_at.desc())
    )


def has_cloud_processing(db: Session, user_id: str) -> bool:
    roles = get_roles(db, user_id)
    if roles & ADMIN_ROLES:
        return True
    subscription = active_subscription(db, user_id)
    if not subscription:
        return False
    plan_code = str(subscription.plan_code or "").strip().lower()
    return plan_code in CLOUD_PROCESSING_PLAN_CODES or plan_code.endswith("_cloud")


def enabled_subject_engines_for_user(db: Session, user_id: str) -> list[str]:
    roles = get_roles(db, user_id)
    if roles & ADMIN_ROLES:
        return sorted(SUBJECT_ENGINES)
    ensure_default_plans(db)
    subscription = active_subscription(db, user_id)
    if subscription:
        return normalize_subject_engines(subscription.enabled_subject_engines)
    plan = db.scalar(select(Plan).where(Plan.code == "free"))
    return normalize_subject_engines(plan.enabled_subject_engines if plan else ["math"])


def ensure_subject_engine_access(db: Session, user_id: str, subject_engine: str) -> None:
    engine = normalize_subject_engine(subject_engine)
    if engine in enabled_subject_engines_for_user(db, user_id):
        return
    if engine == KOREAN_ENGINE:
        detail = "Korean Language extraction is not enabled for this plan. Enable the Korean Language subject engine in billing."
    else:
        detail = "This subject extraction engine is not enabled for this plan."
    raise HTTPException(status_code=402, detail=detail)


def usage_summary(db: Session, user_id: str) -> tuple[Plan, Subscription | None, int, int, int, float]:
    ensure_default_plans(db)
    subscription = active_subscription(db, user_id)
    plan_code = subscription.plan_code if subscription else "free"
    plan = db.scalar(select(Plan).where(Plan.code == plan_code)) or db.scalar(select(Plan).where(Plan.code == "free"))
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    uploads = db.scalar(select(func.count(UsageLog.id)).where(UsageLog.user_id == user_id, UsageLog.usage_type == "upload", UsageLog.created_at >= month_start)) or 0
    pages = db.scalar(select(func.coalesce(func.sum(UsageLog.pages_count), 0)).where(UsageLog.user_id == user_id, UsageLog.created_at >= month_start)) or 0
    tokens = db.scalar(select(func.coalesce(func.sum(UsageLog.tokens_used), 0)).where(UsageLog.user_id == user_id, UsageLog.created_at >= month_start)) or 0
    storage = db.scalar(select(func.coalesce(func.sum(UsageLog.storage_mb), 0)).where(UsageLog.user_id == user_id)) or 0
    return plan, subscription, int(uploads), int(pages), int(tokens), float(storage)


def enforce_usage_limit(db: Session, user_id: str, pages_to_add: int = 0, upload_count: int = 0) -> None:
    plan, _, uploads, pages, _, _ = usage_summary(db, user_id)
    if uploads + upload_count > plan.monthly_upload_count:
        raise HTTPException(status_code=402, detail="이번 달 업로드 한도를 초과했습니다. 플랜을 업그레이드하세요.")
    if pages + pages_to_add > plan.monthly_processed_pages:
        raise HTTPException(status_code=402, detail="이번 달 처리 페이지 한도를 초과했습니다. 플랜을 업그레이드하세요.")


def platform_commission_rate(db: Session, creator_id: str | None = None) -> float:
    # Creator-specific overrides can be added to platform_settings later.
    return 0.10


def calculate_order_amounts(price: int, commission_rate: float) -> tuple[int, int, int, int]:
    gross = max(int(price), 0)
    payment_fee = 0
    commission = int(round(gross * commission_rate))
    creator_net = max(gross - payment_fee - commission, 0)
    return gross, payment_fee, commission, creator_net


def create_signed_url(path: str, expires_minutes: int = 15) -> tuple[str, datetime]:
    expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
    # Local development signed URL placeholder. Production should delegate this to
    # Supabase Storage or S3 signed URLs and verify the token server-side.
    return f"/api/secure-download?path={path}&expires={int(expires_at.timestamp())}", expires_at


def ensure_buyer_license(db: Session, user_id: str, product_id: UUID) -> ProductLicense:
    license_record = db.scalar(
        select(ProductLicense).where(ProductLicense.buyer_user_id == user_id, ProductLicense.product_id == product_id, ProductLicense.status == "active")
    )
    if not license_record:
        raise HTTPException(status_code=403, detail="구매한 사용자만 다운로드할 수 있습니다.")
    return license_record


def product_owned_by_creator(db: Session, product_id: UUID, creator_id: str) -> Product:
    product = db.scalar(select(Product).where(Product.id == product_id, Product.creator_id == creator_id, Product.deleted_at.is_(None)))
    if not product:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다.")
    return product


def has_creator_application(db: Session, user_id: str) -> CreatorApplication | None:
    return db.scalar(select(CreatorApplication).where(CreatorApplication.user_id == user_id).order_by(CreatorApplication.created_at.desc()))
