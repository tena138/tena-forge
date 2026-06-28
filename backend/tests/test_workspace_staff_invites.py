import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from database import Base  # noqa: E402
from models import Academy, AcademyClass, AcademyStaffInviteCode, AcademyStaffMembership, AcademyStudentSubscription, ClassTeacher  # noqa: E402
from routers.workspaces import StaffInviteClaim, StaffInviteCreate, create_staff_invite_code, claim_staff_invite_code, list_staff, list_workspaces  # noqa: E402


def request_for(user_id: str, workspace_id: str | None = None):
    headers = {"X-Tena-Workspace-Id": workspace_id} if workspace_id else {}
    return SimpleNamespace(state=SimpleNamespace(academy_id=user_id), headers=headers)


class WorkspaceStaffInviteTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.owner_id = str(uuid.uuid4())
        self.staff_id = str(uuid.uuid4())
        self.other_id = str(uuid.uuid4())
        self.class_id = uuid.uuid4()

    def seed_accounts(self, db, purchased_staff_seats: int = 1):
        db.add_all(
            [
                Academy(id=uuid.UUID(self.owner_id), email="owner@example.com", academy_name="Owner Academy", profile_name="owner_academy", account_type="academy"),
                Academy(id=uuid.UUID(self.staff_id), email="staff@example.com", academy_name="Staff User", profile_name="staff_user", account_type="student"),
                Academy(id=uuid.UUID(self.other_id), email="other@example.com", academy_name="Other User", profile_name="other_user", account_type="student"),
                AcademyStudentSubscription(academy_id=self.owner_id, plan_code="basic", purchased_staff_seats=purchased_staff_seats),
                AcademyClass(id=self.class_id, academy_id=self.owner_id, name="Algebra A", subject="Math", grade_level="G3"),
            ]
        )
        db.commit()

    def test_staff_invite_is_single_use_and_counts_pending_capacity(self):
        db = self.Session()
        try:
            self.seed_accounts(db, purchased_staff_seats=1)
            owner_request = request_for(self.owner_id)

            invite = create_staff_invite_code(
                self.owner_id,
                StaffInviteCreate(role="teacher", assigned_class_ids=[self.class_id], can_manage_seats=True, can_manage_coagent=True),
                owner_request,
                db,
            )
            self.assertTrue(invite["code"].startswith("TF-"))
            self.assertEqual(invite["seat_status"]["pending_invites"], 1)
            self.assertEqual(invite["seat_status"]["available_staff_seats"], 0)

            stored_code = db.scalar(select(AcademyStaffInviteCode).where(AcademyStaffInviteCode.id == uuid.UUID(invite["id"])))
            self.assertIsNotNone(stored_code)
            self.assertNotEqual(stored_code.code_hash, invite["code"])

            with self.assertRaises(HTTPException) as blocked:
                create_staff_invite_code(self.owner_id, StaffInviteCreate(role="teacher", assigned_class_ids=[self.class_id]), owner_request, db)
            self.assertEqual(blocked.exception.status_code, 402)

            claimed = claim_staff_invite_code(StaffInviteClaim(code=invite["code"]), request_for(self.staff_id), db)
            self.assertTrue(claimed["ok"])
            self.assertEqual(claimed["workspace"]["id"], self.owner_id)
            self.assertTrue(claimed["workspace"]["permissions"]["can_manage_coagent"])
            self.assertFalse(claimed["workspace"]["permissions"]["can_manage_billing"])

            membership = db.scalar(select(AcademyStaffMembership).where(AcademyStaffMembership.academy_id == self.owner_id, AcademyStaffMembership.user_id == self.staff_id))
            self.assertIsNotNone(membership)
            self.assertTrue(membership.can_manage_seats)
            self.assertFalse(membership.can_manage_billing)
            class_teacher = db.scalar(select(ClassTeacher).where(ClassTeacher.class_id == self.class_id, ClassTeacher.academy_staff_user_id == self.staff_id))
            self.assertIsNotNone(class_teacher)

            with self.assertRaises(HTTPException) as reused:
                claim_staff_invite_code(StaffInviteClaim(code=invite["code"]), request_for(self.other_id), db)
            self.assertEqual(reused.exception.status_code, 404)

            staff_list = list_staff(self.owner_id, owner_request, db)
            self.assertEqual(staff_list["seat_status"]["active_staff"], 1)
            self.assertEqual(staff_list["seat_status"]["available_staff_seats"], 0)
            self.assertEqual(len(staff_list["staff"]), 1)
        finally:
            db.close()

    def test_workspace_header_must_match_owned_or_staff_membership(self):
        db = self.Session()
        try:
            self.seed_accounts(db, purchased_staff_seats=1)

            with self.assertRaises(HTTPException) as spoofed:
                list_workspaces(request_for(self.other_id, self.owner_id), db)
            self.assertEqual(spoofed.exception.status_code, 403)

            invite = create_staff_invite_code(
                self.owner_id,
                StaffInviteCreate(role="teacher", assigned_class_ids=[self.class_id], can_manage_materials=False),
                request_for(self.owner_id),
                db,
            )
            claim_staff_invite_code(StaffInviteClaim(code=invite["code"]), request_for(self.staff_id), db)

            visible = list_workspaces(request_for(self.staff_id, self.owner_id), db)
            self.assertEqual(visible["active_workspace_id"], self.owner_id)
            workspace = next(item for item in visible["items"] if item["id"] == self.owner_id)
            self.assertEqual(workspace["role"], "teacher")
            self.assertFalse(workspace["permissions"]["can_manage_materials"])
            self.assertFalse(workspace["permissions"]["can_manage_billing"])
        finally:
            db.close()

    def test_workspace_listing_does_not_create_free_subscription(self):
        db = self.Session()
        try:
            db.add(Academy(id=uuid.UUID(self.owner_id), email="owner@example.com", academy_name="Owner Academy", profile_name="owner_academy", account_type="academy"))
            db.commit()

            visible = list_workspaces(request_for(self.owner_id), db)
            workspace = next(item for item in visible["items"] if item["id"] == self.owner_id)
            self.assertEqual(workspace["seat_status"]["purchased_staff_seats"], 0)
            self.assertIsNone(db.scalar(select(AcademyStudentSubscription).where(AcademyStudentSubscription.academy_id == self.owner_id)))
        finally:
            db.close()

    def test_teacher_invite_requires_assigned_class(self):
        db = self.Session()
        try:
            self.seed_accounts(db, purchased_staff_seats=1)
            with self.assertRaises(HTTPException) as blocked:
                create_staff_invite_code(self.owner_id, StaffInviteCreate(role="teacher"), request_for(self.owner_id), db)
            self.assertEqual(blocked.exception.status_code, 400)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
