import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Academy, AcademyClass, AcademyPlan, AcademySeat, ClassStudent, SeatAssignmentHistory, StudentAcademyMembership  # noqa: E402
from routers.student_management import ClassPayload, create_class, dashboard, delete_class  # noqa: E402
from services.academy_student_access import claim_invite_code, create_seat  # noqa: E402


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
                profile_name="academy_test",
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

    def test_delete_class_revokes_class_seats(self):
        db = self.Session()
        try:
            self.seed_academy(db)
            class_row = AcademyClass(
                academy_id=self.academy_id,
                name="A1",
                subject="Math",
                grade_level="N",
            )
            db.add(class_row)
            db.flush()
            seat, invite_code = create_seat(db, self.academy_id, "학생 대기 중", class_id=class_row.id)
            membership = StudentAcademyMembership(
                student_user_id=f"manual-{uuid.uuid4().hex[:24]}",
                academy_id=self.academy_id,
                academy_seat_id=seat.id,
                status="active",
                metadata_json={"invite_code": invite_code},
            )
            db.add(membership)
            db.flush()
            seat.current_student_membership_id = membership.id
            db.add(ClassStudent(class_id=class_row.id, student_membership_id=membership.id))
            db.add(SeatAssignmentHistory(academy_seat_id=seat.id, academy_id=self.academy_id, student_user_id=membership.student_user_id, membership_id=membership.id))
            db.commit()

            delete_class(class_row.id, self.request, db)

            revoked_seat = db.get(AcademySeat, seat.id)
            ended_membership = db.get(StudentAcademyMembership, membership.id)
            history = db.query(SeatAssignmentHistory).filter(SeatAssignmentHistory.academy_seat_id == seat.id).one()

            self.assertIsNone(db.get(AcademyClass, class_row.id))
            self.assertIsNotNone(revoked_seat)
            self.assertFalse(revoked_seat.is_active)
            self.assertIsNone(revoked_seat.class_id)
            self.assertIsNone(revoked_seat.current_student_membership_id)
            self.assertEqual((revoked_seat.invite_metadata or {}).get("revoked_reason"), "class_deleted")
            self.assertEqual(ended_membership.status, "ended")
            self.assertIsNotNone(ended_membership.ended_at)
            self.assertIsNotNone(history.released_at)
            self.assertEqual(history.reason, "class_deleted")

            with self.assertRaises(HTTPException) as raised:
                claim_invite_code(db, request_for(str(uuid.uuid4())), invite_code)
            self.assertEqual(raised.exception.status_code, 410)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
