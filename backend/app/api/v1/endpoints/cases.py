from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, require_complete_profile, require_roles
from app.api.v1.endpoints.bicycles import admin_only, get_bicycle_or_404, has_open_auction, owner_of
from app.db.session import get_db
from app.models.case import AuctionRequest, Notification
from app.models.user import User, UserRole
from app.schemas.lifecycle import AuctionRequestCreate, AuctionRequestRead, NoteRequest, NotificationRead
from app.services.hostel import bike_hostel, can_manage
from app.services.lifecycle_service import BicycleLifecycleService as Lifecycle, utcnow
from app.services.notifications import notify, notify_admins

router = APIRouter(tags=["Auction Requests & Notifications"], dependencies=[Depends(require_complete_profile)])
student_only = Depends(require_roles(UserRole.STUDENT))


def _lock_request(request_id: int, db: Session) -> AuctionRequest:
    request = db.scalar(select(AuctionRequest).where(AuctionRequest.id == request_id).with_for_update())
    if not request:
        raise HTTPException(404, "Auction request not found.")
    return request


@router.post("/auction-requests", response_model=AuctionRequestRead, status_code=201)
def create_auction_request(payload: AuctionRequestCreate, db: Session = Depends(get_db), user: User = student_only):
    """The owning student asks their hostel admin to auction an active bicycle."""
    bicycle = get_bicycle_or_404(payload.bicycle_id, db)
    if owner_of(bicycle) != user.id or bicycle.status != "active":
        raise HTTPException(400, "You can request an auction only for your own bicycle while it is in use.")
    if db.scalar(select(AuctionRequest.id).where(AuctionRequest.bicycle_id == bicycle.id, AuctionRequest.status == "pending")):
        raise HTTPException(409, "An auction request for this bicycle is already pending.")
    request = AuctionRequest(bicycle_id=bicycle.id, student_id=user.id, hostel_id=bike_hostel(db, bicycle), note=payload.note)
    db.add(request)
    notify_admins(db, request.hostel_id, f"{user.full_name} asked to auction bicycle {bicycle.asset_tag}.", bicycle.id)
    db.commit()
    return request


@router.get("/auction-requests", response_model=List[AuctionRequestRead])
def list_auction_requests(status: Optional[str] = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Students see their own requests; hostel admins see their hostel's; super admins see all."""
    if user.role == UserRole.GUARD:
        raise HTTPException(403, "Guards cannot view auction requests.")
    query = select(AuctionRequest).order_by(AuctionRequest.id.desc())
    if status:
        query = query.where(AuctionRequest.status == status)
    if user.role == UserRole.STUDENT:
        return list(db.scalars(query.where(AuctionRequest.student_id == user.id)))
    return [r for r in db.scalars(query) if can_manage(user, r.hostel_id)]


@router.post("/auction-requests/{request_id}/withdraw", response_model=AuctionRequestRead)
def withdraw_auction_request(request_id: int, db: Session = Depends(get_db), user: User = student_only):
    """The student cancels a pending request, or takes back an approved bicycle not yet in an auction."""
    request = _lock_request(request_id, db)
    if request.student_id != user.id:
        raise HTTPException(404, "Auction request not found.")
    bicycle = get_bicycle_or_404(request.bicycle_id, db)
    if request.status == "approved":
        if bicycle.status != "auctionable" or has_open_auction(bicycle, db):
            raise HTTPException(409, "This bicycle is already in a scheduled or live auction and cannot be taken back.")
        Lifecycle.return_to_owner(bicycle, user, db=db)
    elif request.status != "pending":
        raise HTTPException(409, f"This request was already {request.status}.")
    request.status = "withdrawn"
    notify_admins(db, request.hostel_id, f"{user.full_name} withdrew the auction request for bicycle {bicycle.asset_tag}.", bicycle.id)
    db.commit()
    return request


@router.post("/auction-requests/{request_id}/{decision}", response_model=AuctionRequestRead)
def review_auction_request(request_id: int, decision: Literal["approve", "reject"], payload: NoteRequest,
                           db: Session = Depends(get_db), user: User = admin_only):
    """Approval moves the bicycle into the auction pool; it never launches an auction."""
    request = _lock_request(request_id, db)
    if not can_manage(user, request.hostel_id):
        raise HTTPException(403, "You can only review requests from your own hostel.")
    if request.status != "pending":
        raise HTTPException(409, f"This request was already {request.status}.")
    bicycle, approve = get_bicycle_or_404(request.bicycle_id, db), decision == "approve"
    if approve:
        Lifecycle.approve_for_auction(bicycle, user, notes=payload.note, db=db)
    request.status = "approved" if approve else "rejected"
    request.note, request.reviewed_by_id, request.reviewed_at = payload.note, user.id, utcnow()
    outcome = "approved; it is now in the auction pool" if approve else "rejected" + (f": {payload.note}" if payload.note else "")
    notify(db, [request.student_id], f"Your auction request for bicycle {bicycle.asset_tag} was {outcome}.", bicycle.id)
    db.commit()
    return request


@router.get("/notifications", response_model=List[NotificationRead])
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return list(db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.id.desc())))


@router.post("/notifications/{notification_id}/read", response_model=NotificationRead)
def mark_notification_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise HTTPException(404, "Notification not found.")
    notification.is_read = True
    db.commit()
    return notification
