"""Add account archive folders

Revision ID: 0027_archive_folders
Revises: 0026_korean_passage_review
Create Date: 2026-06-06 21:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0027_archive_folders"
down_revision = "0026_korean_passage_review"
branch_labels = None
depends_on = None


def _uuid_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.UUID()
    return sa.CHAR(36)


def upgrade() -> None:
    uuid_type = _uuid_type()
    op.create_table(
        "archive_folders",
        sa.Column("id", uuid_type, nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=False, server_default="local_user"),
        sa.Column("academy_id", sa.String(length=64), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("parent_id", uuid_type, nullable=True),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["parent_id"], ["archive_folders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_archive_folders_owner_id", "archive_folders", ["owner_id"])
    op.create_index("ix_archive_folders_academy_id", "archive_folders", ["academy_id"])
    op.create_index("ix_archive_folders_parent_id", "archive_folders", ["parent_id"])
    op.add_column("batches", sa.Column("archive_folder_id", uuid_type, nullable=True))
    op.create_index("ix_batches_archive_folder_id", "batches", ["archive_folder_id"])
    op.create_foreign_key(
        "fk_batches_archive_folder_id_archive_folders",
        "batches",
        "archive_folders",
        ["archive_folder_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_batches_archive_folder_id_archive_folders", "batches", type_="foreignkey")
    op.drop_index("ix_batches_archive_folder_id", table_name="batches")
    op.drop_column("batches", "archive_folder_id")
    op.drop_index("ix_archive_folders_parent_id", table_name="archive_folders")
    op.drop_index("ix_archive_folders_academy_id", table_name="archive_folders")
    op.drop_index("ix_archive_folders_owner_id", table_name="archive_folders")
    op.drop_table("archive_folders")
