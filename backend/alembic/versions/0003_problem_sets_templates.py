"""add problem sets and exam templates

Revision ID: 0003_problem_sets_templates
Revises: 0002_optional_solution_pdf
Create Date: 2026-05-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_problem_sets_templates"
down_revision: Union[str, None] = "0002_optional_solution_pdf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.JSONB(astext_type=sa.Text())
    return sa.JSON()


def _uuid_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.CHAR(length=36)


def _has_table(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return any(index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name))


def _has_rows(table_name: str) -> bool:
    result = op.get_bind().execute(sa.text(f'SELECT EXISTS (SELECT 1 FROM "{table_name}" LIMIT 1)'))
    return bool(result.scalar())


def _uses_uuid_id(table_name: str) -> bool:
    if not _has_table(table_name):
        return True
    for column in sa.inspect(op.get_bind()).get_columns(table_name):
        if column["name"] == "id":
            return str(column["type"]).lower() == "uuid"
    return True


def _drop_empty_partial_table(table_name: str) -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or not _has_table(table_name) or _uses_uuid_id(table_name):
        return
    if _has_rows(table_name):
        raise RuntimeError(f"{table_name} has non-UUID ids and contains data; manual migration is required.")
    op.execute(sa.text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))


def upgrade() -> None:
    _drop_empty_partial_table("problem_set_items")
    _drop_empty_partial_table("problem_sets")
    _drop_empty_partial_table("exam_templates")

    if not _has_table("problem_sets"):
        op.create_table(
            "problem_sets",
            sa.Column("id", _uuid_type(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    if not _has_table("problem_set_items"):
        op.create_table(
            "problem_set_items",
            sa.Column("id", _uuid_type(), nullable=False),
            sa.Column("problem_set_id", _uuid_type(), nullable=False),
            sa.Column("problem_id", _uuid_type(), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["problem_id"], ["problems.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["problem_set_id"], ["problem_sets.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("problem_set_id", "problem_id", name="uq_problem_set_problem"),
        )
    if not _has_index("problem_set_items", "ix_problem_set_items_problem_id"):
        op.create_index(op.f("ix_problem_set_items_problem_id"), "problem_set_items", ["problem_id"], unique=False)
    if not _has_index("problem_set_items", "ix_problem_set_items_problem_set_id"):
        op.create_index(op.f("ix_problem_set_items_problem_set_id"), "problem_set_items", ["problem_set_id"], unique=False)
    if not _has_table("exam_templates"):
        op.create_table(
            "exam_templates",
            sa.Column("id", _uuid_type(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("academy_name", sa.String(length=255), nullable=True),
            sa.Column("logo_url", sa.String(length=1000), nullable=True),
            sa.Column("header_fields", _json_type(), nullable=False),
            sa.Column("footer_text", sa.Text(), nullable=True),
            sa.Column("font_size", sa.Integer(), nullable=False),
            sa.Column("problems_per_page", sa.Integer(), nullable=False),
            sa.Column("include_solution", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("exam_templates")
    op.drop_index(op.f("ix_problem_set_items_problem_set_id"), table_name="problem_set_items")
    op.drop_index(op.f("ix_problem_set_items_problem_id"), table_name="problem_set_items")
    op.drop_table("problem_set_items")
    op.drop_table("problem_sets")
