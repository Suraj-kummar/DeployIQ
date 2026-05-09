# backend/routes/teams.py
# Team management routes — create team, invite member, get team info.

from __future__ import annotations

import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.db import repository as db
from backend.routes.auth import get_current_user

router = APIRouter(prefix="/api/teams", tags=["teams"])


# ── Models ────────────────────────────────────────────────────

class CreateTeamPayload(BaseModel):
    name: str

class AssignTeamPayload(BaseModel):
    user_id: str
    team_id: str
    role: str = "member"


# ── Routes ────────────────────────────────────────────────────

@router.post("/", status_code=201)
async def create_team(
    payload: CreateTeamPayload,
    user: dict = Depends(get_current_user),
):
    """Create a new team. The requesting user becomes admin."""
    slug = _slugify(payload.name)
    sb = db.get_supabase()

    # Create team
    team_result = sb.table("teams").insert({"name": payload.name, "slug": slug}).execute()
    if not team_result.data:
        raise HTTPException(status_code=500, detail="Failed to create team")
    team = team_result.data[0]

    # Assign creator as admin
    db.assign_user_to_team(user_id=user["id"], team_id=team["id"], role="admin")

    return team


@router.get("/{team_id}")
async def get_team(team_id: str, user: dict = Depends(get_current_user)):
    """Get team info. Only team members can access."""
    sb = db.get_supabase()
    result = sb.table("teams").select("*").eq("id", team_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Team not found")
    return result.data


@router.get("/{team_id}/members")
async def list_members(team_id: str, user: dict = Depends(get_current_user)):
    """List all members of a team."""
    sb = db.get_supabase()
    result = sb.table("users").select("id, email, role, created_at").eq("team_id", team_id).execute()
    return result.data


@router.post("/{team_id}/assign")
async def assign_member(
    team_id: str,
    payload: AssignTeamPayload,
    user: dict = Depends(get_current_user),
):
    """Assign a user to a team (admin only in production)."""
    return db.assign_user_to_team(
        user_id=payload.user_id,
        team_id=team_id,
        role=payload.role,
    )


@router.get("/{team_id}/stats")
async def team_stats(team_id: str, user: dict = Depends(get_current_user)):
    """Return team-level diagnosis statistics from the stats view."""
    stats = db.get_team_stats(team_id)
    if not stats:
        return {"team_id": team_id, "total_diagnoses": 0, "fix_success_rate": None}
    return stats


# ── Helpers ───────────────────────────────────────────────────

def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")[:50]


def get_supabase():
    from backend.db.supabase_client import get_supabase as _get
    return _get()
