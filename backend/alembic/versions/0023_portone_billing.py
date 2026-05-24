"""Add PortOne billing key subscription tables."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0023_portone_billing"
down_revision = "0022_problem_choices"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _json_type():
    bind = op.get_bind()
    return postgresql.JSONB() if bind.dialect.name == "postgresql" else sa.JSON()


def _json_default(value: str):
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.text(f"'{value}'::jsonb")
    return value


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

    if not _has_table("subscription_billing_keys"):
        op.create_table(
            "subscription_billing_keys",
            sa.Column("id", uuid_type, nullable=False),
            sa.Column("user_id", sa.String(length=64), nullable=False),
            sa.Column("subscription_id", uuid_type, nullable=True),
            sa.Column("provider", sa.String(length=40), nullable=False, server_default="portone"),
            sa.Column("provider_billing_key_hash", sa.String(length=64), nullable=False),
            sa.Column("billing_key_encrypted", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="active"),
            sa.Column("issued_at", sa.DateTime(), nullable=True),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        _create_indexes("subscription_billing_keys", ("user_id", "subscription_id", "provider", "provider_billing_key_hash", "status"))

    if not _has_table("subscription_orders"):
        op.create_table(
            "subscription_orders",
            sa.Column("id", uuid_type, nullable=False),
            sa.Column("user_id", sa.String(length=64), nullable=False),
            sa.Column("subscription_id", uuid_type, nullable=True),
            sa.Column("billing_key_id", uuid_type, nullable=True),
            sa.Column("plan_code", sa.String(length=40), nullable=False),
            sa.Column("billing_cycle", sa.String(length=20), nullable=False, server_default="monthly"),
            sa.Column("selected_packages", _json_type(), nullable=False, server_default=_json_default("{}")),
            sa.Column("enabled_subject_engines", _json_type(), nullable=False, server_default=_json_default('["math"]')),
            sa.Column("monthly_price_krw", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("amount_krw", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("currency", sa.String(length=10), nullable=False, server_default="KRW"),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="ready"),
            sa.Column("provider", sa.String(length=40), nullable=False, server_default="portone"),
            sa.Column("provider_payment_id", sa.String(length=80), nullable=True),
            sa.Column("provider_issue_id", sa.String(length=80), nullable=True),
            sa.Column("order_name", sa.String(length=255), nullable=False),
            sa.Column("payment_snapshot", _json_type(), nullable=False, server_default=_json_default("{}")),
            sa.Column("failure_reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["billing_key_id"], ["subscription_billing_keys.id"]),
            sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("provider", "provider_payment_id", name="uq_subscription_order_provider_payment"),
            sa.UniqueConstraint("provider", "provider_issue_id", name="uq_subscription_order_provider_issue"),
        )
        _create_indexes(
            "subscription_orders",
            ("user_id", "subscription_id", "billing_key_id", "plan_code", "billing_cycle", "status", "provider", "provider_payment_id", "provider_issue_id"),
        )

    if not _has_table("subscription_payment_attempts"):
        op.create_table(
            "subscription_payment_attempts",
            sa.Column("id", uuid_type, nullable=False),
            sa.Column("user_id", sa.String(length=64), nullable=False),
            sa.Column("subscription_id", uuid_type, nullable=True),
            sa.Column("order_id", uuid_type, nullable=True),
            sa.Column("provider", sa.String(length=40), nullable=False, server_default="portone"),
            sa.Column("provider_payment_id", sa.String(length=80), nullable=False),
            sa.Column("billing_cycle", sa.String(length=20), nullable=False, server_default="monthly"),
            sa.Column("amount_krw", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("currency", sa.String(length=10), nullable=False, server_default="KRW"),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="ready"),
            sa.Column("scheduled_at", sa.DateTime(), nullable=True),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("failed_at", sa.DateTime(), nullable=True),
            sa.Column("raw_payload", _json_type(), nullable=False, server_default=_json_default("{}")),
            sa.Column("failure_reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["order_id"], ["subscription_orders.id"]),
            sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("provider", "provider_payment_id", name="uq_subscription_payment_attempt_provider_payment"),
        )
        _create_indexes(
            "subscription_payment_attempts",
            ("user_id", "subscription_id", "order_id", "provider", "provider_payment_id", "status", "scheduled_at"),
        )


def downgrade() -> None:
    for table_name in ("subscription_payment_attempts", "subscription_orders", "subscription_billing_keys"):
        if _has_table(table_name):
            op.drop_table(table_name)
