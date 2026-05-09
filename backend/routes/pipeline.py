# backend/routes/pipeline.py
# FastAPI routes for the pipeline failure + diagnosis workflow.
# Flow: webhook → insert failure → embed logs → find similar →
#        run Claude diagnosis → insert diagnosis → insert embedding

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel, HttpUrl

from backend.db import repository as db

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


# ── Request / Response Models ─────────────────────────────────

class WebhookPayload(BaseModel):
    team_id: str
    repo_url: str
    platform: str        # 'github_actions' | 'jenkins' | 'gitlab_ci' etc.
    failed_stage: str | None = None
    raw_logs: dict[str, Any]
    compressed_logs: str | None = None


class FeedbackPayload(BaseModel):
    diagnosis_id: str
    team_id: str
    worked: bool
    notes: str | None = None


# ── Webhook: receive failure + run full diagnosis ─────────────

@router.post("/webhook", status_code=201)
async def receive_failure(
    payload: WebhookPayload,
    x_webhook_secret: str = Header(default=None),
):
    """
    Entry point for CI/CD webhook events.
    GitHub Actions / Jenkins send failure payloads here.
    """
    _verify_webhook_secret(x_webhook_secret)

    # 1. Persist the raw failure
    failure = db.insert_failure(
        team_id=payload.team_id,
        repo_url=str(payload.repo_url),
        platform=payload.platform,
        raw_logs=payload.raw_logs,
        failed_stage=payload.failed_stage,
        compressed_logs=payload.compressed_logs,
    )
    failure_id = failure["id"]

    # 2. Find semantically similar past fixes
    past_fixes: list[dict] = []
    compressed = payload.compressed_logs or ""
    if compressed:
        embedding = await _embed_text(compressed)
        past_fixes = db.find_similar_fixes(
            team_id=payload.team_id,
            query_embedding=embedding,
            match_count=3,
            min_similarity=0.70,
        )

    # 3. Run Claude diagnosis (calls your existing LangGraph agent)
    diagnosis_result = await _run_diagnosis(
        logs=compressed or str(payload.raw_logs),
        platform=payload.platform,
        past_fixes=past_fixes,
    )

    # 4. Persist the diagnosis (triggers Supabase Realtime → dashboard updates)
    diagnosis = db.insert_diagnosis(
        failure_id=failure_id,
        team_id=payload.team_id,
        category=diagnosis_result["category"],
        confidence=diagnosis_result["confidence"],
        root_cause=diagnosis_result["root_cause"],
        technical_detail=diagnosis_result["technical_detail"],
        fix_steps=diagnosis_result["fix_steps"],
        full_output=diagnosis_result["full_output"],
        prevention=diagnosis_result.get("prevention"),
        pr_diff=diagnosis_result.get("pr_diff"),
        time_to_fix_min=diagnosis_result.get("time_to_fix_min"),
    )
    diagnosis_id = diagnosis["id"]

    # 5. Embed the fix summary and store for future similarity search
    summary = _build_fix_summary(diagnosis_result)
    fix_embedding = await _embed_text(summary)
    db.insert_embedding(
        team_id=payload.team_id,
        failure_id=failure_id,
        diagnosis_id=diagnosis_id,
        embedding=fix_embedding,
        summary=summary,
    )

    return {
        "failure_id": failure_id,
        "diagnosis_id": diagnosis_id,
        "confidence": diagnosis_result["confidence"],
        "root_cause": diagnosis_result["root_cause"],
    }


# ── Read endpoints ────────────────────────────────────────────

@router.get("/failures/{team_id}")
async def list_failures(team_id: str, limit: int = 20):
    return db.list_failures(team_id=team_id, limit=limit)


@router.get("/diagnoses/{team_id}")
async def list_diagnoses(team_id: str, limit: int = 20):
    return db.list_diagnoses(team_id=team_id, limit=limit)


@router.get("/diagnosis/{diagnosis_id}")
async def get_diagnosis(diagnosis_id: str):
    record = db.get_diagnosis(diagnosis_id)
    if not record:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    return record


@router.get("/stats/{team_id}")
async def get_team_stats(team_id: str):
    stats = db.get_team_stats(team_id)
    if not stats:
        return {"team_id": team_id, "total_diagnoses": 0}
    return stats


# ── Feedback ──────────────────────────────────────────────────

@router.post("/feedback", status_code=201)
async def submit_feedback(payload: FeedbackPayload):
    """Record whether the generated fix actually worked."""
    record = db.insert_feedback(
        diagnosis_id=payload.diagnosis_id,
        team_id=payload.team_id,
        worked=payload.worked,
        notes=payload.notes,
    )
    return record


# ── Internal helpers ──────────────────────────────────────────

def _verify_webhook_secret(secret: str | None) -> None:
    expected = os.environ.get("WEBHOOK_SECRET")
    if expected and secret != expected:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


async def _embed_text(text: str) -> list[float]:
    """
    Embed text using OpenAI text-embedding-3-small (1536 dims).
    Swap this call for your preferred embedding provider.
    """
    import openai
    client = openai.AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=text[:8000],  # token limit guard
    )
    return response.data[0].embedding


async def _run_diagnosis(
    logs: str,
    platform: str,
    past_fixes: list[dict],
) -> dict:
    """
    Hook into your existing LangGraph agent.
    Replace the body here with your actual agent call.
    Expected return shape matches insert_diagnosis() parameters.
    """
    from backend.agent.graph import run_agent
    return await run_agent(logs=logs, platform=platform, past_fixes=past_fixes)


def _build_fix_summary(diagnosis: dict) -> str:
    """Build a short text summary for embedding storage."""
    steps = diagnosis.get("fix_steps", [])
    first_cmd = steps[0].get("command", "") if steps else ""
    return (
        f"Category: {diagnosis['category']}. "
        f"Cause: {diagnosis['root_cause']}. "
        f"Fix: {first_cmd[:200]}"
    )
