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


def _uuid_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.CHAR(length=36)


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name))


def upgrade() -> None:
    if not _has_column("exam_templates", "updated_at"):
        op.add_column("exam_templates", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE exam_templates SET updated_at = created_at WHERE updated_at IS NULL")
    if not _has_table("template_versions"):
        op.create_table(
            "template_versions",
            sa.Column("id", _uuid_type(), nullable=False),
            sa.Column("template_id", _uuid_type(), nullable=False),
            sa.Column("canvas_json", _json_type(), nullable=False),
            sa.Column("saved_at", sa.DateTime(), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("element_count", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["template_id"], ["exam_templates.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _has_index("template_versions", "ix_template_versions_template_id"):
        op.create_index(op.f("ix_template_versions_template_id"), "template_versions", ["template_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_template_versions_template_id"), table_name="template_versions")
    op.drop_table("template_versions")
    op.drop_column("exam_templates", "updated_at")
