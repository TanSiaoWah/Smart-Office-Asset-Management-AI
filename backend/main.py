import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from assets.router import router as assets_router
from auth.router import router as auth_router
from database import Base, engine
from inventory.router import router as inventory_router

load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(title="Smart Office Asset Management AI")

cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    # Allow any local network IP on any port (covers 192.168.x.x, 10.x.x.x, localhost, 127.0.0.1)
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_tables() -> None:
    """
    Create database tables on startup.

    If the database is not reachable (e.g. DATABASE_URL not configured),
    the server still starts — auth endpoints will return errors until the
    database is available.
    """
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified successfully.")
    except Exception as exc:
        logger.warning(
            "Could not connect to database — auth endpoints will fail "
            "until DATABASE_URL is configured correctly: %s",
            exc,
        )


# Include routers
app.include_router(assets_router)
app.include_router(auth_router)
app.include_router(inventory_router)


@app.get("/", response_class=JSONResponse)
async def health_check() -> JSONResponse:
    """
    Health check endpoint to verify the backend is running.
    """
    return JSONResponse({"status": "ok", "message": "Smart Office Asset Management AI backend is running."})


# Note: Uploaded original and detected images are stored in Supabase Storage
# via the SupabaseStorageService. No local static mount is needed.