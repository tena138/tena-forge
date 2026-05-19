"""persist batch progress and failure details

Revision ID: 0009_batch_failure_details
Revises: 0008_marketplace_architecture
Create Date: 2026-05-08 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_batch_failure_details"
down_revision = "0008_marketplace_architecture"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("batches", sa.Column("progress_message", sa.String(length=500), nullable=True))
    op.add_column("batches", sa.Column("failure_stage", sa.String(length=500), nullable=True))
    op.add_column("batches", sa.Column("failure_reason", sa.Text(), nullable=True))
    op.add_column("batches", sa.Column("failure_hint", sa.Text(), nullable=True))
    op.add_column("batches", sa.Column("failed_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("batches", "failed_at")
    op.drop_column("batches", "failure_hint")
    op.drop_column("batches", "failure_reason")
    op.drop_column("batches", "failure_stage")
    op.drop_column("batches", "progress_message")
