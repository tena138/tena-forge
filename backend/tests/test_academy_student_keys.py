import sys
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import (  # noqa: E402
    Academy,
    AcademyClass,
    AcademyPlan,
    AcademySeat,
    ClassScheduleEvent,
    ClassStudent,
    ContentVersion,
    LearningAssignment,
    LearningAssignmentTarget,
    PaperSession,
    StudentAcademyMembership,
    StudentNotification,
    WrongAnswerRecord,
)
from routers.academy_student_app import (  # noqa: E402
    InviteCodeRequest,
    SeatCreate,
    academy_key_requirements,
    claim_academy_key,
    create_seats,
    student_calendar,
)
from routers.student_management import _class_payload  # noqa: E402
from services.academy_student_access import (  # noqa: E402
    academy_seat_key_status,
    claim_invite_code,
    create_seat,
    save_student_profile_collection_settings,
)


def request_for(user_id: str):
    return SimpleNamespace(
        state=SimpleNamespace(academy_id=user_id),
        headers={},
        client=SimpleNamespace(host="testclient"),
    )


class AcademyStudentKeyTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.academy_id = str(uuid.uuid4())
        self.student_id = str(uuid.uuid4())
        self.other_student_id = str(uuid.uuid4())
        self.class_id = uuid.uuid4()

    def tearDown(self):
        self.engine.dispose()

    def seed_accounts(self, db):
        db.add_all(
            [
                Academy(
                    id=uuid.UUID(self.academy_id),
                    email="academy@example.com",
                    academy_name="Academy",
                    profile_name="academy_test",
                    account_type="academy",
                    plan=AcademyPlan.basic,
                ),
                Academy(
                    id=uuid.UUID(self.student_id),
                    email="student@example.com",
                    academy_name="Student",
                    profile_name="student_test",
                    account_type="student",
                ),
                Academy(
                    id=uuid.UUID(self.other_student_id),
                    email="other@example.com",
                    academy_name="Other Student",
                    profile_name="other_student_test",
                    account_type="student",
                ),
                AcademyClass(
                    id=self.class_id,
                    academy_id=self.academy_id,
                    name="Math A",
                    subject="Math",
                    grade_level="G9",
                ),
            ]
        )
        db.commit()

    def test_class_key_claim_connects_real_student_to_class(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            created = create_seats(
                self.academy_id,
                SeatCreate(count=1, class_id=self.class_id),
                request_for(self.academy_id),
                db,
            )
            invite_code = created[0]["invite_code"]
            seat = db.scalar(select(AcademySeat).where(AcademySeat.id == uuid.UUID(created[0]["id"])))

            self.assertIsNotNone(seat)
            self.assertEqual(seat.class_id, self.class_id)
            self.assertIsNotNone(seat.current_student_membership_id)
            self.assertEqual(academy_seat_key_status(db, seat), "unclaimed")
            pending_membership = db.get(StudentAcademyMembership, seat.current_student_membership_id)
            self.assertIsNotNone(pending_membership)
            self.assertTrue(pending_membership.student_user_id.startswith("manual-"))
            class_payload = _class_payload(db, self.academy_id, db.get(AcademyClass, self.class_id), include_students=True)
            self.assertEqual(class_payload["student_count"], 0)
            self.assertEqual(class_payload["pending_key_count"], 1)
            self.assertEqual(class_payload["students"][0]["card_type"], "pending_key")

            membership = claim_invite_code(db, request_for(self.student_id), invite_code)
            db.commit()
            db.refresh(seat)

            self.assertEqual(membership.student_user_id, self.student_id)
            self.assertEqual(membership.id, pending_membership.id)
            self.assertEqual(seat.current_student_membership_id, membership.id)
            self.assertEqual(academy_seat_key_status(db, seat), "claimed")
            class_link = db.scalar(
                select(ClassStudent).where(
                    ClassStudent.class_id == self.class_id,
                    ClassStudent.student_membership_id == membership.id,
                    ClassStudent.left_at.is_(None),
                )
            )
            self.assertIsNotNone(class_link)
            class_payload = _class_payload(db, self.academy_id, db.get(AcademyClass, self.class_id), include_students=True)
            self.assertEqual(class_payload["student_count"], 1)
            self.assertEqual(class_payload["pending_key_count"], 0)

            with self.assertRaises(HTTPException) as already_used_by_same_student:
                claim_invite_code(db, request_for(self.student_id), invite_code)
            self.assertEqual(already_used_by_same_student.exception.status_code, 409)
            self.assertEqual(already_used_by_same_student.exception.detail["code"], "KEY_ALREADY_CLAIMED")

            with self.assertRaises(HTTPException) as already_claimed:
                claim_invite_code(db, request_for(self.other_student_id), invite_code)
            self.assertEqual(already_claimed.exception.status_code, 409)
            self.assertEqual(already_claimed.exception.detail["code"], "KEY_ALREADY_CLAIMED")
        finally:
            db.close()

    def test_class_key_claim_accepts_normalized_key_input(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            created = create_seats(
                self.academy_id,
                SeatCreate(count=1, class_id=self.class_id),
                request_for(self.academy_id),
                db,
            )
            invite_code = created[0]["invite_code"]
            normalized_input = f"  {invite_code.replace('-', '').lower()}  "

            membership = claim_invite_code(db, request_for(self.student_id), normalized_input)
            db.commit()

            self.assertEqual(membership.student_user_id, self.student_id)
            seat = db.scalar(select(AcademySeat).where(AcademySeat.id == uuid.UUID(created[0]["id"])))
            self.assertEqual(academy_seat_key_status(db, seat), "claimed")
        finally:
            db.close()

    def test_bulk_sms_keys_store_recipient_metadata_and_claim_profile_defaults(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            created = create_seats(
                self.academy_id,
                SeatCreate(
                    class_id=self.class_id,
                    delivery_channel="sms",
                    recipients=[
                        {"name": "Student A", "phone": "010-1111-2222"},
                        {"name": "Student B", "phone": "010-3333-4444"},
                    ],
                ),
                request_for(self.academy_id),
                db,
            )

            self.assertEqual(len(created), 2)
            self.assertTrue(created[0]["sms_url"].startswith("sms:01011112222?body="))
            self.assertEqual(created[0]["delivery_status"], "sms_link_ready")

            seat = db.get(AcademySeat, uuid.UUID(created[0]["id"]))
            self.assertEqual(seat.invite_metadata["recipient_name"], "Student A")
            self.assertEqual(seat.invite_metadata["recipient_phone"], "01011112222")

            membership = claim_invite_code(db, request_for(self.student_id), created[0]["invite_code"])
            db.commit()

            metadata = membership.metadata_json or {}
            self.assertEqual(membership.display_name_in_academy, "Student A")
            self.assertEqual(metadata["guardian_phone"], "01011112222")
            self.assertEqual(metadata["seat_invitation"]["delivery_status"], "claimed")
            db.refresh(seat)
            self.assertEqual(seat.invite_metadata["delivery_status"], "claimed")
        finally:
            db.close()

    def test_bulk_student_app_invite_creates_notification(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            created = create_seats(
                self.academy_id,
                SeatCreate(
                    class_id=self.class_id,
                    delivery_channel="student_app",
                    recipients=[{"name": "Student A", "account_user_id": self.student_id}],
                ),
                request_for(self.academy_id),
                db,
            )
            self.assertEqual(created[0]["delivery_status"], "app_notification_created")
            notification = db.get(StudentNotification, uuid.UUID(created[0]["notification_id"]))
            self.assertIsNotNone(notification)
            self.assertEqual(notification.student_user_id, self.student_id)
            self.assertEqual(notification.metadata_json["academy_seat_id"], created[0]["id"])
        finally:
            db.close()

    def test_bulk_create_preflights_seat_limit(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            with self.assertRaises(HTTPException) as limit:
                create_seats(
                    self.academy_id,
                    SeatCreate(count=6, class_id=self.class_id),
                    request_for(self.academy_id),
                    db,
                )
            self.assertEqual(limit.exception.status_code, 402)
            self.assertEqual(limit.exception.detail["code"], "SEAT_LIMIT_EXCEEDED")
            self.assertEqual(len(db.scalars(select(AcademySeat).where(AcademySeat.academy_id == self.academy_id)).all()), 0)
        finally:
            db.close()

    def test_same_student_cannot_claim_second_key_for_same_class(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            first = create_seats(self.academy_id, SeatCreate(count=1, class_id=self.class_id), request_for(self.academy_id), db)
            second = create_seats(self.academy_id, SeatCreate(count=1, class_id=self.class_id), request_for(self.academy_id), db)

            claim_invite_code(db, request_for(self.student_id), first[0]["invite_code"])
            db.commit()

            with self.assertRaises(HTTPException) as duplicate_class:
                claim_invite_code(db, request_for(self.student_id), second[0]["invite_code"])
            self.assertEqual(duplicate_class.exception.status_code, 409)
            self.assertEqual(duplicate_class.exception.detail["code"], "CLASS_ALREADY_CONNECTED")
        finally:
            db.close()

    def test_manual_student_key_transfers_existing_forge_data(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            seat, code = create_seat(db, self.academy_id, "Manual student", class_id=self.class_id)
            manual_student_id = f"manual-{uuid.uuid4()}"
            manual_membership = StudentAcademyMembership(
                student_user_id=manual_student_id,
                academy_id=self.academy_id,
                academy_seat_id=seat.id,
                display_name_in_academy="Manual Student",
            )
            db.add(manual_membership)
            db.flush()
            seat.current_student_membership_id = manual_membership.id
            content_version_id = uuid.uuid4()
            wrong_record_id = uuid.uuid4()
            learning_target_id = uuid.uuid4()
            db.add(ClassStudent(class_id=self.class_id, student_membership_id=manual_membership.id))
            db.add(
                WrongAnswerRecord(
                    id=wrong_record_id,
                    academy_id=self.academy_id,
                    student_id=manual_student_id,
                    problem_id=uuid.uuid4(),
                    problem_version_id=content_version_id,
                )
            )
            db.add(
                LearningAssignmentTarget(
                    id=learning_target_id,
                    assignment_id=uuid.uuid4(),
                    academy_id=self.academy_id,
                    student_id=manual_student_id,
                )
            )
            db.commit()

            claimed = claim_invite_code(db, request_for(self.student_id), code)
            db.commit()

            self.assertEqual(claimed.id, manual_membership.id)
            self.assertEqual(claimed.student_user_id, self.student_id)
            self.assertEqual(db.get(WrongAnswerRecord, wrong_record_id).student_id, self.student_id)
            self.assertEqual(db.get(LearningAssignmentTarget, learning_target_id).student_id, self.student_id)
        finally:
            db.close()

    def test_claimed_class_key_exposes_forge_calendar_data(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            created = create_seats(
                self.academy_id,
                SeatCreate(count=1, class_id=self.class_id),
                request_for(self.academy_id),
                db,
            )
            claim_invite_code(db, request_for(self.student_id), created[0]["invite_code"])
            content_version_id = uuid.uuid4()
            learning_assignment_id = uuid.uuid4()
            paper_session_id = uuid.uuid4()
            now = datetime(2026, 6, 24, 9, 0, 0)
            db.add(
                ContentVersion(
                    id=content_version_id,
                    academy_id=self.academy_id,
                    source_type="problem_set",
                    source_id="ps-1",
                    title="Mock problem set",
                )
            )
            db.add(
                ClassScheduleEvent(
                    academy_id=self.academy_id,
                    class_id=self.class_id,
                    title="수학 정규 수업",
                    starts_at=now,
                    ends_at=now + timedelta(hours=2),
                )
            )
            db.add(
                LearningAssignment(
                    id=learning_assignment_id,
                    academy_id=self.academy_id,
                    title="일차함수 과제",
                    source_type="problem_set",
                    source_id="ps-1",
                    content_version_id=content_version_id,
                    assigned_by=self.academy_id,
                    assigned_to_type="class",
                    due_at=now + timedelta(days=1),
                    status="published",
                )
            )
            db.add(
                LearningAssignmentTarget(
                    assignment_id=learning_assignment_id,
                    academy_id=self.academy_id,
                    group_id=self.class_id,
                )
            )
            db.add(
                PaperSession(
                    id=paper_session_id,
                    academy_id=self.academy_id,
                    title="단원 테스트",
                    content_version_id=content_version_id,
                    class_ids=[str(self.class_id)],
                    scheduled_at=now + timedelta(days=2),
                    due_at=now + timedelta(days=3),
                    status="scheduled",
                )
            )
            db.add(
                WrongAnswerRecord(
                    academy_id=self.academy_id,
                    student_id=self.student_id,
                    problem_id=uuid.uuid4(),
                    problem_version_id=content_version_id,
                    latest_wrong_at=now + timedelta(days=4),
                )
            )
            db.commit()

            payload = student_calendar(request_for(self.student_id), db)
            event_sources = {event["source_type"] for event in payload["events"]}
            due_sources = {item["source_type"] for item in payload["assignment_due_dates"]}

            self.assertIn("forge_class_schedule", event_sources)
            self.assertIn("forge_paper_session", event_sources)
            self.assertIn("forge_wrong_answer_archive", event_sources)
            self.assertIn("learning_assignment", due_sources)
            self.assertIn("paper_session_due", due_sources)
        finally:
            db.close()

    def test_legacy_classless_and_inactive_keys_have_specific_errors(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            legacy_seat, legacy_code = create_seat(db, self.academy_id, "Legacy")
            inactive_seat, inactive_code = create_seat(db, self.academy_id, "Inactive", class_id=self.class_id)
            inactive_seat.is_active = False
            db.commit()

            self.assertEqual(academy_seat_key_status(db, legacy_seat), "legacy_unassigned")
            self.assertEqual(academy_seat_key_status(db, inactive_seat), "revoked")

            with self.assertRaises(HTTPException) as classless:
                claim_invite_code(db, request_for(self.student_id), legacy_code)
            self.assertEqual(classless.exception.status_code, 422)
            self.assertEqual(classless.exception.detail["code"], "KEY_MISSING_CLASS")

            with self.assertRaises(HTTPException) as inactive:
                claim_invite_code(db, request_for(self.student_id), inactive_code)
            self.assertEqual(inactive.exception.status_code, 410)
            self.assertEqual(inactive.exception.detail["code"], "KEY_INACTIVE")
        finally:
            db.close()

    def test_claim_requires_and_saves_academy_profile_fields(self):
        db = self.Session()
        try:
            self.seed_accounts(db)
            created = create_seats(
                self.academy_id,
                SeatCreate(count=1, class_id=self.class_id),
                request_for(self.academy_id),
                db,
            )
            invite_code = created[0]["invite_code"]
            settings = save_student_profile_collection_settings(
                db,
                self.academy_id,
                {
                    "fields": [
                        {"key": "name", "enabled": True, "required": True, "real_name": True},
                        {"key": "school", "enabled": True, "required": False, "real_name": False},
                    ]
                },
            )
            db.commit()

            requirements = academy_key_requirements(invite_code, request_for(self.student_id), db)
            required_names = {field["key"] for field in requirements["fields"] if field["required"]}
            self.assertEqual(settings["fields"][0]["key"], "name")
            self.assertIn("name", required_names)

            with self.assertRaises(HTTPException) as missing_profile:
                claim_academy_key(InviteCodeRequest(invite_code=invite_code), request_for(self.student_id), db)
            self.assertEqual(missing_profile.exception.status_code, 422)
            self.assertEqual(missing_profile.exception.detail["code"], "STUDENT_PROFILE_REQUIRED")

            response = claim_academy_key(
                InviteCodeRequest(
                    invite_code=invite_code,
                    student_profile={"name": "Kim Student", "school": "Tena High"},
                ),
                request_for(self.student_id),
                db,
            )
            membership = db.get(StudentAcademyMembership, uuid.UUID(response["id"]))
            self.assertEqual(membership.display_name_in_academy, "Kim Student")
            self.assertEqual(membership.metadata_json["student_profile"]["name"], "Kim Student")
            self.assertEqual(membership.metadata_json["school"], "Tena High")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
