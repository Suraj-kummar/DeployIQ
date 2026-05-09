# backend/agent/graph.py
# LangGraph agent — Observe → Classify → Diagnose → Format
# Calls Claude Sonnet 4.5 with past_fixes context injected.
# Falls back to Mistral 7B on rate limit (429) or API error.

from __future__ import annotations

import os
import json
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
import anthropic
import httpx


# ── State ─────────────────────────────────────────────────────

class AgentState(TypedDict):
    logs: str
    platform: str
    past_fixes: list[dict]
    category: str
    confidence: str
    root_cause: str
    technical_detail: str
    fix_steps: list[dict]
    prevention: str
    pr_diff: str
    time_to_fix_min: int
    full_output: str
    error: str


# ── Claude client ─────────────────────────────────────────────

def _get_claude():
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


# ── Nodes ─────────────────────────────────────────────────────

def observe(state: AgentState) -> AgentState:
    """
    STEP 1 — OBSERVE: strip noise from raw logs.
    Keep only ERROR/FAILED/exception lines + lines immediately before them.
    """
    lines = state["logs"].split("\n")
    kept = []
    error_keywords = ("error", "err!", "failed", "fatal", "exception", "traceback", "exit code")
    for i, line in enumerate(lines):
        if any(k in line.lower() for k in error_keywords):
            # Include 2 lines of context before the error
            start = max(0, i - 2)
            kept.extend(lines[start:i + 1])

    compressed = "\n".join(dict.fromkeys(kept))  # deduplicate, preserve order
    state["logs"] = compressed[:6000] if compressed else state["logs"][:6000]
    return state


def build_prompt(state: AgentState) -> str:
    past = ""
    if state["past_fixes"]:
        past = "\n\n## PAST FIXES FROM THIS TEAM\n" + "\n".join(
            f"- [{round(f['similarity']*100)}% match] {f['summary']}"
            for f in state["past_fixes"]
        )

    return f"""You are DeployIQ, an elite CI/CD debugging agent.

Platform: {state['platform']}
{past}

## CI/CD LOGS
{state['logs']}

Analyze the logs and respond with ONLY valid JSON (no markdown fences) in this exact shape:
{{
  "category": "dependency_conflict | environment_misconfiguration | build_script_failure | infrastructure_error | network_external | test_quality_gate",
  "confidence": "HIGH | MEDIUM | LOW",
  "root_cause": "one sentence, plain English, no jargon",
  "technical_detail": "2-4 sentences referencing exact log lines",
  "fix_steps": [
    {{"step": 1, "label": "Step description", "command": "exact command", "diff": null}},
    {{"step": 2, "label": "Step description", "command": "exact command", "diff": "BEFORE:\\n- old line\\nAFTER:\\n+ new line"}}
  ],
  "prevention": "1-3 concrete prevention actions",
  "pr_diff": "diff text or null",
  "time_to_fix_min": 10
}}"""


def diagnose_claude(state: AgentState) -> AgentState:
    """STEP 2 — Call Claude Sonnet. Parse structured JSON response."""
    try:
        client = _get_claude()
        msg = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=2048,
            temperature=0.2,
            messages=[{"role": "user", "content": build_prompt(state)}],
        )
        raw = msg.content[0].text.strip()
        # Strip markdown fences if model adds them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        state.update({
            "category":        data.get("category", "build_script_failure"),
            "confidence":      data.get("confidence", "MEDIUM"),
            "root_cause":      data.get("root_cause", ""),
            "technical_detail": data.get("technical_detail", ""),
            "fix_steps":       data.get("fix_steps", []),
            "prevention":      data.get("prevention", ""),
            "pr_diff":         data.get("pr_diff"),
            "time_to_fix_min": int(data.get("time_to_fix_min", 15)),
            "error":           "",
        })
    except anthropic.RateLimitError:
        state["error"] = "rate_limit"
    except Exception as e:
        state["error"] = str(e)
    return state


def diagnose_mistral(state: AgentState) -> AgentState:
    """STEP 2b — Mistral fallback via OpenAI-compatible endpoint."""
    try:
        import openai
        client = openai.OpenAI(
            api_key=os.environ.get("MISTRAL_API_KEY", ""),
            base_url="https://api.mistral.ai/v1",
        )
        resp = client.chat.completions.create(
            model="mistral-small-latest",
            max_tokens=2048,
            temperature=0.2,
            messages=[{"role": "user", "content": build_prompt(state)}],
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        state.update({
            "category":        data.get("category", "build_script_failure"),
            "confidence":      data.get("confidence", "LOW"),  # lower confidence for fallback
            "root_cause":      data.get("root_cause", ""),
            "technical_detail": data.get("technical_detail", ""),
            "fix_steps":       data.get("fix_steps", []),
            "prevention":      data.get("prevention", ""),
            "pr_diff":         data.get("pr_diff"),
            "time_to_fix_min": int(data.get("time_to_fix_min", 15)),
            "error":           "",
        })
    except Exception as e:
        state["error"] = str(e)
        # Hard fallback values so the pipeline never crashes
        state.update({
            "category": "build_script_failure",
            "confidence": "LOW",
            "root_cause": "Could not determine root cause — please review logs manually.",
            "technical_detail": f"Both Claude and Mistral failed: {str(e)[:200]}",
            "fix_steps": [],
            "prevention": "N/A",
            "pr_diff": None,
            "time_to_fix_min": 30,
        })
    return state


def format_output(state: AgentState) -> AgentState:
    """STEP 3 — Build the full formatted diagnosis string."""
    steps_text = "\n".join(
        f"Step {s['step']}: {s['label']}\n$ {s['command']}"
        + (f"\n{s['diff']}" if s.get("diff") else "")
        for s in state.get("fix_steps", [])
    )

    state["full_output"] = f"""🔴 FAILURE DETECTED
{'━'*53}
📍 FAILED STAGE:    {state.get('category','').replace('_',' ').title()}
🏷️  CATEGORY:       {state.get('category','')}
📊 CONFIDENCE:     {state.get('confidence','')}
⏱️  TIME TO FIX:    ~{state.get('time_to_fix_min',15)} minutes
🖥️  PLATFORM:       {state.get('platform','')}

{'━'*53}
🔍 ROOT CAUSE
{'━'*53}
{state.get('root_cause','')}

{'━'*53}
🧠 WHY IT BROKE
{'━'*53}
{state.get('technical_detail','')}

{'━'*53}
⚡ IMMEDIATE FIX
{'━'*53}
{steps_text}

{'━'*53}
🛡️  PREVENTION
{'━'*53}
{state.get('prevention','')}
"""
    return state


# ── Router ────────────────────────────────────────────────────

def should_fallback(state: AgentState) -> str:
    return "mistral" if state.get("error") == "rate_limit" else "format"


# ── Graph ─────────────────────────────────────────────────────

def build_graph():
    g = StateGraph(AgentState)
    g.add_node("observe",          observe)
    g.add_node("diagnose_claude",  diagnose_claude)
    g.add_node("diagnose_mistral", diagnose_mistral)
    g.add_node("format_output",    format_output)

    g.set_entry_point("observe")
    g.add_edge("observe", "diagnose_claude")
    g.add_conditional_edges("diagnose_claude", should_fallback, {
        "mistral": "diagnose_mistral",
        "format":  "format_output",
    })
    g.add_edge("diagnose_mistral", "format_output")
    g.add_edge("format_output", END)

    return g.compile()


_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


# ── Public entry point (called from pipeline.py) ──────────────

async def run_agent(logs: str, platform: str, past_fixes: list[dict]) -> dict:
    """
    Main entry point. Returns a dict matching insert_diagnosis() parameters.
    """
    initial: AgentState = {
        "logs": logs,
        "platform": platform,
        "past_fixes": past_fixes,
        "category": "",
        "confidence": "",
        "root_cause": "",
        "technical_detail": "",
        "fix_steps": [],
        "prevention": "",
        "pr_diff": None,
        "time_to_fix_min": 15,
        "full_output": "",
        "error": "",
    }

    graph = get_graph()
    result = await graph.ainvoke(initial)

    return {
        "category":        result["category"],
        "confidence":      result["confidence"],
        "root_cause":      result["root_cause"],
        "technical_detail": result["technical_detail"],
        "fix_steps":       result["fix_steps"],
        "prevention":      result.get("prevention"),
        "pr_diff":         result.get("pr_diff"),
        "time_to_fix_min": result.get("time_to_fix_min", 15),
        "full_output":     result["full_output"],
    }
