from datetime import date, datetime, timezone
from typing import Optional, List, TYPE_CHECKING
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Enum as SQLEnum, func
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

    # Role stored as enum
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role", values_callable=lambda x: [e.value for e in x]),
        default=UserRole.STUDENT,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Contact
    phone_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Student degree details (jayesh's lifecycle-aware fields)
    degree_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)   # BTech, MTech, PhD
    degree_duration_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    enrollment_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Student degree details (skarma-dev's DB design fields — kept for migration compat)
    joining_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    course_duration_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    degree_end_date: Mapped[Optional[date]] = mapped_column(Date, index=True, nullable=True)

    # Hostel info
    hostel_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    room_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    # `owned_bicycles` via owner_id — used by lifecycle service
    owned_bicycles = relationship("Bicycle", back_populates="owner", foreign_keys="Bicycle.owner_id")
    # `bicycles` via current_owner_id — used by skarma-dev / QR sticker models
    bicycles: Mapped[List["Bicycle"]] = relationship(
        "Bicycle", back_populates="current_owner", foreign_keys="Bicycle.current_owner_id"
    )
    stickers: Mapped[List["QRSticker"]] = relationship("QRSticker", back_populates="issued_to")

    # Computed helpers
    @property
    def graduation_year(self) -> Optional[int]:
        if self.enrollment_year and self.degree_duration_years:
            return self.enrollment_year + self.degree_duration_years
        return None

    def is_degree_active(self, current_year: int) -> bool:
        """Returns True if the student is currently enrolled within degree duration."""
        if self.role != UserRole.STUDENT:
            return False
        grad_year = self.graduation_year
        if grad_year is None:
            return True
        return current_year < grad_year
