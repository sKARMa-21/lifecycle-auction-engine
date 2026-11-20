from datetime import datetime, timedelta, timezone
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.auction import Auction, Bid, AuctionStatus
from app.models.bicycle import Bicycle, CycleState
from app.models.user import User, UserRole
from app.schemas.auction import AuctionCreate, BidCreate
from app.services.lifecycle_service import BicycleLifecycleService
from app.core.redis import publish_auction_event


class AuctionService:
    @staticmethod
    def create_auction(db: Session, data: AuctionCreate) -> Auction:
        # 1. Verify bicycle exists
        bicycle = db.get(Bicycle, data.bicycle_id)
        if not bicycle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Bicycle with ID {data.bicycle_id} not found.",
            )

        # Serialize setup for the same bicycle, including duplicate-auction checks.
        bicycle = db.query(Bicycle).filter(Bicycle.id == data.bicycle_id).with_for_update().one()
        creator = db.get(User, data.created_by_id)
        if not creator:
            raise HTTPException(status_code=404, detail="User not found")
        owner_id = bicycle.current_owner_id or bicycle.owner_id
        is_student_owner = creator.role == UserRole.STUDENT and owner_id == creator.id
        is_admin_creator = creator.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
        if bicycle.status == "active" and not (is_student_owner or (is_admin_creator and owner_id is None)):
            raise HTTPException(status_code=403, detail="Administrators cannot auction a bicycle currently in use by its owner.")
        if creator.role == UserRole.GUARD or (not is_student_owner and not is_admin_creator):
            raise HTTPException(status_code=403, detail="Only the student owner or an administrator can create an auction.")

        # An owner's voluntary sale and an unowned campus asset can be configured directly.
        if bicycle.status == "active":
            BicycleLifecycleService.mark_as_auctionable_by_owner(bicycle, creator, db=db)
        elif bicycle.status == "dead" and is_admin_creator and owner_id is None:
            bicycle.status = "auctionable"
            bicycle.current_state = CycleState.AUCTIONABLE
            BicycleLifecycleService._record_event(bicycle, CycleState.DEAD, CycleState.AUCTIONABLE,
                                                  actor_id=creator.id, notes="Unowned scrap offered for auction", db=db)
        elif bicycle.status == "asset" and is_admin_creator:
            BicycleLifecycleService.promote_asset_to_auctionable(bicycle, actor=creator, db=db)

        # 2. Gate by lifecycle state machine: cycle must be AUCTIONABLE
        is_auctionable = (
            bicycle.current_state == CycleState.AUCTIONABLE
            or bicycle.status == CycleState.AUCTIONABLE.value
        )
        if not is_auctionable:
            curr_status = bicycle.status or (bicycle.current_state.value if bicycle.current_state else "unknown")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot launch auction: Bicycle #{bicycle.id} is currently in '{curr_status}' state. "
                    f"Only bicycles in '{CycleState.AUCTIONABLE.value}' state can be put up for auction."
                ),
            )

        # 3. Verify creator exists and has authority (cycle owner or admin)
        creator = db.get(User, data.created_by_id)
        if not creator:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID {data.created_by_id} not found.",
            )

        is_admin = creator.role in (UserRole.ADMIN, "admin", UserRole.SUPER_ADMIN, "super_admin")
        is_owner = (
            (bicycle.owner_id is not None and bicycle.owner_id == creator.id)
            or (bicycle.current_owner_id is not None and bicycle.current_owner_id == creator.id)
        )
        if not (is_admin or is_owner):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the registered bicycle owner or an administrator can launch an auction for this bicycle.",
            )

        # 4. Check for active/ongoing auctions for this bicycle
        existing_auction = (
            db.query(Auction)
            .filter(
                Auction.bicycle_id == data.bicycle_id,
                Auction.status.in_([AuctionStatus.ACTIVE, AuctionStatus.EXTENDED, AuctionStatus.SCHEDULED]),
            )
            .first()
        )
        if existing_auction:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An active auction (#{existing_auction.id}) already exists for bicycle #{data.bicycle_id}.",
            )

        # 5. Validate end time is in the future
        now = datetime.now(timezone.utc)
        ends_at = data.ends_at
        if ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)

        if ends_at <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Auction end date must be in the future.",
            )

        starts_at = data.starts_at
        if starts_at.tzinfo is None:
            starts_at = starts_at.replace(tzinfo=timezone.utc)
        if starts_at < now or ends_at <= starts_at:
            raise HTTPException(status_code=400, detail="Choose a future start time and an end time after it.")

        auction = Auction(
            bicycle_id=data.bicycle_id,
            created_by_id=data.created_by_id,
            title=data.title,
            starting_price=data.starting_price,
            current_highest_bid=data.starting_price,
            min_bid_increment=data.min_bid_increment,
            starts_at=starts_at,
            ends_at=ends_at,
            anti_snipe_trigger_window=data.anti_snipe_trigger_window,
            anti_snipe_extension_minutes=data.anti_snipe_extension_minutes,
            status=AuctionStatus.SCHEDULED,
        )
        db.add(auction)
        db.commit()
        db.refresh(auction)
        return auction

    @staticmethod
    def place_bid(db: Session, auction_id: int, bid_in: BidCreate, *, bidder_id: int) -> Bid:
        # PESSIMISTIC LOCK: with_for_update prevents concurrent race conditions
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

        # Validate minimum bid threshold
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

        # Validate bidder exists and is strictly a student (Guards/Admins cannot own or bid on cycles)
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

        # Mark previous highest bid as outbid
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

        # Create bid record
        new_bid = Bid(
            auction_id=auction.id,
            bidder_id=bidder_id,
            amount=bid_in.amount,
            placed_at=now,
            status="winning",
        )
        db.add(new_bid)

        # Update auction state
        auction.current_highest_bid = bid_in.amount
        auction.current_winner_id = bidder_id

        is_extended = False
        # Anti-sniping dynamic extension
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
        # Pessimistic lock to avoid concurrent double-settlement
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

        # Cannot settle an auction that's still live (or scheduled and not yet over)
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

        # --- No bids: cancel, leave bicycle auctionable for re-listing ---
        if auction.current_winner_id is None:
            auction.status = AuctionStatus.CANCELLED
            db.commit()
            db.refresh(auction)
            return auction

        # --- Has a winner: settle ---
        # 1. Update bid statuses: highest bid -> winning, rest -> outbid
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

        # 2. Transition bicycle AUCTIONABLE -> SOLD via lifecycle service
        BicycleLifecycleService.mark_as_sold(
            bicycle=bicycle,
            sold_price=auction.current_highest_bid,
            notes=f"Sold via auction #{auction.id}. Winner: user #{auction.current_winner_id}",
            db=db,
        )

        # 3. Transfer bicycle ownership to winner
        bicycle.owner_id = auction.current_winner_id
        bicycle.current_owner_id = auction.current_winner_id

        # 4. Set payment deadline (48 hours from settlement) and mark SETTLED
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
