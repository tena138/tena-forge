"""Add paper sessions for manual classroom grading."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0021_paper_sessions"
down_revision = "0020_korean_subject_engine"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _json_type():
    bind = op.get_bind()
    return postgresql.JSONB() if bind.dialect.name == "postgresql" else sa.JSON()


def _uuid_type():
    bind = op.get_bind()
    return postgresql.UUID(as_uuid=True) if bind.dialect.name == "postgresql" else sa.CHAR(length=36)


def _create_indexes(table_name: str, columns: tuple[str, ...]) -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {index["name"] for index in inspector.get_indexes(table_name)}
    for column in columns:
        index_name = f"ix_{table_name}_{column}"
        if index_name not in existing:
            op.create_index(index_name, table_name, [column])


def upgrade() -> None:
    uuid_type = _uuid_type()

    if not _has_table("paper_sessions"):
        op.create_table(
            "paper_sessions",
            sa.Column("id", uuid_type, nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("source_problem_set_id", uuid_type, nullable=True),
            sa.Column("source_archive_id", sa.String(length=80), nullable=True),
            sa.Column("content_version_id", uuid_type, nullable=False),
            sa.Column("session_type", sa.String(length=32), nullable=False, server_default="test"),
            sa.Column("target_type", sa.String(length=24), nullable=False, server_default="class"),
            sa.Column("class_ids", _json_type(), nullable=False),
            sa.Column("student_membership_ids", _json_type(), nullable=False),
            sa.Column("scheduled_at", sa.DateTime(), nullable=True),
            sa.Column("due_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
            sa.Column("exported_file_url", sa.String(length=1000), nullable=True),
            sa.Column("created_by", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["content_version_id"], ["content_versions.id"]),
            sa.ForeignKeyConstraint(["source_problem_set_id"], ["problem_sets.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        _create_indexes(
            "paper_sessions",
            (
                "academy_id",
                "source_problem_set_id",
                "source_archive_id",
                "content_version_id",
                "session_type",
                "target_type",
                "scheduled_at",
                "due_at",
                "status",
                "created_by",
            ),
        )

    if not _has_table("paper_session_results"):
        op.create_table(
            "paper_session_results",
            sa.Column("id", uuid_type, nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("paper_session_id", uuid_type, nullable=False),
            sa.Column("student_membership_id", uuid_type, nullable=False),
            sa.Column("student_user_id", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending_grading"),
            sa.Column("score", sa.Numeric(8, 2), nullable=True),
            sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("wrong_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("graded_by", sa.String(length=64), nullable=True),
            sa.Column("graded_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["paper_session_id"], ["paper_sessions.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_membership_id"], ["student_academy_memberships.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("paper_session_id", "student_membership_id", name="uq_paper_session_student_result"),
        )
        _create_indexes(
            "paper_session_results",
            ("academy_id", "paper_session_id", "student_membership_id", "student_user_id", "status", "graded_by", "graded_at"),
        )

    if not _has_table("problem_results"):
        op.create_table(
            "problem_results",
            sa.Column("id", uuid_type, nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("paper_session_id", uuid_type, nullable=False),
            sa.Column("paper_session_result_id", uuid_type, nullable=False),
            sa.Column("student_membership_id", uuid_type, nullable=False),
            sa.Column("student_user_id", sa.String(length=64), nullable=False),
            sa.Column("problem_id", uuid_type, nullable=False),
            sa.Column("problem_version_id", uuid_type, nullable=False),
            sa.Column("problem_number", sa.Integer(), nullable=False),
            sa.Column("result_status", sa.String(length=24), nullable=False, server_default="unmarked"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["paper_session_id"], ["paper_sessions.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["paper_session_result_id"], ["paper_session_results.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_membership_id"], ["student_academy_memberships.id"]),
            sa.ForeignKeyConstraint(["problem_id"], ["problems.id"]),
            sa.ForeignKeyConstraint(["problem_version_id"], ["content_versions.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("paper_session_result_id", "problem_id", name="uq_problem_result_student_problem"),
        )
        _create_indexes(
            "problem_results",
            (
                "academy_id",
                "paper_session_id",
                "paper_session_result_id",
                "student_membership_id",
                "student_user_id",
                "problem_id",
                "problem_version_id",
                "problem_number",
                "result_status",
            ),
        )

    if not _has_table("class_schedule_events"):
        op.create_table(
            "class_schedule_events",
            sa.Column("id", uuid_type, nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("class_id", uuid_type, nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("event_type", sa.String(length=32), nullable=False, server_default="class"),
            sa.Column("starts_at", sa.DateTime(), nullable=False),
            sa.Column("ends_at", sa.DateTime(), nullable=True),
            sa.Column("linked_paper_session_id", uuid_type, nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["class_id"], ["academy_classes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["linked_paper_session_id"], ["paper_sessions.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        _create_indexes(
            "class_schedule_events",
            ("academy_id", "class_id", "event_type", "starts_at", "linked_paper_session_id"),
        )


def downgrade() -> None:
    for table_name in ("class_schedule_events", "problem_results", "paper_session_results", "paper_sessions"):
        if _has_table(table_name):
            op.drop_table(table_name)
