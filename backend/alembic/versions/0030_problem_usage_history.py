"""add problem usage history

Revision ID: 0030_problem_usage_history
Revises: 0029_routine_actions
Create Date: 2026-06-17 00:00:00.000000
"""

from typing import Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from models import GUID


revision: str = "0030_problem_usage_history"
down_revision: Union[str, None] = "0029_routine_actions"
branch_labels = None
depends_on = None


def _json_type():
    return sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "problem_usage_history",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=False),
        sa.Column("academy_id", sa.String(length=64), nullable=True),
        sa.Column("problem_id", GUID(), nullable=False),
        sa.Column("usage_type", sa.String(length=40), nullable=False),
        sa.Column("problem_set_id", GUID(), nullable=True),
        sa.Column("export_title", sa.String(length=255), nullable=True),
        sa.Column("export_date", sa.String(length=40), nullable=True),
        sa.Column("template_id", GUID(), nullable=True),
        sa.Column("hub_template_id", GUID(), nullable=True),
        sa.Column("context_id", sa.String(length=120), nullable=True),
        sa.Column("metadata", _json_type(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["problem_id"], ["problems.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["problem_set_id"], ["problem_sets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["template_id"], ["exam_templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["hub_template_id"], ["template_hub_templates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_problem_usage_history_owner_id"), "problem_usage_history", ["owner_id"])
    op.create_index(op.f("ix_problem_usage_history_academy_id"), "problem_usage_history", ["academy_id"])
    op.create_index(op.f("ix_problem_usage_history_problem_id"), "problem_usage_history", ["problem_id"])
    op.create_index(op.f("ix_problem_usage_history_usage_type"), "problem_usage_history", ["usage_type"])
    op.create_index(op.f("ix_problem_usage_history_problem_set_id"), "problem_usage_history", ["problem_set_id"])
    op.create_index(op.f("ix_problem_usage_history_template_id"), "problem_usage_history", ["template_id"])
    op.create_index(op.f("ix_problem_usage_history_hub_template_id"), "problem_usage_history", ["hub_template_id"])
    op.create_index(op.f("ix_problem_usage_history_context_id"), "problem_usage_history", ["context_id"])
    op.create_index(op.f("ix_problem_usage_history_created_at"), "problem_usage_history", ["created_at"])

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT psi.problem_id, psi.problem_set_id, ps.owner_id, ps.academy_id, ps.name, ps.created_at
            FROM problem_set_items psi
            JOIN problem_sets ps ON ps.id = psi.problem_set_id
            """
        )
    ).mappings().all()
    if rows:
        usage_table = sa.table(
            "problem_usage_history",
            sa.column("id", GUID()),
            sa.column("owner_id", sa.String()),
            sa.column("academy_id", sa.String()),
            sa.column("problem_id", GUID()),
            sa.column("usage_type", sa.String()),
            sa.column("problem_set_id", GUID()),
            sa.column("metadata", _json_type()),
            sa.column("created_by", sa.String()),
            sa.column("created_at", sa.DateTime()),
        )
        op.bulk_insert(
            usage_table,
            [
                {
                    "id": uuid.uuid4(),
                    "owner_id": row["owner_id"],
                    "academy_id": row["academy_id"],
                    "problem_id": row["problem_id"],
                    "usage_type": "problem_set",
                    "problem_set_id": row["problem_set_id"],
                    "metadata": {"problem_set_name": row["name"]},
                    "created_by": row["owner_id"],
                    "created_at": row["created_at"],
                }
                for row in rows
            ],
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_problem_usage_history_created_at"), table_name="problem_usage_history")
    op.drop_index(op.f("ix_problem_usage_history_context_id"), table_name="problem_usage_history")
    op.drop_index(op.f("ix_problem_usage_history_hub_template_id"), table_name="problem_usage_history")
    op.drop_index(op.f("ix_problem_usage_history_template_id"), table_name="problem_usage_history")
    op.drop_index(op.f("ix_problem_usage_history_problem_set_id"), table_name="problem_usage_history")
    op.drop_index(op.f("ix_problem_usage_history_usage_type"), table_name="problem_usage_history")
    op.drop_index(op.f("ix_problem_usage_history_problem_id"), table_name="problem_usage_history")
    op.drop_index(op.f("ix_problem_usage_history_academy_id"), table_name="problem_usage_history")
    op.drop_index(op.f("ix_problem_usage_history_owner_id"), table_name="problem_usage_history")
    op.drop_table("problem_usage_history")
