"""Auction scheduling, participation and report photo storage."""
from alembic import op
import sqlalchemy as sa

revision = "0004_auction_workflow"
down_revision = "0003_add_super_admin_role"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("auctions", sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_table("auction_participants",
        sa.Column("auction_id", sa.Integer(), sa.ForeignKey("auctions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True))
    op.alter_column("lifecycle_events", "proof_image_url", type_=sa.Text(), existing_type=sa.String(500))


def downgrade():
    op.drop_table("auction_participants")
    op.drop_column("auctions", "starts_at")
