from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from enum import Enum
from sqlalchemy import String, Integer, Numeric, Text, DateTime, Enum as SQLEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.qr_sticker import QRSticker
    from app.models.lifecycle import LifecycleEvent


class CycleState(str, Enum):
    ACTIVE = "active"
    ASSET = "asset"
    AUCTIONABLE = "auctionable"
    SOLD = "sold"
    DEAD = "dead"


class Bicycle(Base):
    __tablename__ = "bicycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    current_owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    active_sticker_id: Mapped[Optional[int]] = mapped_column(ForeignKey("qr_stickers.id", ondelete="SET NULL"), nullable=True)
    current_state: Mapped[CycleState] = mapped_column(
        SQLEnum(CycleState, name="cycle_state", values_callable=lambda x: [e.value for e in x]),
        default=CycleState.ACTIVE,
        index=True,
        nullable=False,
    )
    
    brand: Mapped[str] = mapped_column(String(80), nullable=False)
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    color: Mapped[str] = mapped_column(String(40), nullable=False)
    condition_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estimated_value: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    last_known_location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    
    tagged_as_asset_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner: Mapped[Optional["User"]] = relationship("User", back_populates="bicycles", foreign_keys=[current_owner_id])
    active_sticker: Mapped[Optional["QRSticker"]] = relationship("QRSticker", foreign_keys=[active_sticker_id])
    events: Mapped[List["LifecycleEvent"]] = relationship("LifecycleEvent", back_populates="bicycle", cascade="all, delete-orphan")
