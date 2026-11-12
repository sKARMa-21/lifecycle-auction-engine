from datetime import datetime
from enum import Enum
from sqlalchemy import (
    Column, Integer, String, Numeric, DateTime,
    ForeignKey, Enum as SQLEnum, CheckConstraint
)
from sqlalchemy.orm import relationship
from app.db.base import Base


class AuctionStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    SCHEDULED = "scheduled"
    EXTENDED = "extended"
    ENDED = "ended"
    SETTLED = "settled"
    CANCELLED = "cancelled"


class Auction(Base):
    __tablename__ = "auctions"

    id = Column(Integer, primary_key=True, index=True)
    bicycle_id = Column(Integer, ForeignKey("bicycles.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title = Column(String(150), nullable=False)

    starting_price = Column(Numeric(10, 2), nullable=False)
    min_bid_increment = Column(Numeric(10, 2), nullable=False, default=20.0)
    current_highest_bid = Column(Numeric(10, 2), nullable=False)
    current_winner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    status = Column(SQLEnum(AuctionStatus, name="auction_status", values_callable=lambda x: [e.value for e in x]),
                    default=AuctionStatus.DRAFT, nullable=False)

    ends_at = Column(DateTime(timezone=True), nullable=False)
    payment_deadline = Column(DateTime(timezone=True), nullable=True)
    extension_count = Column(Integer, nullable=False, default=0)

    # Anti-sniping parameters (in minutes)
    anti_snipe_trigger_window = Column(Integer, default=5)
    anti_snipe_extension_minutes = Column(Integer, default=5)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    bids = relationship("Bid", back_populates="auction", order_by="desc(Bid.placed_at)")

    __table_args__ = (
        CheckConstraint("current_highest_bid >= starting_price", name="chk_bid_gte_starting"),
    )


class Bid(Base):
    __tablename__ = "bids"

    id = Column(Integer, primary_key=True, index=True)
    auction_id = Column(Integer, ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    bidder_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(SQLEnum("valid", "outbid", "winning", "forfeited", name="bid_status"), nullable=False, default="valid")
    placed_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    auction = relationship("Auction", back_populates="bids")

    __table_args__ = (
        CheckConstraint("amount > 0", name="bid_amount_positive"),
    )
