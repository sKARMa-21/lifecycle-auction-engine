from datetime import datetime
from enum import Enum
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, 
    ForeignKey, Enum as SQLEnum, CheckConstraint
)
from sqlalchemy.orm import relationship
from app.db.base import Base  # Adjust import to match your base model location


class AuctionStatus(str, Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    EXTENDED = "EXTENDED"
    ENDED = "ENDED"
    CANCELLED = "CANCELLED"


class Auction(Base):
    __tablename__ = "auctions"

    id = Column(Integer, primary_key=True, index=True)
    bicycle_id = Column(Integer, nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    
    starting_price = Column(Float, nullable=False, default=0.0)
    current_highest_bid = Column(Float, nullable=False, default=0.0)
    current_highest_bidder_id = Column(Integer, nullable=True)
    bid_increment = Column(Float, nullable=False, default=50.0)
    
    start_time = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=False)
    
    # Anti-sniping parameters (in minutes)
    anti_snipe_trigger_window = Column(Integer, default=5)  # If bid within last 5 mins
    anti_snipe_extension_minutes = Column(Integer, default=5) # Extend by 5 mins
    
    status = Column(SQLEnum(AuctionStatus), default=AuctionStatus.ACTIVE, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    bids = relationship("Bid", back_populates="auction", order_by="desc(Bid.created_at)")


class Bid(Base):
    __tablename__ = "bids"

    id = Column(Integer, primary_key=True, index=True)
    auction_id = Column(Integer, ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    auction = relationship("Auction", back_populates="bids")

    __table_args__ = (
        CheckConstraint("amount > 0", name="bid_amount_positive"),
    )