"""Add super_admin to user_role enum

Revision ID: 0003_add_super_admin_role
Revises: 0002_lifecycle_auction_v2
Create Date: 2026-11-15

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0003_add_super_admin_role"
down_revision: Union[str, None] = "0002_lifecycle_auction_v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'")


def downgrade() -> None:
    # PostgreSQL does not natively support removing an enum value from an enum type.
    pass
