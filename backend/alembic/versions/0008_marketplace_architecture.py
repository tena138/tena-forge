"""marketplace architecture and rights metadata

Revision ID: 0008_marketplace_architecture
Revises: 0007_template_hub
Create Date: 2026-05-08 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_marketplace_architecture"
down_revision = "0007_template_hub"
branch_labels = None
depends_on = None


def upgrade():
    for table_name in ("batches",):
        op.add_column(table_name, sa.Column("source_type", sa.String(length=40), nullable=False, server_default="self_created"))
        op.add_column(table_name, sa.Column("source_label", sa.String(length=255), nullable=True))
        op.add_column(table_name, sa.Column("rights_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.add_column(table_name, sa.Column("rights_confirmed_at", sa.DateTime(), nullable=True))
        op.add_column(table_name, sa.Column("rights_note", sa.Text(), nullable=True))
        op.add_column(table_name, sa.Column("owner_id", sa.String(length=64), nullable=False, server_default="local_user"))
        op.add_column(table_name, sa.Column("academy_id", sa.String(length=64), nullable=True))

    for table_name in ("problems",):
        op.add_column(table_name, sa.Column("source_type", sa.String(length=40), nullable=False, server_default="self_created"))
        op.add_column(table_name, sa.Column("source_label", sa.String(length=255), nullable=True))
        op.add_column(table_name, sa.Column("rights_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.add_column(table_name, sa.Column("rights_confirmed_at", sa.DateTime(), nullable=True))
        op.add_column(table_name, sa.Column("rights_note", sa.Text(), nullable=True))
        op.add_column(table_name, sa.Column("visibility", sa.String(length=32), nullable=False, server_default="private"))
        op.add_column(table_name, sa.Column("origin_type", sa.String(length=32), nullable=False, server_default="owned"))
        op.add_column(table_name, sa.Column("owner_id", sa.String(length=64), nullable=False, server_default="local_user"))
        op.add_column(table_name, sa.Column("academy_id", sa.String(length=64), nullable=True))
        op.add_column(table_name, sa.Column("updated_at", sa.DateTime(), nullable=True))

    problem_set_columns = [
        ("owner_id", sa.String(length=64), False, "local_user"),
        ("academy_id", sa.String(length=64), True, None),
        ("subtitle", sa.String(length=255), True, None),
        ("description", sa.Text(), True, None),
        ("subject", sa.String(length=120), True, None),
        ("grade", sa.String(length=120), True, None),
        ("unit", sa.String(length=255), True, None),
        ("difficulty", sa.String(length=40), True, None),
        ("problem_count", sa.Integer(), False, "0"),
        ("visibility", sa.String(length=32), False, "private"),
        ("source_type", sa.String(length=40), False, "self_created"),
        ("rights_confirmed", sa.Boolean(), False, sa.false()),
        ("can_publish_to_marketplace", sa.Boolean(), False, sa.false()),
        ("thumbnail_url", sa.String(length=1000), True, None),
        ("preview_problem_ids", sa.JSON(), True, None),
    ]
    for name, type_, nullable, default in problem_set_columns:
        op.add_column("problem_sets", sa.Column(name, type_, nullable=nullable, server_default=default))

    op.add_column("template_hub_templates", sa.Column("academy_id", sa.String(length=64), nullable=True))
    op.add_column("template_hub_templates", sa.Column("source_type", sa.String(length=40), nullable=False, server_default="self_created"))
    op.add_column("template_hub_templates", sa.Column("rights_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("template_hub_templates", sa.Column("rights_confirmed_at", sa.DateTime(), nullable=True))

    op.create_table(
        "marketplace_listings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("seller_id", sa.String(length=64), nullable=False),
        sa.Column("academy_id", sa.String(length=64), nullable=True),
        sa.Column("content_type", sa.String(length=40), nullable=False),
        sa.Column("content_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("subtitle", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("subject", sa.String(length=120), nullable=True),
        sa.Column("grade", sa.String(length=120), nullable=True),
        sa.Column("unit", sa.String(length=255), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=1000), nullable=True),
        sa.Column("pricing_type", sa.String(length=32), nullable=False, server_default="free"),
        sa.Column("price_amount", sa.Integer(), nullable=True),
        sa.Column("price_currency", sa.String(length=10), nullable=False, server_default="KRW"),
        sa.Column("subscription_period", sa.String(length=32), nullable=True),
        sa.Column("license_type", sa.String(length=40), nullable=False, server_default="free_use"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("rights_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rights_confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("save_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "license_entitlements",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("buyer_id", sa.String(length=64), nullable=False),
        sa.Column("buyer_academy_id", sa.String(length=64), nullable=True),
        sa.Column("seller_id", sa.String(length=64), nullable=False),
        sa.Column("listing_id", sa.String(length=36), nullable=False),
        sa.Column("content_type", sa.String(length=40), nullable=False),
        sa.Column("content_id", sa.String(length=64), nullable=False),
        sa.Column("license_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="active"),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("can_view", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("can_export", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("can_edit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_publish", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_permanently_save", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "creator_profiles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_id", sa.String(length=64), nullable=False, unique=True),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False, unique=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("profile_image_url", sa.String(length=1000), nullable=True),
        sa.Column("cover_image_url", sa.String(length=1000), nullable=True),
        sa.Column("specialties", sa.JSON(), nullable=True),
        sa.Column("verified_status", sa.String(length=32), nullable=False, server_default="unverified"),
        sa.Column("follower_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("listing_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "reports",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("reporter_id", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table("reports")
    op.drop_table("creator_profiles")
    op.drop_table("license_entitlements")
    op.drop_table("marketplace_listings")
