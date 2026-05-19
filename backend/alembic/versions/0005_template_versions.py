"""add template versions

Revision ID: 0005_template_versions
Revises: 0004_tag_source
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005_template_versions"
down_revision: Union[str, None] = "0004_tag_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.JSONB(astext_type=sa.Text())
    return sa.JSON()


def upgrade() -> None:
    op.add_column("exam_templates", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE exam_templates SET updated_at = created_at WHERE updated_at IS NULL")
    op.create_table(
        "template_versions",
        sa.Column("id", sa.CHAR(length=36), nullable=False),
        sa.Column("template_id", sa.CHAR(length=36), nullable=False),
        sa.Column("canvas_json", _json_type(), nullable=False),
        sa.Column("saved_at", sa.DateTime(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("element_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["exam_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_template_versions_template_id"), "template_versions", ["template_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_template_versions_template_id"), table_name="template_versions")
    op.drop_table("template_versions")
    op.drop_column("exam_templates", "updated_at")
