"""add live interaction settings and invite class assignment

Revision ID: 0033_live_interactions_settings
Revises: 0032_workspace_staff_invites
Create Date: 2026-06-18 00:00:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0033_live_interactions_settings"
down_revision: Union[str, None] = "0032_workspace_staff_invites"
branch_labels = None
depends_on = None


def _json_type():
    return postgresql.JSONB() if op.get_bind().dialect.name == "postgresql" else sa.JSON()


def _json_default(value: str):
    return sa.text(f"'{value}'::jsonb") if op.get_bind().dialect.name == "postgresql" else sa.text(f"'{value}'")


def upgrade() -> None:
    op.add_column(
        "academy_staff_invite_codes",
        sa.Column("assigned_class_ids", _json_type(), nullable=False, server_default=_json_default("[]")),
    )
    op.create_table(
        "academy_workspace_settings",
        sa.Column("academy_id", sa.String(length=64), nullable=False),
        sa.Column("live_start_lead_minutes", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("academy_id"),
    )


def downgrade() -> None:
    op.drop_table("academy_workspace_settings")
    op.drop_column("academy_staff_invite_codes", "assigned_class_ids")
