from datetime import datetime
from decimal import Decimal
from typing import List, Optional
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


class BicycleUpdate(BaseModel):
    asset_tag: Optional[str] = None
    serial_number: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    found_location: Optional[str] = None
    owner_id: Optional[int] = None


class TransferOwnershipRequest(BaseModel):
    new_owner_id: Optional[int] = None
    actor_id: Optional[int] = None


class BicyclePublic(BaseModel):
    """What students and guards see: no internal lifecycle status, only allowed actions and a message."""
    id: int
    asset_tag: str
    serial_number: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[int] = None
    current_owner_id: Optional[int] = None
    claim_deadline: Optional[datetime] = None
    created_at: datetime
    actions: List[str] = []
    message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BicycleRead(BicyclePublic):
    status: str
    found_location: Optional[str] = None
    image_url: Optional[str] = None
    reported_by_id: Optional[int] = None
    asset_tagged_at: Optional[datetime] = None
    case_hostel_id: Optional[int] = None
    qr_token: Optional[str] = None
    cycle_condition: Optional[str] = None
    market_value: Optional[Decimal] = None
    years_used: Optional[int] = None
    base_price_set: Optional[Decimal] = None
    sold_price: Optional[Decimal] = None
    updated_at: datetime
