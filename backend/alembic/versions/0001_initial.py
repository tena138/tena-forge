"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    batch_status = postgresql.ENUM("pending", "processing", "done", "error", name="batch_status")
    batch_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("problem_pdf_filename", sa.String(length=500), nullable=False),
        sa.Column("solution_pdf_filename", sa.String(length=500), nullable=True),
        sa.Column("status", batch_status, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "problems",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("problem_number", sa.Integer(), nullable=False),
        sa.Column("problem_text", sa.Text(), nullable=False),
        sa.Column("has_visual", sa.Boolean(), nullable=False),
        sa.Column("visual_url", sa.String(length=1000), nullable=True),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("solution_steps", sa.Text(), nullable=True),
        sa.Column("key_concept", sa.Text(), nullable=True),
        sa.Column("needs_review", sa.Boolean(), nullable=False),
        sa.Column("source_batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["source_batch_id"], ["batches.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("problem_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("unit", sa.String(length=255), nullable=True),
        sa.Column("difficulty", sa.String(length=20), nullable=True),
        sa.Column("problem_type", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["problem_id"], ["problems.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("problem_id"),
    )
    op.create_index("ix_problems_problem_number", "problems", ["problem_number"])
    op.create_index("ix_problems_source_batch_id", "problems", ["source_batch_id"])
    op.create_index("ix_tags_subject", "tags", ["subject"])
    op.create_index("ix_tags_unit", "tags", ["unit"])
    op.create_index("ix_tags_difficulty", "tags", ["difficulty"])
    op.create_index("ix_tags_problem_type", "tags", ["problem_type"])


def downgrade() -> None:
    op.drop_index("ix_tags_problem_type", table_name="tags")
    op.drop_index("ix_tags_difficulty", table_name="tags")
    op.drop_index("ix_tags_unit", table_name="tags")
    op.drop_index("ix_tags_subject", table_name="tags")
    op.drop_index("ix_problems_source_batch_id", table_name="problems")
    op.drop_index("ix_problems_problem_number", table_name="problems")
    op.drop_table("tags")
    op.drop_table("problems")
    op.drop_table("batches")
    postgresql.ENUM(name="batch_status").drop(op.get_bind(), checkfirst=True)
