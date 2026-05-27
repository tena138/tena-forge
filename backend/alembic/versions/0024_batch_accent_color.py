"""Add accent color to batches."""

from alembic import op
import sqlalchemy as sa


revision = "0024_batch_accent_color"
down_revision = "0023_portone_billing"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    if _has_table("batches") and not _has_column("batches", "accent_color"):
        op.add_column("batches", sa.Column("accent_color", sa.String(length=7), nullable=True))


def downgrade() -> None:
    if _has_table("batches") and _has_column("batches", "accent_color"):
        op.drop_column("batches", "accent_color")
