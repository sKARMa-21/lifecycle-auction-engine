from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    DegreeDurationActiveError,
    GracePeriodNotExpiredError,
    InvalidStateTransitionError,
    UnauthorizedTransitionError,
)

app = FastAPI(
    title="Lifecycle & Auction Engine",
    description="Campus bicycle lifecycle management and auction API.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


from app.api.v1.endpoints.bicycles import router as bicycles_router

app.include_router(bicycles_router, prefix="/api/v1")


@app.get("/", tags=["General"])
def root():
    return {
        "message": "Lifecycle & Auction Engine API",
        "status": "running",
    }


@app.get("/health/live", tags=["Health"])
def health_live():
    return {"status": "alive"}
