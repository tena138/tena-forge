from datetime import datetime
import os
from pathlib import Path
import sys

from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal
from models import Academy, AcademyPlan, UserRole
from services.auth_security import hash_password


ADMIN_EMAIL = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@tenaforge.com").strip().lower()
ADMIN_PASSWORD = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "").strip()
ADMIN_NAME = os.getenv("BOOTSTRAP_ADMIN_NAME", "Tena Admin").strip() or "Tena Admin"


def main() -> None:
    if not ADMIN_PASSWORD:
        print("Skipping admin bootstrap: BOOTSTRAP_ADMIN_PASSWORD is not set.")
        return

    db = SessionLocal()
    try:
        admin = db.scalar(select(Academy).where(Academy.email == ADMIN_EMAIL))
        now = datetime.utcnow()
        if not admin:
            admin = Academy(
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                academy_name=ADMIN_NAME,
                account_type="academy",
                email_verified=True,
                email_verified_at=now,
                is_active=True,
                is_suspended=False,
                plan=AcademyPlan.pro,
            )
            db.add(admin)
            db.flush()
            print(f"Created admin account: {ADMIN_EMAIL}")
        else:
            admin.password_hash = hash_password(ADMIN_PASSWORD)
            admin.academy_name = admin.academy_name or ADMIN_NAME
            admin.account_type = admin.account_type or "academy"
            admin.email_verified = True
            admin.email_verified_at = admin.email_verified_at or now
            admin.is_active = True
            admin.is_suspended = False
            admin.suspension_reason = None
            admin.locked_until = None
            admin.failed_login_attempts = 0
            admin.plan = AcademyPlan.pro
            print(f"Updated admin account: {ADMIN_EMAIL}")

        existing_role = db.scalar(
            select(UserRole).where(
                UserRole.user_id == str(admin.id),
                UserRole.role == "admin",
            )
        )
        if not existing_role:
            db.add(UserRole(user_id=str(admin.id), role="admin", granted_by="bootstrap"))
            print(f"Granted admin role: {ADMIN_EMAIL}")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
