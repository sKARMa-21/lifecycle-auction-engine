from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.db.session import get_db  # Adjust to your get_db dependency
from app.schemas.auction import AuctionCreate, AuctionResponse, BidCreate, BidResponse
from app.services.auction_service import AuctionService

router = APIRouter(prefix="/auctions", tags=["Auctions"])


@router.post("/", response_model=AuctionResponse, status_code=status.HTTP_201_CREATED)
def create_auction(auction_in: AuctionCreate, db: Session = Depends(get_db)):
    return AuctionService.create_auction(db, auction_in)


@router.get("/", response_model=List[AuctionResponse])
def get_active_auctions(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return AuctionService.list_active_auctions(db, skip=skip, limit=limit)


@router.get("/{auction_id}", response_model=AuctionResponse)
def get_auction_details(auction_id: int, db: Session = Depends(get_db)):
    return AuctionService.get_auction(db, auction_id)


@router.post("/{auction_id}/bids", response_model=BidResponse, status_code=status.HTTP_201_CREATED)
def place_bid(auction_id: int, bid_in: BidCreate, db: Session = Depends(get_db)):
    return AuctionService.place_bid(db, auction_id, bid_in)