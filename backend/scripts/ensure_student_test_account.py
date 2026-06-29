from datetime import datetime
import os
from pathlib import Path
import sys

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal
from models import Academy, AcademyPlan
from services.auth_security import hash_password, validate_password_policy


STUDENT_EMAIL = os.getenv("TEST_STUDENT_EMAIL", "student@tena-forge.com").strip().lower()
STUDENT_PASSWORD = os.getenv("TEST_STUDENT_PASSWORD", "Learner!2026").strip()
STUDENT_NAME = os.getenv("TEST_STUDENT_NAME", "Tena Note Student").strip() or "Tena Note Student"
STUDENT_PROFILE_NAME = os.getenv("TEST_STUDENT_PROFILE_NAME", "tena_note_student").strip().lower()


def main() -> None:
    if not STUDENT_EMAIL or not STUDENT_PASSWORD:
        print("Skipping student test account bootstrap: email or password is empty.")
        return

    validate_password_policy(STUDENT_PASSWORD, STUDENT_EMAIL, STUDENT_NAME)

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        account = db.scalar(select(Academy).where(Academy.email == STUDENT_EMAIL))
        if not account:
            account = Academy(
                email=STUDENT_EMAIL,
                password_hash=hash_password(STUDENT_PASSWORD),
                academy_name=STUDENT_NAME,
                display_name=STUDENT_NAME,
                profile_name=STUDENT_PROFILE_NAME,
                account_type="student",
                email_verified=True,
                email_verified_at=now,
                is_active=True,
                is_suspended=False,
                plan=AcademyPlan.free,
            )
            db.add(account)
            print(f"Created student test account: {STUDENT_EMAIL}")
        else:
            account.password_hash = hash_password(STUDENT_PASSWORD)
            account.academy_name = STUDENT_NAME
            account.display_name = STUDENT_NAME
            account.profile_name = account.profile_name or STUDENT_PROFILE_NAME
            account.account_type = "student"
            account.email_verified = True
            account.email_verified_at = account.email_verified_at or now
            account.is_active = True
            account.is_suspended = False
            account.suspension_reason = None
            account.failed_login_attempts = 0
            account.locked_until = None
            account.plan = AcademyPlan.free
            print(f"Updated student test account: {STUDENT_EMAIL}")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
