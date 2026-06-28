import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Academy, AcademyPlan, StudentAcademyMembership  # noqa: E402
from routers.student_management import ClassPayload, create_class, dashboard  # noqa: E402
from services.academy_student_access import create_seat  # noqa: E402


def request_for(academy_id: str):
    return SimpleNamespace(
        state=SimpleNamespace(academy_id=academy_id),
        headers={},
        client=SimpleNamespace(host="testclient"),
    )


class StudentManagementClassCreationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.academy_id = str(uuid.uuid4())
        self.request = request_for(self.academy_id)

    def tearDown(self):
        self.engine.dispose()

    def seed_academy(self, db):
        db.add(
            Academy(
                id=uuid.UUID(self.academy_id),
                email="academy@example.com",
                academy_name="Academy",
                account_type="academy",
                plan=AcademyPlan.basic,
            )
        )
        db.commit()

    def test_new_class_does_not_inherit_unlinked_unnamed_student(self):
        db = self.Session()
        try:
            self.seed_academy(db)
            seat, _ = create_seat(db, self.academy_id)
            membership = StudentAcademyMembership(
                student_user_id=str(uuid.uuid4()),
                academy_id=self.academy_id,
                academy_seat_id=seat.id,
                status="active",
                metadata_json={},
            )
            db.add(membership)
            db.flush()
            seat.current_student_membership_id = membership.id
            db.commit()

            created = create_class(ClassPayload(name="A1"), self.request, db)
            self.assertEqual(created["student_count"], 0)
            self.assertEqual(created["students"], [])

            result = dashboard(self.request, db)
            created_payload = next(class_row for class_row in result["classes"] if class_row["id"] == created["id"])
            self.assertEqual(created_payload["student_count"], 0)
            self.assertEqual(created_payload["students"], [])
            self.assertEqual(result["summary"]["student_count"], 1)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
