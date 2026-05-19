"""add source tag

Revision ID: 0004_tag_source
Revises: 0003_problem_sets_templates
Create Date: 2026-05-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_tag_source"
down_revision: Union[str, None] = "0003_problem_sets_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tags", sa.Column("source", sa.String(length=500), nullable=True))
    op.create_index(op.f("ix_tags_source"), "tags", ["source"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tags_source"), table_name="tags")
    op.drop_column("tags", "source")
