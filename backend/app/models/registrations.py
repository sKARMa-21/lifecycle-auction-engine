from typing import Optional

from sqlalchemy import ForeignKey, JSON, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BicycleRegistration(Base):
    __tablename__ = "bicycle_registrations"
    __table_args__ = (
        Index("uq_registration_pending_serial", "serial_number", unique=True,
              postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    hostel_id: Mapped[int] = mapped_column(ForeignKey("hostels.id"))
    serial_number: Mapped[str] = mapped_column(String(120))
    brand: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(60))
    photos: Mapped[dict[str, str]] = mapped_column(JSON, deferred=True)
    status: Mapped[str] = mapped_column(String(10), server_default="pending")
    reason: Mapped[Optional[str]] = mapped_column(String(500))
    bicycle_id: Mapped[Optional[int]] = mapped_column(ForeignKey("bicycles.id", ondelete="SET NULL"))
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))