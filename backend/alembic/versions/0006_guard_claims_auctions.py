"""Claim deadlines, in-app notifications and student auction requests."""
from alembic import op
import sqlalchemy as sa

revision = "0006_guard_claims_auctions"
down_revision = "0005_hostels_and_registration"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("bicycles", sa.Column("claim_deadline", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bicycles", sa.Column("case_hostel_id", sa.Integer(), sa.ForeignKey("hostels.id"), nullable=True))
    op.create_index("ix_bicycles_claim_deadline", "bicycles", ["claim_deadline"])
    op.execute("""
        UPDATE bicycles SET claim_deadline = asset_tagged_at + interval '15 days',
               case_hostel_id = (SELECT hostel_id FROM users WHERE users.id = COALESCE(bicycles.current_owner_id, bicycles.owner_id))
        WHERE status = 'asset' AND asset_tagged_at IS NOT NULL
    """)
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("bicycle_id", sa.Integer(), sa.ForeignKey("bicycles.id", ondelete="CASCADE"), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "auction_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bicycle_id", sa.Integer(), sa.ForeignKey("bicycles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("hostel_id", sa.Integer(), sa.ForeignKey("hostels.id"), nullable=True, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("reviewed_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("uq_pending_auction_request", "auction_requests", ["bicycle_id"], unique=True,
                    postgresql_where=sa.text("status = 'pending'"))


def downgrade():
    op.drop_table("auction_requests")
    op.drop_table("notifications")
    op.drop_index("ix_bicycles_claim_deadline", table_name="bicycles")
    op.drop_column("bicycles", "case_hostel_id")
    op.drop_column("bicycles", "claim_deadline")
