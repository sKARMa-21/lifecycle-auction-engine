from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.auction import Auction, Bid, AuctionStatus, BidStatus
from app.models.user import User


async def place_bid_atomic(
    db: AsyncSession,
    auction_id: int,
    bidder_id: int,
    bid_amount: Decimal
) -> Bid:
    """Places a bid safely under high concurrency with anti-sniping and row locking."""
    
    # 1. Lock auction row to block simultaneous concurrent bids on the same auction
    stmt = select(Auction).where(Auction.id == auction_id).with_for_update()
    result = await db.execute(stmt)
    auction = result.scalar_one_or_none()

    if not auction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auction not found")

    now = datetime.now(timezone.utc)

    # 2. Check auction state and timer expiry
    if auction.status not in (AuctionStatus.ACTIVE, AuctionStatus.EXTENDED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Auction is not active")
    
    if now >= auction.ends_at:
        auction.status = AuctionStatus.ENDED
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Auction has ended")

    # 3. Prevent self-bidding
    if auction.current_winner_id == bidder_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You are already the highest bidder")

    # 4. Enforce fixed increment check algorithm
    min_required = Decimal(str(auction.current_highest_bid)) + Decimal(str(auction.min_bid_increment))
    if bid_amount < min_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bid amount must be at least {min_required} (Current: {auction.current_highest_bid} + Min Increment: {auction.min_bid_increment})"
        )

    # 5. Anti-sniping logic: extend timer if bid placed in last 180 seconds (3 minutes)
    time_remaining = (auction.ends_at - now).total_seconds()
    if time_remaining <= 180:
        auction.ends_at = auction.ends_at + timedelta(seconds=180)
        auction.extension_count += 1
        auction.status = AuctionStatus.EXTENDED

    # 6. Mark previous highest bids as outbid
    outbid_stmt = select(Bid).where(Bid.auction_id == auction_id, Bid.status == BidStatus.WINNING)
    outbid_res = await db.execute(outbid_stmt)
    previous_winning_bid = outbid_res.scalar_one_or_none()
    if previous_winning_bid:
        previous_winning_bid.status = BidStatus.OUTBID

    # 7. Create new winning bid record
    new_bid = Bid(
        auction_id=auction_id,
        bidder_id=bidder_id,
        amount=bid_amount,
        status=BidStatus.WINNING,
        placed_at=now
    )
    db.add(new_bid)

    # 8. Update auction aggregate state
    auction.current_highest_bid = bid_amount
    auction.current_winner_id = bidder_id
    
    await db.commit()
    await db.refresh(new_bid)
    
    return new_bid


def place_bid_atomic_sync(
    db: Session,
    auction_id: int,
    bidder_id: int,
    bid_amount: Decimal
) -> Bid:
    """Synchronous version of atomic bidding using Session with SELECT FOR UPDATE."""
    stmt = select(Auction).where(Auction.id == auction_id).with_for_update()
    auction = db.execute(stmt).scalar_one_or_none()

    if not auction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auction not found")

    now = datetime.now(timezone.utc)

    if auction.status not in (AuctionStatus.ACTIVE, AuctionStatus.EXTENDED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Auction is not active")
    
    if now >= auction.ends_at:
        auction.status = AuctionStatus.ENDED
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Auction has ended")

    if auction.current_winner_id == bidder_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You are already the highest bidder")

    min_required = Decimal(str(auction.current_highest_bid)) + Decimal(str(auction.min_bid_increment))
    if bid_amount < min_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bid amount must be at least {min_required} (Current: {auction.current_highest_bid} + Min Increment: {auction.min_bid_increment})"
        )

    time_remaining = (auction.ends_at - now).total_seconds()
    if time_remaining <= 180:
        auction.ends_at = auction.ends_at + timedelta(seconds=180)
        auction.extension_count += 1
        auction.status = AuctionStatus.EXTENDED

    outbid_stmt = select(Bid).where(Bid.auction_id == auction_id, Bid.status == BidStatus.WINNING)
    previous_winning_bid = db.execute(outbid_stmt).scalar_one_or_none()
    if previous_winning_bid:
        previous_winning_bid.status = BidStatus.OUTBID

    new_bid = Bid(
        auction_id=auction_id,
        bidder_id=bidder_id,
        amount=bid_amount,
        status=BidStatus.WINNING,
        placed_at=now
    )
    db.add(new_bid)

    auction.current_highest_bid = bid_amount
    auction.current_winner_id = bidder_id
    
    db.commit()
    db.refresh(new_bid)
    
    return new_bid
