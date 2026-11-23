from datetime import datetime, timedelta, timezone
from typing import List
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.auction import Auction, AuctionParticipant, Bid, AuctionStatus
from app.models.bicycle import Bicycle, CycleState
from app.models.lifecycle import LifecycleEvent
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
        extension = timedelta(minutes=auction.anti_snipe_extension_minutes)
        max_extensions = 10

        if time_left < threshold and (auction.extension_count or 0) < max_extensions:
            auction.ends_at = now + extension
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
    def _sync_auction_state(db: Session, auction: Auction) -> None:
        now = datetime.now(timezone.utc)
        ends_at = auction.ends_at if auction.ends_at.tzinfo else auction.ends_at.replace(tzinfo=timezone.utc)
        if now >= ends_at and auction.status in (AuctionStatus.SCHEDULED, AuctionStatus.ACTIVE, AuctionStatus.EXTENDED):
            if auction.current_winner_id:
                auction.status = AuctionStatus.ENDED
                if not auction.payment_deadline:
                    auction.payment_deadline = now + timedelta(minutes=8)
            else:
                auction.status = AuctionStatus.CANCELLED
            db.commit()
            db.refresh(auction)
        elif auction.status == AuctionStatus.ENDED and auction.payment_deadline:
            p_deadline = auction.payment_deadline if auction.payment_deadline.tzinfo else auction.payment_deadline.replace(tzinfo=timezone.utc)
            if now > p_deadline:
                AuctionService.pass_to_runner_up(db, auction.id)

    @staticmethod
    def get_auction(db: Session, auction_id: int) -> Auction:
        auction = db.query(Auction).filter(Auction.id == auction_id).first()
        if not auction:
            raise HTTPException(status_code=404, detail="Auction not found")
        AuctionService._sync_auction_state(db, auction)
        return auction

    @staticmethod
    def list_active_auctions(db: Session, skip: int = 0, limit: int = 50):
        auctions = (
            db.query(Auction)
            .filter(Auction.status != AuctionStatus.DRAFT)
            .order_by(
                Auction.status.in_([AuctionStatus.ACTIVE, AuctionStatus.EXTENDED, AuctionStatus.SCHEDULED]).desc(),
                Auction.id.desc(),
            )
            .offset(skip)
            .limit(limit)
            .all()
        )
        for a in auctions:
            AuctionService._sync_auction_state(db, a)
        return auctions

    @staticmethod
    def pass_to_runner_up(db: Session, auction_id: int, declined_by_user_id: int = None) -> Auction:
        auction = db.query(Auction).filter(Auction.id == auction_id).with_for_update().first()
        if not auction:
            raise HTTPException(status_code=404, detail="Auction not found")
        if auction.status != AuctionStatus.ENDED:
            raise HTTPException(status_code=400, detail="Payment can only be declined after the auction has ended.")

        current_winner = auction.current_winner_id
        if declined_by_user_id and current_winner != declined_by_user_id:
            raise HTTPException(status_code=403, detail="Only the leading bidder can decline payment.")

        # Anti-exploit: allow at most ONE pass to the runner-up. No cascading chains!
        already_passed = db.query(Bid).filter(Bid.auction_id == auction.id, Bid.status == "forfeited").first() is not None
        if already_passed:
            if current_winner:
                for b in db.query(Bid).filter(Bid.auction_id == auction.id, Bid.bidder_id == current_winner).all():
                    b.status = "forfeited"
            auction.status = AuctionStatus.CANCELLED
            auction.payment_deadline = None
            bicycle = db.get(Bicycle, auction.bicycle_id)
            if bicycle:
                bicycle.status = CycleState.AUCTIONABLE.value
                bicycle.current_state = CycleState.AUCTIONABLE
            publish_auction_event(
                auction.id,
                {
                    "type": "AUCTION_CANCELLED",
                    "auction_id": auction.id,
                },
            )
            db.commit()
            db.refresh(auction)
            return auction

        if current_winner:
            prev_bids = db.query(Bid).filter(Bid.auction_id == auction.id, Bid.bidder_id == current_winner).all()
            for b in prev_bids:
                b.status = "forfeited"

        runner_up = (
            db.query(Bid)
            .filter(
                Bid.auction_id == auction.id,
                Bid.bidder_id != current_winner,
                Bid.status != "forfeited",
            )
            .order_by(Bid.amount.desc())
            .first()
        )

        now = datetime.now(timezone.utc)
        if runner_up:
            runner_up.status = "winning"
            auction.current_winner_id = runner_up.bidder_id
            auction.current_highest_bid = runner_up.amount
            auction.payment_deadline = now + timedelta(minutes=8)
            auction.status = AuctionStatus.ENDED

            notify(
                db,
                [runner_up.bidder_id],
                f"The previous bidder passed on '{auction.title}'. You are now the winning bidder at ₹{runner_up.amount}! Complete your UPI payment within 8 minutes.",
                auction.bicycle_id,
            )
            publish_auction_event(
                auction.id,
                {
                    "type": "RUNNER_UP_ACTIVE",
                    "auction_id": auction.id,
                    "winner_id": runner_up.bidder_id,
                    "amount": float(runner_up.amount),
                    "payment_deadline": auction.payment_deadline.isoformat(),
                },
            )
        else:
            auction.status = AuctionStatus.CANCELLED
            auction.payment_deadline = None
            bicycle = db.get(Bicycle, auction.bicycle_id)
            if bicycle:
                bicycle.status = CycleState.AUCTIONABLE.value
                bicycle.current_state = CycleState.AUCTIONABLE
            publish_auction_event(
                auction.id,
                {
                    "type": "AUCTION_CANCELLED",
                    "auction_id": auction.id,
                },
            )

        db.commit()
        db.refresh(auction)
        return auction

    @staticmethod
    def pay_auction(db: Session, auction_id: int, user_id: int, payment_ref: str = "UPI-SIMULATED") -> Auction:
        auction = db.query(Auction).filter(Auction.id == auction_id).with_for_update().first()
        if not auction:
            raise HTTPException(status_code=404, detail="Auction not found")

        if auction.current_winner_id != user_id:
            raise HTTPException(status_code=403, detail="Only the winning bidder can complete payment.")

        if auction.status == AuctionStatus.SETTLED:
            raise HTTPException(status_code=400, detail="Auction payment has already been completed.")
        if auction.status != AuctionStatus.ENDED:
            raise HTTPException(status_code=400, detail="Payment is only possible after the auction has ended.")

        now = datetime.now(timezone.utc)
        if auction.payment_deadline:
            p_deadline = auction.payment_deadline if auction.payment_deadline.tzinfo else auction.payment_deadline.replace(tzinfo=timezone.utc)
            if now > p_deadline:
                AuctionService.pass_to_runner_up(db, auction.id)
                raise HTTPException(status_code=400, detail="Payment window expired. Bicycle was offered to the runner-up bidder.")

        bicycle = db.get(Bicycle, auction.bicycle_id)
        if not bicycle:
            raise HTTPException(status_code=404, detail="Associated bicycle not found")

        bicycle.owner_id = user_id
        bicycle.current_owner_id = user_id
        bicycle.status = CycleState.ACTIVE.value
        bicycle.current_state = CycleState.ACTIVE

        bicycle.sold_price = auction.current_highest_bid
        bicycle.base_price_set = auction.starting_price

        winner = db.get(User, user_id)
        winner_name = winner.full_name if winner else f"User #{user_id}"
        record = LifecycleEvent(
            bicycle_id=bicycle.id,
            actor_id=user_id,
            from_state=CycleState.AUCTIONABLE,
            to_state=CycleState.SOLD,
            notes=f"Sold via Auction #{auction.id} to {winner_name} for ₹{auction.current_highest_bid}. Ref: {payment_ref}",
        )
        db.add(record)

        all_bids = db.query(Bid).filter(Bid.auction_id == auction_id).all()
        for b in all_bids:
            if b.bidder_id == user_id and b.amount == auction.current_highest_bid:
                b.status = "winning"
            else:
                b.status = "outbid"

        auction.status = AuctionStatus.SETTLED

        notify(
            db,
            [user_id],
            f"Payment of ₹{auction.current_highest_bid} confirmed! Bicycle #{bicycle.asset_tag} is now active in your bicycle list.",
            bicycle.id,
        )

        db.commit()
        db.refresh(auction)

        publish_auction_event(
            auction.id,
            {
                "type": "PAYMENT_CONFIRMED",
                "auction_id": auction.id,
                "winner_id": user_id,
                "amount": float(auction.current_highest_bid),
            },
        )
        return auction

    @staticmethod
    def settle_auction(db: Session, auction_id: int, actor: User) -> Auction:
        """Hostel admin / super admin settles an ended auction on behalf of its winner."""
        auction = AuctionService._lock_managed_auction(db, auction_id, actor)
        AuctionService._sync_auction_state(db, auction)
        if auction.status != AuctionStatus.ENDED or not auction.current_winner_id:
            raise HTTPException(status_code=400, detail=f"Only ended auctions with a winner can be settled (this one is {auction.status.value}).")
        return AuctionService.pay_auction(db, auction_id, auction.current_winner_id, payment_ref="ADMIN-SETTLE")

    @staticmethod
    def process_expired_payments(db: Session) -> None:
        """Background job: pass every ENDED auction whose payment window lapsed to the runner-up."""
        now = datetime.now(timezone.utc)
        ids = db.scalars(select(Auction.id).where(Auction.status == AuctionStatus.ENDED,
                                                  Auction.payment_deadline < now)).all()
        for auction_id in ids:
            AuctionService.pass_to_runner_up(db, auction_id)

    @staticmethod
    def close_ended_auctions(db: Session) -> List[Auction]:
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
            if auction.current_winner_id:
                auction.status = AuctionStatus.ENDED
                if not auction.payment_deadline:
                    auction.payment_deadline = now + timedelta(minutes=8)
            else:
                auction.status = AuctionStatus.CANCELLED
        db.commit()
        return expired
