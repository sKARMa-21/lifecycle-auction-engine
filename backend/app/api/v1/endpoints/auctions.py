from typing import List, Optional
from datetime import datetime, timezone
from decimal import Decimal
from pydantic import BaseModel
from fastapi import APIRouter, Depends, status, HTTPException
from app.api.v1.deps import require_complete_profile, require_roles
from app.models.auction import Auction, AuctionParticipant, AuctionStatus
from app.models.bicycle import Bicycle
from app.models.user import User, UserRole
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.auction import AuctionCreate, AuctionResponse, AuctionUpdate, BidCreate, BidResponse, SettleResponse
from app.services.auction_service import AuctionService

router = APIRouter(prefix="/auctions", tags=["Auctions"])


@router.post("/", response_model=AuctionResponse, status_code=status.HTTP_201_CREATED)
def create_auction(auction_in: AuctionCreate, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))):
    if auction_in.created_by_id != user.id:
        raise HTTPException(403, "Creator must match the signed-in user")
    return AuctionService.create_auction(db, auction_in)


@router.patch("/{auction_id}", response_model=AuctionResponse)
def update_auction(auction_id: int, auction_in: AuctionUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN))):
    """Edit a scheduled auction before bidding opens (hostel admin or super admin)."""
    return AuctionService.update_auction(db, auction_id, auction_in, user)


@router.post("/{auction_id}/cancel", response_model=AuctionResponse)
def cancel_auction(auction_id: int, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(UserRole.SUPER_ADMIN))):
    """Cancel a scheduled or live auction (super admin); the bicycle returns to the auction pool."""
    return AuctionService.cancel_auction(db, auction_id, user)


@router.get("/", response_model=List[AuctionResponse])
def get_active_auctions(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return AuctionService.list_active_auctions(db, skip=skip, limit=limit)


@router.get("/{auction_id}", response_model=AuctionResponse)
def get_auction_details(auction_id: int, db: Session = Depends(get_db)):
    return AuctionService.get_auction(db, auction_id)


@router.post("/{auction_id}/bids", response_model=BidResponse, status_code=status.HTTP_201_CREATED)
def place_bid(auction_id: int, bid_in: BidCreate, db: Session = Depends(get_db), user: User = Depends(require_complete_profile)):
    auction = db.query(Auction).filter_by(id=auction_id).with_for_update().first()
    if not auction:
        raise HTTPException(404, "Auction not found")
    bicycle = db.get(Bicycle, auction.bicycle_id)
    if user.role != "student" or user.id in (auction.created_by_id, bicycle.owner_id, bicycle.current_owner_id):
        raise HTTPException(403, "The seller and staff cannot bid")
    if not db.get(AuctionParticipant, (auction_id, user.id)):
        raise HTTPException(403, "Join the auction before bidding")
    now = datetime.now(timezone.utc)
    if now < auction.starts_at or now >= auction.ends_at:
        raise HTTPException(400, "Bidding is available only between the start and deadline")
    expected = Decimal(str(auction.current_highest_bid)) + Decimal(str(auction.min_bid_increment)) if auction.current_winner_id else Decimal(str(auction.starting_price))
    if Decimal(str(bid_in.amount)) != expected:
        raise HTTPException(409, f"The next bid must be exactly ₹{expected}. Refresh and try again.")
    if auction.status == AuctionStatus.SCHEDULED:
        auction.status = AuctionStatus.ACTIVE
    return AuctionService.place_bid(db, auction_id, bid_in, bidder_id=user.id)


@router.get("/{auction_id}/participation")
def participation(auction_id: int, db: Session = Depends(get_db), user: User = Depends(require_complete_profile)):
    AuctionService.get_auction(db, auction_id)
    return {"joined": db.get(AuctionParticipant, (auction_id, user.id)) is not None,
            "count": db.query(AuctionParticipant).filter_by(auction_id=auction_id).count()}


@router.post("/{auction_id}/participants")
def join_auction(auction_id: int, db: Session = Depends(get_db), user: User = Depends(require_complete_profile)):
    auction = db.query(Auction).filter_by(id=auction_id).with_for_update().first()
    if not auction:
        raise HTTPException(404, "Auction not found")
    bicycle = db.get(Bicycle, auction.bicycle_id)
    if user.role != "student" or user.id in (auction.created_by_id, bicycle.owner_id, bicycle.current_owner_id):
        raise HTTPException(403, "Only students other than the seller can participate")
    if auction.status not in (AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE, AuctionStatus.EXTENDED) or datetime.now(timezone.utc) >= auction.ends_at:
        raise HTTPException(400, "This auction is closed")
    if db.get(AuctionParticipant, (auction_id, user.id)) is None:
        db.add(AuctionParticipant(auction_id=auction_id, user_id=user.id))
        db.commit()
    return participation(auction_id, db, user)


@router.post("/{auction_id}/settle", response_model=SettleResponse)
def settle_auction(
    auction_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Settle an ended auction on the winner's behalf (this hostel's admin or a super admin)."""
    return AuctionService.settle_auction(db, auction_id, admin)


@router.post("/cron/close-ended", response_model=List[AuctionResponse])
def close_ended_auctions(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)),
):
    """Cron endpoint: sweeps all live auctions past their end time and marks them ENDED (admin only)."""
    return AuctionService.close_ended_auctions(db)


class PaymentPayload(BaseModel):
    payment_method: str = "upi"
    transaction_ref: Optional[str] = "UPI-SIMULATED"


@router.post("/{auction_id}/pay", response_model=AuctionResponse)
def pay_auction(
    auction_id: int,
    payload: PaymentPayload = PaymentPayload(),
    db: Session = Depends(get_db),
    user: User = Depends(require_complete_profile),
):
    """Complete 8-minute UPI payment for a won auction."""
    return AuctionService.pay_auction(db, auction_id, user.id, payload.transaction_ref or "UPI-SIMULATED")


@router.post("/{auction_id}/decline-payment", response_model=AuctionResponse)
def decline_payment(
    auction_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_complete_profile),
):
    """Decline payment and pass the bicycle to the 2nd highest bidder."""
    return AuctionService.pass_to_runner_up(db, auction_id, declined_by_user_id=user.id)
