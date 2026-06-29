from datetime import datetime
import os
from pathlib import Path
import sys

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal
from models import Academy, AcademyPlan
from services.auth_security import hash_password


STUDENT_EMAIL = os.getenv("TEST_STUDENT_EMAIL", "student@tenaforge.com").strip().lower()
STUDENT_PASSWORD = os.getenv("TEST_STUDENT_PASSWORD", "Student123!").strip()
STUDENT_NAME = os.getenv("TEST_STUDENT_NAME", "Tena Note Student").strip() or "Tena Note Student"
STUDENT_PROFILE_NAME = os.getenv("TEST_STUDENT_PROFILE_NAME", "tena_note_login_student").strip().lower()


def _available_profile_name(db, account: Academy | None) -> str:
    candidate = STUDENT_PROFILE_NAME or "tena_note_login_student"
    owner = db.scalar(select(Academy).where(Academy.profile_name == candidate))
    if not owner or (account and owner.id == account.id):
        return candidate

    base = candidate[:28].rstrip("_") or "tena_note_login_student"
    for index in range(2, 100):
        next_candidate = f"{base}_{index}"[:32]
        owner = db.scalar(select(Academy).where(Academy.profile_name == next_candidate))
        if not owner or (account and owner.id == account.id):
            return next_candidate
    raise RuntimeError("Could not allocate profile name for student test account.")


def main() -> None:
    if not STUDENT_EMAIL or not STUDENT_PASSWORD:
        print("Skipping student test account bootstrap: email or password is empty.")
        return

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        account = db.scalar(select(Academy).where(Academy.email == STUDENT_EMAIL))
        profile_name = _available_profile_name(db, account)
        if not account:
            account = Academy(
                email=STUDENT_EMAIL,
                password_hash=hash_password(STUDENT_PASSWORD),
                academy_name=STUDENT_NAME,
                display_name=STUDENT_NAME,
                profile_name=profile_name,
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
            account.profile_name = account.profile_name or profile_name
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
