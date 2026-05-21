"""Add per-batch processing task."""

from alembic import op
import sqlalchemy as sa


revision = "0018_batch_processing_task"
down_revision = "0016_batch_subject_unit_candidates"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    if not _has_column("batches", "processing_task"):
        op.add_column(
            "batches",
            sa.Column("processing_task", sa.String(length=30), nullable=False, server_default="full"),
        )
    if not _has_index("batches", "ix_batches_processing_task"):
        op.create_index("ix_batches_processing_task", "batches", ["processing_task"])


def downgrade() -> None:
    if _has_index("batches", "ix_batches_processing_task"):
        op.drop_index("ix_batches_processing_task", table_name="batches")
    if _has_column("batches", "processing_task"):
        op.drop_column("batches", "processing_task")
