from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.auction import AuctionStatus


class BidCreate(BaseModel):
    model_config = {"extra": "forbid"}

    amount: float = Field(..., gt=0)


class BidResponse(BaseModel):
    id: int
    auction_id: int
    bidder_id: int
    amount: float
    status: str
    placed_at: datetime

    class Config:
        from_attributes = True


class AuctionCreate(BaseModel):
    bicycle_id: int
    created_by_id: int
    title: str
    starting_price: float = Field(..., ge=0)
    min_bid_increment: float = Field(default=50.0, gt=0)
    starts_at: datetime
    ends_at: datetime
    anti_snipe_trigger_window: int = 5
    anti_snipe_extension_minutes: int = 5


class AuctionResponse(BaseModel):
    id: int
    bicycle_id: int
    created_by_id: int
    title: str
    starting_price: float
    current_highest_bid: float
    current_winner_id: Optional[int]
    min_bid_increment: float
    starts_at: datetime
    ends_at: datetime
    payment_deadline: Optional[datetime]
    extension_count: int
    status: AuctionStatus
    created_at: datetime
    bids: List[BidResponse] = []

    class Config:
        from_attributes = True


class SettleResponse(AuctionResponse):
    """Extended auction response returned after settlement."""
    pass


class AuctionBidEvent(BaseModel):
    type: str = "NEW_BID"
    bidder_id: int
    amount: float
    ends_at: datetime
    extended: bool

