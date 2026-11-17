import asyncio
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.redis import get_async_redis_client

router = APIRouter()


class AuctionConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self.listener_tasks: Dict[int, asyncio.Task] = {}

    async def connect(self, auction_id: int, websocket: WebSocket):
        await websocket.accept()
        if auction_id not in self.active_connections:
            self.active_connections[auction_id] = set()
        self.active_connections[auction_id].add(websocket)

        if auction_id not in self.listener_tasks or self.listener_tasks[auction_id].done():
            self.listener_tasks[auction_id] = asyncio.create_task(
                self._listen_to_channel(auction_id)
            )

    def disconnect(self, auction_id: int, websocket: WebSocket):
        if auction_id in self.active_connections:
            self.active_connections[auction_id].discard(websocket)
            if not self.active_connections[auction_id]:
                del self.active_connections[auction_id]
                task = self.listener_tasks.pop(auction_id, None)
                if task and not task.done():
                    task.cancel()

    async def broadcast_text(self, auction_id: int, message: str):
        if auction_id not in self.active_connections:
            return
        dead_connections = []
        for ws in self.active_connections[auction_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead_connections.append(ws)
        for ws in dead_connections:
            self.disconnect(auction_id, ws)

    async def _listen_to_channel(self, auction_id: int):
        client = get_async_redis_client()
        pubsub = client.pubsub()
        channel = f"auction:{auction_id}"
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message and message.get("type") == "message":
                    data = message.get("data")
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    if data:
                        await self.broadcast_text(auction_id, data)
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
                await client.aclose()
            except Exception:
                pass


auction_ws_manager = AuctionConnectionManager()


@router.websocket("/ws/auctions/{auction_id}")
async def auction_websocket_endpoint(websocket: WebSocket, auction_id: int):
    await auction_ws_manager.connect(auction_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        auction_ws_manager.disconnect(auction_id, websocket)
    except Exception:
        auction_ws_manager.disconnect(auction_id, websocket)
