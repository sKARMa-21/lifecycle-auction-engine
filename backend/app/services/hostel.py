from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bicycle import Bicycle
from app.models.user import User, UserRole


def bike_hostel(db: Session, bicycle: Bicycle) -> Optional[int]:
    """The hostel responsible for a bicycle: the open case's hostel, otherwise the owner's."""
    if bicycle.case_hostel_id:
        return bicycle.case_hostel_id
    owner_id = bicycle.current_owner_id or bicycle.owner_id
    owner = db.get(User, owner_id) if owner_id else None
    return owner.hostel_id if owner else None


def can_manage(user: User, hostel_id: Optional[int]) -> bool:
    """Same rule as deps.require_hostel_access, as a boolean."""
    return user.role == UserRole.SUPER_ADMIN or (
        user.role == UserRole.ADMIN and hostel_id is not None and user.hostel_id == hostel_id
    )


def responsible_admins(db: Session, hostel_id: Optional[int]) -> List[User]:
    """Active admins of the hostel; super admins review cases with no hostel or no hostel admin."""
    active = select(User).where(User.is_active.is_(True))
    admins = list(db.scalars(active.where(User.role == UserRole.ADMIN, User.hostel_id == hostel_id))) if hostel_id else []
    return admins or list(db.scalars(active.where(User.role == UserRole.SUPER_ADMIN)))
