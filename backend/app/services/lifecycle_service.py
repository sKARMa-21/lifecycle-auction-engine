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
from app.models.bicycle import Bicycle, BicycleStatus
from app.models.user import User


class BicycleLifecycleService:
    AUTHORITY_ROLES = {"security_guard", "warden", "admin"}
    DEFAULT_GRACE_PERIOD_DAYS = 30

    @staticmethod
    def _is_owner_or_admin(bicycle: Bicycle, actor: User) -> bool:
        """Helper to verify if the actor owns the cycle or is an administrator."""
        return (bicycle.owner_id is not None and bicycle.owner_id == actor.id) or actor.role == "admin"

    @classmethod
    def tag_as_asset(
        cls,
        bicycle: Bicycle,
        actor: User,
        current_time: Optional[datetime] = None,
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
        bicycle.asset_tagged_at = now
        return bicycle

    @classmethod
    def mark_as_auctionable_by_owner(
        cls,
        bicycle: Bicycle,
        actor: User,
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
        return bicycle

    @classmethod
    def reclaim_bicycle(
        cls,
        bicycle: Bicycle,
        actor: User,
    ) -> Bicycle:
        """Owner claims cycle back during the 30-day grace period (ASSET -> ACTIVE)."""
        if bicycle.status != BicycleStatus.ASSET.value:
            raise InvalidStateTransitionError(
                f"Cannot reclaim: Bicycle is in '{bicycle.status}' state, expected '{BicycleStatus.ASSET.value}'."
            )

        if not cls._is_owner_or_admin(bicycle, actor):
            raise UnauthorizedTransitionError("Only the owner or an admin can reclaim an impounded asset.")

        bicycle.status = BicycleStatus.ACTIVE.value
        bicycle.asset_tagged_at = None
        return bicycle

    @classmethod
    def promote_asset_to_auctionable(
        cls,
        bicycle: Bicycle,
        current_time: Optional[datetime] = None,
        grace_period_days: int = DEFAULT_GRACE_PERIOD_DAYS,
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

        db.commit()
        return expired_assets

    @classmethod
    def mark_as_sold(
        cls,
        bicycle: Bicycle,
        cycle_condition: Optional[str] = None,
        market_value: Optional[Decimal] = None,
        years_used: Optional[int] = None,
        base_price_set: Optional[Decimal] = None,
        sold_price: Optional[Decimal] = None,
    ) -> Bicycle:
        """Final transition from AUCTIONABLE to SOLD with analytical sale metadata."""
        if bicycle.status != BicycleStatus.AUCTIONABLE.value:
            raise InvalidStateTransitionError(
                f"Cannot mark sold: Bicycle is in '{bicycle.status}', expected '{BicycleStatus.AUCTIONABLE.value}'."
            )

        bicycle.status = BicycleStatus.SOLD.value
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

        return bicycle
