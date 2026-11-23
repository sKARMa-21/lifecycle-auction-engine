"""Background maintenance: asset expiry plus closing auctions and lapsed payment windows."""
import asyncio
import logging
from app.db.session import SessionLocal
from app.services.auction_service import AuctionService
from app.services.lifecycle_service import BicycleLifecycleService

log = logging.getLogger(__name__)


def process_assets():
    with SessionLocal() as db:
        BicycleLifecycleService.process_expired_assets(db)


def process_auctions():
    with SessionLocal() as db:
        AuctionService.close_ended_auctions(db)
        AuctionService.process_expired_payments(db)


async def run_asset_expiry():
    while True:
        for job in (process_assets, process_auctions):
            try:
                await asyncio.to_thread(job)
            except Exception:
                log.exception("%s failed; retrying in 60 seconds", job.__name__)
        await asyncio.sleep(60)
