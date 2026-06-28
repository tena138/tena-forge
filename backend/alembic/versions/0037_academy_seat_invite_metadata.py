"""add invite metadata to academy seats

Revision ID: 0037_academy_seat_invite_metadata
Revises: 0036_academy_display_profile
Create Date: 2026-06-27 00:00:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "0037_academy_seat_invite_metadata"
down_revision: Union[str, None] = "0036_academy_display_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("academy_seats")}
    if "invite_metadata" not in columns:
        op.add_column(
            "academy_seats",
            sa.Column("invite_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        )
    op.alter_column("academy_seats", "invite_metadata", server_default=None)


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("academy_seats")}
    if "invite_metadata" in columns:
        op.drop_column("academy_seats", "invite_metadata")
