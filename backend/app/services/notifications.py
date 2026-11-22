from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.case import Notification
from app.services.hostel import responsible_admins


def notify(db: Session, user_ids: Iterable[Optional[int]], message: str, bicycle_id: Optional[int] = None) -> None:
    """Queue one in-app notification per distinct recipient in the caller's transaction; the caller commits."""
    db.add_all(Notification(user_id=u, bicycle_id=bicycle_id, message=message) for u in {u for u in user_ids if u})


def notify_admins(db: Session, hostel_id: Optional[int], message: str, bicycle_id: Optional[int] = None) -> None:
    notify(db, [admin.id for admin in responsible_admins(db, hostel_id)], message, bicycle_id)
