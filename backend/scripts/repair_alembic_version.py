from pathlib import Path
import sys

from sqlalchemy import create_engine, inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_settings


HEAD_REVISION = "0016_batch_subject_unit_candidates"


def _has_columns(inspector, table_name: str, column_names: set[str]) -> bool:
    if table_name not in inspector.get_table_names():
        return False
    existing = {column["name"] for column in inspector.get_columns(table_name)}
    return column_names.issubset(existing)


def _schema_is_at_head(inspector) -> bool:
    return _has_columns(inspector, "batches", {"subject_candidates", "unit_candidates"})


def main() -> None:
    engine = create_engine(get_settings().database_url, pool_pre_ping=True)
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "alembic_version" not in inspector.get_table_names():
            return
        if not _schema_is_at_head(inspector):
            return

        versions = [
            row[0]
            for row in connection.execute(
                text("SELECT version_num FROM alembic_version ORDER BY version_num")
            ).all()
        ]
        if versions == [HEAD_REVISION]:
            return

        connection.execute(text("DELETE FROM alembic_version"))
        connection.execute(
            text("INSERT INTO alembic_version (version_num) VALUES (:version_num)"),
            {"version_num": HEAD_REVISION},
        )
        print(f"Repaired alembic_version from {versions!r} to {HEAD_REVISION}.")


if __name__ == "__main__":
    main()
