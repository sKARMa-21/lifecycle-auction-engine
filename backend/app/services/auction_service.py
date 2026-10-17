from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.auction import Auction, Bid, AuctionStatus
from app.schemas.auction import AuctionCreate, BidCreate


class AuctionService:
    @staticmethod
    def create_auction(db: Session, data: AuctionCreate) -> Auction:
        auction = Auction(
            bicycle_id=data.bicycle_id,
            title=data.title,
            description=data.description,
            starting_price=data.starting_price,
            current_highest_bid=data.starting_price,
            bid_increment=data.bid_increment,
            start_time=data.start_time,
            end_time=data.end_time,
            anti_snipe_trigger_window=data.anti_snipe_trigger_window,
            anti_snipe_extension_minutes=data.anti_snipe_extension_minutes,
            status=AuctionStatus.ACTIVE,
        )
        db.add(auction)
        db.commit()
        db.refresh(auction)
        return auction

    @staticmethod
    def place_bid(db: Session, auction_id: int, bid_in: BidCreate) -> Bid:
        # PESSIMISTIC LOCK: with_for_update prevents concurrent race conditions
        auction = (
            db.query(Auction)
            .filter(Auction.id == auction_id)
            .with_for_update()
            .first()
        )

        if not auction:
            raise HTTPException(status_code=404, detail="Auction not found")

        now = datetime.utcnow()

        if auction.status not in [AuctionStatus.ACTIVE, AuctionStatus.EXTENDED]:
            raise HTTPException(status_code=400, detail="Auction is closed or inactive")

        if now < auction.start_time:
            raise HTTPException(status_code=400, detail="Auction has not started yet")

        if now > auction.end_time:
            auction.status = AuctionStatus.ENDED
            db.commit()
            raise HTTPException(status_code=400, detail="Auction deadline has passed")

        # Validate minimum bid threshold
        min_required_bid = (
            auction.current_highest_bid + auction.bid_increment
            if auction.current_highest_bidder_id is not None
            else auction.starting_price
        )

        if bid_in.amount < min_required_bid:
            raise HTTPException(
                status_code=400,
                detail=f"Bid amount too low. Minimum acceptable bid is {min_required_bid}"
            )

        if auction.current_highest_bidder_id == bid_in.user_id:
            raise HTTPException(status_code=400, detail="You are already the highest bidder")

        # Create bid record
        new_bid = Bid(
            auction_id=auction.id,
            user_id=bid_in.user_id,
            amount=bid_in.amount,
            created_at=now,
        )
        db.add(new_bid)

        # Update auction state
        auction.current_highest_bid = bid_in.amount
        auction.current_highest_bidder_id = bid_in.user_id

        # Anti-sniping dynamic extension:
        time_left = auction.end_time - now
        threshold = timedelta(minutes=auction.anti_snipe_trigger_window)
        if time_left < threshold:
            auction.end_time = auction.end_time + timedelta(minutes=auction.anti_snipe_extension_minutes)
            auction.status = AuctionStatus.EXTENDED

        db.commit()
        db.refresh(new_bid)
        return new_bid

    @staticmethod
    def get_auction(db: Session, auction_id: int) -> Auction:
        auction = db.query(Auction).filter(Auction.id == auction_id).first()
        if not auction:
            raise HTTPException(status_code=404, detail="Auction not found")
        return auction

    @staticmethod
    def list_active_auctions(db: Session, skip: int = 0, limit: int = 50):
        return (
            db.query(Auction)
            .filter(Auction.status.in_([AuctionStatus.ACTIVE, AuctionStatus.EXTENDED]))
            .offset(skip)
            .limit(limit)
            .all()
        )