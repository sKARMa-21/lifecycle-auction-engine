from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TagAssetRequest(BaseModel):
    actor_id: int
    location: str = Field(min_length=1, max_length=150)
    notes: str = Field(min_length=1, max_length=5000)
    proof_image_url: str = Field(min_length=1, max_length=4_200_000, pattern=r"^(https://|data:image/(jpeg|png|webp);base64,)")


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


class MarkDeadRequest(BaseModel):
    actor_id: int
    reason: Optional[str] = None


class LifecycleEventRead(BaseModel):
    id: int
    bicycle_id: int
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    from_state: str
    to_state: str
    location: Optional[str] = None
    notes: Optional[str] = None
    proof_image_url: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NoteRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=1000)


class AuctionRequestCreate(NoteRequest):
    bicycle_id: int


class AuctionRequestRead(BaseModel):
    id: int
    bicycle_id: int
    student_id: int
    hostel_id: Optional[int] = None
    status: str
    note: Optional[str] = None
    reviewed_by_id: Optional[int] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationRead(BaseModel):
    id: int
    bicycle_id: Optional[int] = None
    message: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
