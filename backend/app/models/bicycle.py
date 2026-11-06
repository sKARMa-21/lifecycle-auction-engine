from datetime import datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from decimal import Decimal
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


# Alias kept for backward compat with any code that referenced BicycleStatus
BicycleStatus = CycleState


class Bicycle(Base):
    __tablename__ = "bicycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Identification
    asset_tag: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    serial_number: Mapped[Optional[str]] = mapped_column(String(120), unique=True, nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Lifecycle state — canonical enum field used by lifecycle service
    current_state: Mapped[CycleState] = mapped_column(
        SQLEnum(CycleState, name="cycle_state", values_callable=lambda x: [e.value for e in x]),
        default=CycleState.ACTIVE,
        index=True,
        nullable=False,
    )

    # Legacy string status column kept for BicycleRead schema responses
    status: Mapped[str] = mapped_column(
        String(30),
        default=CycleState.ACTIVE.value,
        index=True,
        nullable=False,
    )

    # Ownership & reporting (jayesh's lifecycle service FKs)
    owner_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reported_by_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Canonical FK used by skarma-dev / QR sticker models
    current_owner_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    active_sticker_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("qr_stickers.id", ondelete="SET NULL"),
        nullable=True,
    )

    found_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    found_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Transition tracking
    asset_tagged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    tagged_as_asset_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    qr_token: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)

    # Condition / valuation
    condition_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estimated_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    last_known_location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    # Sold / Post-auction analytics
    cycle_condition: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    market_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    years_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    base_price_set: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    sold_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    owner = relationship("User", back_populates="owned_bicycles", foreign_keys=[owner_id])
    reported_by = relationship("User", foreign_keys=[reported_by_id])
    current_owner: Mapped[Optional["User"]] = relationship(
        "User", back_populates="bicycles", foreign_keys=[current_owner_id]
    )
    active_sticker: Mapped[Optional["QRSticker"]] = relationship(
        "QRSticker", foreign_keys=[active_sticker_id]
    )
    events: Mapped[List["LifecycleEvent"]] = relationship(
        "LifecycleEvent", back_populates="bicycle", cascade="all, delete-orphan"
    )
