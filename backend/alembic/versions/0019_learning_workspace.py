"""Add student learning workspace tables."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0019_learning_workspace"
down_revision = "0018_batch_processing_task"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _json_type():
    bind = op.get_bind()
    return postgresql.JSONB() if bind.dialect.name == "postgresql" else sa.JSON()


def upgrade() -> None:
    if _has_table("student_academy_memberships"):
        if not _has_column("student_academy_memberships", "display_name_in_academy"):
            op.add_column("student_academy_memberships", sa.Column("display_name_in_academy", sa.String(length=120), nullable=True))
        if not _has_column("student_academy_memberships", "expires_at"):
            op.add_column("student_academy_memberships", sa.Column("expires_at", sa.DateTime(), nullable=True))
            op.create_index("ix_student_academy_memberships_expires_at", "student_academy_memberships", ["expires_at"])

    if not _has_table("content_versions"):
        op.create_table(
            "content_versions",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("source_type", sa.String(length=40), nullable=False),
            sa.Column("source_id", sa.String(length=80), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("version_label", sa.String(length=80), nullable=True),
            sa.Column("snapshot", _json_type(), nullable=False),
            sa.Column("created_by", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_content_versions_academy_id", "content_versions", ["academy_id"])
        op.create_index("ix_content_versions_source_type", "content_versions", ["source_type"])
        op.create_index("ix_content_versions_source_id", "content_versions", ["source_id"])

    if not _has_table("archive_access_grants"):
        op.create_table(
            "archive_access_grants",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("student_id", sa.String(length=64), nullable=True),
            sa.Column("group_id", sa.UUID(), nullable=True),
            sa.Column("source_type", sa.String(length=40), nullable=False),
            sa.Column("source_id", sa.String(length=80), nullable=False),
            sa.Column("access_scope", sa.String(length=40), nullable=False, server_default="problemSet"),
            sa.Column("can_view_problems", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("can_solve_freely", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("can_save_to_my_archive", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("can_create_custom_sets", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("can_see_answer_immediately", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("can_see_solution", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("can_retry", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("timed_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("starts_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        for column in ("academy_id", "student_id", "group_id", "source_type", "source_id", "access_scope", "starts_at", "expires_at", "revoked_at"):
            op.create_index(f"ix_archive_access_grants_{column}", "archive_access_grants", [column])

    if not _has_table("learning_assignments"):
        op.create_table(
            "learning_assignments",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("source_type", sa.String(length=40), nullable=False),
            sa.Column("source_id", sa.String(length=80), nullable=False),
            sa.Column("content_version_id", sa.UUID(), nullable=False),
            sa.Column("assigned_by", sa.String(length=64), nullable=False),
            sa.Column("assigned_to_type", sa.String(length=24), nullable=False, server_default="mixed"),
            sa.Column("start_at", sa.DateTime(), nullable=True),
            sa.Column("due_at", sa.DateTime(), nullable=True),
            sa.Column("schedule_type", sa.String(length=24), nullable=False, server_default="one_time"),
            sa.Column("recurrence_rule", sa.String(length=500), nullable=True),
            sa.Column("grading_mode", sa.String(length=24), nullable=False, server_default="auto"),
            sa.Column("show_score_policy", sa.String(length=32), nullable=False, server_default="immediately"),
            sa.Column("show_answer_policy", sa.String(length=32), nullable=False, server_default="afterSubmit"),
            sa.Column("show_solution_policy", sa.String(length=32), nullable=False, server_default="afterSubmit"),
            sa.Column("retry_policy", sa.String(length=24), nullable=False, server_default="wrongOnly"),
            sa.Column("time_limit_seconds", sa.Integer(), nullable=True),
            sa.Column("shuffle_problems", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("shuffle_choices", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["content_version_id"], ["content_versions.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        for column in ("academy_id", "source_type", "source_id", "content_version_id", "assigned_by", "start_at", "due_at", "status"):
            op.create_index(f"ix_learning_assignments_{column}", "learning_assignments", [column])

    if not _has_table("learning_assignment_targets"):
        op.create_table(
            "learning_assignment_targets",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("assignment_id", sa.UUID(), nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("student_id", sa.String(length=64), nullable=True),
            sa.Column("group_id", sa.UUID(), nullable=True),
            sa.ForeignKeyConstraint(["assignment_id"], ["learning_assignments.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        for column in ("assignment_id", "academy_id", "student_id", "group_id"):
            op.create_index(f"ix_learning_assignment_targets_{column}", "learning_assignment_targets", [column])

    if not _has_table("learning_submissions"):
        op.create_table(
            "learning_submissions",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("student_id", sa.String(length=64), nullable=False),
            sa.Column("assignment_id", sa.UUID(), nullable=True),
            sa.Column("source_context", sa.String(length=40), nullable=False, server_default="assignment"),
            sa.Column("source_id", sa.String(length=80), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="in_progress"),
            sa.Column("score", sa.Numeric(8, 2), nullable=True),
            sa.Column("correct_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("wrong_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("time_spent_seconds", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["assignment_id"], ["learning_assignments.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        for column in ("academy_id", "student_id", "assignment_id", "source_context", "source_id", "submitted_at", "status"):
            op.create_index(f"ix_learning_submissions_{column}", "learning_submissions", [column])

    if not _has_table("problem_attempts"):
        op.create_table(
            "problem_attempts",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("student_id", sa.String(length=64), nullable=False),
            sa.Column("submission_id", sa.UUID(), nullable=True),
            sa.Column("assignment_id", sa.UUID(), nullable=True),
            sa.Column("problem_id", sa.UUID(), nullable=False),
            sa.Column("problem_version_id", sa.UUID(), nullable=False),
            sa.Column("source_context", sa.String(length=40), nullable=False),
            sa.Column("student_answer", sa.Text(), nullable=True),
            sa.Column("normalized_student_answer", sa.Text(), nullable=True),
            sa.Column("correct_answer", sa.Text(), nullable=True),
            sa.Column("normalized_correct_answer", sa.Text(), nullable=True),
            sa.Column("is_correct", sa.Boolean(), nullable=True),
            sa.Column("grading_status", sa.String(length=32), nullable=False, server_default="needs_manual_review"),
            sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("time_spent_seconds", sa.Integer(), nullable=True),
            sa.Column("submitted_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["assignment_id"], ["learning_assignments.id"]),
            sa.ForeignKeyConstraint(["problem_id"], ["problems.id"]),
            sa.ForeignKeyConstraint(["problem_version_id"], ["content_versions.id"]),
            sa.ForeignKeyConstraint(["submission_id"], ["learning_submissions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        for column in ("academy_id", "student_id", "submission_id", "assignment_id", "problem_id", "problem_version_id", "source_context", "is_correct", "grading_status", "submitted_at"):
            op.create_index(f"ix_problem_attempts_{column}", "problem_attempts", [column])

    if not _has_table("wrong_answer_records"):
        op.create_table(
            "wrong_answer_records",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("student_id", sa.String(length=64), nullable=False),
            sa.Column("problem_id", sa.UUID(), nullable=False),
            sa.Column("problem_version_id", sa.UUID(), nullable=False),
            sa.Column("first_wrong_at", sa.DateTime(), nullable=False),
            sa.Column("latest_wrong_at", sa.DateTime(), nullable=False),
            sa.Column("wrong_count", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("resolved_status", sa.String(length=24), nullable=False, server_default="unresolved"),
            sa.Column("last_attempt_id", sa.UUID(), nullable=True),
            sa.Column("source_assignment_ids", _json_type(), nullable=False),
            sa.Column("student_memo", sa.Text(), nullable=True),
            sa.Column("teacher_memo", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["problem_id"], ["problems.id"]),
            sa.ForeignKeyConstraint(["problem_version_id"], ["content_versions.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("academy_id", "student_id", "problem_id", name="uq_wrong_answer_student_problem"),
        )
        for column in ("academy_id", "student_id", "problem_id", "problem_version_id", "latest_wrong_at", "resolved_status", "last_attempt_id"):
            op.create_index(f"ix_wrong_answer_records_{column}", "wrong_answer_records", [column])

    if not _has_table("student_personal_sets"):
        op.create_table(
            "student_personal_sets",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("student_id", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("visibility", sa.String(length=24), nullable=False, server_default="private"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_student_personal_sets_student_id", "student_personal_sets", ["student_id"])

    if not _has_table("student_personal_set_items"):
        op.create_table(
            "student_personal_set_items",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("set_id", sa.UUID(), nullable=False),
            sa.Column("student_id", sa.String(length=64), nullable=False),
            sa.Column("academy_id", sa.String(length=64), nullable=False),
            sa.Column("problem_id", sa.UUID(), nullable=False),
            sa.Column("problem_version_id", sa.UUID(), nullable=False),
            sa.Column("source_access_grant_id", sa.UUID(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("locked_reason", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["problem_id"], ["problems.id"]),
            sa.ForeignKeyConstraint(["problem_version_id"], ["content_versions.id"]),
            sa.ForeignKeyConstraint(["set_id"], ["student_personal_sets.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["source_access_grant_id"], ["archive_access_grants.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("set_id", "problem_id", name="uq_student_personal_set_problem"),
        )
        for column in ("set_id", "student_id", "academy_id", "problem_id", "problem_version_id", "source_access_grant_id"):
            op.create_index(f"ix_student_personal_set_items_{column}", "student_personal_set_items", [column])


def downgrade() -> None:
    for table_name in (
        "student_personal_set_items",
        "student_personal_sets",
        "wrong_answer_records",
        "problem_attempts",
        "learning_submissions",
        "learning_assignment_targets",
        "learning_assignments",
        "archive_access_grants",
        "content_versions",
    ):
        if _has_table(table_name):
            op.drop_table(table_name)
    if _has_column("student_academy_memberships", "expires_at"):
        op.drop_column("student_academy_memberships", "expires_at")
    if _has_column("student_academy_memberships", "display_name_in_academy"):
        op.drop_column("student_academy_memberships", "display_name_in_academy")
