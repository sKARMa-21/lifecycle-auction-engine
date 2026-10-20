from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class TagAssetRequest(BaseModel):
    actor_id: int


class MarkAuctionableRequest(BaseModel):
    actor_id: int


class ReclaimRequest(BaseModel):
    actor_id: int


class MarkSoldRequest(BaseModel):
    cycle_condition: Optional[str] = None
    market_value: Optional[Decimal] = None
    years_used: Optional[int] = None
    base_price_set: Optional[Decimal] = None
    sold_price: Decimal
