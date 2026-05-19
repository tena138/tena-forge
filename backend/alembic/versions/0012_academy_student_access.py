"""add academy student access system

Revision ID: 0012_academy_student_access
Revises: 0011_dashboard_announcements
Create Date: 2026-05-09 00:00:00.000000
"""

from alembic import op

from models import (
    AbuseSignal,
    AcademyClass,
    AcademyMaterial,
    AcademyMaterialAssignment,
    AcademySeat,
    AcademyStaffMembership,
    AcademyStudentPlan,
    AcademyStudentSubscription,
    Announcement,
    Assignment,
    AssignmentAnswer,
    AssignmentContent,
    AssignmentSubmission,
    AssignmentTarget,
    CalendarEvent,
    ClassStudent,
    ClassTeacher,
    DailyStudentQuotaUsage,
    MaterialDeliveryLog,
    MonthlyUsageRecord,
    SeatAssignmentHistory,
    StudentAcademyMembership,
    StudentNotification,
    TestSession,
    TestSessionEvent,
    WatermarkedExport,
    WrongAnswerAttempt,
    WrongAnswerExport,
    WrongAnswerItem,
    WrongAnswerReview,
)

revision = "0012_academy_student_access"
down_revision = "0011_dashboard_announcements"
branch_labels = None
depends_on = None

TABLES = [
    AcademyStudentPlan.__table__,
    AcademyStudentSubscription.__table__,
    AcademyStaffMembership.__table__,
    AcademySeat.__table__,
    StudentAcademyMembership.__table__,
    SeatAssignmentHistory.__table__,
    AcademyClass.__table__,
    ClassStudent.__table__,
    ClassTeacher.__table__,
    Assignment.__table__,
    AssignmentTarget.__table__,
    AssignmentContent.__table__,
    AssignmentSubmission.__table__,
    AssignmentAnswer.__table__,
    TestSession.__table__,
    TestSessionEvent.__table__,
    CalendarEvent.__table__,
    AcademyMaterial.__table__,
    AcademyMaterialAssignment.__table__,
    MaterialDeliveryLog.__table__,
    WatermarkedExport.__table__,
    DailyStudentQuotaUsage.__table__,
    MonthlyUsageRecord.__table__,
    WrongAnswerItem.__table__,
    WrongAnswerReview.__table__,
    WrongAnswerAttempt.__table__,
    WrongAnswerExport.__table__,
    Announcement.__table__,
    StudentNotification.__table__,
    AbuseSignal.__table__,
]


def upgrade():
    bind = op.get_bind()
    for table in TABLES:
        table.create(bind=bind, checkfirst=True)


def downgrade():
    bind = op.get_bind()
    for table in reversed(TABLES):
        table.drop(bind=bind, checkfirst=True)

