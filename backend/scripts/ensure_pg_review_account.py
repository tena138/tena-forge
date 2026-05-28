from datetime import datetime
import os
from pathlib import Path
import sys

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal
from models import Academy, AcademyPlan, Subscription
from services.auth_security import hash_password, validate_password_policy


REVIEW_EMAIL = os.getenv("PG_REVIEW_EMAIL", "pg-review@tena-forge.com").strip().lower()
REVIEW_PASSWORD = os.getenv("PG_REVIEW_PASSWORD", "TenaTossReview!2026").strip()
REVIEW_NAME = os.getenv("PG_REVIEW_NAME", "Toss Payments Review").strip() or "Toss Payments Review"
SECONDARY_REVIEW_EMAIL = os.getenv("PG_REVIEW_SECONDARY_EMAIL", "review@tena-forge.com").strip().lower()
SECONDARY_REVIEW_PASSWORD = os.getenv("PG_REVIEW_SECONDARY_PASSWORD", "LumaGate!2026").strip()
SECONDARY_REVIEW_NAME = os.getenv("PG_REVIEW_SECONDARY_NAME", "Tena Forge Review").strip() or "Tena Forge Review"


def ensure_review_account(db, *, email: str, password: str, name: str, now: datetime) -> None:
    if not email or not password:
        print("Skipping PG review account bootstrap: review email or password is empty.")
        return

    validate_password_policy(password, email, name)

    account = db.scalar(select(Academy).where(Academy.email == email))
    if not account:
        account = Academy(
            email=email,
            password_hash=hash_password(password),
            academy_name=name,
            account_type="academy",
            plan=AcademyPlan.free,
            plan_expires_at=None,
            email_verified=True,
            email_verified_at=now,
            is_active=True,
            is_suspended=False,
            failed_login_attempts=0,
            locked_until=None,
        )
        db.add(account)
        db.flush()
        print(f"Created PG review account: {email}")
    else:
        account.password_hash = hash_password(password)
        account.academy_name = name
        account.account_type = "academy"
        account.plan = AcademyPlan.free
        account.plan_expires_at = None
        account.email_verified = True
        account.email_verified_at = account.email_verified_at or now
        account.is_active = True
        account.is_suspended = False
        account.suspension_reason = None
        account.failed_login_attempts = 0
        account.locked_until = None
        print(f"Updated PG review account: {email}")

    for subscription in db.scalars(select(Subscription).where(Subscription.user_id == str(account.id), Subscription.status.in_(["trialing", "active"]))).all():
        subscription.status = "canceled"
        subscription.current_period_end = now
        subscription.cancel_at_period_end = False


def main() -> None:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        ensure_review_account(db, email=REVIEW_EMAIL, password=REVIEW_PASSWORD, name=REVIEW_NAME, now=now)
        ensure_review_account(db, email=SECONDARY_REVIEW_EMAIL, password=SECONDARY_REVIEW_PASSWORD, name=SECONDARY_REVIEW_NAME, now=now)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
