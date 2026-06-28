from pathlib import Path
import sys

from sqlalchemy import create_engine, inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import Base, get_settings
import models  # noqa: F401 - registers all SQLAlchemy models on Base.metadata

PREVIOUS_REVISION = "0023_portone_billing"
HEAD_REVISION = "0038_profile_name_student_invites"
BATCH_REQUIRED_COLUMNS = {
    "source_type",
    "source_label",
    "rights_confirmed",
    "rights_confirmed_at",
    "rights_note",
    "subject_candidates",
    "unit_candidates",
    "document_type_hints",
    "archive_folder_id",
    "processing_task",
    "subject_engine",
    "accent_color",
    "owner_id",
    "academy_id",
    "progress_message",
    "progress_current",
    "progress_total",
    "progress_started_at",
    "progress_updated_at",
    "failure_stage",
    "failure_reason",
    "failure_hint",
    "failed_at",
}
PROBLEM_REQUIRED_COLUMNS = {
    "choices",
    "source_type",
    "source_label",
    "rights_confirmed",
    "rights_confirmed_at",
    "rights_note",
    "visibility",
    "origin_type",
    "owner_id",
    "academy_id",
    "updated_at",
    "review_page_image_url",
    "review_page_number",
    "visual_schema",
    "math_model",
    "deleted_at",
    "delete_scheduled_at",
}
KOREAN_PASSAGE_GROUP_REQUIRED_COLUMNS = {
    "needs_review",
}
CLASS_SCHEDULE_EVENT_REQUIRED_COLUMNS = {
    "counts_for_tuition",
    "metadata",
}
ACADEMY_SEAT_REQUIRED_COLUMNS = {
    "class_id",
    "invite_metadata",
}
ACADEMY_STUDENT_SUBSCRIPTION_REQUIRED_COLUMNS = {
    "purchased_staff_seats",
}
ACADEMY_STAFF_MEMBERSHIP_REQUIRED_COLUMNS = {
    "can_manage_students",
    "can_manage_schedule",
    "can_manage_coagent",
}
ACADEMY_STAFF_INVITE_CODE_REQUIRED_COLUMNS = {
    "assigned_class_ids",
}
ACADEMY_WORKSPACE_SETTINGS_REQUIRED_COLUMNS = {
    "live_start_lead_minutes",
}
SUBJECT_ENGINE_COLUMNS = {
    "enabled_subject_engines",
    "subject_engine_count",
    "subject_multiplier",
    "final_monthly_price",
    "final_annual_price",
}
ACADEMY_REQUIRED_COLUMNS = {
    "email_verified",
    "email_verified_at",
    "password_hash",
    "academy_name",
    "display_name",
    "profile_name",
    "bio",
    "account_type",
    "business_number",
    "phone",
    "address",
    "plan",
    "plan_expires_at",
    "is_active",
    "is_suspended",
    "suspension_reason",
    "created_at",
    "updated_at",
    "last_login_at",
    "last_login_ip",
    "failed_login_attempts",
    "locked_until",
}


def _column_names(inspector, table_name: str) -> set[str]:
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    if table_name not in inspector.get_table_names():
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _foreign_key_names(inspector, table_name: str) -> set[str]:
    if table_name not in inspector.get_table_names():
        return set()
    return {foreign_key.get("name") for foreign_key in inspector.get_foreign_keys(table_name) if foreign_key.get("name")}


def _has_columns(inspector, table_name: str, column_names: set[str]) -> bool:
    return column_names.issubset(_column_names(inspector, table_name))


def _create_missing_tables(connection) -> None:
    Base.metadata.create_all(bind=connection)


def _add_column_if_missing(connection, inspector, table_name: str, column_name: str, definition: str) -> bool:
    if column_name in _column_names(inspector, table_name):
        return False
    if connection.dialect.name == "postgresql":
        ddl = f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {definition}"
    else:
        ddl = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"
    connection.execute(text(ddl))
    return True


def _ensure_academy_columns(connection, inspector) -> bool:
    if "academies" not in inspector.get_table_names():
        return False

    changed = False
    bool_false = "FALSE" if connection.dialect.name == "postgresql" else "0"
    bool_true = "TRUE" if connection.dialect.name == "postgresql" else "1"
    timestamp_default = "CURRENT_TIMESTAMP" if connection.dialect.name == "postgresql" else "'1970-01-01 00:00:00'"
    specs = [
        ("email", "VARCHAR(320) NULL"),
        ("email_verified", f"BOOLEAN NOT NULL DEFAULT {bool_false}"),
        ("email_verified_at", "TIMESTAMP NULL"),
        ("password_hash", "VARCHAR(255) NULL"),
        ("academy_name", "VARCHAR(255) NOT NULL DEFAULT 'Tena User'"),
        ("display_name", "VARCHAR(120) NULL"),
        ("profile_name", "VARCHAR(32) NULL"),
        ("bio", "TEXT NULL"),
        ("account_type", "VARCHAR(20) NOT NULL DEFAULT 'academy'"),
        ("business_number", "VARCHAR(50) NULL"),
        ("phone", "VARCHAR(50) NULL"),
        ("address", "VARCHAR(500) NULL"),
        ("plan", "VARCHAR(20) NOT NULL DEFAULT 'free'"),
        ("plan_expires_at", "TIMESTAMP NULL"),
        ("is_active", f"BOOLEAN NOT NULL DEFAULT {bool_true}"),
        ("is_suspended", f"BOOLEAN NOT NULL DEFAULT {bool_false}"),
        ("suspension_reason", "TEXT NULL"),
        ("created_at", f"TIMESTAMP NOT NULL DEFAULT {timestamp_default}"),
        ("updated_at", f"TIMESTAMP NOT NULL DEFAULT {timestamp_default}"),
        ("last_login_at", "TIMESTAMP NULL"),
        ("last_login_ip", "VARCHAR(64) NULL"),
        ("failed_login_attempts", "INTEGER NOT NULL DEFAULT 0"),
        ("locked_until", "TIMESTAMP NULL"),
    ]
    for column_name, definition in specs:
        if _add_column_if_missing(connection, inspector, "academies", column_name, definition):
            changed = True
            inspector = inspect(connection)

    connection.execute(text(f"UPDATE academies SET email_verified = {bool_false} WHERE email_verified IS NULL"))
    connection.execute(text("UPDATE academies SET academy_name = split_part(email, '@', 1) WHERE academy_name IS NULL OR academy_name = ''")) if connection.dialect.name == "postgresql" else connection.execute(text("UPDATE academies SET academy_name = substr(email, 1, instr(email, '@') - 1) WHERE academy_name IS NULL OR academy_name = ''"))
    if connection.dialect.name == "postgresql":
        connection.execute(
            text(
                "UPDATE academies "
                "SET profile_name = 'academy_' || substr(replace(id::text, '-', ''), 1, 24) "
                "WHERE profile_name IS NULL OR profile_name = ''"
            )
        )
        connection.execute(text("ALTER TABLE academies ALTER COLUMN profile_name SET NOT NULL"))
    else:
        connection.execute(
            text(
                "UPDATE academies "
                "SET profile_name = 'academy_' || substr(replace(CAST(id AS TEXT), '-', ''), 1, 24) "
                "WHERE profile_name IS NULL OR profile_name = ''"
            )
        )
    connection.execute(text("UPDATE academies SET account_type = 'academy' WHERE account_type IS NULL OR account_type = ''"))
    connection.execute(text("UPDATE academies SET plan = 'free' WHERE plan IS NULL"))
    connection.execute(text(f"UPDATE academies SET is_active = {bool_true} WHERE is_active IS NULL"))
    connection.execute(text(f"UPDATE academies SET is_suspended = {bool_false} WHERE is_suspended IS NULL"))
    connection.execute(text(f"UPDATE academies SET created_at = {timestamp_default} WHERE created_at IS NULL"))
    connection.execute(text(f"UPDATE academies SET updated_at = {timestamp_default} WHERE updated_at IS NULL"))
    connection.execute(text("UPDATE academies SET failed_login_attempts = 0 WHERE failed_login_attempts IS NULL"))
    inspector = inspect(connection)
    if "ix_academies_account_type" not in _index_names(inspector, "academies"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_academies_account_type ON academies (account_type)"))
        changed = True
    if "ix_academies_email" not in _index_names(inspector, "academies"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_academies_email ON academies (email)"))
        changed = True
    if "ix_academies_profile_name" not in _index_names(inspector, "academies"):
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_academies_profile_name ON academies (profile_name)"))
        changed = True
    return changed


def _ensure_batch_columns(connection, inspector) -> bool:
    if "batches" not in inspector.get_table_names():
        return False

    changed = False
    bool_false = "FALSE" if connection.dialect.name == "postgresql" else "0"
    json_definition = "JSONB NOT NULL DEFAULT '[]'::jsonb" if connection.dialect.name == "postgresql" else "JSON NOT NULL DEFAULT '[]'"
    json_default = "'[]'::jsonb" if connection.dialect.name == "postgresql" else "'[]'"
    specs = [
        ("source_type", "VARCHAR(40) NOT NULL DEFAULT 'self_created'"),
        ("source_label", "VARCHAR(255) NULL"),
        ("rights_confirmed", f"BOOLEAN NOT NULL DEFAULT {bool_false}"),
        ("rights_confirmed_at", "TIMESTAMP NULL"),
        ("rights_note", "TEXT NULL"),
        ("subject_candidates", json_definition),
        ("unit_candidates", json_definition),
        ("document_type_hints", json_definition),
        ("archive_folder_id", "UUID NULL" if connection.dialect.name == "postgresql" else "CHAR(36) NULL"),
        ("processing_task", "VARCHAR(30) NOT NULL DEFAULT 'full'"),
        ("subject_engine", "VARCHAR(30) NOT NULL DEFAULT 'math'"),
        ("accent_color", "VARCHAR(7) NULL"),
        ("owner_id", "VARCHAR(64) NOT NULL DEFAULT 'local_user'"),
        ("academy_id", "VARCHAR(64) NULL"),
        ("progress_message", "VARCHAR(500) NULL"),
        ("progress_current", "INTEGER NULL"),
        ("progress_total", "INTEGER NULL"),
        ("progress_started_at", "TIMESTAMP NULL"),
        ("progress_updated_at", "TIMESTAMP NULL"),
        ("failure_stage", "VARCHAR(500) NULL"),
        ("failure_reason", "TEXT NULL"),
        ("failure_hint", "TEXT NULL"),
        ("failed_at", "TIMESTAMP NULL"),
    ]
    for column_name, definition in specs:
        if _add_column_if_missing(connection, inspector, "batches", column_name, definition):
            changed = True
            inspector = inspect(connection)
    connection.execute(text("UPDATE batches SET source_type = 'self_created' WHERE source_type IS NULL OR source_type = ''"))
    connection.execute(text(f"UPDATE batches SET rights_confirmed = {bool_false} WHERE rights_confirmed IS NULL"))
    connection.execute(text("UPDATE batches SET owner_id = 'local_user' WHERE owner_id IS NULL OR owner_id = ''"))
    connection.execute(text(f"UPDATE batches SET subject_candidates = {json_default} WHERE subject_candidates IS NULL"))
    connection.execute(text(f"UPDATE batches SET unit_candidates = {json_default} WHERE unit_candidates IS NULL"))
    connection.execute(text(f"UPDATE batches SET document_type_hints = {json_default} WHERE document_type_hints IS NULL"))
    connection.execute(text("UPDATE batches SET processing_task = 'full' WHERE processing_task IS NULL OR processing_task = ''"))
    connection.execute(text("UPDATE batches SET subject_engine = 'math' WHERE subject_engine IS NULL OR subject_engine = ''"))
    inspector = inspect(connection)
    if "ix_batches_source_type" not in _index_names(inspector, "batches"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_batches_source_type ON batches (source_type)"))
        changed = True
    if "ix_batches_owner_id" not in _index_names(inspector, "batches"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_batches_owner_id ON batches (owner_id)"))
        changed = True
    if "ix_batches_academy_id" not in _index_names(inspector, "batches"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_batches_academy_id ON batches (academy_id)"))
        changed = True
    if "ix_batches_archive_folder_id" not in _index_names(inspector, "batches"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_batches_archive_folder_id ON batches (archive_folder_id)"))
        changed = True
    if "ix_batches_processing_task" not in _index_names(inspector, "batches"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_batches_processing_task ON batches (processing_task)"))
        changed = True
    if "ix_batches_subject_engine" not in _index_names(inspector, "batches"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_batches_subject_engine ON batches (subject_engine)"))
        changed = True
    return changed


def _ensure_archive_folder_columns(connection, inspector) -> bool:
    if "archive_folders" not in inspector.get_table_names():
        return False

    changed = False
    if _add_column_if_missing(connection, inspector, "archive_folders", "subject_engine", "VARCHAR(30) NOT NULL DEFAULT 'math'"):
        changed = True
        inspector = inspect(connection)
    connection.execute(text("UPDATE archive_folders SET subject_engine = 'math' WHERE subject_engine IS NULL OR subject_engine = ''"))
    if "ix_archive_folders_subject_engine" not in _index_names(inspector, "archive_folders"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_archive_folders_subject_engine ON archive_folders (subject_engine)"))
        changed = True
    return changed


def _ensure_student_membership_columns(connection, inspector) -> bool:
    if "student_academy_memberships" not in inspector.get_table_names():
        return False

    changed = False
    specs = [
        ("display_name_in_academy", "VARCHAR(120) NULL"),
        ("expires_at", "TIMESTAMP NULL"),
    ]
    for column_name, definition in specs:
        if _add_column_if_missing(connection, inspector, "student_academy_memberships", column_name, definition):
            changed = True
            inspector = inspect(connection)
    if "ix_student_academy_memberships_expires_at" not in _index_names(inspector, "student_academy_memberships"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_student_academy_memberships_expires_at ON student_academy_memberships (expires_at)"))
        changed = True
    return changed


def _ensure_problem_columns(connection, inspector) -> bool:
    if "problems" not in inspector.get_table_names():
        return False

    changed = False
    bool_false = "FALSE" if connection.dialect.name == "postgresql" else "0"
    json_definition = "JSONB NOT NULL DEFAULT '[]'::jsonb" if connection.dialect.name == "postgresql" else "JSON NOT NULL DEFAULT '[]'"
    json_default = "'[]'::jsonb" if connection.dialect.name == "postgresql" else "'[]'"
    specs = [
        ("choices", json_definition),
        ("source_type", "VARCHAR(40) NOT NULL DEFAULT 'self_created'"),
        ("source_label", "VARCHAR(255) NULL"),
        ("rights_confirmed", f"BOOLEAN NOT NULL DEFAULT {bool_false}"),
        ("rights_confirmed_at", "TIMESTAMP NULL"),
        ("rights_note", "TEXT NULL"),
        ("visibility", "VARCHAR(32) NOT NULL DEFAULT 'private'"),
        ("origin_type", "VARCHAR(32) NOT NULL DEFAULT 'owned'"),
        ("owner_id", "VARCHAR(64) NOT NULL DEFAULT 'local_user'"),
        ("academy_id", "VARCHAR(64) NULL"),
        ("updated_at", "TIMESTAMP NULL"),
        ("review_page_image_url", "VARCHAR(1000) NULL"),
        ("review_page_number", "INTEGER NULL"),
        ("visual_schema", "JSONB NULL" if connection.dialect.name == "postgresql" else "JSON NULL"),
        ("math_model", "JSONB NULL" if connection.dialect.name == "postgresql" else "JSON NULL"),
        ("deleted_at", "TIMESTAMP NULL"),
        ("delete_scheduled_at", "TIMESTAMP NULL"),
    ]
    for column_name, definition in specs:
        if _add_column_if_missing(connection, inspector, "problems", column_name, definition):
            changed = True
            inspector = inspect(connection)

    connection.execute(text(f"UPDATE problems SET choices = {json_default} WHERE choices IS NULL"))
    connection.execute(text("UPDATE problems SET source_type = 'self_created' WHERE source_type IS NULL OR source_type = ''"))
    connection.execute(text(f"UPDATE problems SET rights_confirmed = {bool_false} WHERE rights_confirmed IS NULL"))
    connection.execute(text("UPDATE problems SET visibility = 'private' WHERE visibility IS NULL OR visibility = ''"))
    connection.execute(text("UPDATE problems SET origin_type = 'owned' WHERE origin_type IS NULL OR origin_type = ''"))
    connection.execute(text("UPDATE problems SET owner_id = 'local_user' WHERE owner_id IS NULL OR owner_id = ''"))
    if "created_at" in _column_names(inspector, "problems"):
        connection.execute(text("UPDATE problems SET updated_at = created_at WHERE updated_at IS NULL"))

    inspector = inspect(connection)
    for index_name, column_name in (
        ("ix_problems_visibility", "visibility"),
        ("ix_problems_origin_type", "origin_type"),
        ("ix_problems_owner_id", "owner_id"),
        ("ix_problems_academy_id", "academy_id"),
        ("ix_problems_deleted_at", "deleted_at"),
        ("ix_problems_delete_scheduled_at", "delete_scheduled_at"),
    ):
        if index_name not in _index_names(inspector, "problems"):
            connection.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON problems ({column_name})"))
            changed = True
    return changed


def _ensure_academy_seat_columns(connection, inspector) -> bool:
    if "academy_seats" not in inspector.get_table_names():
        return False

    changed = False
    class_id_definition = "UUID NULL" if connection.dialect.name == "postgresql" else "CHAR(36) NULL"
    if _add_column_if_missing(connection, inspector, "academy_seats", "class_id", class_id_definition):
        changed = True
        inspector = inspect(connection)
    json_definition = "JSONB NOT NULL DEFAULT '{}'" if connection.dialect.name == "postgresql" else "JSON NOT NULL DEFAULT '{}'"
    if _add_column_if_missing(connection, inspector, "academy_seats", "invite_metadata", json_definition):
        changed = True
        inspector = inspect(connection)
    connection.execute(text("UPDATE academy_seats SET invite_metadata = '{}' WHERE invite_metadata IS NULL"))
    if "ix_academy_seats_class_id" not in _index_names(inspector, "academy_seats"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_academy_seats_class_id ON academy_seats (class_id)"))
        changed = True
    if (
        connection.dialect.name == "postgresql"
        and "academy_classes" in inspector.get_table_names()
        and "fk_academy_seats_class_id_academy_classes" not in _foreign_key_names(inspector, "academy_seats")
    ):
        connection.execute(
            text(
                "ALTER TABLE academy_seats "
                "ADD CONSTRAINT fk_academy_seats_class_id_academy_classes "
                "FOREIGN KEY (class_id) REFERENCES academy_classes (id) ON DELETE SET NULL"
            )
        )
        changed = True
    return changed


def _ensure_academy_subscription_staff_columns(connection, inspector) -> bool:
    if "academy_student_subscriptions" not in inspector.get_table_names():
        return False

    changed = False
    if _add_column_if_missing(connection, inspector, "academy_student_subscriptions", "purchased_staff_seats", "INTEGER NOT NULL DEFAULT 0"):
        changed = True
        inspector = inspect(connection)
    connection.execute(text("UPDATE academy_student_subscriptions SET purchased_staff_seats = 0 WHERE purchased_staff_seats IS NULL"))
    return changed


def _ensure_academy_staff_membership_columns(connection, inspector) -> bool:
    if "academy_staff_memberships" not in inspector.get_table_names():
        return False

    changed = False
    bool_false = "FALSE" if connection.dialect.name == "postgresql" else "0"
    bool_true = "TRUE" if connection.dialect.name == "postgresql" else "1"
    specs = [
        ("can_manage_students", f"BOOLEAN NOT NULL DEFAULT {bool_true}"),
        ("can_manage_schedule", f"BOOLEAN NOT NULL DEFAULT {bool_true}"),
        ("can_manage_coagent", f"BOOLEAN NOT NULL DEFAULT {bool_false}"),
    ]
    for column_name, definition in specs:
        if _add_column_if_missing(connection, inspector, "academy_staff_memberships", column_name, definition):
            changed = True
            inspector = inspect(connection)
    connection.execute(text(f"UPDATE academy_staff_memberships SET can_manage_students = {bool_true} WHERE can_manage_students IS NULL"))
    connection.execute(text(f"UPDATE academy_staff_memberships SET can_manage_schedule = {bool_true} WHERE can_manage_schedule IS NULL"))
    connection.execute(text(f"UPDATE academy_staff_memberships SET can_manage_coagent = {bool_false} WHERE can_manage_coagent IS NULL"))
    return changed


def _ensure_academy_staff_invite_code_columns(connection, inspector) -> bool:
    if "academy_staff_invite_codes" not in inspector.get_table_names():
        return False

    changed = False
    json_definition = "JSONB NOT NULL DEFAULT '[]'::jsonb" if connection.dialect.name == "postgresql" else "JSON NOT NULL DEFAULT '[]'"
    json_default = "'[]'::jsonb" if connection.dialect.name == "postgresql" else "'[]'"
    if _add_column_if_missing(connection, inspector, "academy_staff_invite_codes", "assigned_class_ids", json_definition):
        changed = True
        inspector = inspect(connection)
    connection.execute(text(f"UPDATE academy_staff_invite_codes SET assigned_class_ids = {json_default} WHERE assigned_class_ids IS NULL"))
    return changed


def _ensure_academy_workspace_settings_columns(connection, inspector) -> bool:
    if "academy_workspace_settings" not in inspector.get_table_names():
        return False

    changed = False
    if _add_column_if_missing(connection, inspector, "academy_workspace_settings", "live_start_lead_minutes", "INTEGER NOT NULL DEFAULT 5"):
        changed = True
        inspector = inspect(connection)
    connection.execute(text("UPDATE academy_workspace_settings SET live_start_lead_minutes = 5 WHERE live_start_lead_minutes IS NULL"))
    return changed


def _ensure_korean_passage_review_columns(connection, inspector) -> bool:
    if "korean_passage_groups" not in inspector.get_table_names():
        return False

    changed = False
    bool_true = "TRUE" if connection.dialect.name == "postgresql" else "1"
    if _add_column_if_missing(connection, inspector, "korean_passage_groups", "needs_review", f"BOOLEAN NOT NULL DEFAULT {bool_true}"):
        changed = True
        inspector = inspect(connection)
    connection.execute(text(f"UPDATE korean_passage_groups SET needs_review = {bool_true} WHERE needs_review IS NULL"))
    if "ix_korean_passage_groups_needs_review" not in _index_names(inspector, "korean_passage_groups"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_korean_passage_groups_needs_review ON korean_passage_groups (needs_review)"))
        changed = True

    tables = set(inspector.get_table_names())
    problem_columns = _column_names(inspector, "problems")
    batch_columns = _column_names(inspector, "batches")
    if (
        {"problems", "batches"}.issubset(tables)
        and {"needs_review", "source_batch_id"}.issubset(problem_columns)
        and "subject_engine" in batch_columns
    ):
        deleted_filter = "AND deleted_at IS NULL" if "deleted_at" in problem_columns else ""
        connection.execute(
            text(
                f"""
                UPDATE problems
                SET needs_review = {bool_true}
                WHERE source_batch_id IN (
                    SELECT id FROM batches WHERE subject_engine = 'korean'
                )
                {deleted_filter}
                """
            )
        )
    return changed


def _ensure_class_schedule_event_columns(connection, inspector) -> bool:
    if "class_schedule_events" not in inspector.get_table_names():
        return False

    changed = False
    bool_true = "TRUE" if connection.dialect.name == "postgresql" else "1"
    json_definition = "JSONB NOT NULL DEFAULT '{}'::jsonb" if connection.dialect.name == "postgresql" else "JSON NOT NULL DEFAULT '{}'"
    if _add_column_if_missing(connection, inspector, "class_schedule_events", "counts_for_tuition", f"BOOLEAN NOT NULL DEFAULT {bool_true}"):
        changed = True
        inspector = inspect(connection)
    if _add_column_if_missing(connection, inspector, "class_schedule_events", "metadata", json_definition):
        changed = True
        inspector = inspect(connection)
    connection.execute(text(f"UPDATE class_schedule_events SET counts_for_tuition = {bool_true} WHERE counts_for_tuition IS NULL"))
    json_default = "'{}'::jsonb" if connection.dialect.name == "postgresql" else "'{}'"
    connection.execute(text(f"UPDATE class_schedule_events SET metadata = {json_default} WHERE metadata IS NULL"))
    if "ix_class_schedule_events_counts_for_tuition" not in _index_names(inspector, "class_schedule_events"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_class_schedule_events_counts_for_tuition ON class_schedule_events (counts_for_tuition)"))
        changed = True
    return changed


def _ensure_subject_engine_columns(connection, inspector) -> bool:
    changed = False
    json_definition = "JSONB NOT NULL DEFAULT '[\"math\"]'::jsonb" if connection.dialect.name == "postgresql" else "JSON NOT NULL DEFAULT '[\"math\"]'"
    json_default = "'[\"math\"]'::jsonb" if connection.dialect.name == "postgresql" else "'[\"math\"]'"
    specs = [
        ("enabled_subject_engines", json_definition),
        ("subject_engine_count", "INTEGER NOT NULL DEFAULT 1"),
        ("subject_multiplier", "NUMERIC(6, 2) NOT NULL DEFAULT 1"),
        ("final_monthly_price", "INTEGER NOT NULL DEFAULT 0"),
        ("final_annual_price", "INTEGER NOT NULL DEFAULT 0"),
    ]
    for table_name in ("plans", "subscriptions"):
        if table_name not in inspector.get_table_names():
            continue
        for column_name, definition in specs:
            if _add_column_if_missing(connection, inspector, table_name, column_name, definition):
                changed = True
                inspector = inspect(connection)

        connection.execute(text(f"UPDATE {table_name} SET enabled_subject_engines = {json_default} WHERE enabled_subject_engines IS NULL"))
        connection.execute(text(f"UPDATE {table_name} SET subject_engine_count = 1 WHERE subject_engine_count IS NULL OR subject_engine_count < 1"))
        connection.execute(text(f"UPDATE {table_name} SET subject_multiplier = 1 WHERE subject_multiplier IS NULL OR subject_multiplier <= 0"))

    tables = set(inspector.get_table_names())
    if "plans" in tables and _has_columns(inspector, "plans", {"monthly_price", "final_monthly_price", "final_annual_price"}):
        connection.execute(text("UPDATE plans SET final_monthly_price = monthly_price WHERE (final_monthly_price IS NULL OR final_monthly_price = 0) AND monthly_price IS NOT NULL"))
        connection.execute(text("UPDATE plans SET final_annual_price = final_monthly_price * 12 WHERE final_annual_price IS NULL OR final_annual_price = 0"))
    if (
        "plans" in tables
        and "subscriptions" in tables
        and _has_columns(inspector, "plans", {"code", "monthly_price"})
        and _has_columns(inspector, "subscriptions", {"plan_code", "final_monthly_price", "final_annual_price"})
    ):
        connection.execute(
            text(
                "UPDATE subscriptions SET final_monthly_price = "
                "COALESCE((SELECT monthly_price FROM plans WHERE plans.code = subscriptions.plan_code), 0) "
                "WHERE final_monthly_price IS NULL OR final_monthly_price = 0"
            )
        )
        connection.execute(text("UPDATE subscriptions SET final_annual_price = final_monthly_price * 12 WHERE final_annual_price IS NULL OR final_annual_price = 0"))
    return changed


def _schema_is_at_head(inspector) -> bool:
    required_tables = {
        "academies",
        "user_roles",
        "archive_folders",
        "batches",
        "problems",
        "problem_sets",
        "student_academy_memberships",
        "academy_student_subscriptions",
        "academy_staff_memberships",
        "academy_staff_invite_codes",
        "academy_workspace_settings",
        "academy_classes",
        "academy_seats",
        "content_versions",
        "archive_access_grants",
        "learning_assignments",
        "learning_assignment_targets",
        "learning_submissions",
        "problem_attempts",
        "wrong_answer_records",
        "student_personal_sets",
        "student_personal_set_items",
        "paper_sessions",
        "paper_session_results",
        "problem_results",
        "class_schedule_events",
        "korean_extraction_documents",
        "korean_passage_groups",
        "korean_questions",
        "subscription_orders",
        "subscription_billing_keys",
        "subscription_payment_attempts",
        "routine_actions",
        "routine_messages",
        "problem_usage_history",
        "student_tuition_payments",
        "student_tuition_session_adjustments",
        "student_invites",
    }
    tables = set(inspector.get_table_names())
    return (
        required_tables.issubset(tables)
        and _has_columns(inspector, "batches", BATCH_REQUIRED_COLUMNS)
        and _has_columns(inspector, "archive_folders", {"subject_engine"})
        and _has_columns(inspector, "plans", SUBJECT_ENGINE_COLUMNS)
        and _has_columns(inspector, "subscriptions", SUBJECT_ENGINE_COLUMNS)
        and _has_columns(inspector, "academies", ACADEMY_REQUIRED_COLUMNS)
        and _has_columns(inspector, "student_academy_memberships", {"display_name_in_academy", "expires_at"})
        and _has_columns(inspector, "academy_student_subscriptions", ACADEMY_STUDENT_SUBSCRIPTION_REQUIRED_COLUMNS)
        and _has_columns(inspector, "academy_staff_memberships", ACADEMY_STAFF_MEMBERSHIP_REQUIRED_COLUMNS)
        and _has_columns(inspector, "academy_staff_invite_codes", ACADEMY_STAFF_INVITE_CODE_REQUIRED_COLUMNS)
        and _has_columns(inspector, "academy_workspace_settings", ACADEMY_WORKSPACE_SETTINGS_REQUIRED_COLUMNS)
        and _has_columns(inspector, "academy_seats", ACADEMY_SEAT_REQUIRED_COLUMNS)
        and _has_columns(inspector, "korean_passage_groups", KOREAN_PASSAGE_GROUP_REQUIRED_COLUMNS)
        and _has_columns(inspector, "class_schedule_events", CLASS_SCHEDULE_EVENT_REQUIRED_COLUMNS)
        and _has_columns(inspector, "problems", PROBLEM_REQUIRED_COLUMNS)
    )


def _schema_has_problem_choices(inspector) -> bool:
    return _has_columns(inspector, "problems", {"choices"})


def _schema_is_at_previous(inspector) -> bool:
    required_tables = {"academies", "user_roles", "batches", "problems", "problem_sets"}
    tables = set(inspector.get_table_names())
    return (
        required_tables.issubset(tables)
        and _has_columns(inspector, "batches", {"subject_candidates", "unit_candidates", "processing_task", "subject_engine"})
        and _has_columns(inspector, "academies", ACADEMY_REQUIRED_COLUMNS)
    )


def _looks_physically_migrated_to_previous(inspector) -> bool:
    return _has_columns(inspector, "batches", {"subject_candidates", "unit_candidates"})


def main() -> None:
    engine = create_engine(get_settings().database_url, pool_pre_ping=True)
    with engine.begin() as connection:
        _create_missing_tables(connection)
        inspector = inspect(connection)
        if _ensure_academy_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_batch_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_archive_folder_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_student_membership_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_problem_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_academy_seat_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_academy_subscription_staff_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_academy_staff_membership_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_academy_staff_invite_code_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_academy_workspace_settings_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_korean_passage_review_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_class_schedule_event_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_subject_engine_columns(connection, inspector):
            inspector = inspect(connection)
        if "alembic_version" not in inspector.get_table_names():
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(255) NOT NULL)"))
            inspector = inspect(connection)
        versions = [
            row[0]
            for row in connection.execute(
                text("SELECT version_num FROM alembic_version ORDER BY version_num")
            ).all()
        ]

        if versions == [HEAD_REVISION] or _looks_physically_migrated_to_previous(inspector):
            _create_missing_tables(connection)
            inspector = inspect(connection)
            if _ensure_academy_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_batch_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_archive_folder_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_student_membership_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_problem_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_academy_seat_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_academy_subscription_staff_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_academy_staff_membership_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_academy_staff_invite_code_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_academy_workspace_settings_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_korean_passage_review_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_class_schedule_event_columns(connection, inspector):
                inspector = inspect(connection)
            if _ensure_subject_engine_columns(connection, inspector):
                inspector = inspect(connection)

        if _schema_is_at_head(inspector) or (_schema_is_at_previous(inspector) and _schema_has_problem_choices(inspector)):
            target_revision = HEAD_REVISION
        elif _schema_is_at_previous(inspector):
            target_revision = PREVIOUS_REVISION
        else:
            return

        if versions == [target_revision]:
            return

        connection.execute(text("DELETE FROM alembic_version"))
        connection.execute(
            text("INSERT INTO alembic_version (version_num) VALUES (:version_num)"),
            {"version_num": target_revision},
        )
        print(f"Repaired alembic_version from {versions!r} to {target_revision}.")


if __name__ == "__main__":
    main()
