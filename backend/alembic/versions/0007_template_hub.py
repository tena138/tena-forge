"""add template hub table

Revision ID: 0007_template_hub
Revises: 0006_auth_security
Create Date: 2026-05-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0007_template_hub"
down_revision: Union[str, None] = "0006_auth_security"
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


def upgrade() -> None:
    op.create_table(
        "template_hub_templates",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("visibility", sa.String(length=24), nullable=False),
        sa.Column("html", sa.Text(), nullable=False),
        sa.Column("css", sa.Text(), nullable=True),
        sa.Column("schema_json", _json_type(), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=1000), nullable=True),
        sa.Column("forked_from_template_id", _uuid_type(), nullable=True),
        sa.Column("like_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["forked_from_template_id"], ["template_hub_templates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_template_hub_templates_owner_id"), "template_hub_templates", ["owner_id"], unique=False)
    op.create_index(op.f("ix_template_hub_templates_category"), "template_hub_templates", ["category"], unique=False)
    op.create_index(op.f("ix_template_hub_templates_visibility"), "template_hub_templates", ["visibility"], unique=False)
    op.create_index(op.f("ix_template_hub_templates_forked_from_template_id"), "template_hub_templates", ["forked_from_template_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_template_hub_templates_forked_from_template_id"), table_name="template_hub_templates")
    op.drop_index(op.f("ix_template_hub_templates_visibility"), table_name="template_hub_templates")
    op.drop_index(op.f("ix_template_hub_templates_category"), table_name="template_hub_templates")
    op.drop_index(op.f("ix_template_hub_templates_owner_id"), table_name="template_hub_templates")
    op.drop_table("template_hub_templates")
