from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default="student", nullable=False)  # student, security_guard, warden, admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Student profile fields
    degree_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # BTech, MTech, PhD
    degree_duration_years: Mapped[int | None] = mapped_column(Integer, nullable=True)  # e.g. 4, 2
    enrollment_year: Mapped[int | None] = mapped_column(Integer, nullable=True)  # e.g. 2022
    hostel_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    room_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    owned_bicycles = relationship("Bicycle", back_populates="owner", foreign_keys="Bicycle.owner_id")

    @property
    def graduation_year(self) -> int | None:
        if self.enrollment_year and self.degree_duration_years:
            return self.enrollment_year + self.degree_duration_years
        return None

    def is_degree_active(self, current_year: int) -> bool:
        """Returns True if the student is currently enrolled within degree duration."""
        if self.role != "student":
            return False
        grad_year = self.graduation_year
        if grad_year is None:
            # If no duration set, default to active
            return True
        return current_year < grad_year
