from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import api_router

app = FastAPI(
    title="Lifecycle & Auction Engine",
    description="Campus bicycle lifecycle management and auction API.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["General"])
def root():
    return {
        "message": "Lifecycle & Auction Engine API",
        "status": "running",
    }


@app.get("/health/live", tags=["Health"])
def health_live():
    return {"status": "alive"}
