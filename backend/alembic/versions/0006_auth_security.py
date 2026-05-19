"""add authentication and security tables

Revision ID: 0006_auth_security
Revises: 0005_template_versions
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0006_auth_security"
down_revision: Union[str, None] = "0005_template_versions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _json_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.JSONB(astext_type=sa.Text())
    return sa.JSON()


def _uuid_type():
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.CHAR(length=36)


ACADEMY_PLAN_VALUES = ("free", "basic", "pro", "enterprise")
OAUTH_PROVIDER_VALUES = ("google", "kakao", "naver")


def _enum_type(name: str, values: tuple[str, ...], create_type: bool = False):
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return postgresql.ENUM(*values, name=name, create_type=create_type)
    return sa.Enum(*values, name=name)


def upgrade() -> None:
    bind = op.get_bind()
    academy_plan = _enum_type("academy_plan", ACADEMY_PLAN_VALUES)
    oauth_provider = _enum_type("oauth_provider", OAUTH_PROVIDER_VALUES)
    if bind.dialect.name == "postgresql":
        _enum_type("academy_plan", ACADEMY_PLAN_VALUES, create_type=True).create(bind, checkfirst=True)
        _enum_type("oauth_provider", OAUTH_PROVIDER_VALUES, create_type=True).create(bind, checkfirst=True)

    op.create_table(
        "academies",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("email_verified", sa.Boolean(), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("academy_name", sa.String(length=255), nullable=False),
        sa.Column("business_number", sa.String(length=50), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("plan", academy_plan, nullable=False),
        sa.Column("plan_expires_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_suspended", sa.Boolean(), nullable=False),
        sa.Column("suspension_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("last_login_ip", sa.String(length=64), nullable=True),
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(op.f("ix_academies_email"), "academies", ["email"], unique=True)

    op.create_table(
        "oauth_accounts",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("academy_id", _uuid_type(), nullable=False),
        sa.Column("provider", oauth_provider, nullable=False),
        sa.Column("provider_account_id", sa.String(length=255), nullable=False),
        sa.Column("provider_email", sa.String(length=320), nullable=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["academy_id"], ["academies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_account_id", name="uq_oauth_provider_account"),
    )
    op.create_index(op.f("ix_oauth_accounts_academy_id"), "oauth_accounts", ["academy_id"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("academy_id", _uuid_type(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("device_info", sa.String(length=500), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_reason", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["academy_id"], ["academies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refresh_tokens_academy_id"), "refresh_tokens", ["academy_id"], unique=False)
    op.create_index(op.f("ix_refresh_tokens_token_hash"), "refresh_tokens", ["token_hash"], unique=False)

    op.create_table(
        "email_verifications",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("academy_id", _uuid_type(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["academy_id"], ["academies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_email_verifications_academy_id"), "email_verifications", ["academy_id"], unique=False)
    op.create_index(op.f("ix_email_verifications_token_hash"), "email_verifications", ["token_hash"], unique=False)

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("academy_id", _uuid_type(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["academy_id"], ["academies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_password_reset_tokens_academy_id"), "password_reset_tokens", ["academy_id"], unique=False)
    op.create_index(op.f("ix_password_reset_tokens_token_hash"), "password_reset_tokens", ["token_hash"], unique=False)

    op.create_table(
        "login_history",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("academy_id", _uuid_type(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=False),
        sa.Column("device_type", sa.String(length=32), nullable=False),
        sa.Column("os", sa.String(length=128), nullable=False),
        sa.Column("browser", sa.String(length=128), nullable=False),
        sa.Column("country", sa.String(length=128), nullable=True),
        sa.Column("login_at", sa.DateTime(), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("failure_reason", sa.String(length=255), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["academy_id"], ["academies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_login_history_academy_id"), "login_history", ["academy_id"], unique=False)

    op.create_table(
        "active_sessions",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("academy_id", _uuid_type(), nullable=False),
        sa.Column("refresh_token_id", _uuid_type(), nullable=False),
        sa.Column("device_fingerprint", sa.String(length=128), nullable=False),
        sa.Column("last_active_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["academy_id"], ["academies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["refresh_token_id"], ["refresh_tokens.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_active_sessions_academy_id"), "active_sessions", ["academy_id"], unique=False)
    op.create_index(op.f("ix_active_sessions_refresh_token_id"), "active_sessions", ["refresh_token_id"], unique=False)

    op.create_table(
        "totp_secrets",
        sa.Column("id", _uuid_type(), nullable=False),
        sa.Column("academy_id", _uuid_type(), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("enabled_at", sa.DateTime(), nullable=True),
        sa.Column("backup_codes", _json_type(), nullable=False),
        sa.ForeignKeyConstraint(["academy_id"], ["academies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("academy_id"),
    )
    op.create_index(op.f("ix_totp_secrets_academy_id"), "totp_secrets", ["academy_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_totp_secrets_academy_id"), table_name="totp_secrets")
    op.drop_table("totp_secrets")
    op.drop_index(op.f("ix_active_sessions_refresh_token_id"), table_name="active_sessions")
    op.drop_index(op.f("ix_active_sessions_academy_id"), table_name="active_sessions")
    op.drop_table("active_sessions")
    op.drop_index(op.f("ix_login_history_academy_id"), table_name="login_history")
    op.drop_table("login_history")
    op.drop_index(op.f("ix_password_reset_tokens_token_hash"), table_name="password_reset_tokens")
    op.drop_index(op.f("ix_password_reset_tokens_academy_id"), table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_index(op.f("ix_email_verifications_token_hash"), table_name="email_verifications")
    op.drop_index(op.f("ix_email_verifications_academy_id"), table_name="email_verifications")
    op.drop_table("email_verifications")
    op.drop_index(op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_academy_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_oauth_accounts_academy_id"), table_name="oauth_accounts")
    op.drop_table("oauth_accounts")
    op.drop_index(op.f("ix_academies_email"), table_name="academies")
    op.drop_table("academies")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        _enum_type("oauth_provider", OAUTH_PROVIDER_VALUES, create_type=True).drop(bind, checkfirst=True)
        _enum_type("academy_plan", ACADEMY_PLAN_VALUES, create_type=True).drop(bind, checkfirst=True)
