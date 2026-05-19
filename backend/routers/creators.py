from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import CreatorApplication, CreatorBalanceLedger, CreatorProfile, PayoutAccount
from schemas import CreatorApplicationCreate, CreatorApplicationRead, CreatorProfileRead
from services.ownership import current_owner_id
from services.saas_security import audit, grant_role, has_creator_application

router = APIRouter(prefix="/api/creators", tags=["creators"])


@router.get("/application", response_model=CreatorApplicationRead | None)
def my_application(request: Request, db: Session = Depends(get_db)):
    return has_creator_application(db, current_owner_id(request))


@router.post("/application", response_model=CreatorApplicationRead)
def submit_application(payload: CreatorApplicationCreate, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    if not all([payload.rights_agreed, payload.seller_terms_agreed, payload.infringement_policy_agreed, payload.payout_policy_agreed]):
        raise HTTPException(status_code=400, detail="필수 약관과 권리 확인에 모두 동의해야 합니다.")
    existing = has_creator_application(db, user_id)
    if existing and existing.status in {"submitted", "under_review", "approved"}:
        raise HTTPException(status_code=409, detail="이미 진행 중인 크리에이터 신청이 있습니다.")
    application = CreatorApplication(user_id=user_id, status="submitted", **payload.model_dump())
    db.add(application)
    grant_role(db, user_id, "creator_applicant", user_id)
    audit(db, user_id, "creator.application.submitted", "creator_application", str(application.id))
    db.commit()
    db.refresh(application)
    return application


@router.get("/me", response_model=CreatorProfileRead | None)
def my_creator_profile(request: Request, db: Session = Depends(get_db)):
    return db.scalar(select(CreatorProfile).where(CreatorProfile.owner_id == current_owner_id(request)))


@router.get("/metrics")
def creator_metrics(request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.owner_id == user_id))
    if not profile:
        return {"approved": False, "total_sales": 0, "monthly_sales": 0, "pending_payout": 0, "paid_payout": 0}
    total = db.scalar(select(CreatorBalanceLedger).where(CreatorBalanceLedger.creator_id == user_id))
    balance = db.scalars(select(CreatorBalanceLedger).where(CreatorBalanceLedger.creator_id == user_id)).all()
    pending = sum(item.amount for item in balance if item.entry_type in {"sale", "adjustment"})
    return {"approved": True, "display_name": profile.display_name, "total_sales": pending, "monthly_sales": pending, "pending_payout": pending, "paid_payout": 0}
