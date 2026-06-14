"""add routine action queue

Revision ID: 0029_routine_actions
Revises: 0028_archive_folder_subject_engine
Create Date: 2026-06-14 23:30:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from models import GUID


revision: str = "0029_routine_actions"
down_revision: Union[str, None] = "0028_archive_folder_subject_engine"
branch_labels = None
depends_on = None


def _json_type():
    return sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "routine_actions",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("academy_id", sa.String(length=64), nullable=False),
        sa.Column("routine_type", sa.String(length=80), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.String(length=120), nullable=False),
        sa.Column("class_id", GUID(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="suggested"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("ai_payload", _json_type(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("channel", sa.String(length=40), nullable=False, server_default="student_notification"),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("approved_by", sa.String(length=64), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("academy_id", "routine_type", "source_type", "source_id", name="uq_routine_action_source"),
    )
    op.create_index(op.f("ix_routine_actions_academy_id"), "routine_actions", ["academy_id"])
    op.create_index(op.f("ix_routine_actions_routine_type"), "routine_actions", ["routine_type"])
    op.create_index(op.f("ix_routine_actions_source_type"), "routine_actions", ["source_type"])
    op.create_index(op.f("ix_routine_actions_source_id"), "routine_actions", ["source_id"])
    op.create_index(op.f("ix_routine_actions_class_id"), "routine_actions", ["class_id"])
    op.create_index(op.f("ix_routine_actions_status"), "routine_actions", ["status"])

    op.create_table(
        "routine_messages",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("action_id", GUID(), nullable=False),
        sa.Column("student_membership_id", GUID(), nullable=True),
        sa.Column("student_user_id", sa.String(length=64), nullable=False),
        sa.Column("student_name", sa.String(length=255), nullable=False),
        sa.Column("class_id", GUID(), nullable=True),
        sa.Column("class_name", sa.String(length=255), nullable=True),
        sa.Column("message_body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("channel", sa.String(length=40), nullable=False, server_default="student_notification"),
        sa.Column("delivery_status", sa.String(length=40), nullable=False, server_default="draft"),
        sa.Column("notification_id", GUID(), nullable=True),
        sa.Column("metadata", _json_type(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["action_id"], ["routine_actions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["notification_id"], ["student_notifications.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_routine_messages_action_id"), "routine_messages", ["action_id"])
    op.create_index(op.f("ix_routine_messages_student_membership_id"), "routine_messages", ["student_membership_id"])
    op.create_index(op.f("ix_routine_messages_student_user_id"), "routine_messages", ["student_user_id"])
    op.create_index(op.f("ix_routine_messages_class_id"), "routine_messages", ["class_id"])
    op.create_index(op.f("ix_routine_messages_status"), "routine_messages", ["status"])
    op.create_index(op.f("ix_routine_messages_delivery_status"), "routine_messages", ["delivery_status"])
    op.create_index(op.f("ix_routine_messages_notification_id"), "routine_messages", ["notification_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_routine_messages_notification_id"), table_name="routine_messages")
    op.drop_index(op.f("ix_routine_messages_delivery_status"), table_name="routine_messages")
    op.drop_index(op.f("ix_routine_messages_status"), table_name="routine_messages")
    op.drop_index(op.f("ix_routine_messages_class_id"), table_name="routine_messages")
    op.drop_index(op.f("ix_routine_messages_student_user_id"), table_name="routine_messages")
    op.drop_index(op.f("ix_routine_messages_student_membership_id"), table_name="routine_messages")
    op.drop_index(op.f("ix_routine_messages_action_id"), table_name="routine_messages")
    op.drop_table("routine_messages")
    op.drop_index(op.f("ix_routine_actions_status"), table_name="routine_actions")
    op.drop_index(op.f("ix_routine_actions_class_id"), table_name="routine_actions")
    op.drop_index(op.f("ix_routine_actions_source_id"), table_name="routine_actions")
    op.drop_index(op.f("ix_routine_actions_source_type"), table_name="routine_actions")
    op.drop_index(op.f("ix_routine_actions_routine_type"), table_name="routine_actions")
    op.drop_index(op.f("ix_routine_actions_academy_id"), table_name="routine_actions")
    op.drop_table("routine_actions")
