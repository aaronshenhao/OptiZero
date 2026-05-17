import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.optimizer_router import router as optimizer_router

app = FastAPI()


DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]


def get_cors_origins() -> list[str]:
    configured_origins = os.getenv("FRONTEND_URLS") or os.getenv("FRONTEND_URL", "")
    deployed_origins = [
        origin.strip().rstrip("/")
        for origin in configured_origins.split(",")
        if origin.strip()
    ]

    return list(dict.fromkeys(DEFAULT_CORS_ORIGINS + deployed_origins))


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(optimizer_router)


@app.get("/")
async def root():
    return {"message": "OptiZero optimizer backend is running"}
