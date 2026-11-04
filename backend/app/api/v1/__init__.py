from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.bicycles import router as bicycles_router
from app.api.v1.endpoints.auctions import router as auctions_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(bicycles_router)
api_router.include_router(auctions_router)
