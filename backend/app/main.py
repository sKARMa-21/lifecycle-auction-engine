from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/", tags=["General"])
def root():
    return {
        "message": "Lifecycle & Auction Engine API",
        "status": "running",
    }


@app.get("/health/live", tags=["Health"])
def health_live():
    return {"status": "alive"}
