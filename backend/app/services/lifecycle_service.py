from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import (
    DegreeDurationActiveError,
    GracePeriodNotExpiredError,
    InvalidStateTransitionError,
    UnauthorizedTransitionError,
)
from app.models.bicycle import Bicycle, BicycleStatus, CycleState
from app.models.lifecycle import LifecycleEvent
from app.models.user import User


class BicycleLifecycleService:
    AUTHORITY_ROLES = {"guard", "admin"}
    DEFAULT_GRACE_PERIOD_DAYS = 30

    @staticmethod
    def _is_owner_or_admin(bicycle: Bicycle, actor: User) -> bool:
        """Helper to verify if the actor owns the cycle or is an administrator."""
        return (bicycle.owner_id is not None and bicycle.owner_id == actor.id) or actor.role == "admin"

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
            bicycle_id=bicycle.id,
            actor_id=actor_id,
            from_state=from_state,
            to_state=to_state,
            location=location,
            notes=notes,
            proof_image_url=proof_image_url,
        )
        if db is not None:
            db.add(event)
        else:
            bicycle.events.append(event)
        return event

    @classmethod
    def tag_as_asset(
        cls,
        bicycle: Bicycle,
        actor: User,
        current_time: Optional[datetime] = None,
        location: Optional[str] = None,
        notes: Optional[str] = None,
        proof_image_url: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Bicycle:
        """Transitions a cycle from ACTIVE to ASSET.
        
        Only security guards, wardens, or admins can perform this.
        BLOCKED if the student owner is still within active degree duration.
        """
        if bicycle.status != BicycleStatus.ACTIVE.value:
            raise InvalidStateTransitionError(
                f"Cannot tag as asset: Bicycle is currently in '{bicycle.status}' state, expected '{BicycleStatus.ACTIVE.value}'."
            )

        if actor.role not in cls.AUTHORITY_ROLES:
            raise UnauthorizedTransitionError(
                f"Actor with role '{actor.role}' is not authorized to tag bicycles as asset. Must be one of {cls.AUTHORITY_ROLES}."
            )

        now = current_time or datetime.now(timezone.utc)
        current_year = now.year

        # Check degree duration protection for student owners
        if bicycle.owner and bicycle.owner.role == "student":
            if bicycle.owner.is_degree_active(current_year):
                grad_year = bicycle.owner.graduation_year or "unknown"
                raise DegreeDurationActiveError(
                    f"Protected by degree duration: Owner '{bicycle.owner.full_name}' is currently enrolled "
                    f"in {bicycle.owner.degree_type or 'degree'} (enrolled: {bicycle.owner.enrollment_year}, expected graduation: {grad_year}). "
                    f"Authorities cannot tag active student cycles as asset."
                )

        bicycle.status = BicycleStatus.ASSET.value
        bicycle.current_state = CycleState.ASSET
        bicycle.asset_tagged_at = now
        if location:
            bicycle.last_known_location = location

        cls._record_event(
            bicycle=bicycle,
            from_state=CycleState.ACTIVE,
            to_state=CycleState.ASSET,
            actor_id=actor.id,
            location=location or bicycle.found_location or bicycle.last_known_location,
            notes=notes or "Tagged as campus asset by authority",
            proof_image_url=proof_image_url,
            db=db,
        )
        return bicycle

    @classmethod
    def mark_as_auctionable_by_owner(
        cls,
        bicycle: Bicycle,
        actor: User,
        notes: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Bicycle:
        """Direct transition from ACTIVE to AUCTIONABLE.
        
        Only permitted for the registered owner (student) or admin.
        Authorities cannot use this to bypass the ASSET grace period.
        """
        if bicycle.status != BicycleStatus.ACTIVE.value:
            raise InvalidStateTransitionError(
                f"Cannot mark auctionable: Bicycle is currently in '{bicycle.status}', expected '{BicycleStatus.ACTIVE.value}'."
            )

        if not cls._is_owner_or_admin(bicycle, actor):
            raise UnauthorizedTransitionError(
                "Only the registered cycle owner or an administrator can directly move an active cycle to auctionable."
            )

        bicycle.status = BicycleStatus.AUCTIONABLE.value
        bicycle.current_state = CycleState.AUCTIONABLE

        cls._record_event(
            bicycle=bicycle,
            from_state=CycleState.ACTIVE,
            to_state=CycleState.AUCTIONABLE,
            actor_id=actor.id,
            notes=notes or "Marked as auctionable by owner",
            db=db,
        )
        return bicycle

    @classmethod
    def reclaim_bicycle(
        cls,
        bicycle: Bicycle,
        actor: User,
        notes: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Bicycle:
        """Owner claims cycle back during the 30-day grace period (ASSET -> ACTIVE)."""
        if bicycle.status != BicycleStatus.ASSET.value:
            raise InvalidStateTransitionError(
                f"Cannot reclaim: Bicycle is in '{bicycle.status}' state, expected '{BicycleStatus.ASSET.value}'."
            )

        if not cls._is_owner_or_admin(bicycle, actor):
            raise UnauthorizedTransitionError("Only the owner or an admin can reclaim an impounded asset.")

        bicycle.status = BicycleStatus.ACTIVE.value
        bicycle.current_state = CycleState.ACTIVE
        bicycle.asset_tagged_at = None

        cls._record_event(
            bicycle=bicycle,
            from_state=CycleState.ASSET,
            to_state=CycleState.ACTIVE,
            actor_id=actor.id,
            notes=notes or "Reclaimed by owner during grace period",
            db=db,
        )
        return bicycle

    @classmethod
    def promote_asset_to_auctionable(
        cls,
        bicycle: Bicycle,
        actor: Optional[User] = None,
        current_time: Optional[datetime] = None,
        grace_period_days: int = DEFAULT_GRACE_PERIOD_DAYS,
        notes: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Bicycle:
        """Promotes an ASSET to AUCTIONABLE once 30-day grace period expires."""
        if bicycle.status != BicycleStatus.ASSET.value:
            raise InvalidStateTransitionError(
                f"Cannot promote to auctionable: Bicycle is in '{bicycle.status}', expected '{BicycleStatus.ASSET.value}'."
            )

        if not bicycle.asset_tagged_at:
            raise InvalidStateTransitionError("Bicycle is missing asset_tagged_at timestamp.")

        now = current_time or datetime.now(timezone.utc)
        elapsed = now - bicycle.asset_tagged_at

        if elapsed < timedelta(days=grace_period_days):
            remaining_days = grace_period_days - elapsed.days
            raise GracePeriodNotExpiredError(
                f"Grace period active: {remaining_days} days remaining before cycle can be transitioned to auctionable."
            )

        bicycle.status = BicycleStatus.AUCTIONABLE.value
        bicycle.current_state = CycleState.AUCTIONABLE

        cls._record_event(
            bicycle=bicycle,
            from_state=CycleState.ASSET,
            to_state=CycleState.AUCTIONABLE,
            actor_id=actor.id if actor else None,
            notes=notes or f"Promoted to auctionable after {grace_period_days}-day grace period",
            db=db,
        )
        return bicycle

    @classmethod
    def process_expired_assets(
        cls,
        db: Session,
        current_time: Optional[datetime] = None,
        grace_period_days: int = DEFAULT_GRACE_PERIOD_DAYS,
    ) -> List[Bicycle]:
        """Scheduled worker job: finds all ASSET cycles past grace period and promotes to AUCTIONABLE."""
        now = current_time or datetime.now(timezone.utc)
        cutoff = now - timedelta(days=grace_period_days)

        stmt = select(Bicycle).where(
            Bicycle.status == BicycleStatus.ASSET.value,
            Bicycle.asset_tagged_at <= cutoff,
        )
        expired_assets = list(db.scalars(stmt).all())

        for bike in expired_assets:
            bike.status = BicycleStatus.AUCTIONABLE.value
            bike.current_state = CycleState.AUCTIONABLE
            cls._record_event(
                bicycle=bike,
                from_state=CycleState.ASSET,
                to_state=CycleState.AUCTIONABLE,
                actor_id=None,
                notes=f"Automated cron transition: {grace_period_days}-day grace period elapsed",
                db=db,
            )

        db.commit()
        return expired_assets

    @classmethod
    def mark_as_sold(
        cls,
        bicycle: Bicycle,
        actor: Optional[User] = None,
        cycle_condition: Optional[str] = None,
        market_value: Optional[Decimal] = None,
        years_used: Optional[int] = None,
        base_price_set: Optional[Decimal] = None,
        sold_price: Optional[Decimal] = None,
        notes: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Bicycle:
        """Final transition from AUCTIONABLE to SOLD with analytical sale metadata."""
        if bicycle.status != BicycleStatus.AUCTIONABLE.value:
            raise InvalidStateTransitionError(
                f"Cannot mark sold: Bicycle is in '{bicycle.status}', expected '{BicycleStatus.AUCTIONABLE.value}'."
            )

        bicycle.status = BicycleStatus.SOLD.value
        bicycle.current_state = CycleState.SOLD
        if cycle_condition is not None:
            bicycle.cycle_condition = cycle_condition
        if market_value is not None:
            bicycle.market_value = market_value
        if years_used is not None:
            bicycle.years_used = years_used
        if base_price_set is not None:
            bicycle.base_price_set = base_price_set
        if sold_price is not None:
            bicycle.sold_price = sold_price

        cls._record_event(
            bicycle=bicycle,
            from_state=CycleState.AUCTIONABLE,
            to_state=CycleState.SOLD,
            actor_id=actor.id if actor else None,
            notes=notes or f"Marked as sold. Final sold price: {sold_price}",
            db=db,
        )
        return bicycle
