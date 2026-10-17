from alembic import op
import sqlalchemy as sa

revision = "0002_cycle_lifecycle_fields"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users table additions
    op.add_column("users", sa.Column("degree_type", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("degree_duration_years", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("enrollment_year", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("hostel_name", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("room_number", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("phone_number", sa.String(30), nullable=True))

    # Bicycles table additions
    op.add_column("bicycles", sa.Column("owner_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_bicycles_owner_id_users",
        "bicycles",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("bicycles", sa.Column("asset_tagged_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bicycles", sa.Column("qr_token", sa.String(100), nullable=True))
    op.create_unique_constraint("uq_bicycles_qr_token", "bicycles", ["qr_token"])

    op.add_column("bicycles", sa.Column("cycle_condition", sa.String(50), nullable=True))
    op.add_column("bicycles", sa.Column("market_value", sa.Numeric(12, 2), nullable=True))
    op.add_column("bicycles", sa.Column("years_used", sa.Integer(), nullable=True))
    op.add_column("bicycles", sa.Column("base_price_set", sa.Numeric(12, 2), nullable=True))
    op.add_column("bicycles", sa.Column("sold_price", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("bicycles", "sold_price")
    op.drop_column("bicycles", "base_price_set")
    op.drop_column("bicycles", "years_used")
    op.drop_column("bicycles", "market_value")
    op.drop_column("bicycles", "cycle_condition")
    op.drop_constraint("uq_bicycles_qr_token", "bicycles", type_="unique")
    op.drop_column("bicycles", "qr_token")
    op.drop_column("bicycles", "asset_tagged_at")
    op.drop_constraint("fk_bicycles_owner_id_users", "bicycles", type_="foreignkey")
    op.drop_column("bicycles", "owner_id")

    op.drop_column("users", "phone_number")
    op.drop_column("users", "room_number")
    op.drop_column("users", "hostel_name")
    op.drop_column("users", "enrollment_year")
    op.drop_column("users", "degree_duration_years")
    op.drop_column("users", "degree_type")
