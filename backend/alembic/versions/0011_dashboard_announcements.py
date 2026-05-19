"""add dashboard announcements

Revision ID: 0011_dashboard_announcements
Revises: 0010_batch_progress_counters
Create Date: 2026-05-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0011_dashboard_announcements"
down_revision = "0010_batch_progress_counters"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "dashboard_announcements",
        sa.Column("id", sa.CHAR(36), primary_key=True, nullable=False),
        sa.Column("eyebrow", sa.String(length=80), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("badge", sa.String(length=80), nullable=True),
        sa.Column("cta_label", sa.String(length=80), nullable=True),
        sa.Column("cta_href", sa.String(length=500), nullable=True),
        sa.Column("secondary_label", sa.String(length=80), nullable=True),
        sa.Column("secondary_href", sa.String(length=500), nullable=True),
        sa.Column("media_type", sa.String(length=20), nullable=False, server_default="none"),
        sa.Column("media_url", sa.String(length=1000), nullable=True),
        sa.Column("media_alt", sa.String(length=255), nullable=True),
        sa.Column("theme", sa.String(length=40), nullable=False, server_default="product"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("starts_at", sa.DateTime(), nullable=True),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("dashboard_announcements")
