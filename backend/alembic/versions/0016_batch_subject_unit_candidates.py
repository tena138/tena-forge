"""Add batch subject and unit candidates."""

from alembic import op
import sqlalchemy as sa


revision = "0016_batch_subject_unit_candidates"
down_revision = "0015_problem_trash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("batches", sa.Column("subject_candidates", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("batches", sa.Column("unit_candidates", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("batches", "unit_candidates")
    op.drop_column("batches", "subject_candidates")
