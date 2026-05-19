"""Add problem trash scheduling fields."""

from alembic import op
import sqlalchemy as sa


revision = "0015_problem_trash"
down_revision = "0014_account_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("problems", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("problems", sa.Column("delete_scheduled_at", sa.DateTime(), nullable=True))
    op.create_index("ix_problems_deleted_at", "problems", ["deleted_at"])
    op.create_index("ix_problems_delete_scheduled_at", "problems", ["delete_scheduled_at"])


def downgrade() -> None:
    op.drop_index("ix_problems_delete_scheduled_at", table_name="problems")
    op.drop_index("ix_problems_deleted_at", table_name="problems")
    op.drop_column("problems", "delete_scheduled_at")
    op.drop_column("problems", "deleted_at")
