import sys
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import (  # noqa: E402
    Academy,
    AcademyClass,
    AcademyMaterial,
    AcademyMaterialAssignment,
    AcademyPlan,
    AcademySeat,
    AcademyStudentSubscription,
    Assignment,
    Batch,
    CalendarEvent,
    ClassScheduleEvent,
    ClassStudent,
    ContentVersion,
    LearningAssignment,
    LearningAssignmentTarget,
    LearningSubmission,
    MaterialDeliveryLog,
    PaperSession,
    PaperSessionResult,
    Problem,
    ProblemAttempt,
    ProblemResult,
    ProblemSet,
    ProblemSetItem,
    StudentAcademyMembership,
    StudentInvite,
    StudentNotification,
    StudentPersonalSet,
    StudentPersonalSetItem,
    Subscription,
    Tag,
    WrongAnswerRecord,
)
from services.account_data_reset import reset_account_data  # noqa: E402


class AccountDataResetTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.academy_uuid = uuid.uuid4()
        self.academy_id = str(self.academy_uuid)
        self.student_id = str(uuid.uuid4())

    def tearDown(self):
        self.engine.dispose()

    def seed_account_with_operational_data(self, db):
        now = datetime.utcnow()
        academy = Academy(
            id=self.academy_uuid,
            email="academy@example.com",
            academy_name="Academy",
            profile_name="academy_test",
            account_type="academy",
            plan=AcademyPlan.pro,
        )
        subscription = Subscription(user_id=self.academy_id, plan_code="pro", status="active")
        student_subscription = AcademyStudentSubscription(
            academy_id=self.academy_id,
            plan_code="growth",
            purchased_additional_seats=12,
            purchased_staff_seats=3,
        )
        academy_class = AcademyClass(
            academy_id=self.academy_id,
            name="A1",
            subject="math",
            grade_level="N",
        )
        db.add_all([academy, subscription, student_subscription, academy_class])
        db.flush()

        seat = AcademySeat(
            academy_id=self.academy_id,
            class_id=academy_class.id,
            seat_number="S1",
            invite_code_hash="hash-1",
            invite_code_preview="ABCD",
        )
        db.add(seat)
        db.flush()
        membership = StudentAcademyMembership(
            student_user_id=self.student_id,
            academy_id=self.academy_id,
            academy_seat_id=seat.id,
            display_name_in_academy="Student",
        )
        db.add(membership)
        db.flush()
        seat.current_student_membership_id = membership.id
        db.add(ClassStudent(class_id=academy_class.id, student_membership_id=membership.id))
        db.add(
            StudentInvite(
                academy_id=self.academy_id,
                academy_seat_id=seat.id,
                academy_student_membership_id=membership.id,
                target_user_id=self.student_id,
                target_profile_name="student_test",
            )
        )

        event = ClassScheduleEvent(
            academy_id=self.academy_id,
            class_id=academy_class.id,
            title="Math class",
            starts_at=now,
            ends_at=now + timedelta(hours=1),
        )
        db.add(event)
        db.add(
            CalendarEvent(
                owner_type="academy",
                owner_id=self.academy_id,
                academy_id=self.academy_id,
                class_id=academy_class.id,
                student_membership_id=membership.id,
                created_by_user_id=self.academy_id,
                title="Calendar class",
                starts_at=now,
                ends_at=now + timedelta(hours=1),
            )
        )

        material = AcademyMaterial(
            academy_id=self.academy_id,
            created_by_user_id=self.academy_id,
            title="Handout",
            storage_path="materials/handout.pdf",
        )
        db.add(material)
        db.flush()
        db.add(AcademyMaterialAssignment(material_id=material.id, target_type="class", target_id=str(academy_class.id)))
        db.add(MaterialDeliveryLog(material_id=material.id, student_user_id=self.student_id, academy_id=self.academy_id, action="view"))

        assignment = Assignment(academy_id=self.academy_id, created_by_user_id=self.academy_id, title="Legacy homework")
        db.add(assignment)

        batch = Batch(name="Batch", problem_pdf_filename="problem.pdf", owner_id=self.academy_id, academy_id=self.academy_id)
        db.add(batch)
        db.flush()
        problem = Problem(problem_number=1, problem_text="1+1", source_batch_id=batch.id, owner_id=self.academy_id, academy_id=self.academy_id)
        problem_set = ProblemSet(name="Set", owner_id=self.academy_id, academy_id=self.academy_id)
        db.add_all([problem, problem_set])
        db.flush()
        db.add_all([Tag(problem_id=problem.id, subject="math"), ProblemSetItem(problem_set_id=problem_set.id, problem_id=problem.id, order_index=0)])

        content_version = ContentVersion(
            academy_id=self.academy_id,
            source_type="problem_set",
            source_id=str(problem_set.id),
            title="Set v1",
            created_by=self.academy_id,
        )
        db.add(content_version)
        db.flush()
        learning_assignment = LearningAssignment(
            academy_id=self.academy_id,
            title="Learning homework",
            source_type="problem_set",
            source_id=str(problem_set.id),
            content_version_id=content_version.id,
            assigned_by=self.academy_id,
        )
        db.add(learning_assignment)
        db.flush()
        db.add(LearningAssignmentTarget(assignment_id=learning_assignment.id, academy_id=self.academy_id, student_id=self.student_id))
        learning_submission = LearningSubmission(academy_id=self.academy_id, student_id=self.student_id, assignment_id=learning_assignment.id)
        db.add(learning_submission)
        db.flush()
        db.add(
            ProblemAttempt(
                academy_id=self.academy_id,
                student_id=self.student_id,
                submission_id=learning_submission.id,
                assignment_id=learning_assignment.id,
                problem_id=problem.id,
                problem_version_id=content_version.id,
                source_context="assignment",
            )
        )
        db.add(WrongAnswerRecord(academy_id=self.academy_id, student_id=self.student_id, problem_id=problem.id, problem_version_id=content_version.id))

        personal_set = StudentPersonalSet(student_id=self.student_id, title="Wrong answers")
        db.add(personal_set)
        db.flush()
        db.add(StudentPersonalSetItem(set_id=personal_set.id, student_id=self.student_id, academy_id=self.academy_id, problem_id=problem.id, problem_version_id=content_version.id))

        paper_session = PaperSession(
            academy_id=self.academy_id,
            title="Test",
            source_problem_set_id=problem_set.id,
            content_version_id=content_version.id,
            created_by=self.academy_id,
        )
        db.add(paper_session)
        db.flush()
        paper_result = PaperSessionResult(
            academy_id=self.academy_id,
            paper_session_id=paper_session.id,
            student_membership_id=membership.id,
            student_user_id=self.student_id,
        )
        db.add(paper_result)
        db.flush()
        db.add(
            ProblemResult(
                academy_id=self.academy_id,
                paper_session_id=paper_session.id,
                paper_session_result_id=paper_result.id,
                student_membership_id=membership.id,
                student_user_id=self.student_id,
                problem_id=problem.id,
                problem_version_id=content_version.id,
                problem_number=1,
            )
        )
        db.add(StudentNotification(student_user_id=self.student_id, academy_id=self.academy_id, notification_type="assignment", title="New homework"))
        db.commit()
        return academy, subscription.id, student_subscription.id

    def test_reset_preserves_billing_and_deletes_operational_data(self):
        db = self.Session()
        try:
            academy, subscription_id, student_subscription_id = self.seed_account_with_operational_data(db)

            result = reset_account_data(db, academy)
            db.commit()

            self.assertGreater(result["total_deleted"], 0)
            self.assertEqual(result["preserved"]["purchased_additional_student_keys"], 12)
            self.assertEqual(result["preserved"]["purchased_staff_seats"], 3)
            self.assertIsNotNone(db.get(Academy, self.academy_uuid))
            self.assertIsNotNone(db.get(Subscription, subscription_id))
            self.assertIsNotNone(db.get(AcademyStudentSubscription, student_subscription_id))
            self.assertEqual(db.query(AcademyClass).count(), 0)
            self.assertEqual(db.query(AcademySeat).count(), 0)
            self.assertEqual(db.query(StudentInvite).count(), 0)
            self.assertEqual(db.query(StudentAcademyMembership).count(), 0)
            self.assertEqual(db.query(ClassScheduleEvent).count(), 0)
            self.assertEqual(db.query(CalendarEvent).count(), 0)
            self.assertEqual(db.query(AcademyMaterial).count(), 0)
            self.assertEqual(db.query(Batch).count(), 0)
            self.assertEqual(db.query(Problem).count(), 0)
            self.assertEqual(db.query(ProblemSet).count(), 0)
            self.assertEqual(db.query(LearningAssignment).count(), 0)
            self.assertEqual(db.query(WrongAnswerRecord).count(), 0)
            self.assertEqual(db.query(StudentNotification).count(), 0)
        finally:
            db.close()

    def test_reset_can_clear_legacy_local_user_student_management_data(self):
        db = self.Session()
        try:
            academy = Academy(
                id=self.academy_uuid,
                email="academy@example.com",
                academy_name="Academy",
                profile_name="academy_test",
                account_type="academy",
                plan=AcademyPlan.pro,
            )
            student_subscription = AcademyStudentSubscription(
                academy_id=self.academy_id,
                plan_code="growth",
                purchased_additional_seats=7,
                purchased_staff_seats=2,
            )
            academy_class = AcademyClass(academy_id="local_user", name="Legacy class", subject="math", grade_level="N")
            db.add_all([academy, student_subscription, academy_class])
            db.flush()
            seat = AcademySeat(
                academy_id="local_user",
                class_id=academy_class.id,
                seat_number="L1",
                invite_code_hash="legacy-hash",
                invite_code_preview="LGCY",
            )
            db.add(seat)
            db.flush()
            membership = StudentAcademyMembership(
                student_user_id="manual-legacy",
                academy_id="local_user",
                academy_seat_id=seat.id,
                display_name_in_academy="Legacy Student",
            )
            db.add(membership)
            db.flush()
            seat.current_student_membership_id = membership.id
            db.add(ClassStudent(class_id=academy_class.id, student_membership_id=membership.id))
            db.commit()

            result = reset_account_data(db, academy, target_owner_id="local_user")
            db.commit()

            self.assertGreater(result["total_deleted"], 0)
            self.assertEqual(result["preserved"]["target_owner_id"], "local_user")
            self.assertEqual(result["preserved"]["student_plan_code"], "growth")
            self.assertEqual(result["preserved"]["purchased_additional_student_keys"], 7)
            self.assertIsNotNone(db.get(Academy, self.academy_uuid))
            self.assertEqual(db.query(AcademyStudentSubscription).count(), 1)
            self.assertEqual(db.query(AcademyClass).count(), 0)
            self.assertEqual(db.query(AcademySeat).count(), 0)
            self.assertEqual(db.query(StudentAcademyMembership).count(), 0)
            self.assertEqual(db.query(ClassStudent).count(), 0)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
