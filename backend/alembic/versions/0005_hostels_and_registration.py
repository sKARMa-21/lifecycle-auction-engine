"""Normalize hostels and add student bicycle registration requests."""

from alembic import op
import sqlalchemy as sa

revision = "0005_hostels_and_registration"
down_revision = "0004_auction_workflow"
branch_labels = None
depends_on = None

LEGACY_PROFILE = {
    "degree_type": sa.String(50),
    "degree_duration_years": sa.Integer(),
    "enrollment_year": sa.Integer(),
    "joining_year": sa.Integer(),
    "course_duration_years": sa.Integer(),
    "degree_end_date": sa.Date(),
    "hostel_name": sa.String(100),
    "room_number": sa.String(50),
}


def upgrade() -> None:
    hostels = op.create_table(
        "hostels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(5), nullable=False, unique=True),
        sa.Column("name", sa.String(50), nullable=False),
    )
    op.bulk_insert(hostels, [
        {"code": f"H{number:02}", "name": f"Hostel {number}"}
        for number in (*range(1, 20), 21)
    ] + [{"code": "TANSA", "name": "Tansa"}])
    op.add_column("users", sa.Column("hostel_id", sa.Integer(), sa.ForeignKey("hostels.id")))
    op.create_index("ix_users_hostel_id", "users", ["hostel_id"])
    op.add_column("users", sa.Column("roll_number", sa.String(30)))
    op.create_unique_constraint("uq_users_roll_number", "users", ["roll_number"])
    op.add_column("users", sa.Column("degree_course", sa.String(100)))
    op.execute("UPDATE users SET degree_course = NULLIF(trim(degree_type), '')")
    op.execute("""
        UPDATE users AS u SET hostel_id = h.id
        FROM hostels AS h
        WHERE regexp_replace(lower(u.hostel_name), '[[:space:]-]+', '', 'g') IN (
            lower(h.code), lower(replace(h.name, ' ', '')),
            ltrim(substring(h.code FROM 2), '0'), 'h' || ltrim(substring(h.code FROM 2), '0'),
            'hostel' || substring(h.code FROM 2)
        ) AND (h.code <> 'TANSA' OR lower(trim(u.hostel_name)) IN ('tansa', 'tansa hostel'))
    """)
    op.execute("""
        UPDATE users SET hostel_id = (SELECT id FROM hostels WHERE code = 'TANSA')
        WHERE lower(trim(hostel_name)) IN ('tansa hostel', 'hostel tansa')
    """)
    for name in LEGACY_PROFILE:
        op.drop_column("users", name)

    op.create_table(
        "bicycle_registrations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("hostel_id", sa.Integer(), sa.ForeignKey("hostels.id"), nullable=False),
        sa.Column("serial_number", sa.String(120), nullable=False),
        sa.Column("brand", sa.String(100), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("color", sa.String(60), nullable=False),
        sa.Column("photos", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("reason", sa.String(500)),
        sa.Column("bicycle_id", sa.Integer(), sa.ForeignKey("bicycles.id", ondelete="SET NULL")),
        sa.Column("reviewed_by_id", sa.Integer(), sa.ForeignKey("users.id")),
    )
    op.create_index("uq_registration_pending_serial", "bicycle_registrations", ["serial_number"],
                    unique=True, postgresql_where=sa.text("status = 'pending'"))


def downgrade() -> None:
    op.drop_table("bicycle_registrations")
    for name, type_ in LEGACY_PROFILE.items():
        op.add_column("users", sa.Column(name, type_))
    op.execute("UPDATE users SET degree_type = left(degree_course, 50)")
    op.execute("UPDATE users u SET hostel_name = h.name FROM hostels h WHERE u.hostel_id = h.id")
    op.create_index("idx_users_degree_end_date", "users", ["degree_end_date"])
    for name in ("degree_course", "roll_number", "hostel_id"):
        op.drop_column("users", name)
    op.drop_table("hostels")
