"""add workspace staff invite codes

Revision ID: 0032_workspace_staff_invites
Revises: 0031_tuition_management
Create Date: 2026-06-18 00:00:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa

from models import GUID


revision: str = "0032_workspace_staff_invites"
down_revision: Union[str, None] = "0031_tuition_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("academy_student_subscriptions", sa.Column("purchased_staff_seats", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("academy_staff_memberships", sa.Column("can_manage_students", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("academy_staff_memberships", sa.Column("can_manage_schedule", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("academy_staff_memberships", sa.Column("can_manage_coagent", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        "academy_staff_invite_codes",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("academy_id", sa.String(length=64), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("code_preview", sa.String(length=12), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False, server_default="teacher"),
        sa.Column("can_manage_seats", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_manage_materials", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("can_manage_assignments", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("can_manage_students", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("can_manage_schedule", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("can_manage_coagent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column("claimed_by", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash", name="uq_academy_staff_invite_code_hash"),
    )
    op.create_index(op.f("ix_academy_staff_invite_codes_academy_id"), "academy_staff_invite_codes", ["academy_id"])
    op.create_index(op.f("ix_academy_staff_invite_codes_code_hash"), "academy_staff_invite_codes", ["code_hash"])
    op.create_index(op.f("ix_academy_staff_invite_codes_role"), "academy_staff_invite_codes", ["role"])
    op.create_index(op.f("ix_academy_staff_invite_codes_created_by"), "academy_staff_invite_codes", ["created_by"])
    op.create_index(op.f("ix_academy_staff_invite_codes_claimed_by"), "academy_staff_invite_codes", ["claimed_by"])
    op.create_index(op.f("ix_academy_staff_invite_codes_expires_at"), "academy_staff_invite_codes", ["expires_at"])
    op.create_index(op.f("ix_academy_staff_invite_codes_revoked_at"), "academy_staff_invite_codes", ["revoked_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_academy_staff_invite_codes_revoked_at"), table_name="academy_staff_invite_codes")
    op.drop_index(op.f("ix_academy_staff_invite_codes_expires_at"), table_name="academy_staff_invite_codes")
    op.drop_index(op.f("ix_academy_staff_invite_codes_claimed_by"), table_name="academy_staff_invite_codes")
    op.drop_index(op.f("ix_academy_staff_invite_codes_created_by"), table_name="academy_staff_invite_codes")
    op.drop_index(op.f("ix_academy_staff_invite_codes_role"), table_name="academy_staff_invite_codes")
    op.drop_index(op.f("ix_academy_staff_invite_codes_code_hash"), table_name="academy_staff_invite_codes")
    op.drop_index(op.f("ix_academy_staff_invite_codes_academy_id"), table_name="academy_staff_invite_codes")
    op.drop_table("academy_staff_invite_codes")

    op.drop_column("academy_staff_memberships", "can_manage_coagent")
    op.drop_column("academy_staff_memberships", "can_manage_schedule")
    op.drop_column("academy_staff_memberships", "can_manage_students")
    op.drop_column("academy_student_subscriptions", "purchased_staff_seats")
