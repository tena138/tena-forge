"""add profile names and student invite records

Revision ID: 0038_profile_name_student_invites
Revises: 0037_academy_seat_invite_metadata
Create Date: 2026-06-28 00:00:00.000000
"""

from typing import Union
import re
import unicodedata

from alembic import op
import sqlalchemy as sa


revision: str = "0038_profile_name_student_invites"
down_revision: Union[str, None] = "0037_academy_seat_invite_metadata"
branch_labels = None
depends_on = None

PROFILE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_]{2,31}$")


def _seed(*values: str | None) -> str:
    for value in values:
        normalized = unicodedata.normalize("NFKD", str(value or ""))
        ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
        cleaned = re.sub(r"[^a-z0-9_]+", "_", ascii_value).strip("_")
        cleaned = re.sub(r"_+", "_", cleaned)
        if cleaned and cleaned[0].isalnum():
            return cleaned[:24]
    return "user"


def _unique(seed: str, fallback_id: str, used: set[str]) -> str:
    base = re.sub(r"[^a-z0-9_]+", "_", str(seed or "").strip().lower()).strip("_") or "user"
    if not base[0].isalnum():
        base = f"user_{base}"
    base = base[:24]
    if len(base) < 3:
        base = f"{base}user"[:24]
    if base not in used and PROFILE_NAME_RE.fullmatch(base):
        used.add(base)
        return base
    suffix = re.sub(r"[^a-z0-9]+", "", fallback_id.lower())[:8] or "00000000"
    counter = 1
    while True:
        counter_suffix = suffix if counter == 1 else f"{suffix[:6]}{counter}"
        trimmed = base[: max(3, 31 - len(counter_suffix))]
        candidate = f"{trimmed}_{counter_suffix}"[:32]
        if candidate not in used and PROFILE_NAME_RE.fullmatch(candidate):
            used.add(candidate)
            return candidate
        counter += 1


def _backfill_profile_names() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, email, display_name, academy_name, profile_name FROM academies")).mappings().all()
    used = {str(row["profile_name"]).lower() for row in rows if row["profile_name"]}
    for row in rows:
        if row["profile_name"]:
            continue
        email_local = str(row["email"] or "").split("@", 1)[0]
        seed = _seed(row["display_name"], row["academy_name"], email_local)
        profile_name = _unique(seed, str(row["id"]), used)
        bind.execute(
            sa.text("UPDATE academies SET profile_name = :profile_name WHERE id = :id"),
            {"profile_name": profile_name, "id": row["id"]},
        )


def upgrade() -> None:
    op.add_column("academies", sa.Column("profile_name", sa.String(length=32), nullable=True))
    _backfill_profile_names()
    op.alter_column("academies", "profile_name", existing_type=sa.String(length=32), nullable=False)
    op.create_index(op.f("ix_academies_profile_name"), "academies", ["profile_name"], unique=True)

    op.create_table(
        "student_invites",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("academy_id", sa.String(length=64), nullable=False),
        sa.Column("academy_seat_id", sa.UUID(), nullable=False),
        sa.Column("academy_student_membership_id", sa.UUID(), nullable=False),
        sa.Column("target_user_id", sa.String(length=64), nullable=False),
        sa.Column("target_profile_name", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("notification_id", sa.UUID(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("declined_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["academy_seat_id"], ["academy_seats.id"]),
        sa.ForeignKeyConstraint(["academy_student_membership_id"], ["student_academy_memberships.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_student_invites_academy_id"), "student_invites", ["academy_id"], unique=False)
    op.create_index(op.f("ix_student_invites_academy_seat_id"), "student_invites", ["academy_seat_id"], unique=False)
    op.create_index(op.f("ix_student_invites_academy_student_membership_id"), "student_invites", ["academy_student_membership_id"], unique=False)
    op.create_index(op.f("ix_student_invites_notification_id"), "student_invites", ["notification_id"], unique=False)
    op.create_index(op.f("ix_student_invites_status"), "student_invites", ["status"], unique=False)
    op.create_index(op.f("ix_student_invites_target_profile_name"), "student_invites", ["target_profile_name"], unique=False)
    op.create_index(op.f("ix_student_invites_target_user_id"), "student_invites", ["target_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_student_invites_target_user_id"), table_name="student_invites")
    op.drop_index(op.f("ix_student_invites_target_profile_name"), table_name="student_invites")
    op.drop_index(op.f("ix_student_invites_status"), table_name="student_invites")
    op.drop_index(op.f("ix_student_invites_notification_id"), table_name="student_invites")
    op.drop_index(op.f("ix_student_invites_academy_student_membership_id"), table_name="student_invites")
    op.drop_index(op.f("ix_student_invites_academy_seat_id"), table_name="student_invites")
    op.drop_index(op.f("ix_student_invites_academy_id"), table_name="student_invites")
    op.drop_table("student_invites")
    op.drop_index(op.f("ix_academies_profile_name"), table_name="academies")
    op.drop_column("academies", "profile_name")
