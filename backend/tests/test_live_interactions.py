import sys
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Academy, AcademyClass, AcademyStaffMembership, ClassScheduleEvent, ClassTeacher  # noqa: E402
from routers.live_interactions import LiveInteractionSettingsPayload, list_upcoming_live_interactions, update_live_interaction_settings  # noqa: E402


def request_for(user_id: str, workspace_id: str | None = None):
    headers = {"X-Tena-Workspace-Id": workspace_id} if workspace_id else {}
    return SimpleNamespace(state=SimpleNamespace(academy_id=user_id), headers=headers)


class LiveInteractionTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.owner_id = str(uuid.uuid4())
        self.staff_id = str(uuid.uuid4())
        self.class_a_id = uuid.uuid4()
        self.class_b_id = uuid.uuid4()

    def seed(self, db):
        now = datetime.utcnow()
        db.add_all(
            [
                Academy(id=uuid.UUID(self.owner_id), email="owner@example.com", academy_name="Owner Academy", profile_name="owner_academy", account_type="academy"),
                Academy(id=uuid.UUID(self.staff_id), email="staff@example.com", academy_name="Staff User", profile_name="staff_user", account_type="student"),
                AcademyClass(id=self.class_a_id, academy_id=self.owner_id, name="Assigned Class", subject="Math", grade_level="G3"),
                AcademyClass(id=self.class_b_id, academy_id=self.owner_id, name="Other Class", subject="Math", grade_level="G3"),
                AcademyStaffMembership(academy_id=self.owner_id, user_id=self.staff_id, role="teacher"),
                ClassTeacher(class_id=self.class_a_id, academy_staff_user_id=self.staff_id),
                ClassScheduleEvent(academy_id=self.owner_id, class_id=self.class_a_id, title="Assigned Live Class", starts_at=now + timedelta(minutes=5), ends_at=now + timedelta(minutes=65)),
                ClassScheduleEvent(academy_id=self.owner_id, class_id=self.class_b_id, title="Other Live Class", starts_at=now + timedelta(minutes=5), ends_at=now + timedelta(minutes=65)),
                ClassScheduleEvent(academy_id=self.owner_id, class_id=self.class_a_id, title="Later Class", starts_at=now + timedelta(minutes=30), ends_at=now + timedelta(minutes=90)),
            ]
        )
        db.commit()

    def test_staff_only_sees_assigned_classes_within_lead_window(self):
        db = self.Session()
        try:
            self.seed(db)
            result = list_upcoming_live_interactions(request_for(self.staff_id, self.owner_id), db)
            titles = [event["title"] for event in result["events"]]
            self.assertEqual(titles, ["Assigned Live Class"])
            self.assertEqual(result["settings"]["live_start_lead_minutes"], 5)
        finally:
            db.close()

    def test_owner_can_reduce_live_start_lead_time(self):
        db = self.Session()
        try:
            self.seed(db)
            update_live_interaction_settings(LiveInteractionSettingsPayload(live_start_lead_minutes=3), request_for(self.owner_id), db)
            result = list_upcoming_live_interactions(request_for(self.owner_id), db)
            self.assertEqual(result["events"], [])
            self.assertEqual(result["settings"]["live_start_lead_minutes"], 3)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
