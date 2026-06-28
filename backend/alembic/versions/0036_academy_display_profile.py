"""add academy display profile fields

Revision ID: 0036_academy_display_profile
Revises: 0035_batch_document_type_hints
Create Date: 2026-06-27 00:00:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "0036_academy_display_profile"
down_revision: Union[str, None] = "0035_batch_document_type_hints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("academies")}
    if "display_name" not in columns:
        op.add_column("academies", sa.Column("display_name", sa.String(length=120), nullable=True))
    if "bio" not in columns:
        op.add_column("academies", sa.Column("bio", sa.Text(), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("academies")}
    if "bio" in columns:
        op.drop_column("academies", "bio")
    if "display_name" in columns:
        op.drop_column("academies", "display_name")
