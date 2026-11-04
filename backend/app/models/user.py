from datetime import date, datetime
from typing import Optional, List, TYPE_CHECKING
from enum import Enum
from sqlalchemy import String, Integer, Date, DateTime, Enum as SQLEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.bicycle import Bicycle
    from app.models.qr_sticker import QRSticker


class UserRole(str, Enum):
    ADMIN = "admin"
    STUDENT = "student"
    GUARD = "guard"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role", values_callable=lambda x: [e.value for e in x]),
        default=UserRole.STUDENT,
        nullable=False,
    )
    phone_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    
    joining_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    course_duration_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    degree_end_date: Mapped[Optional[date]] = mapped_column(Date, index=True, nullable=True)
    hostel_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    room_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bicycles: Mapped[List["Bicycle"]] = relationship("Bicycle", back_populates="owner", foreign_keys="Bicycle.current_owner_id")
    stickers: Mapped[List["QRSticker"]] = relationship("QRSticker", back_populates="issued_to")
