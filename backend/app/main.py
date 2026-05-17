from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.optimizer_router import router as optimizer_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(optimizer_router)


@app.get("/")
async def root():
    return {"message": "OptiZero optimizer backend is running"}
