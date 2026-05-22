from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import JobOutput, ProcessingJob, Subscription, SubscriptionEvent, UsageLog
from schemas import CheckoutRequest, CheckoutResponse, ProcessingJobCreate, ProcessingJobRead, SignedUrlResponse, UsageSummaryRead
from services.ownership import current_owner_id
from services.saas_security import audit, create_signed_url, enforce_usage_limit, ensure_default_plans, get_roles, usage_summary
from services.subject_engines import normalize_subject_engines, subject_engine_pricing

router = APIRouter(prefix="/api/saas", tags=["saas"])


@router.get("/roles")
def roles(request: Request, db: Session = Depends(get_db)):
    return {"roles": sorted(get_roles(db, current_owner_id(request)))}


@router.get("/billing/summary", response_model=UsageSummaryRead)
def billing_summary(request: Request, db: Session = Depends(get_db)):
    plan, subscription, uploads, pages, tokens, storage = usage_summary(db, current_owner_id(request))
    return {
        "plan": plan,
        "subscription": subscription,
        "monthly_uploads_used": uploads,
        "monthly_pages_used": pages,
        "monthly_ai_tokens_used": tokens,
        "storage_mb_used": storage,
    }


@router.get("/plans")
def list_plans(db: Session = Depends(get_db)):
    ensure_default_plans(db)
    db.commit()
    from models import Plan

    return db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.monthly_price)).all()


@router.post("/billing/checkout", response_model=CheckoutResponse)
def create_checkout(payload: CheckoutRequest, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    ensure_default_plans(db)
    from models import Plan

    plan = db.scalar(select(Plan).where(Plan.code == payload.plan_code))
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")
    enabled_engines = normalize_subject_engines(payload.enabled_subject_engines)
    pricing = subject_engine_pricing(plan.monthly_price, enabled_engines)
    subscription = Subscription(
        user_id=user_id,
        plan_code=payload.plan_code,
        status="active",
        provider="mock",
        current_period_start=datetime.utcnow(),
        enabled_subject_engines=pricing["enabled_subject_engines"],
        subject_engine_count=int(pricing["subject_engine_count"]),
        subject_multiplier=float(pricing["subject_multiplier"]),
        final_monthly_price=int(pricing["final_monthly_price"]),
        final_annual_price=int(pricing["final_annual_price"]),
    )
    db.add(subscription)
    event_payload = {
        "plan_code": payload.plan_code,
        "enabled_subject_engines": pricing["enabled_subject_engines"],
        "final_monthly_price": pricing["final_monthly_price"],
    }
    db.add(SubscriptionEvent(provider="mock", provider_event_id=f"checkout-{subscription.id}", event_type="subscription.mock_checkout", payload=event_payload, processed_at=datetime.utcnow()))
    audit(db, user_id, "subscription.checkout.mock", "subscription", str(subscription.id), event_payload)
    db.commit()
    return {"provider": "mock", "checkout_url": "/billing?mock=success", "message": "개발용 mock 결제가 완료되었습니다."}


@router.post("/jobs", response_model=ProcessingJobRead)
def create_job(payload: ProcessingJobCreate, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    enforce_usage_limit(db, user_id, pages_to_add=payload.page_count, upload_count=1)
    job = ProcessingJob(
        user_id=user_id,
        status="queued",
        input_file_url=payload.input_file_url,
        source_filename=payload.source_filename,
        file_size=payload.file_size,
        page_count=payload.page_count,
        options=payload.options,
    )
    db.add(job)
    db.flush()
    db.add(UsageLog(job_id=job.id, user_id=user_id, usage_type="upload", pages_count=payload.page_count, storage_mb=round(payload.file_size / 1024 / 1024, 3)))
    audit(db, user_id, "job.created", "job", str(job.id), {"source_filename": payload.source_filename})
    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs", response_model=list[ProcessingJobRead])
def list_jobs(request: Request, db: Session = Depends(get_db)):
    return db.scalars(select(ProcessingJob).where(ProcessingJob.user_id == current_owner_id(request)).order_by(ProcessingJob.created_at.desc())).all()


@router.get("/jobs/{job_id}", response_model=ProcessingJobRead)
def get_job(job_id: UUID, request: Request, db: Session = Depends(get_db)):
    job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id, ProcessingJob.user_id == current_owner_id(request)))
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return job


@router.post("/jobs/{job_id}/cancel", response_model=ProcessingJobRead)
def cancel_job(job_id: UUID, request: Request, db: Session = Depends(get_db)):
    job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id, ProcessingJob.user_id == current_owner_id(request)))
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    if job.status in {"completed", "failed", "canceled"}:
        return job
    job.status = "canceled"
    audit(db, job.user_id, "job.canceled", "job", str(job.id))
    db.commit()
    db.refresh(job)
    return job


@router.post("/jobs/{job_id}/download", response_model=SignedUrlResponse)
def signed_job_download(job_id: UUID, request: Request, db: Session = Depends(get_db)):
    user_id = current_owner_id(request)
    output = db.scalar(select(JobOutput).where(JobOutput.job_id == job_id, JobOutput.user_id == user_id).order_by(JobOutput.created_at.desc()))
    if not output:
        job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id, ProcessingJob.user_id == user_id))
        if not job or not job.output_file_url:
            raise HTTPException(status_code=404, detail="다운로드할 결과 파일이 없습니다.")
        path = job.output_file_url
    else:
        path = output.storage_path
    url, expires_at = create_signed_url(path)
    audit(db, user_id, "job.download_url.created", "job", str(job_id), {"path": path})
    db.commit()
    return {"url": url, "expires_at": expires_at}
