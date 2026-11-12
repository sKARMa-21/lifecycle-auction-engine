from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.auction import AuctionStatus


class BidCreate(BaseModel):
    bidder_id: int
    amount: float = Field(..., gt=0)


class BidResponse(BaseModel):
    id: int
    auction_id: int
    bidder_id: int
    amount: float
    placed_at: datetime

    class Config:
        from_attributes = True


class AuctionCreate(BaseModel):
    bicycle_id: int
    created_by_id: int
    title: str
    starting_price: float = Field(..., ge=0)
    min_bid_increment: float = 20.0
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
    ends_at: datetime
    status: AuctionStatus
    created_at: datetime
    bids: List[BidResponse] = []

    class Config:
        from_attributes = True