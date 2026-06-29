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

SECOND_STUDENT_EMAIL = os.getenv("TEST_STUDENT_2_EMAIL", "student2@tenaforge.com").strip().lower()
SECOND_STUDENT_PASSWORD = os.getenv("TEST_STUDENT_2_PASSWORD", STUDENT_PASSWORD).strip()
SECOND_STUDENT_NAME = os.getenv("TEST_STUDENT_2_NAME", "Tena Note Student 2").strip() or "Tena Note Student 2"
SECOND_STUDENT_PROFILE_NAME = os.getenv("TEST_STUDENT_2_PROFILE_NAME", "tena_note_login_student_2").strip().lower()


def _available_profile_name(db, account: Academy | None, desired_profile_name: str, fallback_profile_name: str) -> str:
    candidate = desired_profile_name or fallback_profile_name
    owner = db.scalar(select(Academy).where(Academy.profile_name == candidate))
    if not owner or (account and owner.id == account.id):
        return candidate

    base = candidate[:28].rstrip("_") or fallback_profile_name
    for index in range(2, 100):
        next_candidate = f"{base}_{index}"[:32]
        owner = db.scalar(select(Academy).where(Academy.profile_name == next_candidate))
        if not owner or (account and owner.id == account.id):
            return next_candidate
    raise RuntimeError("Could not allocate profile name for student test account.")


def _upsert_student(db, *, email: str, password: str, name: str, profile_name: str, fallback_profile_name: str, now: datetime) -> None:
    if not email or not password:
        print("Skipping student test account bootstrap: email or password is empty.")
        return

    account = db.scalar(select(Academy).where(Academy.email == email))
    available_profile_name = _available_profile_name(db, account, profile_name, fallback_profile_name)
    if not account:
        account = Academy(
            email=email,
            password_hash=hash_password(password),
            academy_name=name,
            display_name=name,
            profile_name=available_profile_name,
            account_type="student",
            email_verified=True,
            email_verified_at=now,
            is_active=True,
            is_suspended=False,
            plan=AcademyPlan.free,
        )
        db.add(account)
        print(f"Created student test account: {email}")
    else:
        account.password_hash = hash_password(password)
        account.academy_name = name
        account.display_name = name
        account.profile_name = account.profile_name or available_profile_name
        account.account_type = "student"
        account.email_verified = True
        account.email_verified_at = account.email_verified_at or now
        account.is_active = True
        account.is_suspended = False
        account.suspension_reason = None
        account.failed_login_attempts = 0
        account.locked_until = None
        account.plan = AcademyPlan.free
        print(f"Updated student test account: {email}")


def main() -> None:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        _upsert_student(
            db,
            email=STUDENT_EMAIL,
            password=STUDENT_PASSWORD,
            name=STUDENT_NAME,
            profile_name=STUDENT_PROFILE_NAME,
            fallback_profile_name="tena_note_login_student",
            now=now,
        )
        _upsert_student(
            db,
            email=SECOND_STUDENT_EMAIL,
            password=SECOND_STUDENT_PASSWORD,
            name=SECOND_STUDENT_NAME,
            profile_name=SECOND_STUDENT_PROFILE_NAME,
            fallback_profile_name="tena_note_login_student_2",
            now=now,
        )
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
