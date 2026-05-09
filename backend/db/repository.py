# backend/db/repository.py
# All Supabase read/write operations for DeployIQ.
# Every public function is the single point of contact between
# FastAPI business logic and the Supabase database.

from __future__ import annotations

import json
import uuid
from typing import Any

from .supabase_client import get_supabase


# ── Pipeline Failures ─────────────────────────────────────────

def insert_failure(
    team_id: str,
    repo_url: str,
    platform: str,
    raw_logs: dict[str, Any],
    failed_stage: str | None = None,
    compressed_logs: str | None = None,
) -> dict:
    """Insert a new pipeline failure. Returns the created row."""
    sb = get_supabase()
    result = (
        sb.table("pipeline_failures")
        .insert({
            "team_id": team_id,
            "repo_url": repo_url,
            "platform": platform,
            "raw_logs": raw_logs,
            "failed_stage": failed_stage,
            "compressed_logs": compressed_logs,
        })
        .execute()
    )
    return result.data[0]


def get_failure(failure_id: str) -> dict | None:
    sb = get_supabase()
    result = (
        sb.table("pipeline_failures")
        .select("*")
        .eq("id", failure_id)
        .single()
        .execute()
    )
    return result.data


def list_failures(team_id: str, limit: int = 20) -> list[dict]:
    sb = get_supabase()
    result = (
        sb.table("pipeline_failures")
        .select("*")
        .eq("team_id", team_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


# ── Diagnoses ─────────────────────────────────────────────────

def insert_diagnosis(
    failure_id: str,
    team_id: str,
    category: str,
    confidence: str,
    root_cause: str,
    technical_detail: str,
    fix_steps: list[dict],
    full_output: str,
    prevention: str | None = None,
    pr_diff: str | None = None,
    time_to_fix_min: int | None = None,
) -> dict:
    """Insert a diagnosis record. Returns the created row."""
    sb = get_supabase()
    result = (
        sb.table("diagnoses")
        .insert({
            "failure_id": failure_id,
            "team_id": team_id,
            "category": category,
            "confidence": confidence,
            "root_cause": root_cause,
            "technical_detail": technical_detail,
            "fix_steps": fix_steps,
            "prevention": prevention,
            "pr_diff": pr_diff,
            "time_to_fix_min": time_to_fix_min,
            "full_output": full_output,
        })
        .execute()
    )
    return result.data[0]


def get_diagnosis(diagnosis_id: str) -> dict | None:
    sb = get_supabase()
    result = (
        sb.table("diagnoses")
        .select("*, pipeline_failures(*)")
        .eq("id", diagnosis_id)
        .single()
        .execute()
    )
    return result.data


def list_diagnoses(team_id: str, limit: int = 20) -> list[dict]:
    sb = get_supabase()
    result = (
        sb.table("diagnoses")
        .select("*, pipeline_failures(repo_url, platform, failed_stage)")
        .eq("team_id", team_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


# ── Fix Embeddings (pgvector) ─────────────────────────────────

def insert_embedding(
    team_id: str,
    failure_id: str,
    diagnosis_id: str,
    embedding: list[float],
    summary: str,
) -> dict:
    """Store a fix embedding for semantic search."""
    sb = get_supabase()
    result = (
        sb.table("fix_embeddings")
        .insert({
            "team_id": team_id,
            "failure_id": failure_id,
            "diagnosis_id": diagnosis_id,
            "embedding": embedding,  # supabase-py sends as JSON array; pgvector accepts it
            "summary": summary,
        })
        .execute()
    )
    return result.data[0]


def find_similar_fixes(
    team_id: str,
    query_embedding: list[float],
    match_count: int = 3,
    min_similarity: float = 0.70,
) -> list[dict]:
    """
    Call the match_similar_fixes Postgres function.
    Returns list of {diagnosis_id, failure_id, summary, similarity}.
    """
    sb = get_supabase()
    result = sb.rpc(
        "match_similar_fixes",
        {
            "query_embedding": query_embedding,
            "match_team_id": team_id,
            "match_count": match_count,
            "min_similarity": min_similarity,
        },
    ).execute()
    return result.data or []


# ── Fix Feedback ──────────────────────────────────────────────

def insert_feedback(
    diagnosis_id: str,
    team_id: str,
    worked: bool,
    notes: str | None = None,
) -> dict:
    sb = get_supabase()
    result = (
        sb.table("fix_feedback")
        .insert({
            "diagnosis_id": diagnosis_id,
            "team_id": team_id,
            "worked": worked,
            "notes": notes,
        })
        .execute()
    )
    return result.data[0]


def get_feedback_for_diagnosis(diagnosis_id: str) -> list[dict]:
    sb = get_supabase()
    result = (
        sb.table("fix_feedback")
        .select("*")
        .eq("diagnosis_id", diagnosis_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


# ── Team Stats ────────────────────────────────────────────────

def get_team_stats(team_id: str) -> dict | None:
    """Fetch from the team_diagnosis_stats view."""
    sb = get_supabase()
    result = (
        sb.table("team_diagnosis_stats")
        .select("*")
        .eq("team_id", team_id)
        .single()
        .execute()
    )
    return result.data


# ── Users ─────────────────────────────────────────────────────

def get_user(user_id: str) -> dict | None:
    sb = get_supabase()
    result = (
        sb.table("users")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )
    return result.data


def assign_user_to_team(user_id: str, team_id: str, role: str = "member") -> dict:
    sb = get_supabase()
    result = (
        sb.table("users")
        .update({"team_id": team_id, "role": role})
        .eq("id", user_id)
        .execute()
    )
    return result.data[0]
