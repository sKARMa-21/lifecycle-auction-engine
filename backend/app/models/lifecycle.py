from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Text, DateTime, Enum as SQLEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.models.bicycle import CycleState

if TYPE_CHECKING:
    from app.models.bicycle import Bicycle
    from app.models.user import User


class LifecycleEvent(Base):
    __tablename__ = "lifecycle_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bicycle_id: Mapped[int] = mapped_column(ForeignKey("bicycles.id", ondelete="CASCADE"), index=True, nullable=False)
    actor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    from_state: Mapped[CycleState] = mapped_column(
        SQLEnum(CycleState, name="cycle_state", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    to_state: Mapped[CycleState] = mapped_column(
        SQLEnum(CycleState, name="cycle_state", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    
    location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proof_image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bicycle: Mapped["Bicycle"] = relationship("Bicycle", back_populates="events")
