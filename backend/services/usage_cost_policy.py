from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import Academy, Batch, BatchStatus, Plan, PlatformSetting, Subscription, UsageLog
from services.subject_engines import KOREAN_ENGINE, normalize_subject_engine


POLICY_SETTING_KEY = "usage_cost_policy"
KRW_PER_BASE_CREDIT = 26.0
SAFETY_BUDGET_RATE = 0.80
DEFAULT_KRW_PER_USD = 1520


@dataclass(frozen=True)
class PlanCostPolicy:
    plan_id: str
    monthly_cost_cap_krw: int
    storage_gb_limit: float
    monthly_upload_mb_limit: int
    max_file_size_mb: int
    max_pages_per_job: int
    max_jobs_per_day: int
    max_concurrent_jobs: int
    original_file_retention_days: int
    extracted_result_retention_days: int
    allowed_models: tuple[str, ...]
    default_model: str
    fallback_model: str | None
    allow_premium_model: bool

    @property
    def monthly_credit_limit(self) -> int:
        safe_budget = self.monthly_cost_cap_krw * SAFETY_BUDGET_RATE
        return max(1, int(math.floor(safe_budget / KRW_PER_BASE_CREDIT)))

    @property
    def monthly_processed_pages_limit(self) -> int:
        return self.monthly_credit_limit

    @property
    def storage_quota_mb(self) -> int:
        return int(round(self.storage_gb_limit * 1024))


@dataclass(frozen=True)
class ExtractionEstimate:
    usage_type: str
    processed_pages: int
    credits: float
    estimated_cost_krw: int
    metadata: dict[str, Any]

    @property
    def credits_milli(self) -> int:
        return int(math.ceil(self.credits * 1000))


DEFAULT_PLAN_POLICIES: dict[str, PlanCostPolicy] = {
    "free": PlanCostPolicy(
        plan_id="free",
        monthly_cost_cap_krw=1_000,
        storage_gb_limit=0.1,
        monthly_upload_mb_limit=50,
        max_file_size_mb=10,
        max_pages_per_job=5,
        max_jobs_per_day=2,
        max_concurrent_jobs=1,
        original_file_retention_days=1,
        extracted_result_retention_days=7,
        allowed_models=("mini",),
        default_model="mini",
        fallback_model=None,
        allow_premium_model=False,
    ),
    "basic": PlanCostPolicy(
        plan_id="basic",
        monthly_cost_cap_krw=13_000,
        storage_gb_limit=1,
        monthly_upload_mb_limit=500,
        max_file_size_mb=300,
        max_pages_per_job=500,
        max_jobs_per_day=10,
        max_concurrent_jobs=2,
        original_file_retention_days=30,
        extracted_result_retention_days=365,
        allowed_models=("mini", "standard"),
        default_model="mini",
        fallback_model="standard",
        allow_premium_model=False,
    ),
    "pro": PlanCostPolicy(
        plan_id="pro",
        monthly_cost_cap_krw=30_000,
        storage_gb_limit=5,
        monthly_upload_mb_limit=3_000,
        max_file_size_mb=1000,
        max_pages_per_job=1500,
        max_jobs_per_day=50,
        max_concurrent_jobs=5,
        original_file_retention_days=90,
        extracted_result_retention_days=365,
        allowed_models=("mini", "standard"),
        default_model="mini",
        fallback_model="standard",
        allow_premium_model=False,
    ),
    "enterprise": PlanCostPolicy(
        plan_id="enterprise",
        monthly_cost_cap_krw=999_999_999,
        storage_gb_limit=999,
        monthly_upload_mb_limit=999_999,
        max_file_size_mb=5000,
        max_pages_per_job=5000,
        max_jobs_per_day=999,
        max_concurrent_jobs=20,
        original_file_retention_days=365,
        extracted_result_retention_days=3650,
        allowed_models=("mini", "standard", "premium"),
        default_model="standard",
        fallback_model="premium",
        allow_premium_model=True,
    ),
}

PLAN_ALIASES = {
    "basic_local": "basic",
    "basic_cloud": "basic",
    "pro_cloud": "pro",
    "team": "pro",
}


def canonical_plan_id(plan_code: str | None) -> str:
    code = str(plan_code or "free").strip().lower()
    return PLAN_ALIASES.get(code, code if code in DEFAULT_PLAN_POLICIES else "free")


def _month_start(now: datetime | None = None) -> datetime:
    value = now or datetime.utcnow()
    return value.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _day_start(now: datetime | None = None) -> datetime:
    value = now or datetime.utcnow()
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


def _policy_from_dict(plan_id: str, base: PlanCostPolicy, value: dict[str, Any]) -> PlanCostPolicy:
    data = {**base.__dict__, **{key: item for key, item in value.items() if key in base.__dict__}}
    data["plan_id"] = plan_id
    if isinstance(data.get("allowed_models"), list):
        data["allowed_models"] = tuple(str(item) for item in data["allowed_models"])
    return PlanCostPolicy(**data)


def plan_cost_policy(db: Session | None, plan_code: str | None) -> PlanCostPolicy:
    plan_id = canonical_plan_id(plan_code)
    base = DEFAULT_PLAN_POLICIES[plan_id]
    if not db:
        return base
    setting = db.get(PlatformSetting, POLICY_SETTING_KEY)
    plans = (setting.value or {}).get("plans", {}) if setting else {}
    override = plans.get(plan_code or "") or plans.get(plan_id)
    if isinstance(override, dict):
        return _policy_from_dict(plan_id, base, override)
    return base


def active_plan_for_user(db: Session, user_id: str) -> tuple[Plan | None, Subscription | None, PlanCostPolicy]:
    now = datetime.utcnow()
    subscription = db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.status.in_(["trialing", "active"]),
            ((Subscription.current_period_end.is_(None)) | (Subscription.current_period_end > now)),
        )
        .order_by(Subscription.created_at.desc())
    )
    academy = db.get(Academy, user_id)
    plan_code = subscription.plan_code if subscription else (academy.plan.value if academy and academy.plan else "free")
    canonical = canonical_plan_id(plan_code)
    plan = (
        db.scalar(select(Plan).where(Plan.code == plan_code))
        or db.scalar(select(Plan).where(Plan.code == canonical))
        or db.scalar(select(Plan).where(Plan.code == "free"))
    )
    return plan, subscription, plan_cost_policy(db, plan_code)


def academy_payment_required(db: Session, user_id: str) -> bool:
    academy = db.get(Academy, user_id)
    if not academy or academy.account_type != "academy" or not academy.plan_expires_at:
        return False
    if academy.plan_expires_at > datetime.utcnow():
        return False
    subscription = db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.status == "active",
            ((Subscription.current_period_end.is_(None)) | (Subscription.current_period_end > datetime.utcnow())),
        )
        .order_by(Subscription.created_at.desc())
    )
    return subscription is None


def monthly_usage_totals(db: Session, user_id: str, now: datetime | None = None) -> dict[str, float]:
    start = _month_start(now)
    row = db.execute(
        select(
            func.coalesce(func.sum(UsageLog.estimated_cost), 0),
            func.coalesce(func.sum(UsageLog.tokens_used), 0),
            func.coalesce(func.sum(UsageLog.storage_mb), 0),
            func.coalesce(func.sum(UsageLog.pages_count), 0),
            func.count(UsageLog.id),
        ).where(UsageLog.user_id == user_id, UsageLog.created_at >= start)
    ).one()
    cost, credits_milli, uploaded_mb, pages, event_count = row
    return {
        "estimated_cost_krw": float(cost or 0),
        "credits": float(credits_milli or 0) / 1000,
        "uploaded_mb": float(uploaded_mb or 0),
        "processed_pages": float(pages or 0),
        "event_count": float(event_count or 0),
    }


def daily_job_count(db: Session, user_id: str, now: datetime | None = None) -> int:
    start = _day_start(now)
    return int(db.scalar(select(func.count(Batch.id)).where(Batch.owner_id == user_id, Batch.created_at >= start)) or 0)


def active_job_count(db: Session, user_id: str) -> int:
    return int(
        db.scalar(
            select(func.count(Batch.id)).where(
                Batch.owner_id == user_id,
                Batch.status.in_([BatchStatus.pending, BatchStatus.processing]),
            )
        )
        or 0
    )


def likely_hard_scan(file_size_mb: float, page_count: int) -> bool:
    if page_count <= 0:
        return False
    return (file_size_mb / page_count) >= 1.0


def estimate_extraction(
    *,
    subject_engine: str,
    problem_pages: int,
    solution_pages: int = 0,
    problem_file_mb: float = 0,
    solution_file_mb: float = 0,
    usage_type: str = "batch_extraction_estimate",
) -> ExtractionEstimate:
    engine = normalize_subject_engine(subject_engine)
    total_pages = max(int(problem_pages or 0), 0) + max(int(solution_pages or 0), 0)
    hard_scan = likely_hard_scan(problem_file_mb + solution_file_mb, max(total_pages, 1))

    if engine == KOREAN_ENGINE:
        problem_multiplier = 4.0 if hard_scan else 3.0
        solution_multiplier = 1.5
        category = "korean_hard_scan" if hard_scan else "korean_long_passage"
    elif hard_scan:
        problem_multiplier = 2.0
        solution_multiplier = 2.0
        category = "math_hard_scan"
    else:
        problem_multiplier = 1.0
        solution_multiplier = 1.35
        category = "math_with_solution" if solution_pages else "clean_math"

    credits = problem_pages * problem_multiplier + solution_pages * solution_multiplier
    estimated_cost = int(math.ceil(credits * KRW_PER_BASE_CREDIT))
    return ExtractionEstimate(
        usage_type=usage_type,
        processed_pages=total_pages,
        credits=round(float(credits), 3),
        estimated_cost_krw=estimated_cost,
        metadata={
            "subject_engine": engine,
            "category": category,
            "problem_pages": problem_pages,
            "solution_pages": solution_pages,
            "problem_multiplier": problem_multiplier,
            "solution_multiplier": solution_multiplier,
            "hard_scan": hard_scan,
            "base_credit_cost_krw": KRW_PER_BASE_CREDIT,
            "safety_budget_rate": SAFETY_BUDGET_RATE,
        },
    )


def estimate_single_reextract() -> ExtractionEstimate:
    credits = 0.7
    return ExtractionEstimate(
        usage_type="problem_reextract_estimate",
        processed_pages=1,
        credits=credits,
        estimated_cost_krw=int(math.ceil(credits * KRW_PER_BASE_CREDIT)),
        metadata={"category": "problem_reextract", "base_credit_cost_krw": KRW_PER_BASE_CREDIT},
    )


def _raise_limit(reason_code: str, message: str, *, policy: PlanCostPolicy, estimate: ExtractionEstimate | None = None, current: dict[str, float] | None = None, **extra: Any) -> None:
    detail = {
        "ok": False,
        "reasonCode": reason_code,
        "message": message,
        "monthlyCostCapKrw": policy.monthly_cost_cap_krw,
        "monthlyCreditLimit": policy.monthly_credit_limit,
        **extra,
    }
    if estimate:
        detail.update({"estimatedJobCostKrw": estimate.estimated_cost_krw, "estimatedCredits": estimate.credits})
    if current:
        detail.update(
            {
                "currentCostKrw": round(current["estimated_cost_krw"]),
                "creditsUsed": round(current["credits"], 3),
                "uploadedMbThisMonth": round(current["uploaded_mb"], 3),
            }
        )
    raise HTTPException(status_code=402, detail=detail)


def enforce_extraction_preflight(
    db: Session,
    user_id: str,
    estimate: ExtractionEstimate,
    *,
    file_size_mb: float,
    page_count: int,
    upload_mb_to_add: float | None = None,
) -> PlanCostPolicy:
    if academy_payment_required(db, user_id):
        policy = plan_cost_policy(db, "basic")
        _raise_limit(
            "TRIAL_EXPIRED",
            "Your Basic trial has ended. Add a payment method or upgrade your plan to continue.",
            policy=policy,
            estimate=estimate,
            current=monthly_usage_totals(db, user_id),
        )
    _, _, policy = active_plan_for_user(db, user_id)
    current = monthly_usage_totals(db, user_id)
    upload_mb = file_size_mb if upload_mb_to_add is None else upload_mb_to_add

    if file_size_mb > policy.max_file_size_mb:
        _raise_limit("MAX_FILE_SIZE_EXCEEDED", "This PDF is larger than your plan allows.", policy=policy, estimate=estimate, current=current, fileSizeMb=round(file_size_mb, 3), maxFileSizeMb=policy.max_file_size_mb)
    if page_count > policy.max_pages_per_job:
        _raise_limit("MAX_PAGES_PER_JOB_EXCEEDED", "This PDF has more pages than your plan allows per job.", policy=policy, estimate=estimate, current=current, pageCount=page_count, maxPagesPerJob=policy.max_pages_per_job)
    if current["uploaded_mb"] + upload_mb > policy.monthly_upload_mb_limit:
        _raise_limit("MONTHLY_UPLOAD_MB_EXCEEDED", "This upload would exceed your monthly upload limit.", policy=policy, estimate=estimate, current=current, monthlyUploadMbLimit=policy.monthly_upload_mb_limit)
    if current["credits"] + estimate.credits > policy.monthly_credit_limit:
        _raise_limit("MONTHLY_CREDIT_LIMIT_EXCEEDED", "This job would exceed your monthly extraction credits.", policy=policy, estimate=estimate, current=current, creditsRemaining=max(policy.monthly_credit_limit - current["credits"], 0))
    if current["estimated_cost_krw"] + estimate.estimated_cost_krw > policy.monthly_cost_cap_krw:
        _raise_limit("MONTHLY_COST_CAP_EXCEEDED", "This job would exceed your monthly processing budget.", policy=policy, estimate=estimate, current=current, availableCostKrw=max(policy.monthly_cost_cap_krw - current["estimated_cost_krw"], 0))
    jobs_today = daily_job_count(db, user_id)
    if jobs_today >= policy.max_jobs_per_day:
        _raise_limit("DAILY_JOB_LIMIT_EXCEEDED", "You have reached today's extraction job limit.", policy=policy, estimate=estimate, current=current, jobsToday=jobs_today, maxJobsPerDay=policy.max_jobs_per_day)
    active_jobs = active_job_count(db, user_id)
    if active_jobs >= policy.max_concurrent_jobs:
        _raise_limit("CONCURRENT_JOB_LIMIT_EXCEEDED", "Too many extraction jobs are already queued or running.", policy=policy, estimate=estimate, current=current, activeJobs=active_jobs, maxConcurrentJobs=policy.max_concurrent_jobs)
    return policy


def record_usage_event(
    db: Session,
    user_id: str,
    estimate: ExtractionEstimate,
    *,
    job_id: Any | None = None,
    storage_mb: float = 0,
) -> UsageLog:
    event = UsageLog(
        job_id=job_id,
        user_id=user_id,
        usage_type=estimate.usage_type,
        pages_count=estimate.processed_pages,
        tokens_used=estimate.credits_milli,
        storage_mb=round(float(storage_mb or 0), 3),
        estimated_cost=estimate.estimated_cost_krw,
    )
    db.add(event)
    return event
