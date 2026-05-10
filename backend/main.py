# backend/main.py
# FastAPI application entry point — wires all routers together.

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import logging

from dotenv import load_dotenv
load_dotenv()  # Load .env before env vars are read

from backend.routes import pipeline, auth, teams

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — validate required env vars
    required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        logger.warning(f"Missing required env vars: {', '.join(missing)} — some features may not work")
    try:
        yield
    finally:
        # Shutdown — nothing to clean up yet, but finally ensures it always runs
        logger.info("DeployIQ API shutting down")


app = FastAPI(
    title="DeployIQ API",
    description="Autonomous CI/CD failure diagnosis backend",
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:5500,http://localhost:3000"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(pipeline.router)


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/", tags=["system"])
async def root():
    return {"message": "DeployIQ API v2.0 — see /docs for endpoints"}
