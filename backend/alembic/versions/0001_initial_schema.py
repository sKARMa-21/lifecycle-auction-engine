"""Initial schema for Lifecycle & Auction Engine.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(30), server_default=sa.text("'student'"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email"),
    )

    op.create_table(
        "bicycles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("asset_tag", sa.String(80), nullable=False),
        sa.Column("serial_number", sa.String(120)),
        sa.Column("brand", sa.String(100)),
        sa.Column("model", sa.String(100)),
        sa.Column("color", sa.String(60)),
        sa.Column("description", sa.Text()),
        sa.Column("image_url", sa.String(500)),
        sa.Column("status", sa.String(30), server_default=sa.text("'reported'"), nullable=False),
        sa.Column("found_location", sa.String(255)),
        sa.Column("found_at", sa.DateTime(timezone=True)),
        sa.Column("reported_by_id", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["reported_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("asset_tag"),
        sa.UniqueConstraint("serial_number"),
    )
    op.create_index("ix_bicycles_status", "bicycles", ["status"])

    op.create_table(
        "lifecycle_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bicycle_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer()),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("location", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["bicycle_id"], ["bicycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_lifecycle_events_bicycle_id", "lifecycle_events", ["bicycle_id"])

    op.create_table(
        "auctions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bicycle_id", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer()),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("starting_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("reserve_price", sa.Numeric(12, 2)),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(30), server_default=sa.text("'draft'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["bicycle_id"], ["bicycles.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_auctions_bicycle_id", "auctions", ["bicycle_id"])
    op.create_index("ix_auctions_status", "auctions", ["status"])

    op.create_table(
        "bids",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("auction_id", sa.Integer(), nullable=False),
        sa.Column("bidder_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(30), server_default=sa.text("'valid'"), nullable=False),
        sa.Column("placed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["auction_id"], ["auctions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bidder_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_bids_auction_id", "bids", ["auction_id"])
    op.create_index("ix_bids_bidder_id", "bids", ["bidder_id"])

    op.create_table(
        "claims",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bicycle_id", sa.Integer(), nullable=False),
        sa.Column("claimant_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("reviewed_by_id", sa.Integer()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["bicycle_id"], ["bicycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["claimant_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_claims_bicycle_id", "claims", ["bicycle_id"])
    op.create_index("ix_claims_claimant_id", "claims", ["claimant_id"])
    op.create_index("ix_claims_status", "claims", ["status"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("notification_type", sa.String(60), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
    op.drop_index("ix_claims_status", table_name="claims")
    op.drop_index("ix_claims_claimant_id", table_name="claims")
    op.drop_index("ix_claims_bicycle_id", table_name="claims")
    op.drop_table("claims")
    op.drop_index("ix_bids_bidder_id", table_name="bids")
    op.drop_index("ix_bids_auction_id", table_name="bids")
    op.drop_table("bids")
    op.drop_index("ix_auctions_status", table_name="auctions")
    op.drop_index("ix_auctions_bicycle_id", table_name="auctions")
    op.drop_table("auctions")
    op.drop_index("ix_lifecycle_events_bicycle_id", table_name="lifecycle_events")
    op.drop_table("lifecycle_events")
    op.drop_index("ix_bicycles_status", table_name="bicycles")
    op.drop_table("bicycles")
    op.drop_table("users")
