"""Add review state to Korean passage groups

Revision ID: 0026_korean_passage_review
Revises: 0025_academy_seat_class_id
Create Date: 2026-06-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0026_korean_passage_review"
down_revision = "0025_academy_seat_class_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "korean_passage_groups",
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_korean_passage_groups_needs_review", "korean_passage_groups", ["needs_review"], unique=False)
    op.execute(
        """
        UPDATE problems
        SET needs_review = TRUE
        WHERE deleted_at IS NULL
          AND source_batch_id IN (
            SELECT id FROM batches WHERE subject_engine = 'korean'
          )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_korean_passage_groups_needs_review", table_name="korean_passage_groups")
    op.drop_column("korean_passage_groups", "needs_review")
