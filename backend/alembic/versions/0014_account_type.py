"""add account type to academies

Revision ID: 0014_account_type
Revises: 0013_problem_review_page_images
Create Date: 2026-05-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0014_account_type"
down_revision: Union[str, None] = "0013_problem_review_page_images"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("academies", sa.Column("account_type", sa.String(length=20), nullable=False, server_default="academy"))
    op.create_index(op.f("ix_academies_account_type"), "academies", ["account_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_academies_account_type"), table_name="academies")
    op.drop_column("academies", "account_type")
