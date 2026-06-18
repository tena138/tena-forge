"""add tuition management

Revision ID: 0031_tuition_management
Revises: 0030_problem_usage_history
Create Date: 2026-06-18 00:00:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from models import GUID


revision: str = "0031_tuition_management"
down_revision: Union[str, None] = "0030_problem_usage_history"
branch_labels = None
depends_on = None


def _json_type():
    return sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column("class_schedule_events", sa.Column("counts_for_tuition", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("class_schedule_events", sa.Column("metadata", _json_type(), nullable=False, server_default=sa.text("'{}'")))
    op.create_index(op.f("ix_class_schedule_events_counts_for_tuition"), "class_schedule_events", ["counts_for_tuition"])

    op.create_table(
        "student_tuition_session_adjustments",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("academy_id", sa.String(length=64), nullable=False),
        sa.Column("event_id", GUID(), nullable=False),
        sa.Column("student_membership_id", GUID(), nullable=False),
        sa.Column("counts_for_tuition", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reason", sa.String(length=80), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["event_id"], ["class_schedule_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_membership_id"], ["student_academy_memberships.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "student_membership_id", name="uq_tuition_session_adjustment_event_student"),
    )
    op.create_index(op.f("ix_student_tuition_session_adjustments_academy_id"), "student_tuition_session_adjustments", ["academy_id"])
    op.create_index(op.f("ix_student_tuition_session_adjustments_event_id"), "student_tuition_session_adjustments", ["event_id"])
    op.create_index(op.f("ix_student_tuition_session_adjustments_student_membership_id"), "student_tuition_session_adjustments", ["student_membership_id"])
    op.create_index(op.f("ix_student_tuition_session_adjustments_counts_for_tuition"), "student_tuition_session_adjustments", ["counts_for_tuition"])

    op.create_table(
        "student_tuition_payments",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("academy_id", sa.String(length=64), nullable=False),
        sa.Column("student_membership_id", GUID(), nullable=False),
        sa.Column("student_user_id", sa.String(length=64), nullable=False),
        sa.Column("class_id", GUID(), nullable=True),
        sa.Column("due_event_id", GUID(), nullable=True),
        sa.Column("cycle_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cycle_start_session", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cycle_end_session", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cycle_sessions", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("amount", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("due_at", sa.DateTime(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("confirmed_by", sa.String(length=64), nullable=True),
        sa.Column("reminder_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reminder_sent_at", sa.DateTime(), nullable=True),
        sa.Column("reminder_message", sa.Text(), nullable=True),
        sa.Column("metadata", _json_type(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["class_id"], ["academy_classes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["due_event_id"], ["class_schedule_events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["student_membership_id"], ["student_academy_memberships.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("academy_id", "student_membership_id", "due_event_id", name="uq_tuition_payment_due_event_student"),
    )
    op.create_index(op.f("ix_student_tuition_payments_academy_id"), "student_tuition_payments", ["academy_id"])
    op.create_index(op.f("ix_student_tuition_payments_student_membership_id"), "student_tuition_payments", ["student_membership_id"])
    op.create_index(op.f("ix_student_tuition_payments_student_user_id"), "student_tuition_payments", ["student_user_id"])
    op.create_index(op.f("ix_student_tuition_payments_class_id"), "student_tuition_payments", ["class_id"])
    op.create_index(op.f("ix_student_tuition_payments_due_event_id"), "student_tuition_payments", ["due_event_id"])
    op.create_index(op.f("ix_student_tuition_payments_cycle_number"), "student_tuition_payments", ["cycle_number"])
    op.create_index(op.f("ix_student_tuition_payments_status"), "student_tuition_payments", ["status"])
    op.create_index(op.f("ix_student_tuition_payments_due_at"), "student_tuition_payments", ["due_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_student_tuition_payments_due_at"), table_name="student_tuition_payments")
    op.drop_index(op.f("ix_student_tuition_payments_status"), table_name="student_tuition_payments")
    op.drop_index(op.f("ix_student_tuition_payments_cycle_number"), table_name="student_tuition_payments")
    op.drop_index(op.f("ix_student_tuition_payments_due_event_id"), table_name="student_tuition_payments")
    op.drop_index(op.f("ix_student_tuition_payments_class_id"), table_name="student_tuition_payments")
    op.drop_index(op.f("ix_student_tuition_payments_student_user_id"), table_name="student_tuition_payments")
    op.drop_index(op.f("ix_student_tuition_payments_student_membership_id"), table_name="student_tuition_payments")
    op.drop_index(op.f("ix_student_tuition_payments_academy_id"), table_name="student_tuition_payments")
    op.drop_table("student_tuition_payments")

    op.drop_index(op.f("ix_student_tuition_session_adjustments_counts_for_tuition"), table_name="student_tuition_session_adjustments")
    op.drop_index(op.f("ix_student_tuition_session_adjustments_student_membership_id"), table_name="student_tuition_session_adjustments")
    op.drop_index(op.f("ix_student_tuition_session_adjustments_event_id"), table_name="student_tuition_session_adjustments")
    op.drop_index(op.f("ix_student_tuition_session_adjustments_academy_id"), table_name="student_tuition_session_adjustments")
    op.drop_table("student_tuition_session_adjustments")

    op.drop_index(op.f("ix_class_schedule_events_counts_for_tuition"), table_name="class_schedule_events")
    op.drop_column("class_schedule_events", "metadata")
    op.drop_column("class_schedule_events", "counts_for_tuition")
