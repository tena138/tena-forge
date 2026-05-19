"""add problem review page image references

Revision ID: 0013_problem_review_page_images
Revises: 0012_academy_student_access
Create Date: 2026-05-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0013_problem_review_page_images"
down_revision: Union[str, None] = "0012_academy_student_access"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("problems", sa.Column("review_page_image_url", sa.String(length=1000), nullable=True))
    op.add_column("problems", sa.Column("review_page_number", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("problems", "review_page_number")
    op.drop_column("problems", "review_page_image_url")
