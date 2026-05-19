from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Academy,
    AuditLog,
    CopyrightReport,
    CreatorApplication,
    CreatorProfile,
    Payout,
    PayoutAccount,
    Product,
    ProductVersion,
)
from schemas import AdminReviewRequest, AuditLogRead, CopyrightReportRead, CreatorApplicationRead, PayoutRead, ProductRead
from services.saas_security import audit, grant_role, require_admin

router = APIRouter(prefix="/api/admin/saas", tags=["admin-saas"])


@router.get("/overview")
def overview(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return {
        "total_users": db.scalar(select(func.count(Academy.id))) or 0,
        "pending_creator_applications": db.scalar(select(func.count(CreatorApplication.id)).where(CreatorApplication.status.in_(["submitted", "under_review"]))) or 0,
        "products_awaiting_review": db.scalar(select(func.count(Product.id)).where(Product.status == "submitted_for_review")) or 0,
        "published_products": db.scalar(select(func.count(Product.id)).where(Product.status == "published")) or 0,
        "pending_payouts": db.scalar(select(func.count(Payout.id)).where(Payout.status.in_(["pending", "ready"]))) or 0,
        "copyright_reports": db.scalar(select(func.count(CopyrightReport.id)).where(CopyrightReport.status.in_(["submitted", "under_review", "action_required"]))) or 0,
    }


@router.get("/creator-applications", response_model=list[CreatorApplicationRead])
def list_creator_applications(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return db.scalars(select(CreatorApplication).order_by(CreatorApplication.created_at.desc())).all()


@router.post("/creator-applications/{application_id}/approve", response_model=CreatorApplicationRead)
def approve_creator_application(application_id: UUID, payload: AdminReviewRequest, request: Request, db: Session = Depends(get_db)):
    admin_id = require_admin(request, db)
    application = db.get(CreatorApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="신청서를 찾을 수 없습니다.")
    application.status = "approved"
    application.admin_notes = payload.admin_notes
    application.reviewed_by = admin_id
    application.reviewed_at = datetime.utcnow()
    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.owner_id == application.user_id))
    if not profile:
        base_slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in application.display_name).strip("-") or f"creator-{application.user_id[:8]}"
        profile = CreatorProfile(owner_id=application.user_id, display_name=application.display_name, slug=f"{base_slug}-{application.user_id[:6]}", verified_status="verified")
        db.add(profile)
    else:
        profile.verified_status = "verified"
    db.add(PayoutAccount(creator_id=application.user_id, bank_name=application.payout_bank_name, account_number=application.payout_account_number, account_holder=application.payout_account_holder, status="verified"))
    grant_role(db, application.user_id, "creator", admin_id)
    audit(db, admin_id, "creator.application.approved", "creator_application", str(application.id), {"user_id": application.user_id})
    db.commit()
    db.refresh(application)
    return application


@router.post("/creator-applications/{application_id}/reject", response_model=CreatorApplicationRead)
def reject_creator_application(application_id: UUID, payload: AdminReviewRequest, request: Request, db: Session = Depends(get_db)):
    admin_id = require_admin(request, db)
    application = db.get(CreatorApplication, application_id)
    if not application:
        raise HTTPException(status_code=404, detail="신청서를 찾을 수 없습니다.")
    application.status = "rejected"
    application.rejection_reason = payload.reason
    application.admin_notes = payload.admin_notes
    application.reviewed_by = admin_id
    application.reviewed_at = datetime.utcnow()
    audit(db, admin_id, "creator.application.rejected", "creator_application", str(application.id), {"reason": payload.reason})
    db.commit()
    db.refresh(application)
    return application


@router.get("/product-review-queue", response_model=list[ProductRead])
def product_review_queue(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return db.scalars(select(Product).where(Product.status == "submitted_for_review").order_by(Product.updated_at.desc())).all()


@router.post("/products/{product_id}/approve", response_model=ProductRead)
def approve_product(product_id: UUID, payload: AdminReviewRequest, request: Request, db: Session = Depends(get_db)):
    admin_id = require_admin(request, db)
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다.")
    product.status = "approved"
    version = db.scalar(select(ProductVersion).where(ProductVersion.product_id == product.id).order_by(ProductVersion.version_number.desc()))
    if version:
        version.status = "approved"
    audit(db, admin_id, "product.approved", "product", str(product.id), {"notes": payload.admin_notes})
    db.commit()
    db.refresh(product)
    return product


@router.post("/products/{product_id}/reject", response_model=ProductRead)
def reject_product(product_id: UUID, payload: AdminReviewRequest, request: Request, db: Session = Depends(get_db)):
    admin_id = require_admin(request, db)
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다.")
    product.status = "rejected"
    audit(db, admin_id, "product.rejected", "product", str(product.id), {"reason": payload.reason})
    db.commit()
    db.refresh(product)
    return product


@router.post("/products/{product_id}/takedown", response_model=ProductRead)
def takedown_product(product_id: UUID, payload: AdminReviewRequest, request: Request, db: Session = Depends(get_db)):
    admin_id = require_admin(request, db)
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다.")
    product.status = "taken_down"
    audit(db, admin_id, "product.taken_down", "product", str(product.id), {"reason": payload.reason})
    db.commit()
    db.refresh(product)
    return product


@router.get("/payouts", response_model=list[PayoutRead])
def list_payouts(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return db.scalars(select(Payout).order_by(Payout.created_at.desc())).all()


@router.post("/payouts/{payout_id}/mark-paid", response_model=PayoutRead)
def mark_payout_paid(payout_id: UUID, request: Request, db: Session = Depends(get_db)):
    admin_id = require_admin(request, db)
    payout = db.get(Payout, payout_id)
    if not payout:
        raise HTTPException(status_code=404, detail="정산을 찾을 수 없습니다.")
    payout.status = "paid"
    payout.paid_at = datetime.utcnow()
    audit(db, admin_id, "payout.marked_paid", "payout", str(payout.id))
    db.commit()
    db.refresh(payout)
    return payout


@router.get("/copyright-reports", response_model=list[CopyrightReportRead])
def list_copyright_reports(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return db.scalars(select(CopyrightReport).order_by(CopyrightReport.created_at.desc())).all()


@router.get("/audit-logs", response_model=list[AuditLogRead])
def list_audit_logs(request: Request, db: Session = Depends(get_db)):
    require_admin(request, db)
    return db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200)).all()
