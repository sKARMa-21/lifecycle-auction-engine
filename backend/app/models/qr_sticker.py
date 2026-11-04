from datetime import date, datetime
from typing import Optional, TYPE_CHECKING
from enum import Enum
from sqlalchemy import String, Integer, Date, DateTime, Enum as SQLEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.bicycle import Bicycle
    from app.models.user import User


class StickerStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    REPLACED = "replaced"
    REVOKED = "revoked"


class QRSticker(Base):
    __tablename__ = "qr_stickers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sticker_code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    bicycle_id: Mapped[Optional[int]] = mapped_column(ForeignKey("bicycles.id", ondelete="SET NULL"), nullable=True)
    issued_to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[StickerStatus] = mapped_column(
        SQLEnum(StickerStatus, name="sticker_status", values_callable=lambda x: [e.value for e in x]),
        default=StickerStatus.ACTIVE,
        nullable=False,
    )
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bicycle: Mapped[Optional["Bicycle"]] = relationship("Bicycle", back_populates="active_sticker", foreign_keys=[bicycle_id])
    issued_to: Mapped["User"] = relationship("User", back_populates="stickers")
