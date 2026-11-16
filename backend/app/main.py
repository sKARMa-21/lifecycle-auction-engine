from contextlib import asynccontextmanager
import asyncio
from contextlib import suppress
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    AuctionNoActiveBidsError,
    DegreeDurationActiveError,
    GracePeriodNotExpiredError,
    InvalidStateTransitionError,
    LifecycleDomainError,
    UnauthorizedTransitionError,
)
from app.api.v1 import api_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure initial Super Admin is bootstrapped
    try:
        from app.db.session import SessionLocal
        from app.models.user import User, UserRole
        from app.core.security import hash_password
        from sqlalchemy import select

        with SessionLocal() as db:
            existing_sa = db.scalar(select(User).where(User.role == UserRole.SUPER_ADMIN))
            if not existing_sa:
                user_by_email = db.scalar(select(User).where(User.email == settings.first_super_admin_email))
                if user_by_email:
                    user_by_email.role = UserRole.SUPER_ADMIN
                    db.commit()
                else:
                    sa_user = User(
                        full_name="System Super Admin",
                        email=settings.first_super_admin_email,
                        password_hash=hash_password(settings.first_super_admin_password),
                        role=UserRole.SUPER_ADMIN,
                        is_active=True,
                    )
                    db.add(sa_user)
                    db.commit()
    except Exception as e:
        print(f"Super Admin bootstrap notice: {e}")
    from app.workers.asset_expiry import run_asset_expiry
    expiry_task = asyncio.create_task(run_asset_expiry())
    try:
        yield
    finally:
        expiry_task.cancel()
        with suppress(asyncio.CancelledError):
            await expiry_task


app = FastAPI(
    title="Lifecycle & Auction Engine",
    description="Campus bicycle lifecycle management and auction API.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


# Global exception handlers for domain errors
@app.exception_handler(InvalidStateTransitionError)
async def invalid_transition_handler(request: Request, exc: InvalidStateTransitionError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(GracePeriodNotExpiredError)
async def grace_period_handler(request: Request, exc: GracePeriodNotExpiredError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(UnauthorizedTransitionError)
async def unauthorized_transition_handler(request: Request, exc: UnauthorizedTransitionError):
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(DegreeDurationActiveError)
async def degree_duration_handler(request: Request, exc: DegreeDurationActiveError):
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(AuctionNoActiveBidsError)
async def auction_no_bids_handler(request: Request, exc: AuctionNoActiveBidsError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(LifecycleDomainError)
async def lifecycle_domain_handler(request: Request, exc: LifecycleDomainError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/", tags=["General"])
def root():
    return {
        "message": "Lifecycle & Auction Engine API",
        "status": "running",
    }


@app.get("/health/live", tags=["Health"])
def health_live():
    return {"status": "alive"}
