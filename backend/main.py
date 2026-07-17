import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from scans.router import router as scans_router

load_dotenv()

app = FastAPI(title="Smart Pantry AI")

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

# Include routers
app.include_router(scans_router)

# temporary for dev — replace with cloud storage (e.g. Supabase) later
# Use absolute path for uploads directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
uploads_dir = os.path.join(backend_dir, "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
