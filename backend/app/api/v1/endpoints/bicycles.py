from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.auction import Auction, AuctionStatus
from app.models.bicycle import Bicycle, CycleState
from app.models.case import AuctionRequest
from app.models.lifecycle import LifecycleEvent
from app.models.user import User, UserRole
from app.schemas.bicycle import BicycleCreate, BicyclePublic, BicycleRead, BicycleUpdate, TransferOwnershipRequest
from app.schemas.lifecycle import LifecycleEventRead, MarkSoldRequest, ReclaimRequest, TagAssetRequest
from app.services import lifecycle_service
from app.services.hostel import bike_hostel, can_manage
from app.services.lifecycle_service import BicycleLifecycleService as Lifecycle
from app.api.v1.deps import get_current_user, require_complete_profile, require_roles

router = APIRouter(prefix="/bicycles", tags=["Bicycle Lifecycle"], dependencies=[Depends(require_complete_profile)])
ADMINS = (UserRole.ADMIN, UserRole.SUPER_ADMIN)
STAFF = (UserRole.GUARD, *ADMINS)
OPEN_AUCTION = (AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE, AuctionStatus.EXTENDED)
BicycleOut = Union[BicycleRead, BicyclePublic]
admin_only = Depends(require_roles(*ADMINS))


def get_bicycle_or_404(bicycle_id: int, db: Session) -> Bicycle:
    bicycle = db.scalar(select(Bicycle).where(Bicycle.id == bicycle_id).with_for_update())
    if not bicycle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Bicycle with ID {bicycle_id} not found.")
    return bicycle


def ensure_student(user_id: Optional[int], db: Session) -> None:
    if user_id is None:
        return
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"User with ID {user_id} not found.")
    if user.role != UserRole.STUDENT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Only students can own bicycles. '{user.full_name}' is a '{user.role.value}'.")


def owner_of(bicycle: Bicycle) -> Optional[int]:
    return bicycle.current_owner_id or bicycle.owner_id


def ensure_manager(bicycle: Bicycle, user: User, db: Session) -> None:
    if not can_manage(user, bike_hostel(db, bicycle)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only manage bicycles from your own hostel.")


def has_open_auction(bicycle: Bicycle, db: Session) -> bool:
    return db.scalar(select(Auction.id).where(Auction.bicycle_id == bicycle.id, Auction.status.in_(OPEN_AUCTION))) is not None


def present(bicycle: Bicycle, user: User, db: Session) -> BicycleOut:
    """Admins get the full record; students and guards get only their allowed actions and a message."""
    state, deadline = bicycle.status, bicycle.claim_deadline
    claim_open = state == "asset" and deadline is not None and lifecycle_service.utcnow() < deadline
    actions: List[str] = []
    if user.role in ADMINS:
        if can_manage(user, bike_hostel(db, bicycle)):
            sale = [] if has_open_auction(bicycle, db) else ["launch_auction"]
            actions = {"active": ["tag_asset", "edit"], "asset": ["reclaim", "promote"], "auctionable": sale}.get(state, [])
        return BicycleRead.model_validate(bicycle).model_copy(update={"actions": actions})
    message = None
    if state == "asset" and deadline:
        message = f"Impounded. Claim deadline: {deadline:%d %b %Y %H:%M} UTC." if claim_open else "Impounded. The claim period has ended."
    elif state == "auctionable":
        message = "In the campus auction pool."
    is_owner = user.role == UserRole.STUDENT and owner_of(bicycle) == user.id
    if user.role == UserRole.GUARD and state == "active":
        actions = ["tag_asset"]
    elif is_owner:
        request = db.scalar(select(AuctionRequest).where(AuctionRequest.bicycle_id == bicycle.id).order_by(AuctionRequest.id.desc()).limit(1))
        pending = request is not None and request.status == "pending"
        actions = ["claim"] if claim_open else ["request_auction"] if state == "active" and not pending else []
        if state == "active" and pending:
            message = "Your auction request is waiting for your hostel admin."
        elif state == "active" and request is not None and request.status == "rejected":
            message = "Your auction request was rejected" + (f": {request.note}" if request.note else ".")
    return BicyclePublic.model_validate(bicycle).model_copy(
        update={"actions": actions, "message": message, "qr_token": bicycle.qr_token if is_owner else None})


@router.post("/", response_model=BicycleOut, status_code=status.HTTP_201_CREATED)
def create_bicycle(payload: BicycleCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == UserRole.STUDENT:
        raise HTTPException(403, "Submit a bicycle registration request for approval.")
    if db.scalar(select(Bicycle).where(Bicycle.asset_tag == payload.asset_tag)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Bicycle with asset tag '{payload.asset_tag}' already exists.")
    ensure_student(payload.owner_id, db)
    bicycle = Bicycle(**payload.model_dump(), current_owner_id=payload.owner_id)
    db.add(bicycle)
    db.commit()
    db.refresh(bicycle)
    return present(bicycle, current_user, db)


@router.get("/", response_model=List[BicycleOut])
def list_bicycles(skip: int = 0, limit: int = 100, owner_id: Optional[int] = None,
                  current_user: User = Depends(get_current_user), db: Session = Depends(get_db), managed: bool = False):
    """List bicycles, with optional hostel scope for admins. Guards use lookup."""
    if current_user.role == UserRole.GUARD:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Guards find bicycles with the lookup.")
    if current_user.role == UserRole.STUDENT:
        owner_id = current_user.id
    query = select(Bicycle)
    if managed and current_user.role == UserRole.ADMIN:
        if current_user.hostel_id is None:
            return []
        # Match bike_hostel: the case takes precedence over the current or original owner.
        query = query.outerjoin(User, User.id == func.coalesce(Bicycle.current_owner_id, Bicycle.owner_id))
        query = query.where(func.coalesce(Bicycle.case_hostel_id, User.hostel_id) == current_user.hostel_id)
    if owner_id is not None:
        query = query.where((Bicycle.owner_id == owner_id) | (Bicycle.current_owner_id == owner_id))
    return [present(b, current_user, db) for b in db.scalars(query.offset(skip).limit(limit).order_by(Bicycle.id.desc()))]


@router.get("/scan/lookup", response_model=BicycleOut)
def lookup_bicycle(token: str, db: Session = Depends(get_db), actor: User = Depends(require_roles(*STAFF))):
    """Read-only lookup by QR token, asset tag or chassis/serial number."""
    token = token.strip()
    bicycle = db.scalar(select(Bicycle).where(
        (Bicycle.asset_tag == token) | (Bicycle.qr_token == token.upper()) | (Bicycle.serial_number == token)))
    if not bicycle:
        raise HTTPException(404, "No bicycle matches that QR token, asset tag or serial number")
    return present(bicycle, actor, db)


@router.get("/{bicycle_id}", response_model=BicycleOut)
def get_bicycle(bicycle_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve details and lifecycle state of a bicycle."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    if (current_user.role == UserRole.STUDENT and current_user.id not in (bicycle.owner_id, bicycle.current_owner_id)
            and bicycle.status not in ("auctionable", "sold")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied: You do not own this bicycle.")
    return present(bicycle, current_user, db)


def _save(bicycle: Bicycle, user: User, db: Session, **fields) -> BicycleOut:
    for field, value in fields.items():
        setattr(bicycle, field, value)
    db.commit()
    db.refresh(bicycle)
    return present(bicycle, user, db)


@router.put("/{bicycle_id}", response_model=BicycleOut)
def update_bicycle(bicycle_id: int, payload: BicycleUpdate, current_user: User = admin_only, db: Session = Depends(get_db)):
    """Update details of a bicycle (the responsible hostel's admin or a super admin)."""
    bicycle, data = get_bicycle_or_404(bicycle_id, db), payload.model_dump(exclude_unset=True)
    ensure_manager(bicycle, current_user, db)
    if data.get("owner_id") is not None:
        ensure_student(data["owner_id"], db)
        data["current_owner_id"] = data["owner_id"]
    return _save(bicycle, current_user, db, **data)


@router.patch("/{bicycle_id}/transfer", response_model=BicycleOut)
def transfer_bicycle_ownership(bicycle_id: int, payload: TransferOwnershipRequest, current_user: User = admin_only,
                               db: Session = Depends(get_db)):
    """Transfer ownership of a bicycle (the responsible hostel's admin or a super admin)."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    ensure_manager(bicycle, current_user, db)
    ensure_student(payload.new_owner_id, db)
    prev_owner_id = bicycle.current_owner_id or bicycle.owner_id
    prev_user = db.get(User, prev_owner_id) if prev_owner_id else None
    new_user = db.get(User, payload.new_owner_id) if payload.new_owner_id else None
    from_name = prev_user.full_name if prev_user else (f"User #{prev_owner_id}" if prev_owner_id else "Unassigned / Pool")
    to_name = new_user.full_name if new_user else (f"User #{payload.new_owner_id}" if payload.new_owner_id else "Unassigned")
    record = LifecycleEvent(
        bicycle_id=bicycle.id,
        actor_id=current_user.id,
        from_state=bicycle.current_state or CycleState.ACTIVE,
        to_state=bicycle.current_state or CycleState.ACTIVE,
        notes=f"Ownership transferred from {from_name} to {to_name} by Admin {current_user.full_name or current_user.email}.",
    )
    db.add(record)
    return _save(bicycle, current_user, db, owner_id=payload.new_owner_id, current_owner_id=payload.new_owner_id)


@router.delete("/{bicycle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bicycle(bicycle_id: int, current_user: User = admin_only, db: Session = Depends(get_db)):
    """Delete a bicycle from the system (the responsible hostel's admin or a super admin)."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    ensure_manager(bicycle, current_user, db)
    db.delete(bicycle)
    db.commit()


def _transition(bicycle_id: int, db: Session, actor: User, payload_actor_id: Optional[int], action, **kwargs) -> BicycleOut:
    """Lock the bicycle, verify the payload actor is the signed-in user, apply the transition, commit."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    if payload_actor_id is not None and payload_actor_id != actor.id:
        raise HTTPException(403, "Actor must match signed-in user")
    action(bicycle=bicycle, actor=actor, db=db, **kwargs)
    db.commit()
    db.refresh(bicycle)
    return present(bicycle, actor, db)


@router.post("/{bicycle_id}/tag-asset", response_model=BicycleOut)
def tag_as_asset(bicycle_id: int, payload: TagAssetRequest, db: Session = Depends(get_db), user: User = Depends(require_roles(*STAFF))):
    """Accepted scan: guard/admin records neglect and begins the owner's 15-day claim period."""
    return _transition(bicycle_id, db, user, payload.actor_id, Lifecycle.tag_as_asset, **payload.model_dump(exclude={"actor_id"}))


@router.post("/{bicycle_id}/reclaim", response_model=BicycleOut)
def reclaim_bicycle(bicycle_id: int, payload: ReclaimRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Owner claims an impounded bicycle while now < claim_deadline."""
    return _transition(bicycle_id, db, user, payload.actor_id, Lifecycle.reclaim_bicycle, notes=payload.notes)


@router.post("/{bicycle_id}/promote-auctionable", response_model=BicycleOut)
def promote_auctionable(bicycle_id: int, db: Session = Depends(get_db), user: User = admin_only):
    """Admin promotes an ASSET after the owner's 15-day claim period."""
    return _transition(bicycle_id, db, user, None, Lifecycle.promote_asset_to_auctionable)


@router.post("/cron/process-expired-assets", response_model=List[BicycleOut])
def process_expired_assets(db: Session = Depends(get_db), user: User = admin_only):
    """Manual trigger for the expiry job (it also runs every 60s in app/workers/asset_expiry.py)."""
    return [present(b, user, db) for b in Lifecycle.process_expired_assets(db)]


@router.post("/{bicycle_id}/mark-sold", response_model=BicycleOut)
def mark_sold(bicycle_id: int, payload: MarkSoldRequest, db: Session = Depends(get_db), user: User = admin_only):
    """Admin finalizes AUCTIONABLE -> SOLD and records sale analytics."""
    ensure_manager(get_bicycle_or_404(bicycle_id, db), user, db)
    return _transition(bicycle_id, db, user, None, Lifecycle.mark_as_sold, **payload.model_dump(exclude={"actor_id"}))


@router.get("/{bicycle_id}/events", response_model=List[LifecycleEventRead])
def get_lifecycle_events(bicycle_id: int, db: Session = Depends(get_db), user: User = admin_only):
    """Internal audit history of a bicycle (admins only)."""
    bicycle = get_bicycle_or_404(bicycle_id, db)
    ensure_manager(bicycle, user, db)
    events = list(db.scalars(select(LifecycleEvent).where(LifecycleEvent.bicycle_id == bicycle_id).order_by(LifecycleEvent.created_at.desc())))
    result = []
    for ev in events:
        actor = db.get(User, ev.actor_id) if ev.actor_id else None
        item = LifecycleEventRead(
            id=ev.id,
            bicycle_id=ev.bicycle_id,
            actor_id=ev.actor_id,
            actor_name=actor.full_name or actor.email if actor else "System",
            from_state=ev.from_state.value if hasattr(ev.from_state, 'value') else str(ev.from_state),
            to_state=ev.to_state.value if hasattr(ev.to_state, 'value') else str(ev.to_state),
            location=ev.location,
            notes=ev.notes,
            proof_image_url=ev.proof_image_url,
            created_at=ev.created_at,
        )
        result.append(item)
    return result
