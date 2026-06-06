"""Scope archive folders by subject engine

Revision ID: 0028_archive_folder_subject_engine
Revises: 0027_archive_folders
Create Date: 2026-06-06 22:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0028_archive_folder_subject_engine"
down_revision = "0027_archive_folders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "archive_folders",
        sa.Column("subject_engine", sa.String(length=30), nullable=False, server_default="math"),
    )
    op.create_index("ix_archive_folders_subject_engine", "archive_folders", ["subject_engine"])
    op.execute(
        """
        UPDATE archive_folders
        SET subject_engine = COALESCE((
            SELECT b.subject_engine
            FROM batches b
            WHERE b.archive_folder_id = archive_folders.id
              AND b.subject_engine IS NOT NULL
              AND b.subject_engine <> ''
            GROUP BY b.subject_engine
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ), subject_engine)
        """
    )
    op.execute(
        """
        UPDATE archive_folders
        SET subject_engine = 'korean'
        WHERE lower(name) IN ('korean', 'kor')
           OR name LIKE '%국어%'
        """
    )
    op.execute(
        """
        UPDATE archive_folders
        SET subject_engine = 'english'
        WHERE lower(name) IN ('english', 'eng')
           OR name LIKE '%영어%'
        """
    )


def downgrade() -> None:
    op.drop_index("ix_archive_folders_subject_engine", table_name="archive_folders")
    op.drop_column("archive_folders", "subject_engine")
