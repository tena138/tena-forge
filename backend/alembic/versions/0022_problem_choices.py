"""Store extracted multiple-choice options on problems."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0022_problem_choices"
down_revision = "0021_paper_sessions"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _json_type():
    bind = op.get_bind()
    return postgresql.JSONB() if bind.dialect.name == "postgresql" else sa.JSON()


def _json_default(value: str):
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.text(f"'{value}'::jsonb")
    return value


def upgrade() -> None:
    if _has_table("problems") and not _has_column("problems", "choices"):
        op.add_column(
            "problems",
            sa.Column("choices", _json_type(), nullable=False, server_default=_json_default("[]")),
        )


def downgrade() -> None:
    if _has_table("problems") and _has_column("problems", "choices"):
        op.drop_column("problems", "choices")
