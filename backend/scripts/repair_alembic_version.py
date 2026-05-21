from pathlib import Path
import sys

from sqlalchemy import create_engine, inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import Base, get_settings
import models  # noqa: F401 - registers all SQLAlchemy models on Base.metadata


PREVIOUS_REVISION = "0017_batch_processing_mode"
HEAD_REVISION = "0018_batch_processing_task"
ACADEMY_REQUIRED_COLUMNS = {
    "email_verified",
    "email_verified_at",
    "password_hash",
    "academy_name",
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
    return changed


def _ensure_batch_columns(connection, inspector) -> bool:
    if "batches" not in inspector.get_table_names():
        return False

    changed = False
    json_definition = "JSONB NOT NULL DEFAULT '[]'::jsonb" if connection.dialect.name == "postgresql" else "JSON NOT NULL DEFAULT '[]'"
    specs = [
        ("subject_candidates", json_definition),
        ("unit_candidates", json_definition),
        ("processing_mode", "VARCHAR(20) NOT NULL DEFAULT 'local'"),
        ("processing_task", "VARCHAR(30) NOT NULL DEFAULT 'full'"),
    ]
    for column_name, definition in specs:
        if _add_column_if_missing(connection, inspector, "batches", column_name, definition):
            changed = True
            inspector = inspect(connection)
    connection.execute(text("UPDATE batches SET processing_mode = 'local' WHERE processing_mode IS NULL OR processing_mode = ''"))
    connection.execute(text("UPDATE batches SET processing_task = 'full' WHERE processing_task IS NULL OR processing_task = ''"))
    if "ix_batches_processing_mode" not in _index_names(inspector, "batches"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_batches_processing_mode ON batches (processing_mode)"))
        changed = True
    if "ix_batches_processing_task" not in _index_names(inspector, "batches"):
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_batches_processing_task ON batches (processing_task)"))
        changed = True
    return changed


def _schema_is_at_head(inspector) -> bool:
    required_tables = {"academies", "user_roles", "batches", "problems", "problem_sets"}
    tables = set(inspector.get_table_names())
    return (
        required_tables.issubset(tables)
        and _has_columns(inspector, "batches", {"subject_candidates", "unit_candidates", "processing_mode", "processing_task"})
        and _has_columns(inspector, "academies", ACADEMY_REQUIRED_COLUMNS)
    )


def _schema_is_at_previous(inspector) -> bool:
    required_tables = {"academies", "user_roles", "batches", "problems", "problem_sets"}
    tables = set(inspector.get_table_names())
    return (
        required_tables.issubset(tables)
        and _has_columns(inspector, "batches", {"subject_candidates", "unit_candidates", "processing_mode"})
        and _has_columns(inspector, "academies", ACADEMY_REQUIRED_COLUMNS)
    )


def _looks_physically_migrated_to_previous(inspector) -> bool:
    return _has_columns(inspector, "batches", {"subject_candidates", "unit_candidates", "processing_mode"})


def main() -> None:
    engine = create_engine(get_settings().database_url, pool_pre_ping=True)
    with engine.begin() as connection:
        _create_missing_tables(connection)
        inspector = inspect(connection)
        if _ensure_academy_columns(connection, inspector):
            inspector = inspect(connection)
        if _ensure_batch_columns(connection, inspector):
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

        if _schema_is_at_head(inspector):
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
