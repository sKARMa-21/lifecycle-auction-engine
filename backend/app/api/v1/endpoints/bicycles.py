from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import (
    DegreeDurationActiveError,
    GracePeriodNotExpiredError,
    InvalidStateTransitionError,
    UnauthorizedTransitionError,
)
from app.db.session import SessionLocal
from app.models.bicycle import Bicycle
from app.models.user import User
from app.schemas.bicycle import BicycleCreate, BicycleRead
from app.schemas.lifecycle import (
    MarkAuctionableRequest,
    MarkSoldRequest,
    ReclaimRequest,
    TagAssetRequest,
)
from app.services.lifecycle_service import BicycleLifecycleService

router = APIRouter(prefix="/bicycles", tags=["Bicycle Lifecycle"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_bicycle_or_404(bicycle_id: int, db: Session) -> Bicycle:
    bicycle = db.get(Bicycle, bicycle_id)
    if not bicycle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bicycle with ID {bicycle_id} not found.",
        )
    return bicycle


def get_user_or_404(user_id: int, db: Session) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} not found.",
        )
    return user


@router.post("/", response_model=BicycleRead, status_code=status.HTTP_201_CREATED)
def create_bicycle(payload: BicycleCreate, db: Session = Depends(get_db)):
    """Register a new bicycle in the system."""
    existing = db.scalar(select(Bicycle).where(Bicycle.asset_tag == payload.asset_tag))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bicycle with asset tag '{payload.asset_tag}' already exists.",
        )

    bicycle = Bicycle(**payload.model_dump())
    db.add(bicycle)
    db.commit()
    db.refresh(bicycle)
    return bicycle


@router.get("/{bicycle_id}", response_model=BicycleRead)
def get_bicycle(bicycle_id: int, db: Session = Depends(get_db)):
    """Retrieve details and lifecycle state of a bicycle."""
    return get_bicycle_or_404(bicycle_id, db)


@router.post("/{bicycle_id}/tag-asset", response_model=BicycleRead)
def tag_as_asset(
    bicycle_id: int,
    payload: TagAssetRequest,
    db: Session = Depends(get_db),
):
    """Authority tags an abandoned/graduated cycle into ASSET (triggers 30-day grace period).
    
    Blocked if student is still actively enrolled within degree duration.
    """
    bicycle = get_bicycle_or_404(bicycle_id, db)
    actor = get_user_or_404(payload.actor_id, db)

    try:
        updated_bike = BicycleLifecycleService.tag_as_asset(bicycle, actor)
        db.commit()
        db.refresh(updated_bike)
        return updated_bike
    except DegreeDurationActiveError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except UnauthorizedTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except InvalidStateTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{bicycle_id}/set-auctionable", response_model=BicycleRead)
def set_auctionable(
    bicycle_id: int,
    payload: MarkAuctionableRequest,
    db: Session = Depends(get_db),
):
    """Student owner directly moves their ACTIVE cycle to AUCTIONABLE."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    actor = get_user_or_404(payload.actor_id, db)

    try:
        updated_bike = BicycleLifecycleService.mark_as_auctionable_by_owner(bicycle, actor)
        db.commit()
        db.refresh(updated_bike)
        return updated_bike
    except UnauthorizedTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except InvalidStateTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{bicycle_id}/reclaim", response_model=BicycleRead)
def reclaim_bicycle(
    bicycle_id: int,
    payload: ReclaimRequest,
    db: Session = Depends(get_db),
):
    """Owner reclaims cycle from ASSET back to ACTIVE during the 30-day grace period."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    actor = get_user_or_404(payload.actor_id, db)

    try:
        updated_bike = BicycleLifecycleService.reclaim_bicycle(bicycle, actor)
        db.commit()
        db.refresh(updated_bike)
        return updated_bike
    except UnauthorizedTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except InvalidStateTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{bicycle_id}/promote-auctionable", response_model=BicycleRead)
def promote_auctionable(
    bicycle_id: int,
    db: Session = Depends(get_db),
):
    """Promotes an ASSET cycle to AUCTIONABLE after the 30-day grace period has passed."""
    bicycle = get_bicycle_or_404(bicycle_id, db)

    try:
        updated_bike = BicycleLifecycleService.promote_asset_to_auctionable(bicycle)
        db.commit()
        db.refresh(updated_bike)
        return updated_bike
    except GracePeriodNotExpiredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except InvalidStateTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/cron/process-expired-assets", response_model=List[BicycleRead])
def process_expired_assets(db: Session = Depends(get_db)):
    """Automated job endpoint: scans all ASSET cycles and transitions expired ones to AUCTIONABLE."""
    promoted = BicycleLifecycleService.process_expired_assets(db)
    return promoted


@router.post("/{bicycle_id}/mark-sold", response_model=BicycleRead)
def mark_sold(
    bicycle_id: int,
    payload: MarkSoldRequest,
    db: Session = Depends(get_db),
):
    """Finalizes cycle state from AUCTIONABLE to SOLD and records sale analytics."""
    bicycle = get_bicycle_or_404(bicycle_id, db)

    try:
        updated_bike = BicycleLifecycleService.mark_as_sold(
            bicycle=bicycle,
            cycle_condition=payload.cycle_condition,
            market_value=payload.market_value,
            years_used=payload.years_used,
            base_price_set=payload.base_price_set,
            sold_price=payload.sold_price,
        )
        db.commit()
        db.refresh(updated_bike)
        return updated_bike
    except InvalidStateTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
