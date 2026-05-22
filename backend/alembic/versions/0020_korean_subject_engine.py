"""Add Korean subject engine and pricing fields."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0020_korean_subject_engine"
down_revision = "0019_learning_workspace"
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


def _json_default(value: str):
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.text(f"'{value}'::jsonb")
    return value


def _has_index(table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return False
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def _add_column(table_name: str, column: sa.Column) -> None:
    if not _has_column(table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    _add_column("batches", sa.Column("subject_engine", sa.String(length=30), nullable=False, server_default="math"))
    if _has_table("batches") and not _has_index("batches", "ix_batches_subject_engine"):
        op.create_index("ix_batches_subject_engine", "batches", ["subject_engine"])

    for table_name in ("plans", "subscriptions"):
        _add_column(table_name, sa.Column("enabled_subject_engines", _json_type(), nullable=False, server_default=_json_default('["math"]')))
        _add_column(table_name, sa.Column("subject_engine_count", sa.Integer(), nullable=False, server_default="1"))
        _add_column(table_name, sa.Column("subject_multiplier", sa.Numeric(6, 2), nullable=False, server_default="1"))
        _add_column(table_name, sa.Column("final_monthly_price", sa.Integer(), nullable=False, server_default="0"))
        _add_column(table_name, sa.Column("final_annual_price", sa.Integer(), nullable=False, server_default="0"))

    bind = op.get_bind()
    if _has_table("plans"):
        bind.execute(sa.text("UPDATE plans SET final_monthly_price = monthly_price WHERE final_monthly_price = 0 AND monthly_price IS NOT NULL"))
        bind.execute(sa.text("UPDATE plans SET final_annual_price = final_monthly_price * 12 WHERE final_annual_price = 0"))
    if _has_table("subscriptions"):
        bind.execute(sa.text("UPDATE subscriptions SET final_monthly_price = COALESCE((SELECT monthly_price FROM plans WHERE plans.code = subscriptions.plan_code), 0) WHERE final_monthly_price = 0"))
        bind.execute(sa.text("UPDATE subscriptions SET final_annual_price = final_monthly_price * 12 WHERE final_annual_price = 0"))

    if not _has_table("korean_extraction_documents"):
        op.create_table(
            "korean_extraction_documents",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("batch_id", sa.UUID(), nullable=False),
            sa.Column("document_id", sa.String(length=80), nullable=False),
            sa.Column("subject", sa.String(length=30), nullable=False, server_default="korean"),
            sa.Column("source_file", sa.String(length=500), nullable=False),
            sa.Column("payload", _json_type(), nullable=False),
            sa.Column("global_warnings", _json_type(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["batch_id"], ["batches.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("batch_id", name="uq_korean_extraction_documents_batch_id"),
        )
        op.create_index("ix_korean_extraction_documents_batch_id", "korean_extraction_documents", ["batch_id"])
        op.create_index("ix_korean_extraction_documents_document_id", "korean_extraction_documents", ["document_id"])
        op.create_index("ix_korean_extraction_documents_subject", "korean_extraction_documents", ["subject"])

    if not _has_table("korean_passage_groups"):
        op.create_table(
            "korean_passage_groups",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("document_id", sa.UUID(), nullable=False),
            sa.Column("passage_id", sa.String(length=120), nullable=False),
            sa.Column("source_pages", _json_type(), nullable=False),
            sa.Column("passage_instruction", sa.Text(), nullable=True),
            sa.Column("passage_title", sa.Text(), nullable=True),
            sa.Column("passage_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("passage_type", sa.String(length=40), nullable=False, server_default="unknown"),
            sa.Column("linked_question_ids", _json_type(), nullable=False),
            sa.Column("extraction_confidence", sa.Numeric(6, 4), nullable=False, server_default="0"),
            sa.Column("warnings", _json_type(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["document_id"], ["korean_extraction_documents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("document_id", "passage_id", name="uq_korean_passage_document_passage"),
        )
        op.create_index("ix_korean_passage_groups_document_id", "korean_passage_groups", ["document_id"])
        op.create_index("ix_korean_passage_groups_passage_id", "korean_passage_groups", ["passage_id"])
        op.create_index("ix_korean_passage_groups_passage_type", "korean_passage_groups", ["passage_type"])

    if not _has_table("korean_questions"):
        op.create_table(
            "korean_questions",
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("document_id", sa.UUID(), nullable=False),
            sa.Column("question_id", sa.String(length=120), nullable=False),
            sa.Column("source_pages", _json_type(), nullable=False),
            sa.Column("question_number", sa.String(length=40), nullable=True),
            sa.Column("linked_passage_id", sa.String(length=120), nullable=True),
            sa.Column("question_stem", sa.Text(), nullable=False, server_default=""),
            sa.Column("additional_material", sa.Text(), nullable=True),
            sa.Column("choices", _json_type(), nullable=False),
            sa.Column("answer", sa.Text(), nullable=True),
            sa.Column("solution", sa.Text(), nullable=True),
            sa.Column("extraction_confidence", sa.Numeric(6, 4), nullable=False, server_default="0"),
            sa.Column("warnings", _json_type(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["document_id"], ["korean_extraction_documents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("document_id", "question_id", name="uq_korean_question_document_question"),
        )
        op.create_index("ix_korean_questions_document_id", "korean_questions", ["document_id"])
        op.create_index("ix_korean_questions_question_id", "korean_questions", ["question_id"])
        op.create_index("ix_korean_questions_question_number", "korean_questions", ["question_number"])
        op.create_index("ix_korean_questions_linked_passage_id", "korean_questions", ["linked_passage_id"])


def downgrade() -> None:
    if _has_table("korean_questions"):
        op.drop_table("korean_questions")
    if _has_table("korean_passage_groups"):
        op.drop_table("korean_passage_groups")
    if _has_table("korean_extraction_documents"):
        op.drop_table("korean_extraction_documents")
    for table_name in ("subscriptions", "plans"):
        for column_name in ("final_annual_price", "final_monthly_price", "subject_multiplier", "subject_engine_count", "enabled_subject_engines"):
            if _has_column(table_name, column_name):
                op.drop_column(table_name, column_name)
    if _has_column("batches", "subject_engine"):
        op.drop_index("ix_batches_subject_engine", table_name="batches")
        op.drop_column("batches", "subject_engine")
