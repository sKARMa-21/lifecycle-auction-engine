"""Redesign database schema for campus cycle lifecycle, QR stickers, and auction engine

Revision ID: 0002_lifecycle_auction_v2
Revises: 0001_initial_schema
Create Date: 2026-10-20

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0002_lifecycle_auction_v2'
down_revision: Union[str, None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 0. Clean up legacy tables and columns from 0001 if present
    op.execute("DROP TABLE IF EXISTS bids CASCADE")
    op.execute("DROP TABLE IF EXISTS auctions CASCADE")
    op.execute("DROP TABLE IF EXISTS lifecycle_events CASCADE")
    op.execute("DROP TABLE IF EXISTS claims CASCADE")
    op.execute("DROP TABLE IF EXISTS notifications CASCADE")

    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS role CASCADE")

    for col in [
        'brand', 'model', 'color', 'created_at', 'updated_at',
        'current_owner_id', 'active_sticker_id', 'current_state',
        'condition_notes', 'estimated_value', 'last_known_location',
        'tagged_as_asset_at'
    ]:
        op.execute(f"ALTER TABLE bicycles DROP COLUMN IF EXISTS {col} CASCADE")

    # 1. Custom Enum Types
    user_role_enum = postgresql.ENUM('admin', 'student', 'guard', name='user_role', create_type=False)
    user_role_enum.create(op.get_bind(), checkfirst=True)

    cycle_state_enum = postgresql.ENUM('active', 'asset', 'auctionable', 'sold', 'dead', name='cycle_state', create_type=False)
    cycle_state_enum.create(op.get_bind(), checkfirst=True)

    auction_status_enum = postgresql.ENUM('draft', 'scheduled', 'active', 'extended', 'ended', 'settled', 'cancelled', name='auction_status', create_type=False)
    auction_status_enum.create(op.get_bind(), checkfirst=True)

    bid_status_enum = postgresql.ENUM('valid', 'outbid', 'winning', 'forfeited', name='bid_status', create_type=False)
    bid_status_enum.create(op.get_bind(), checkfirst=True)

    sticker_status_enum = postgresql.ENUM('active', 'expired', 'replaced', 'revoked', name='sticker_status', create_type=False)
    sticker_status_enum.create(op.get_bind(), checkfirst=True)

    # 2. Users Table Updates
    op.add_column('users', sa.Column('role', user_role_enum, nullable=False, server_default='student'))
    op.add_column('users', sa.Column('phone_number', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('joining_year', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('course_duration_years', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('degree_end_date', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('hostel_name', sa.String(length=50), nullable=True))
    op.add_column('users', sa.Column('room_number', sa.String(length=20), nullable=True))

    # Index for background worker queries on graduating students
    op.create_index('idx_users_degree_end_date', 'users', ['degree_end_date'])

    # 3. QR Stickers Table
    op.create_table(
        'qr_stickers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sticker_code', sa.String(length=64), nullable=False),
        sa.Column('bicycle_id', sa.Integer(), nullable=True),
        sa.Column('issued_to_user_id', sa.Integer(), nullable=False),
        sa.Column('status', sticker_status_enum, nullable=False, server_default='active'),
        sa.Column('valid_until', sa.Date(), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['bicycle_id'], ['bicycles.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['issued_to_user_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sticker_code')
    )
    op.create_index('idx_qr_stickers_code', 'qr_stickers', ['sticker_code'])

    # 4. Bicycles Table Updates
    op.add_column('bicycles', sa.Column('current_owner_id', sa.Integer(), nullable=True))
    op.add_column('bicycles', sa.Column('active_sticker_id', sa.Integer(), nullable=True))
    op.add_column('bicycles', sa.Column('current_state', cycle_state_enum, nullable=False, server_default='active'))
    op.add_column('bicycles', sa.Column('brand', sa.String(length=80), nullable=False))
    op.add_column('bicycles', sa.Column('model', sa.String(length=80), nullable=True))
    op.add_column('bicycles', sa.Column('color', sa.String(length=40), nullable=False))
    op.add_column('bicycles', sa.Column('condition_notes', sa.Text(), nullable=True))
    op.add_column('bicycles', sa.Column('estimated_value', sa.Numeric(precision=10, scale=2), nullable=True))
    op.add_column('bicycles', sa.Column('last_known_location', sa.String(length=150), nullable=True))
    op.add_column('bicycles', sa.Column('tagged_as_asset_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('bicycles', sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
    op.add_column('bicycles', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))

    op.create_foreign_key('fk_bicycles_owner', 'bicycles', 'users', ['current_owner_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_bicycles_sticker', 'bicycles', 'qr_stickers', ['active_sticker_id'], ['id'], ondelete='SET NULL')

    op.create_index('idx_bicycles_state', 'bicycles', ['current_state'])
    op.create_index('idx_bicycles_tagged_asset', 'bicycles', ['tagged_as_asset_at'], postgresql_where=sa.text("current_state = 'asset'"))

    # 5. Lifecycle Events Table
    op.create_table(
        'lifecycle_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bicycle_id', sa.Integer(), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('from_state', cycle_state_enum, nullable=False),
        sa.Column('to_state', cycle_state_enum, nullable=False),
        sa.Column('location', sa.String(length=150), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('proof_image_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['bicycle_id'], ['bicycles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_lifecycle_events_bicycle', 'lifecycle_events', ['bicycle_id'])

    # 6. Auctions Table
    op.create_table(
        'auctions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bicycle_id', sa.Integer(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=150), nullable=False),
        sa.Column('starting_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('min_bid_increment', sa.Numeric(precision=10, scale=2), nullable=False, server_default='20.00'),
        sa.Column('current_highest_bid', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('current_winner_id', sa.Integer(), nullable=True),
        sa.Column('status', auction_status_enum, nullable=False, server_default='draft'),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('payment_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('extension_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('current_highest_bid >= starting_price', name='chk_bid_gte_starting'),
        sa.ForeignKeyConstraint(['bicycle_id'], ['bicycles.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['current_winner_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_auctions_status_ends', 'auctions', ['status', 'ends_at'])

    # 7. Bids Table
    op.create_table(
        'bids',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('auction_id', sa.Integer(), nullable=False),
        sa.Column('bidder_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('status', bid_status_enum, nullable=False, server_default='valid'),
        sa.Column('placed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['auction_id'], ['auctions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['bidder_id'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_bids_auction_amount', 'bids', ['auction_id', sa.text('amount DESC')])


def downgrade() -> None:
    op.drop_table('bids')
    op.drop_table('auctions')
    op.drop_table('lifecycle_events')
    op.drop_table('qr_stickers')
    
    op.drop_column('bicycles', 'updated_at')
    op.drop_column('bicycles', 'created_at')
    op.drop_column('bicycles', 'tagged_as_asset_at')
    op.drop_column('bicycles', 'last_known_location')
    op.drop_column('bicycles', 'estimated_value')
    op.drop_column('bicycles', 'condition_notes')
    op.drop_column('bicycles', 'color')
    op.drop_column('bicycles', 'model')
    op.drop_column('bicycles', 'brand')
    op.drop_column('bicycles', 'current_state')
    op.drop_column('bicycles', 'active_sticker_id')
    op.drop_column('bicycles', 'current_owner_id')

    op.drop_column('users', 'room_number')
    op.drop_column('users', 'hostel_name')
    op.drop_column('users', 'degree_end_date')
    op.drop_column('users', 'course_duration_years')
    op.drop_column('users', 'joining_year')
    op.drop_column('users', 'phone_number')
    op.drop_column('users', 'role')

    op.execute("DROP TYPE IF EXISTS sticker_status")
    op.execute("DROP TYPE IF EXISTS bid_status")
    op.execute("DROP TYPE IF EXISTS auction_status")
    op.execute("DROP TYPE IF EXISTS cycle_state")
    op.execute("DROP TYPE IF EXISTS user_role")
