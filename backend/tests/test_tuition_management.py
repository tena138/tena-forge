import sys
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import StudentTuitionPayment  # noqa: E402
from routers.student_management import (  # noqa: E402
    ClassPayload,
    ScheduleEventPayload,
    StudentPayload,
    StudentUpdatePayload,
    TuitionEventCountPayload,
    TuitionSessionAdjustmentPayload,
    confirm_tuition_paid,
    create_class,
    create_schedule_event,
    create_student,
    list_tuition_payments,
    send_tuition_reminder,
    update_tuition_event_count,
    update_student,
    update_tuition_session_adjustment,
)


def make_request(owner_id: str = "local_user"):
    return SimpleNamespace(state=SimpleNamespace(academy_id=owner_id))


class TuitionManagementTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.request = make_request()

    def tearDown(self):
        self.engine.dispose()

    def _class_student_events(self, db, cycle_sessions: int = 2):
        class_row = create_class(ClassPayload(name="중2 수학", subject="math", grade_level="중2"), self.request, db)
        class_id = uuid.UUID(class_row["id"])
        student = create_student(
            StudentPayload(
                name="김민수",
                grade_level="중2",
                school="테나중",
                class_ids=[class_id],
                guardian_name="김보호",
                guardian_phone="01012345678",
                tuition_enabled=True,
                tuition_cycle_sessions=cycle_sessions,
                tuition_amount=320000,
            ),
            self.request,
            db,
        )
        starts = datetime.utcnow() + timedelta(days=1)
        events = [
            create_schedule_event(
                ScheduleEventPayload(
                    class_id=class_id,
                    title=f"{index + 1}회차",
                    starts_at=starts + timedelta(days=index),
                    ends_at=starts + timedelta(days=index, hours=1),
                ),
                self.request,
                db,
            )
            for index in range(3)
        ]
        return class_row, student, events

    def test_tuition_dashboard_creates_cycle_start_reminders_and_logs_actions(self):
        db = self.Session()
        try:
            _, _, events = self._class_student_events(db, cycle_sessions=2)

            dashboard = list_tuition_payments(self.request, days_ahead=10, db=db)
            self.assertEqual([payment["due_event_id"] for payment in dashboard["payments"]], [events[0]["id"], events[2]["id"]])
            self.assertEqual(dashboard["summary"]["pending_count"], 2)
            self.assertEqual(dashboard["payments"][0]["amount"], 320000)
            self.assertEqual(dashboard["payments"][0]["guardian_phone"], "01012345678")

            reminder = send_tuition_reminder(uuid.UUID(dashboard["payments"][0]["id"]), self.request, db)
            self.assertEqual(reminder["payment"]["status"], "reminded")
            self.assertEqual(reminder["payment"]["reminder_count"], 1)
            self.assertTrue(reminder["sms_url"].startswith("sms:01012345678?body="))

            paid = confirm_tuition_paid(uuid.UUID(dashboard["payments"][0]["id"]), self.request, db)
            self.assertEqual(paid["status"], "paid")
            self.assertIsNotNone(paid["paid_at"])
        finally:
            db.close()

    def test_class_session_exclusion_recalculates_pending_cycle_reminders(self):
        db = self.Session()
        try:
            _, _, events = self._class_student_events(db, cycle_sessions=2)

            initial = list_tuition_payments(self.request, days_ahead=10, db=db)
            self.assertEqual([payment["due_event_id"] for payment in initial["payments"]], [events[0]["id"], events[2]["id"]])

            update_tuition_event_count(uuid.UUID(events[0]["id"]), TuitionEventCountPayload(counts_for_tuition=False), self.request, db)
            recalculated = list_tuition_payments(self.request, days_ahead=10, db=db)
            self.assertEqual([payment["due_event_id"] for payment in recalculated["payments"]], [events[1]["id"]])

            excluded = db.scalars(select(StudentTuitionPayment).where(StudentTuitionPayment.status == "excluded")).all()
            self.assertGreaterEqual(len(excluded), 2)

            update_tuition_event_count(uuid.UUID(events[0]["id"]), TuitionEventCountPayload(counts_for_tuition=True), self.request, db)
            restored = list_tuition_payments(self.request, days_ahead=10, db=db)
            self.assertEqual([payment["due_event_id"] for payment in restored["payments"]], [events[0]["id"], events[2]["id"]])
        finally:
            db.close()

    def test_student_excused_absence_excludes_only_that_student_from_cycle_count(self):
        db = self.Session()
        try:
            _, student, events = self._class_student_events(db, cycle_sessions=2)
            list_tuition_payments(self.request, days_ahead=10, db=db)

            update_tuition_session_adjustment(
                uuid.UUID(events[0]["id"]),
                uuid.UUID(student["id"]),
                TuitionSessionAdjustmentPayload(counts_for_tuition=False, reason="excused_absence"),
                self.request,
                db,
            )
            recalculated = list_tuition_payments(self.request, days_ahead=10, db=db)

            self.assertEqual([payment["due_event_id"] for payment in recalculated["payments"]], [events[1]["id"]])
            self.assertEqual(recalculated["payments"][0]["student_membership_id"], student["id"])
        finally:
            db.close()

    def test_disabling_tuition_hides_existing_pending_reminders(self):
        db = self.Session()
        try:
            _, student, _ = self._class_student_events(db, cycle_sessions=2)
            initial = list_tuition_payments(self.request, days_ahead=10, db=db)
            self.assertEqual(len(initial["payments"]), 2)

            update_student(uuid.UUID(student["id"]), StudentUpdatePayload(tuition_enabled=False), self.request, db)
            disabled = list_tuition_payments(self.request, days_ahead=10, db=db)

            self.assertEqual(disabled["payments"], [])
            self.assertEqual(disabled["summary"]["pending_count"], 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
