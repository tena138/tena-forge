"""make solution pdf optional

Revision ID: 0002_optional_solution_pdf
Revises: 0001_initial
Create Date: 2026-05-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_optional_solution_pdf"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("batches", "solution_pdf_filename", existing_type=sa.String(length=500), nullable=True)


def downgrade() -> None:
    op.alter_column("batches", "solution_pdf_filename", existing_type=sa.String(length=500), nullable=False)
