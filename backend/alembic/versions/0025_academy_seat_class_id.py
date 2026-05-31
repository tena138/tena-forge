"""Add class scope to academy seats

Revision ID: 0025_academy_seat_class_id
Revises: 0024_batch_accent_color
Create Date: 2026-05-31 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

from models import GUID


revision = "0025_academy_seat_class_id"
down_revision = "0024_batch_accent_color"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("academy_seats", sa.Column("class_id", GUID(), nullable=True))
    op.create_index("ix_academy_seats_class_id", "academy_seats", ["class_id"], unique=False)
    op.create_foreign_key(
        "fk_academy_seats_class_id_academy_classes",
        "academy_seats",
        "academy_classes",
        ["class_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_academy_seats_class_id_academy_classes", "academy_seats", type_="foreignkey")
    op.drop_index("ix_academy_seats_class_id", table_name="academy_seats")
    op.drop_column("academy_seats", "class_id")
