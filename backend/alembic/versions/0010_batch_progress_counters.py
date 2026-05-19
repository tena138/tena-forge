"""persist batch progress counters

Revision ID: 0010_batch_progress_counters
Revises: 0009_batch_failure_details
Create Date: 2026-05-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_batch_progress_counters"
down_revision = "0009_batch_failure_details"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("batches", sa.Column("progress_current", sa.Integer(), nullable=True))
    op.add_column("batches", sa.Column("progress_total", sa.Integer(), nullable=True))
    op.add_column("batches", sa.Column("progress_started_at", sa.DateTime(), nullable=True))
    op.add_column("batches", sa.Column("progress_updated_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("batches", "progress_updated_at")
    op.drop_column("batches", "progress_started_at")
    op.drop_column("batches", "progress_total")
    op.drop_column("batches", "progress_current")
