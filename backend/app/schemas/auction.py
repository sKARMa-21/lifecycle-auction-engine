from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.auction import AuctionStatus


class BidCreate(BaseModel):
    user_id: int
    amount: float = Field(..., gt=0)


class BidResponse(BaseModel):
    id: int
    auction_id: int
    user_id: int
    amount: float
    created_at: datetime

    class Config:
        from_attributes = True


class AuctionCreate(BaseModel):
    bicycle_id: int
    title: str
    description: Optional[str] = None
    starting_price: float = Field(..., ge=0)
    bid_increment: float = 50.0
    start_time: datetime
    end_time: datetime
    anti_snipe_trigger_window: int = 5
    anti_snipe_extension_minutes: int = 5


class AuctionResponse(BaseModel):
    id: int
    bicycle_id: int
    title: str
    description: Optional[str]
    starting_price: float
    current_highest_bid: float
    current_highest_bidder_id: Optional[int]
    bid_increment: float
    start_time: datetime
    end_time: datetime
    status: AuctionStatus
    created_at: datetime
    bids: List[BidResponse] = []

    class Config:
        from_attributes = True