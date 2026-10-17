import enum
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class BicycleStatus(str, enum.Enum):
    ACTIVE = "active"
    ASSET = "asset"
    AUCTIONABLE = "auctionable"
    SOLD = "sold"


class Bicycle(Base):
    __tablename__ = "bicycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_tag: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    serial_number: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color: Mapped[str | None] = mapped_column(String(60), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Lifecycle state
    status: Mapped[str] = mapped_column(
        String(30),
        default=BicycleStatus.ACTIVE.value,
        index=True,
        nullable=False,
    )

    # Ownership & reporting
    owner_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reported_by_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    found_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    found_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Transition tracking
    asset_tagged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    qr_token: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)

    # Sold / Post-auction analytics
    cycle_condition: Mapped[str | None] = mapped_column(String(50), nullable=True)
    market_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    years_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    base_price_set: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    sold_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    owner = relationship("User", back_populates="owned_bicycles", foreign_keys=[owner_id])
    reported_by = relationship("User", foreign_keys=[reported_by_id])
