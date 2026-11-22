"""Give every bicycle a QR token and make the token required."""
import secrets

from alembic import op
import sqlalchemy as sa

revision = "0007_bicycle_qr_tokens"
down_revision = "0006_guard_claims_auctions"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    taken = set(bind.execute(sa.text("SELECT qr_token FROM bicycles WHERE qr_token IS NOT NULL")).scalars())
    for bicycle_id in bind.execute(sa.text("SELECT id FROM bicycles WHERE qr_token IS NULL")).scalars().all():
        token = secrets.token_hex(6).upper()
        while token in taken:
            token = secrets.token_hex(6).upper()
        taken.add(token)
        bind.execute(sa.text("UPDATE bicycles SET qr_token = :token WHERE id = :id"), {"token": token, "id": bicycle_id})
    op.alter_column("bicycles", "qr_token", existing_type=sa.String(100), nullable=False)


def downgrade():
    op.alter_column("bicycles", "qr_token", existing_type=sa.String(100), nullable=True)
