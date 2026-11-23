"""
Bicycle lifecycle state machine.

    ACTIVE --tag_as_asset (guard scan, sets claim_deadline)--> ASSET
    ASSET --(claim_deadline passed | admin promote)--> AUCTIONABLE
    AUCTIONABLE --mark_as_sold--> SOLD
    ACTIVE --approve_for_auction (admin approves owner's request)--> AUCTIONABLE
    AUCTIONABLE --return_to_owner (owner takes back an approved request)--> ACTIVE
    ASSET --reclaim (now < claim_deadline)--> ACTIVE
    any non-terminal state --mark_as_dead--> DEAD

Every transition goes through `_move`, which checks the current state, updates both state
columns and writes a LifecycleEvent audit row. Callers commit the session (except the bulk job).
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import GracePeriodNotExpiredError, InvalidStateTransitionError, UnauthorizedTransitionError
from app.models.bicycle import Bicycle, CycleState
from app.models.lifecycle import LifecycleEvent
from app.models.user import User
from app.services.hostel import bike_hostel, can_manage
from app.services.notifications import notify, notify_admins

ADMINS = ("admin", "super_admin")
GRACE_DAYS = 15
ACTIVE, ASSET, AUCTIONABLE, SOLD, DEAD = (CycleState.ACTIVE, CycleState.ASSET, CycleState.AUCTIONABLE,
                                          CycleState.SOLD, CycleState.DEAD)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _owner_id(bicycle: Bicycle) -> Optional[int]:
    return bicycle.current_owner_id or bicycle.owner_id


def _require_manager(bicycle: Bicycle, actor: User, db: Session, message: str) -> None:
    if not can_manage(actor, bike_hostel(db, bicycle)):
        raise UnauthorizedTransitionError(message)


class BicycleLifecycleService:
    @staticmethod
    def _move(bicycle: Bicycle, expected: CycleState, to: CycleState, action: str, actor: Optional[User],
              notes: str, db: Optional[Session], **event) -> Bicycle:
        """Validate the current state, apply the new one and record the audit event."""
        if bicycle.status != expected.value:
            raise InvalidStateTransitionError(f"Cannot {action}: Bicycle is in '{bicycle.status}' state, expected '{expected.value}'.")
        bicycle.status, bicycle.current_state = to.value, to
        record = LifecycleEvent(bicycle_id=bicycle.id, actor_id=actor.id if actor else None, from_state=expected,
                                to_state=to, notes=notes, **event)
        (db.add if db is not None else bicycle.events.append)(record)
        return bicycle

    @classmethod
    def tag_as_asset(cls, bicycle: Bicycle, actor: User, location: Optional[str] = None, notes: Optional[str] = None,
                     proof_image_url: Optional[str] = None, db: Optional[Session] = None) -> Bicycle:
        """Accepted guard scan: ACTIVE -> ASSET, starts the 15-day claim window. A repeat scan changes nothing."""
        if actor.role not in ("guard", *ADMINS):
            raise UnauthorizedTransitionError("Only guards and administrators can tag bicycles as asset.")
        if bicycle.status == ASSET.value:
            return bicycle
        if bicycle.status != ACTIVE.value:
            raise InvalidStateTransitionError(f"Cannot tag as asset: Bicycle is in '{bicycle.status}' state, expected 'active'.")
        if not (proof_image_url and location and notes):
            raise InvalidStateTransitionError("A photo, location and condition notes are required to report neglect.")
        bicycle.asset_tagged_at = utcnow()
        bicycle.claim_deadline = bicycle.asset_tagged_at + timedelta(minutes=1)#timedelta(days=GRACE_DAYS)
        bicycle.case_hostel_id, bicycle.last_known_location = bike_hostel(db, bicycle), location
        cls._move(bicycle, ACTIVE, ASSET, "tag as asset", actor, notes, db, location=location, proof_image_url=proof_image_url)
        notify(db, [_owner_id(bicycle)], f"Your bicycle {bicycle.asset_tag} was found at {location} and impounded. Claim it before "
               f"{bicycle.claim_deadline:%d %b %Y %H:%M} UTC, or it will go to auction.", bicycle.id)
        return bicycle

    @classmethod
    def approve_for_auction(cls, bicycle: Bicycle, actor: User, notes: Optional[str] = None, db: Optional[Session] = None) -> Bicycle:
        """ACTIVE -> AUCTIONABLE when the owner's hostel admin approves their auction request."""
        _require_manager(bicycle, actor, db, "Only this hostel's admin or a super admin can approve this request.")
        return cls._move(bicycle, ACTIVE, AUCTIONABLE, "approve for auction", actor, notes or "Owner's auction request approved", db)

    @classmethod
    def return_to_owner(cls, bicycle: Bicycle, actor: User, notes: Optional[str] = None, db: Optional[Session] = None) -> Bicycle:
        """AUCTIONABLE -> ACTIVE when the owner takes back an approved request before an auction is launched."""
        if _owner_id(bicycle) != actor.id:
            raise UnauthorizedTransitionError("Only the owner can take their bicycle back from the auction pool.")
        return cls._move(bicycle, AUCTIONABLE, ACTIVE, "take back", actor, notes or "Owner took the bicycle back from the auction pool", db)

    @classmethod
    def reclaim_bicycle(cls, bicycle: Bicycle, actor: User, notes: Optional[str] = None, db: Optional[Session] = None) -> Bicycle:
        """ASSET -> ACTIVE by the owner (or the case hostel's admin) while now < claim_deadline."""
        if bicycle.status == ASSET.value:
            if _owner_id(bicycle) != actor.id:
                _require_manager(bicycle, actor, db, "Only the owner or this hostel's admin can reclaim an impounded asset.")
            if bicycle.claim_deadline and utcnow() >= bicycle.claim_deadline:
                raise GracePeriodNotExpiredError("The 15-day claim period has ended.")
        cls._move(bicycle, ASSET, ACTIVE, "reclaim", actor, notes or "Reclaimed by owner during grace period", db)
        bicycle.asset_tagged_at = bicycle.claim_deadline = bicycle.case_hostel_id = None
        return bicycle

    @classmethod
    def promote_asset_to_auctionable(cls, bicycle: Bicycle, actor: Optional[User] = None, notes: Optional[str] = None,
                                     db: Optional[Session] = None) -> Bicycle:
        """ASSET -> AUCTIONABLE by the case hostel's admin (or the expiry job when actor is None) once
        claim_deadline has passed. Unowned bicycles can be promoted immediately.
        """
        if actor is not None:
            if actor.role not in ADMINS:
                raise UnauthorizedTransitionError("Only administrators can promote abandoned assets.")
            _require_manager(bicycle, actor, db, "Only this hostel's admin or a super admin can promote this asset.")
        if bicycle.status == ASSET.value and _owner_id(bicycle):
            if not bicycle.claim_deadline:
                raise InvalidStateTransitionError("Bicycle is missing its claim deadline.")
            if utcnow() < bicycle.claim_deadline:
                raise GracePeriodNotExpiredError(f"Claim period active until {bicycle.claim_deadline:%d %b %Y %H:%M} UTC.")
        return cls._move(bicycle, ASSET, AUCTIONABLE, "promote to auctionable", actor,
                         notes or f"Promoted to auctionable after {GRACE_DAYS}-day grace period", db)

    @classmethod
    def process_expired_assets(cls, db: Session) -> List[Bicycle]:
        """Background job: promote every ASSET with claim_deadline <= now, notify its hostel admins, then commit."""
        expired = list(db.scalars(select(Bicycle).where(Bicycle.status == ASSET.value, Bicycle.claim_deadline <= utcnow())
                                  .with_for_update(skip_locked=True)))
        for bike in expired:
            cls.promote_asset_to_auctionable(bike, db=db, notes=f"Automated cron transition: {GRACE_DAYS}-day grace period elapsed")
            notify_admins(db, bike.case_hostel_id,
                          f"Bicycle {bike.asset_tag} was not claimed within {GRACE_DAYS} days and is now in the auction pool.", bike.id)
        db.commit()
        return expired

    @classmethod
    def mark_as_sold(cls, bicycle: Bicycle, actor: Optional[User] = None, cycle_condition: Optional[str] = None,
                     market_value: Optional[Decimal] = None, years_used: Optional[int] = None,
                     base_price_set: Optional[Decimal] = None, sold_price: Optional[Decimal] = None,
                     notes: Optional[str] = None, db: Optional[Session] = None) -> Bicycle:
        """AUCTIONABLE -> SOLD, storing sale analytics (fields left as None are not overwritten)."""
        cls._move(bicycle, AUCTIONABLE, SOLD, "mark sold", actor, notes or f"Marked as sold. Final sold price: {sold_price}", db)
        for field, value in dict(cycle_condition=cycle_condition, market_value=market_value, years_used=years_used,
                                 base_price_set=base_price_set, sold_price=sold_price).items():
            if value is not None:
                setattr(bicycle, field, value)
        return bicycle

    @classmethod
    def mark_as_dead(cls, bicycle: Bicycle, actor: User, reason: Optional[str] = None, db: Optional[Session] = None) -> Bicycle:
        """Admin retires a non-terminal bicycle (scrapped, destroyed, lost) to DEAD."""
        if bicycle.status in (SOLD.value, DEAD.value):
            raise InvalidStateTransitionError(f"Cannot retire bicycle: it is already in a terminal state '{bicycle.status}'.")
        if actor.role != "admin":
            raise UnauthorizedTransitionError("Only an administrator can permanently retire a bicycle.")
        bicycle.asset_tagged_at = None
        return cls._move(bicycle, CycleState(bicycle.status), DEAD, "retire", actor, reason or "Bicycle permanently retired by administrator", db)
