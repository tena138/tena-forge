from datetime import datetime, timedelta
import os
from pathlib import Path
import sys

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal
from models import Academy, AcademyPlan, AcademyStudentSubscription, Plan, Subscription
from services.academy_student_access import ensure_academy_subscription, ensure_default_academy_plans
from services.auth_security import hash_password, validate_password_policy
from services.subject_engines import subject_engine_pricing
from services.subscription_pricing import calculate_subscription_price


TEST_PASSWORD = os.getenv("TEST_ACADEMY_PASSWORD", os.getenv("PG_REVIEW_PASSWORD", "TenaReview!2026")).strip()
ACCOUNT_A_EMAIL = os.getenv("TEST_ACADEMY_A_EMAIL", "academy-a-test@tena-forge.com").strip().lower()
ACCOUNT_B_EMAIL = os.getenv("TEST_ACADEMY_B_EMAIL", "academy-b-test@tena-forge.com").strip().lower()
ACCOUNT_A_NAME = os.getenv("TEST_ACADEMY_A_NAME", "Tena Forge Test Academy A").strip() or "Tena Forge Test Academy A"
ACCOUNT_B_NAME = os.getenv("TEST_ACADEMY_B_NAME", "Tena Forge Test Academy B").strip() or "Tena Forge Test Academy B"
TRIAL_DAYS = int(os.getenv("TEST_ACADEMY_A_TRIAL_DAYS", "7"))


def _ensure_plan(db, *, code: str, name: str, monthly_price: int) -> None:
    pricing = subject_engine_pricing(monthly_price, ["math"])
    plan = db.scalar(select(Plan).where(Plan.code == code))
    if not plan:
        plan = Plan(code=code, name=name)
        db.add(plan)
    plan.name = name
    plan.monthly_price = monthly_price
    plan.monthly_upload_count = 100
    plan.monthly_processed_pages = 1000
    plan.storage_quota_mb = 20480
    plan.monthly_ai_tokens = 5_000_000
    plan.enabled_subject_engines = pricing["enabled_subject_engines"]
    plan.subject_engine_count = int(pricing["subject_engine_count"])
    plan.subject_multiplier = float(pricing["subject_multiplier"])
    plan.final_monthly_price = int(pricing["final_monthly_price"])
    plan.final_annual_price = int(pricing["final_annual_price"])
    plan.is_active = True


def _upsert_academy(db, *, email: str, name: str, plan: AcademyPlan, now: datetime) -> Academy:
    validate_password_policy(TEST_PASSWORD, email, name)
    account = db.scalar(select(Academy).where(Academy.email == email))
    if not account:
        account = Academy(
            email=email,
            password_hash=hash_password(TEST_PASSWORD),
            academy_name=name,
            account_type="academy",
            email_verified=True,
            email_verified_at=now,
            is_active=True,
            is_suspended=False,
            plan=plan,
        )
        db.add(account)
        db.flush()
        print(f"Created test academy account: {email}")
    else:
        print(f"Updated test academy account: {email}")
    account.password_hash = hash_password(TEST_PASSWORD)
    account.academy_name = name
    account.account_type = "academy"
    account.email_verified = True
    account.email_verified_at = account.email_verified_at or now
    account.is_active = True
    account.is_suspended = False
    account.suspension_reason = None
    account.failed_login_attempts = 0
    account.locked_until = None
    account.plan = plan
    return account


def _cancel_live_subscriptions(db, user_id: str, now: datetime) -> None:
    for subscription in db.scalars(select(Subscription).where(Subscription.user_id == user_id, Subscription.status.in_(["trialing", "active"]))).all():
        subscription.status = "canceled"
        subscription.cancel_at_period_end = False
        subscription.current_period_end = now
        subscription.updated_at = now


def _apply_account_a_trial(db, account: Academy, now: datetime) -> None:
    user_id = str(account.id)
    trial_end = now + timedelta(days=TRIAL_DAYS)
    selected_packages = {"staff": "basic-staff-1"}
    pricing = calculate_subscription_price("basic", "monthly", selected_packages, ["math"])
    _cancel_live_subscriptions(db, user_id, now)
    subscription = Subscription(
        user_id=user_id,
        plan_code="basic",
        status="trialing",
        provider="test-bootstrap",
        provider_subscription_id=f"test-bootstrap-{user_id}",
        current_period_start=now,
        current_period_end=trial_end,
        enabled_subject_engines=["math"],
        subject_engine_count=1,
        subject_multiplier=1,
        final_monthly_price=int(pricing["monthly_price_krw"]),
        final_annual_price=int(pricing["monthly_price_krw"]) * 12,
    )
    db.add(subscription)
    account.plan = AcademyPlan.basic
    account.plan_expires_at = trial_end
    student_subscription = ensure_academy_subscription(db, user_id)
    student_subscription.plan_code = "basic"
    student_subscription.status = "active"
    student_subscription.purchased_additional_seats = 0
    student_subscription.purchased_staff_seats = 1
    student_subscription.current_period_start = now
    student_subscription.current_period_end = trial_end
    student_subscription.billing_metadata = {
        **(student_subscription.billing_metadata or {}),
        "test_bootstrap": True,
        "staff_seat_pack": 1,
        "policy": "payment_method_trial",
    }
    student_subscription.updated_at = now
    print(f"Applied Basic trial + 1 staff seat to {ACCOUNT_A_EMAIL} until {trial_end.isoformat()}.")


def _apply_account_b_free(db, account: Academy, now: datetime) -> None:
    user_id = str(account.id)
    _cancel_live_subscriptions(db, user_id, now)
    account.plan = AcademyPlan.free
    account.plan_expires_at = None
    sub = db.scalar(select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id == user_id))
    if sub:
        sub.plan_code = "free"
        sub.status = "active"
        sub.purchased_additional_seats = 0
        sub.purchased_staff_seats = 0
        sub.current_period_start = now
        sub.current_period_end = now + timedelta(days=31)
        sub.updated_at = now
    print(f"Applied Free plan to {ACCOUNT_B_EMAIL}.")


def main() -> None:
    if not TEST_PASSWORD:
        print("Skipping workspace test accounts: password is empty.")
        return
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        ensure_default_academy_plans(db)
        _ensure_plan(db, code="basic", name="Basic", monthly_price=48_000)
        _ensure_plan(db, code="pro", name="Pro", monthly_price=108_000)
        account_a = _upsert_academy(db, email=ACCOUNT_A_EMAIL, name=ACCOUNT_A_NAME, plan=AcademyPlan.basic, now=now)
        account_b = _upsert_academy(db, email=ACCOUNT_B_EMAIL, name=ACCOUNT_B_NAME, plan=AcademyPlan.free, now=now)
        _apply_account_a_trial(db, account_a, now)
        _apply_account_b_free(db, account_b, now)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
