from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from enum import Enum
from sqlalchemy import String, Integer, Numeric, DateTime, Enum as SQLEnum, ForeignKey, CheckConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.bicycle import Bicycle
    from app.models.user import User


class AuctionStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    EXTENDED = "extended"
    ENDED = "ended"
    SETTLED = "settled"
    CANCELLED = "cancelled"


class BidStatus(str, Enum):
    VALID = "valid"
    OUTBID = "outbid"
    WINNING = "winning"
    FORFEITED = "forfeited"


class Auction(Base):
    __tablename__ = "auctions"
    __table_args__ = (
        CheckConstraint("current_highest_bid >= starting_price", name="chk_bid_gte_starting"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bicycle_id: Mapped[int] = mapped_column(ForeignKey("bicycles.id", ondelete="RESTRICT"), nullable=False)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    current_winner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    starting_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    min_bid_increment: Mapped[float] = mapped_column(Numeric(10, 2), default=20.0, nullable=False)
    current_highest_bid: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    
    status: Mapped[AuctionStatus] = mapped_column(
        SQLEnum(AuctionStatus, name="auction_status", values_callable=lambda x: [e.value for e in x]),
        default=AuctionStatus.DRAFT,
        nullable=False,
    )
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payment_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    extension_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    bids: Mapped[List["Bid"]] = relationship("Bid", back_populates="auction", cascade="all, delete-orphan")


class Bid(Base):
    __tablename__ = "bids"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False)
    bidder_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[BidStatus] = mapped_column(
        SQLEnum(BidStatus, name="bid_status", values_callable=lambda x: [e.value for e in x]),
        default=BidStatus.VALID,
        nullable=False,
    )
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    auction: Mapped["Auction"] = relationship("Auction", back_populates="bids")
