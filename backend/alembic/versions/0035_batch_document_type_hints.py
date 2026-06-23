"""add batch document type hints

Revision ID: 0035_batch_document_type_hints
Revises: 0034_problem_visual_schema
Create Date: 2026-06-24 00:00:00.000000
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0035_batch_document_type_hints"
down_revision: Union[str, None] = "0034_problem_visual_schema"
branch_labels = None
depends_on = None


def _json_type():
    return postgresql.JSONB() if op.get_bind().dialect.name == "postgresql" else sa.JSON()


def upgrade() -> None:
    op.add_column("batches", sa.Column("document_type_hints", _json_type(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("batches", "document_type_hints")
