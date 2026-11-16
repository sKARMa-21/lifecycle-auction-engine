import redis
import redis.asyncio as aioredis
from app.core.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)


def get_redis_client():
    return redis_client


def get_async_redis_client():
    return aioredis.from_url(settings.redis_url, decode_responses=True)


def ping_redis() -> bool:
    try:
        return bool(redis_client.ping())
    except Exception:
        return False
