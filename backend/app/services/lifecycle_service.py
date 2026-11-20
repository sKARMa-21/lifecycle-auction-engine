"""Bicycle lifecycle state machine.

    ACTIVE --tag_as_asset--> ASSET --(15 days | surrender | admin promote)--> AUCTIONABLE --mark_as_sold--> SOLD
    ACTIVE --mark_as_auctionable_by_owner--> AUCTIONABLE        ASSET --reclaim (within 15 days)--> ACTIVE
    any non-terminal state --mark_as_dead--> DEAD

Every transition goes through `_move`, which checks the current state, updates both state
columns and writes a LifecycleEvent audit row. Callers commit the session (except the bulk job).
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import (
    GracePeriodNotExpiredError,
    InvalidStateTransitionError,
    UnauthorizedTransitionError,
)
from app.models.bicycle import Bicycle, CycleState
from app.models.lifecycle import LifecycleEvent
from app.models.user import User

ADMINS = ("admin", "super_admin")


def _owner_id(bicycle: Bicycle) -> Optional[int]:
    return bicycle.current_owner_id or bicycle.owner_id


class BicycleLifecycleService:
    AUTHORITY_ROLES = ("guard", *ADMINS)
    DEFAULT_GRACE_PERIOD_DAYS = 15

    @staticmethod
    def _is_owner_or_admin(bicycle: Bicycle, actor: User) -> bool:
        return _owner_id(bicycle) == actor.id or actor.role in ADMINS

    @staticmethod
    def _record_event(
        bicycle: Bicycle,
        from_state: CycleState,
        to_state: CycleState,
        actor_id: Optional[int] = None,
        notes: Optional[str] = None,
        location: Optional[str] = None,
        proof_image_url: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> LifecycleEvent:
        event = LifecycleEvent(
            bicycle_id=bicycle.id, actor_id=actor_id, from_state=from_state, to_state=to_state,
            location=location, notes=notes, proof_image_url=proof_image_url,
        )
        if db is not None:
            db.add(event)
        else:
            bicycle.events.append(event)
        return event

    @classmethod
    def _move(cls, bicycle: Bicycle, expected: CycleState, to: CycleState, action: str,
              actor: Optional[User], notes: str, db: Optional[Session], **event) -> Bicycle:
        """Validate the current state, apply the new one and record the audit event."""
        if bicycle.status != expected.value:
            raise InvalidStateTransitionError(
                f"Cannot {action}: Bicycle is in '{bicycle.status}' state, expected '{expected.value}'."
            )
        bicycle.status = to.value
        bicycle.current_state = to
        cls._record_event(bicycle, expected, to, actor_id=actor.id if actor else None,
                          notes=notes, db=db, **event)
        return bicycle

    @classmethod
    def tag_as_asset(cls, bicycle: Bicycle, actor: User, current_time: Optional[datetime] = None,
                     location: Optional[str] = None, notes: Optional[str] = None,
                     proof_image_url: Optional[str] = None, db: Optional[Session] = None) -> Bicycle:
        """Guard/admin reports neglect (photo, location, notes required); starts the 15-day claim window."""
        if bicycle.status != CycleState.ACTIVE.value:
            raise InvalidStateTransitionError(
                f"Cannot tag as asset: Bicycle is in '{bicycle.status}' state, expected 'active'."
            )
        if actor.role not in cls.AUTHORITY_ROLES:
            raise UnauthorizedTransitionError("Only guards and administrators can tag bicycles as asset.")
        if not (proof_image_url and location and notes):
            raise InvalidStateTransitionError("A photo, location and condition notes are required to report neglect.")

        bicycle.asset_tagged_at = current_time or datetime.now(timezone.utc)
        bicycle.last_known_location = location
        return cls._move(bicycle, CycleState.ACTIVE, CycleState.ASSET, "tag as asset", actor, notes, db,
                         location=location, proof_image_url=proof_image_url)

    @classmethod
    def mark_as_auctionable_by_owner(cls, bicycle: Bicycle, actor: User, notes: Optional[str] = None,
                                     db: Optional[Session] = None) -> Bicycle:
        """ACTIVE -> AUCTIONABLE by the student owner, or by an admin for an unowned bicycle."""
        owner_id = _owner_id(bicycle)
        if bicycle.status == CycleState.ACTIVE.value and not (
            (actor.role == "student" and owner_id == actor.id) or (actor.role in ADMINS and owner_id is None)
        ):
            raise UnauthorizedTransitionError(
                "Only the registered cycle owner or an administrator can directly move an active cycle to auctionable."
            )
        return cls._move(bicycle, CycleState.ACTIVE, CycleState.AUCTIONABLE, "mark auctionable", actor,
                         notes or "Marked as auctionable by owner", db)

    @classmethod
    def reclaim_bicycle(cls, bicycle: Bicycle, actor: User, notes: Optional[str] = None,
                        db: Optional[Session] = None) -> Bicycle:
        """ASSET -> ACTIVE by the owner (or an admin) within the 15-day claim window."""
        if bicycle.status == CycleState.ASSET.value:
            if not cls._is_owner_or_admin(bicycle, actor):
                raise UnauthorizedTransitionError("Only the owner or an admin can reclaim an impounded asset.")
            tagged = bicycle.asset_tagged_at
            if tagged and datetime.now(timezone.utc) >= tagged + timedelta(days=cls.DEFAULT_GRACE_PERIOD_DAYS):
                raise GracePeriodNotExpiredError("The 15-day claim period has ended.")
        cls._move(bicycle, CycleState.ASSET, CycleState.ACTIVE, "reclaim", actor,
                  notes or "Reclaimed by owner during grace period", db)
        bicycle.asset_tagged_at = None
        return bicycle

    @classmethod
    def surrender_to_auction(cls, bicycle: Bicycle, actor: User, notes: Optional[str] = None,
                             db: Optional[Session] = None) -> Bicycle:
        """ASSET -> AUCTIONABLE by the owner, skipping the rest of the claim window."""
        if actor.id not in (bicycle.owner_id, bicycle.current_owner_id):
            raise UnauthorizedTransitionError("Only the registered owner can surrender their bicycle.")
        cls._move(bicycle, CycleState.ASSET, CycleState.AUCTIONABLE, "surrender", actor,
                  notes or "Owner surrendered for auction", db)
        bicycle.asset_tagged_at = None
        return bicycle

    @classmethod
    def promote_asset_to_auctionable(cls, bicycle: Bicycle, actor: Optional[User] = None,
                                     current_time: Optional[datetime] = None,
                                     grace_period_days: int = DEFAULT_GRACE_PERIOD_DAYS,
                                     notes: Optional[str] = None, db: Optional[Session] = None) -> Bicycle:
        """ASSET -> AUCTIONABLE by an admin (or the expiry job when actor is None) once the window is over.

        Unowned bicycles can be promoted immediately.
        """
        if actor is not None and actor.role not in ADMINS:
            raise UnauthorizedTransitionError("Only administrators can promote abandoned assets.")
        if bicycle.status == CycleState.ASSET.value:
            if not bicycle.asset_tagged_at:
                raise InvalidStateTransitionError("Bicycle is missing asset_tagged_at timestamp.")
            elapsed = (current_time or datetime.now(timezone.utc)) - bicycle.asset_tagged_at
            if _owner_id(bicycle) and elapsed < timedelta(days=grace_period_days):
                raise GracePeriodNotExpiredError(
                    f"Grace period active: {grace_period_days - elapsed.days} days remaining before cycle "
                    f"can be transitioned to auctionable."
                )
        return cls._move(bicycle, CycleState.ASSET, CycleState.AUCTIONABLE, "promote to auctionable", actor,
                         notes or f"Promoted to auctionable after {grace_period_days}-day grace period", db)

    @classmethod
    def process_expired_assets(cls, db: Session, current_time: Optional[datetime] = None,
                               grace_period_days: int = DEFAULT_GRACE_PERIOD_DAYS) -> List[Bicycle]:
        """Background job: promote every ASSET whose claim window has passed, then commit."""
        now = current_time or datetime.now(timezone.utc)
        expired = list(db.scalars(
            select(Bicycle)
            .where(Bicycle.status == CycleState.ASSET.value,
                   Bicycle.asset_tagged_at <= now - timedelta(days=grace_period_days))
            .with_for_update(skip_locked=True)
        ).all())
        for bike in expired:
            cls.promote_asset_to_auctionable(
                bike, current_time=now, grace_period_days=grace_period_days, db=db,
                notes=f"Automated cron transition: {grace_period_days}-day grace period elapsed",
            )
        db.commit()
        return expired

    @classmethod
    def mark_as_sold(cls, bicycle: Bicycle, actor: Optional[User] = None,
                     cycle_condition: Optional[str] = None, market_value: Optional[Decimal] = None,
                     years_used: Optional[int] = None, base_price_set: Optional[Decimal] = None,
                     sold_price: Optional[Decimal] = None, notes: Optional[str] = None,
                     db: Optional[Session] = None) -> Bicycle:
        """AUCTIONABLE -> SOLD, storing sale analytics (fields left as None are not overwritten)."""
        cls._move(bicycle, CycleState.AUCTIONABLE, CycleState.SOLD, "mark sold", actor,
                  notes or f"Marked as sold. Final sold price: {sold_price}", db)
        sale = dict(cycle_condition=cycle_condition, market_value=market_value, years_used=years_used,
                    base_price_set=base_price_set, sold_price=sold_price)
        for field, value in sale.items():
            if value is not None:
                setattr(bicycle, field, value)
        return bicycle

    @classmethod
    def mark_as_dead(cls, bicycle: Bicycle, actor: User, reason: Optional[str] = None,
                     db: Optional[Session] = None) -> Bicycle:
        """Admin retires a non-terminal bicycle (scrapped, destroyed, lost) to DEAD."""
        if bicycle.status in (CycleState.SOLD.value, CycleState.DEAD.value):
            raise InvalidStateTransitionError(
                f"Cannot retire bicycle: it is already in a terminal state '{bicycle.status}'."
            )
        if actor.role != "admin":
            raise UnauthorizedTransitionError("Only an administrator can permanently retire a bicycle.")
        current = CycleState(bicycle.status)
        bicycle.asset_tagged_at = None
        return cls._move(bicycle, current, CycleState.DEAD, "retire", actor,
                         reason or "Bicycle permanently retired by administrator", db)
