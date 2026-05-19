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


def upgrade() -> None:
    op.create_table(
        "problem_sets",
        sa.Column("id", sa.CHAR(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "problem_set_items",
        sa.Column("id", sa.CHAR(length=36), nullable=False),
        sa.Column("problem_set_id", sa.CHAR(length=36), nullable=False),
        sa.Column("problem_id", sa.CHAR(length=36), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["problem_id"], ["problems.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["problem_set_id"], ["problem_sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("problem_set_id", "problem_id", name="uq_problem_set_problem"),
    )
    op.create_index(op.f("ix_problem_set_items_problem_id"), "problem_set_items", ["problem_id"], unique=False)
    op.create_index(op.f("ix_problem_set_items_problem_set_id"), "problem_set_items", ["problem_set_id"], unique=False)
    op.create_table(
        "exam_templates",
        sa.Column("id", sa.CHAR(length=36), nullable=False),
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
