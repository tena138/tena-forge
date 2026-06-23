"""add editable problem visual schema

Revision ID: 0034_problem_visual_schema
Revises: 0033_live_interactions_settings
Create Date: 2026-06-23 00:00:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0034_problem_visual_schema"
down_revision: Union[str, None] = "0033_live_interactions_settings"
branch_labels = None
depends_on = None


def _json_type():
    return postgresql.JSONB() if op.get_bind().dialect.name == "postgresql" else sa.JSON()


def upgrade() -> None:
    op.add_column("problems", sa.Column("visual_schema", _json_type(), nullable=True))
    op.add_column("problems", sa.Column("math_model", _json_type(), nullable=True))


def downgrade() -> None:
    op.drop_column("problems", "math_model")
    op.drop_column("problems", "visual_schema")
