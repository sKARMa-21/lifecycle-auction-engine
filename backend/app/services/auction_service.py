from datetime import datetime, timedelta, timezone
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.auction import Auction, AuctionParticipant, Bid, AuctionStatus
from app.models.bicycle import Bicycle, CycleState
from app.models.user import User, UserRole
from app.schemas.auction import AuctionCreate, AuctionUpdate, BidCreate
from app.services.hostel import bike_hostel, can_manage
from app.services.lifecycle_service import BicycleLifecycleService
from app.services.notifications import notify
from app.core.redis import publish_auction_event


OPEN = (AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE, AuctionStatus.EXTENDED)


def _window(starts_at: datetime, ends_at: datetime) -> tuple:
    """Return the auction window in UTC, rejecting a past start or an end before the start."""
    starts_at, ends_at = (d if d.tzinfo else d.replace(tzinfo=timezone.utc) for d in (starts_at, ends_at))
    if starts_at < datetime.now(timezone.utc) or ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="Choose a future start time and an end time after it.")
    return starts_at, ends_at


class AuctionService:
    @staticmethod
    def create_auction(db: Session, data: AuctionCreate) -> Auction:
        bicycle = db.query(Bicycle).filter(Bicycle.id == data.bicycle_id).with_for_update().first()
        if not bicycle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Bicycle with ID {data.bicycle_id} not found.")
        creator = db.get(User, data.created_by_id)
        if not creator:
            raise HTTPException(status_code=404, detail="User not found")
        if bicycle.status != CycleState.AUCTIONABLE.value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=(
                f"Cannot launch auction: Bicycle #{bicycle.id} is currently in '{bicycle.status}' state. "
                f"Only bicycles in '{CycleState.AUCTIONABLE.value}' state can be put up for auction."))
        if not can_manage(creator, bike_hostel(db, bicycle)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only this hostel's admin or a super admin can launch an auction for this bicycle.")
        existing = db.query(Auction).filter(Auction.bicycle_id == bicycle.id, Auction.status.in_(OPEN)).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"An active auction (#{existing.id}) already exists for bicycle #{bicycle.id}.")
        starts_at, ends_at = _window(data.starts_at, data.ends_at)
        auction = Auction(**data.model_dump(exclude={"starts_at", "ends_at"}), current_highest_bid=data.starting_price,
                          starts_at=starts_at, ends_at=ends_at, status=AuctionStatus.SCHEDULED)
        db.add(auction)
        db.commit()
        db.refresh(auction)
        return auction

    @staticmethod
    def _lock_managed_auction(db: Session, auction_id: int, actor: User) -> Auction:
        auction = db.query(Auction).filter(Auction.id == auction_id).with_for_update().first()
        if not auction:
            raise HTTPException(status_code=404, detail="Auction not found")
        if not can_manage(actor, bike_hostel(db, db.get(Bicycle, auction.bicycle_id))):
            raise HTTPException(status_code=403, detail="Only this hostel's admin or a super admin can manage this auction.")
        return auction

    @staticmethod
    def update_auction(db: Session, auction_id: int, data: AuctionUpdate, actor: User) -> Auction:
        """Edit a scheduled auction before bidding opens (so it has no bids yet)."""
        auction = AuctionService._lock_managed_auction(db, auction_id, actor)
        if auction.status != AuctionStatus.SCHEDULED or auction.starts_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Only scheduled auctions that have not started can be edited.")
        changes = data.model_dump(exclude_unset=True, exclude_none=True)
        changes["starts_at"], changes["ends_at"] = _window(changes.get("starts_at", auction.starts_at), changes.get("ends_at", auction.ends_at))
        if "starting_price" in changes:
            changes["current_highest_bid"] = changes["starting_price"]
        for field, value in changes.items():
            setattr(auction, field, value)
        db.commit()
        db.refresh(auction)
        return auction

    @staticmethod
    def cancel_auction(db: Session, auction_id: int, actor: User) -> Auction:
        """Super admin cancels a scheduled or live auction; the bicycle stays in the auction pool."""
        auction = AuctionService._lock_managed_auction(db, auction_id, actor)
        if auction.status not in OPEN:
            raise HTTPException(status_code=400, detail=f"Only scheduled or live auctions can be cancelled (this one is {auction.status.value}).")
        auction.status = AuctionStatus.CANCELLED
        people = [b.bidder_id for b in db.query(Bid).filter(Bid.auction_id == auction.id)]
        people += [p.user_id for p in db.query(AuctionParticipant).filter(AuctionParticipant.auction_id == auction.id)]
        notify(db, people, f"The auction \"{auction.title}\" was cancelled by an administrator.", auction.bicycle_id)
        db.commit()
        db.refresh(auction)
        return auction

    @staticmethod
    def place_bid(db: Session, auction_id: int, bid_in: BidCreate, *, bidder_id: int) -> Bid:
        auction = (
            db.query(Auction)
            .filter(Auction.id == auction_id)
            .with_for_update()
            .first()
        )

        if not auction:
            raise HTTPException(status_code=404, detail="Auction not found")

        now = datetime.now(timezone.utc)

        if auction.status not in [AuctionStatus.ACTIVE, AuctionStatus.EXTENDED]:
            raise HTTPException(status_code=400, detail="Auction is closed or inactive")

        ends_at = auction.ends_at
        if ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)

        if now > ends_at:
            auction.status = AuctionStatus.ENDED
            db.commit()
            raise HTTPException(status_code=400, detail="Auction deadline has passed")

        min_required_bid = (
            auction.current_highest_bid + auction.min_bid_increment
            if auction.current_winner_id is not None
            else auction.starting_price
        )

        if bid_in.amount < min_required_bid:
            raise HTTPException(
                status_code=400,
                detail=f"Bid amount too low. Minimum acceptable bid is {min_required_bid}"
            )

        bidder = db.get(User, bidder_id)
        if not bidder:
            raise HTTPException(status_code=404, detail="Bidder not found")
        if bidder.role not in (UserRole.STUDENT, "student"):
            raise HTTPException(
                status_code=400,
                detail=f"Only students are eligible to participate and place bids in cycle auctions. User with role '{bidder.role}' cannot bid.",
            )

        if auction.current_winner_id == bidder_id:
            raise HTTPException(status_code=400, detail="You are already the highest bidder")

        if auction.current_winner_id is not None:
            prev_winning = (
                db.query(Bid)
                .filter(
                    Bid.auction_id == auction_id,
                    Bid.bidder_id == auction.current_winner_id,
                    Bid.status == "winning",
                )
                .order_by(Bid.placed_at.desc())
                .first()
            )
            if prev_winning:
                prev_winning.status = "outbid"

        new_bid = Bid(
            auction_id=auction.id,
            bidder_id=bidder_id,
            amount=bid_in.amount,
            placed_at=now,
            status="winning",
        )
        db.add(new_bid)

        auction.current_highest_bid = bid_in.amount
        auction.current_winner_id = bidder_id

        is_extended = False
        time_left = ends_at - now
        threshold = timedelta(minutes=auction.anti_snipe_trigger_window)
        if time_left < threshold:
            auction.ends_at = ends_at + timedelta(minutes=auction.anti_snipe_extension_minutes)
            auction.extension_count = (auction.extension_count or 0) + 1
            auction.status = AuctionStatus.EXTENDED
            is_extended = True

        db.commit()
        db.refresh(new_bid)

        publish_auction_event(
            auction.id,
            {
                "type": "NEW_BID",
                "bidder_id": new_bid.bidder_id,
                "amount": float(new_bid.amount),
                "ends_at": auction.ends_at.isoformat(),
                "extended": is_extended,
            },
        )

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
            .filter(Auction.status.in_([AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE, AuctionStatus.EXTENDED]))
            .offset(skip)
            .limit(limit)
            .all()
        )

    @staticmethod
    def settle_auction(db: Session, auction_id: int) -> Auction:
        """Settle an ended auction.

        - If there is a winner: transitions bicycle AUCTIONABLE -> SOLD,
          transfers ownership to the winning bidder, marks winning bid as
          'winning' and all other bids as 'outbid', sets payment deadline.
        - If no bids were placed: marks the auction CANCELLED and leaves the
          bicycle in AUCTIONABLE state so it can be re-listed.
        """
        auction = (
            db.query(Auction)
            .filter(Auction.id == auction_id)
            .with_for_update()
            .first()
        )
        if not auction:
            raise HTTPException(status_code=404, detail="Auction not found")

        if auction.status == AuctionStatus.SETTLED:
            raise HTTPException(status_code=400, detail="Auction is already settled")

        if auction.status == AuctionStatus.CANCELLED:
            raise HTTPException(status_code=400, detail="Auction is already cancelled")

        now = datetime.now(timezone.utc)
        ends_at = auction.ends_at
        if ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)

        if ends_at > now and auction.status in (
            AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE, AuctionStatus.EXTENDED
        ):
            raise HTTPException(
                status_code=400,
                detail=f"Auction is still live and ends at {auction.ends_at.isoformat()}.",
            )

        bicycle = db.get(Bicycle, auction.bicycle_id)
        if not bicycle:
            raise HTTPException(status_code=404, detail="Associated bicycle not found")

        if auction.current_winner_id is None:
            auction.status = AuctionStatus.CANCELLED
            db.commit()
            db.refresh(auction)
            return auction

        all_bids: List[Bid] = (
            db.query(Bid)
            .filter(Bid.auction_id == auction_id)
            .order_by(Bid.amount.desc())
            .all()
        )
        seen_winner = False
        for bid in all_bids:
            if bid.bidder_id == auction.current_winner_id and not seen_winner:
                bid.status = "winning"
                seen_winner = True
            else:
                bid.status = "outbid"

        BicycleLifecycleService.mark_as_sold(
            bicycle=bicycle,
            sold_price=auction.current_highest_bid,
            notes=f"Sold via auction #{auction.id}. Winner: user #{auction.current_winner_id}",
            db=db,
        )

        bicycle.owner_id = auction.current_winner_id
        bicycle.current_owner_id = auction.current_winner_id

        auction.payment_deadline = now + timedelta(hours=48)
        auction.status = AuctionStatus.SETTLED

        db.commit()
        db.refresh(auction)
        return auction

    @staticmethod
    def close_ended_auctions(db: Session) -> List[Auction]:
        """Cron sweep: finds all SCHEDULED/ACTIVE/EXTENDED auctions past their end time
        and marks them ENDED so they are ready to be settled.
        """
        now = datetime.now(timezone.utc)
        expired = (
            db.query(Auction)
            .filter(
                Auction.status.in_([AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE, AuctionStatus.EXTENDED]),
                Auction.ends_at <= now,
            )
            .all()
        )
        for auction in expired:
            auction.status = AuctionStatus.ENDED
        db.commit()
        return expired
