"""Add per-batch processing mode."""

from alembic import op
import sqlalchemy as sa


revision = "0017_batch_processing_mode"
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
    if not _has_column("batches", "processing_mode"):
        op.add_column(
            "batches",
            sa.Column("processing_mode", sa.String(length=20), nullable=False, server_default="local"),
        )
    if not _has_index("batches", "ix_batches_processing_mode"):
        op.create_index("ix_batches_processing_mode", "batches", ["processing_mode"])


def downgrade() -> None:
    if _has_index("batches", "ix_batches_processing_mode"):
        op.drop_index("ix_batches_processing_mode", table_name="batches")
    if _has_column("batches", "processing_mode"):
        op.drop_column("batches", "processing_mode")
