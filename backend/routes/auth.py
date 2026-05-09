# backend/routes/auth.py
# Supabase Auth verification middleware for FastAPI.
# Validates the JWT from the frontend on protected routes.

from __future__ import annotations

import os
import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


# ── JWT Verification ──────────────────────────────────────────

async def get_current_user(authorization: str = Header(default=None)) -> dict:
    """
    FastAPI dependency — validates Supabase JWT on any protected route.
    Usage: user = Depends(get_current_user)
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
            timeout=5.0,
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return resp.json()


# ── Auth Routes ───────────────────────────────────────────────

@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the current authenticated user's profile."""
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "provider": user.get("app_metadata", {}).get("provider"),
        "created_at": user.get("created_at"),
    }


@router.get("/session")
async def check_session(authorization: str = Header(default=None)):
    """Lightweight session check — returns 200 if token is valid."""
    if not authorization:
        return {"authenticated": False}
    try:
        await get_current_user(authorization)
        return {"authenticated": True}
    except HTTPException:
        return {"authenticated": False}
