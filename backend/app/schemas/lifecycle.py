from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict


class TagAssetRequest(BaseModel):
    actor_id: int
    location: Optional[str] = None
    notes: Optional[str] = None
    proof_image_url: Optional[str] = None


class MarkAuctionableRequest(BaseModel):
    actor_id: int
    notes: Optional[str] = None


class ReclaimRequest(BaseModel):
    actor_id: int
    notes: Optional[str] = None


class MarkSoldRequest(BaseModel):
    actor_id: Optional[int] = None
    cycle_condition: Optional[str] = None
    market_value: Optional[Decimal] = None
    years_used: Optional[int] = None
    base_price_set: Optional[Decimal] = None
    sold_price: Decimal
    notes: Optional[str] = None


class LifecycleEventRead(BaseModel):
    id: int
    bicycle_id: int
    actor_id: Optional[int] = None
    from_state: str
    to_state: str
    location: Optional[str] = None
    notes: Optional[str] = None
    proof_image_url: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
