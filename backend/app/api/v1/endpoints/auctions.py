from typing import List
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, status, HTTPException
from app.api.v1.deps import get_current_user
from app.models.auction import Auction, AuctionParticipant, AuctionStatus
from app.models.bicycle import Bicycle
from app.models.user import User
from sqlalchemy.orm import Session
from app.db.session import get_db  # Adjust to your get_db dependency
from app.schemas.auction import AuctionCreate, AuctionResponse, BidCreate, BidResponse
from app.services.auction_service import AuctionService

router = APIRouter(prefix="/auctions", tags=["Auctions"])


@router.post("/", response_model=AuctionResponse, status_code=status.HTTP_201_CREATED)
def create_auction(auction_in: AuctionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if auction_in.created_by_id != user.id:
        raise HTTPException(403, "Creator must match the signed-in user")
    return AuctionService.create_auction(db, auction_in)


@router.get("/", response_model=List[AuctionResponse])
def get_active_auctions(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return AuctionService.list_active_auctions(db, skip=skip, limit=limit)


@router.get("/{auction_id}", response_model=AuctionResponse)
def get_auction_details(auction_id: int, db: Session = Depends(get_db)):
    return AuctionService.get_auction(db, auction_id)


@router.post("/{auction_id}/bids", response_model=BidResponse, status_code=status.HTTP_201_CREATED)
def place_bid(auction_id: int, bid_in: BidCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Same transaction and lock as the existing engine; do not replace its algorithm.
    auction = db.query(Auction).filter_by(id=auction_id).with_for_update().first()
    if not auction:
        raise HTTPException(404, "Auction not found")
    bicycle = db.get(Bicycle, auction.bicycle_id)
    if user.role != "student" or user.id in (auction.created_by_id, bicycle.owner_id, bicycle.current_owner_id):
        raise HTTPException(403, "The seller and staff cannot bid")
    if bid_in.bidder_id != user.id or not db.get(AuctionParticipant, (auction_id, user.id)):
        raise HTTPException(403, "Join the auction before bidding")
    now = datetime.now(timezone.utc)
    if now < auction.starts_at or now >= auction.ends_at:
        raise HTTPException(400, "Bidding is available only between the start and deadline")
    expected = Decimal(str(auction.current_highest_bid)) + Decimal(str(auction.min_bid_increment)) if auction.current_winner_id else Decimal(str(auction.starting_price))
    if Decimal(str(bid_in.amount)) != expected:
        raise HTTPException(409, f"The next bid must be exactly ₹{expected}. Refresh and try again.")
    if auction.status == AuctionStatus.SCHEDULED:
        auction.status = AuctionStatus.ACTIVE
    return AuctionService.place_bid(db, auction_id, bid_in)


@router.get("/{auction_id}/participation")
def participation(auction_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    AuctionService.get_auction(db, auction_id)
    return {"joined": db.get(AuctionParticipant, (auction_id, user.id)) is not None,
            "count": db.query(AuctionParticipant).filter_by(auction_id=auction_id).count()}


@router.post("/{auction_id}/participants")
def join_auction(auction_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
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
