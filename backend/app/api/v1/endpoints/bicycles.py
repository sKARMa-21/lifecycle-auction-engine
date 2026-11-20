from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.bicycle import Bicycle
from app.models.lifecycle import LifecycleEvent
from app.models.user import User, UserRole
from app.schemas.bicycle import (
    BicycleCreate,
    BicycleRead,
    BicycleUpdate,
    TransferOwnershipRequest,
)
from app.schemas.lifecycle import (
    LifecycleEventRead,
    MarkAuctionableRequest,
    MarkSoldRequest,
    ReclaimRequest,
    TagAssetRequest,
)
from app.services.lifecycle_service import BicycleLifecycleService
from app.api.v1.deps import get_current_user, require_roles

router = APIRouter(prefix="/bicycles", tags=["Bicycle Lifecycle"], dependencies=[Depends(get_current_user)])


def get_bicycle_or_404(bicycle_id: int, db: Session) -> Bicycle:
    bicycle = db.scalar(select(Bicycle).where(Bicycle.id == bicycle_id).with_for_update())
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
def create_bicycle(
    payload: BicycleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register a new bicycle in the system.
    Strict Policy: ONLY students can own bicycles. Guards and Admins cannot own bicycles.
    """
    existing = db.scalar(select(Bicycle).where(Bicycle.asset_tag == payload.asset_tag))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bicycle with asset tag '{payload.asset_tag}' already exists.",
        )

    bike_data = payload.model_dump()
    actor = current_user
    if actor and actor.role == UserRole.STUDENT:
        bike_data["owner_id"] = actor.id
        bike_data["current_owner_id"] = actor.id
    elif actor and actor.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUARD):
        # Staff cannot register bicycles as their own personal property
        if bike_data.get("owner_id") == actor.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Guards and Admins cannot own bicycles. Only registered students can own a bicycle.",
            )

    # Validate that any assigned owner is strictly a STUDENT
    if bike_data.get("owner_id") is not None:
        target_owner = get_user_or_404(bike_data["owner_id"], db)
        if target_owner.role not in (UserRole.STUDENT, "student"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only students can own bicycles. User '{target_owner.full_name}' is a '{target_owner.role}' and cannot own a bicycle.",
            )

    bicycle = Bicycle(**bike_data)
    if "current_owner_id" not in bike_data and bike_data.get("owner_id"):
        bicycle.current_owner_id = bike_data["owner_id"]
    db.add(bicycle)
    db.commit()
    db.refresh(bicycle)
    return bicycle


@router.get("/", response_model=List[BicycleRead])
def list_bicycles(
    skip: int = 0,
    limit: int = 100,
    owner_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve bicycles. If requester is a student, only their own bicycles are returned."""
    caller = current_user

    query = select(Bicycle)

    if caller and caller.role == UserRole.STUDENT:
        # Students can ONLY see bicycles that belong to them
        query = query.where(
            (Bicycle.owner_id == caller.id) | (Bicycle.current_owner_id == caller.id)
        )
    elif owner_id is not None:
        query = query.where(
            (Bicycle.owner_id == owner_id) | (Bicycle.current_owner_id == owner_id)
        )

    query = query.offset(skip).limit(limit).order_by(Bicycle.id.desc())
    return list(db.scalars(query).all())


@router.get("/scan/lookup", response_model=BicycleRead)
def lookup_bicycle(token: str, db: Session = Depends(get_db), actor: User = Depends(require_roles(UserRole.GUARD, UserRole.ADMIN, UserRole.SUPER_ADMIN))):
    bicycle = db.scalar(select(Bicycle).where((Bicycle.asset_tag == token) | (Bicycle.qr_token == token)))
    if not bicycle:
        raise HTTPException(404, "No bicycle matches that tag or QR token")
    return bicycle


@router.get("/{bicycle_id}", response_model=BicycleRead)
def get_bicycle(
    bicycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve details and lifecycle state of a bicycle."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    caller = current_user

    # If caller is a student, verify they own the bicycle or it is in an auctionable state
    if caller and caller.role == UserRole.STUDENT:
        is_owner = (bicycle.owner_id == caller.id) or (bicycle.current_owner_id == caller.id)
        # Students can view cycles they own or cycles that are currently active in auction / auctionable
        if not is_owner and bicycle.status not in ("auctionable", "sold"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not own this bicycle.",
            )

    return bicycle


@router.put("/{bicycle_id}", response_model=BicycleRead)
def update_bicycle(
    bicycle_id: int,
    payload: BicycleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update details of a bicycle."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    update_data = payload.model_dump(exclude_unset=True)

    actor = current_user

    # Students can only update their own bicycle and cannot change owner_id directly
    if actor and actor.role == UserRole.STUDENT:
        is_owner = (bicycle.owner_id == actor.id) or (bicycle.current_owner_id == actor.id)
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this bicycle and cannot modify it.",
            )
        update_data.pop("owner_id", None)

    if "owner_id" in update_data and update_data["owner_id"] is not None:
        target_owner = get_user_or_404(update_data["owner_id"], db)
        if target_owner.role not in (UserRole.STUDENT, "student"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only students can own bicycles. User '{target_owner.full_name}' is a '{target_owner.role}' and cannot own a bicycle.",
            )
        bicycle.current_owner_id = update_data["owner_id"]

    for field, value in update_data.items():
        setattr(bicycle, field, value)

    db.commit()
    db.refresh(bicycle)
    return bicycle


@router.patch("/{bicycle_id}/transfer", response_model=BicycleRead)
def transfer_bicycle_ownership(
    bicycle_id: int,
    payload: TransferOwnershipRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Transfer ownership of a bicycle to another user.
    Students can ONLY transfer bicycles that they own.
    Admins and Super Admins can transfer any bicycle.
    """
    bicycle = get_bicycle_or_404(bicycle_id, db)

    actor = current_user

    # Verify authorization: Must be owner or admin/super_admin
    is_owner = (bicycle.owner_id == actor.id) or (bicycle.current_owner_id == actor.id)
    is_admin = actor.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN, "admin", "super_admin")

    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this bicycle and cannot transfer its ownership.",
        )

    if payload.new_owner_id is not None:
        new_owner = get_user_or_404(payload.new_owner_id, db)
        if new_owner.role not in (UserRole.STUDENT, "student"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only students can own bicycles. Ownership cannot be transferred to a user with role '{new_owner.role}'.",
            )

    bicycle.owner_id = payload.new_owner_id
    bicycle.current_owner_id = payload.new_owner_id
    db.commit()
    db.refresh(bicycle)
    return bicycle


@router.delete("/{bicycle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bicycle(
    bicycle_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a bicycle from the system."""
    bicycle = get_bicycle_or_404(bicycle_id, db)

    actor = current_user
    if actor and actor.role == UserRole.STUDENT:
        is_owner = (bicycle.owner_id == actor.id) or (bicycle.current_owner_id == actor.id)
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not own this bicycle and cannot delete it.",
            )

    db.delete(bicycle)
    db.commit()
    return None


@router.post("/{bicycle_id}/tag-asset", response_model=BicycleRead)
def tag_as_asset(
    bicycle_id: int,
    payload: TagAssetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record neglect and begin the owner's 15-day claim period."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    actor = current_user
    if payload.actor_id != actor.id:
        raise HTTPException(403, "Actor must match signed-in user")

    updated_bike = BicycleLifecycleService.tag_as_asset(
        bicycle=bicycle,
        actor=actor,
        location=payload.location,
        notes=payload.notes,
        proof_image_url=payload.proof_image_url,
        db=db,
    )
    db.commit()
    db.refresh(updated_bike)
    return updated_bike


@router.post("/{bicycle_id}/set-auctionable", response_model=BicycleRead)
def set_auctionable(
    bicycle_id: int,
    payload: MarkAuctionableRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Student owner directly moves their ACTIVE cycle to AUCTIONABLE."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    actor = current_user
    if payload.actor_id != actor.id:
        raise HTTPException(403, "Actor must match signed-in user")

    updated_bike = BicycleLifecycleService.mark_as_auctionable_by_owner(
        bicycle=bicycle,
        actor=actor,
        notes=payload.notes,
        db=db,
    )
    db.commit()
    db.refresh(updated_bike)
    return updated_bike


@router.post("/{bicycle_id}/reclaim", response_model=BicycleRead)
def reclaim_bicycle(
    bicycle_id: int,
    payload: ReclaimRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner reclaims a reported bicycle within 15 days."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    actor = current_user
    if payload.actor_id != actor.id:
        raise HTTPException(403, "Actor must match signed-in user")

    updated_bike = BicycleLifecycleService.reclaim_bicycle(
        bicycle=bicycle,
        actor=actor,
        notes=payload.notes,
        db=db,
    )
    db.commit()
    db.refresh(updated_bike)
    return updated_bike


@router.post("/{bicycle_id}/surrender", response_model=BicycleRead)
def surrender_to_auction(
    bicycle_id: int,
    payload: ReclaimRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner surrenders an ASSET-state bicycle to AUCTIONABLE, skipping the remaining grace period."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    actor = current_user
    if payload.actor_id != actor.id:
        raise HTTPException(403, "Actor must match signed-in user")

    is_owner = (bicycle.owner_id == actor.id) or (bicycle.current_owner_id == actor.id)
    if not is_owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the registered owner can surrender their bicycle.")
    if bicycle.status != "asset":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Bicycle must be in ASSET state to surrender. Current: {bicycle.status}.")

    from app.models.bicycle import BicycleStatus, CycleState
    bicycle.status = BicycleStatus.AUCTIONABLE.value
    bicycle.current_state = CycleState.AUCTIONABLE
    bicycle.asset_tagged_at = None

    BicycleLifecycleService._record_event(
        bicycle=bicycle,
        from_state=CycleState.ASSET,
        to_state=CycleState.AUCTIONABLE,
        actor_id=actor.id,
        notes=payload.notes or "Owner surrendered for auction",
        db=db,
    )
    db.commit()
    db.refresh(bicycle)
    return bicycle


@router.post("/{bicycle_id}/promote-auctionable", response_model=BicycleRead)
def promote_auctionable(
    bicycle_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Promote after the owner's 15-day claim period."""
    bicycle = get_bicycle_or_404(bicycle_id, db)

    updated_bike = BicycleLifecycleService.promote_asset_to_auctionable(
        bicycle=bicycle,
        actor=actor,
        db=db,
    )
    db.commit()
    db.refresh(updated_bike)
    return updated_bike


@router.post("/cron/process-expired-assets", response_model=List[BicycleRead])
def process_expired_assets(db: Session = Depends(get_db), actor: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))):
    """Automated job endpoint: scans all ASSET cycles and transitions expired ones to AUCTIONABLE."""
    return BicycleLifecycleService.process_expired_assets(db)


@router.post("/{bicycle_id}/mark-sold", response_model=BicycleRead)
def mark_sold(
    bicycle_id: int,
    payload: MarkSoldRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Finalizes cycle state from AUCTIONABLE to SOLD and records sale analytics."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    actor = current_user

    updated_bike = BicycleLifecycleService.mark_as_sold(
        bicycle=bicycle,
        actor=actor,
        cycle_condition=payload.cycle_condition,
        market_value=payload.market_value,
        years_used=payload.years_used,
        base_price_set=payload.base_price_set,
        sold_price=payload.sold_price,
        notes=payload.notes,
        db=db,
    )
    db.commit()
    db.refresh(updated_bike)
    return updated_bike


@router.get("/{bicycle_id}/events", response_model=List[LifecycleEventRead])
def get_lifecycle_events(
    bicycle_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    """Retrieve full audit history / lifecycle events for a bicycle."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    if actor.role == UserRole.STUDENT and (bicycle.current_owner_id or bicycle.owner_id) != actor.id:
        raise HTTPException(403, "Only the owner or staff can view inspection evidence")
    stmt = (
        select(LifecycleEvent)
        .where(LifecycleEvent.bicycle_id == bicycle_id)
        .order_by(LifecycleEvent.created_at.asc())
    )
    return list(db.scalars(stmt).all())
