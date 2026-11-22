from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Enum as SQLEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.bicycle import Bicycle
    from app.models.qr_sticker import QRSticker


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    GUARD = "guard"
    STUDENT = "student"


class Hostel(Base):
    __tablename__ = "hostels"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(5), unique=True)
    name: Mapped[str] = mapped_column(String(50))


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

    phone_number: Mapped[Optional[str]] = mapped_column(String(30))
    roll_number: Mapped[Optional[str]] = mapped_column(String(30), unique=True)
    degree_course: Mapped[Optional[str]] = mapped_column(String(100))
    hostel_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hostels.id"), index=True)

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

    @property
    def profile_complete(self) -> bool:
        return self.role != UserRole.STUDENT or bool(
            self.roll_number and self.degree_course and self.hostel_id and self.phone_number
        )