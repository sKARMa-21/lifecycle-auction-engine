from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bicycle_id: Mapped[Optional[int]] = mapped_column(ForeignKey("bicycles.id", ondelete="CASCADE"))
    message: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuctionRequest(Base):
    """A student's request to auction their bicycle: pending -> approved | rejected | withdrawn."""
    __tablename__ = "auction_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    bicycle_id: Mapped[int] = mapped_column(ForeignKey("bicycles.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    hostel_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hostels.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    note: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("uq_pending_auction_request", "bicycle_id", unique=True, postgresql_where=text("status = 'pending'")),
    )
