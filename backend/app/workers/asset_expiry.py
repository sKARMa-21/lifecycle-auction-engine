"""Lifecycle maintenance only; auction settlement remains owned by the bidding engine."""
import asyncio
import logging
from app.db.session import SessionLocal
from app.services.lifecycle_service import BicycleLifecycleService


def process_assets():
    with SessionLocal() as db:
        BicycleLifecycleService.process_expired_assets(db)


async def run_asset_expiry():
    while True:
        try:
            await asyncio.to_thread(process_assets)
        except Exception:
            logging.getLogger(__name__).exception("Asset expiry failed; retrying in 60 seconds")
        await asyncio.sleep(60)
