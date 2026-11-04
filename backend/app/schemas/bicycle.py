from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict


class BicycleBase(BaseModel):
    asset_tag: str
    serial_number: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    found_location: Optional[str] = None


class BicycleCreate(BicycleBase):
    owner_id: Optional[int] = None


class BicycleRead(BicycleBase):
    id: int
    status: str
    owner_id: Optional[int] = None
    reported_by_id: Optional[int] = None
    asset_tagged_at: Optional[datetime] = None
    qr_token: Optional[str] = None
    cycle_condition: Optional[str] = None
    market_value: Optional[Decimal] = None
    years_used: Optional[int] = None
    base_price_set: Optional[Decimal] = None
    sold_price: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
