import json
import redis
import redis.asyncio as aioredis
from app.core.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)


def get_redis_client():
    return redis_client


def get_async_redis_client():
    return aioredis.from_url(settings.redis_url, decode_responses=True)


def publish_auction_event(auction_id: int, event_data: dict) -> None:
    try:
        redis_client.publish(f"auction:{auction_id}", json.dumps(event_data, default=str))
    except Exception:
        pass


def ping_redis() -> bool:
    try:
        return bool(redis_client.ping())
    except Exception:
        return False
