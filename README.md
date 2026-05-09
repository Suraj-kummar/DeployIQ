# DeployIQ 🚀

> **Autonomous CI/CD Failure Diagnosis** — Paste your broken pipeline logs. Get an expert-level root cause, a step-by-step fix, and a PR diff in seconds.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python)](https://python.org)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.1.5-FF6B6B?style=flat-square)](https://langchain-ai.github.io/langgraph)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%204.5-8B5CF6?style=flat-square&logo=anthropic)](https://anthropic.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)](https://docker.com)

---

## ✨ What is DeployIQ?

DeployIQ is an AI-powered CI/CD debugging assistant that autonomously diagnoses pipeline failures. Engineers spend hours staring at cryptic logs — DeployIQ reads them in milliseconds, identifies the root cause, and hands back actionable fix steps, exact commands, and even a ready-to-commit PR diff.

**Built for teams.** Every diagnosis is stored, embedded, and used to surface similar past fixes — so the same error is never debugged twice.

---

## 🎬 Demo

| Step | Description |
|------|-------------|
| 1️⃣ | Paste raw CI/CD logs (GitHub Actions, Jenkins, GitLab CI, etc.) |
| 2️⃣ | Select your platform |
| 3️⃣ | DeployIQ runs a 4-step LangGraph agent: **Observe → Classify → Diagnose → Format** |
| 4️⃣ | Receive a structured diagnosis with root cause, fix steps, and PR diff |
| 5️⃣ | Submit feedback — did the fix work? The system learns for your team |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend (HTML/CSS/JS)                │
│  index.html  •  app.js  •  styles.css  •  styles-extra.css  │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST (JSON)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                  FastAPI Backend (Python 3.11)                │
│                                                              │
│  /api/auth       JWT verification via Supabase               │
│  /api/teams      Team management (create, assign, stats)     │
│  /api/pipeline   Webhook → Diagnose → Store → Embed          │
└───────────────────────────┬──────────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
  ┌───────────────┐ ┌─────────────┐  ┌────────────────┐
  │  LangGraph    │ │  Supabase   │  │  OpenAI /      │
  │  AI Agent     │ │  (Postgres  │  │  Anthropic     │
  │               │ │  + pgvector │  │  Embeddings    │
  │  Observe      │ │  + Auth +   │  └────────────────┘
  │  → Claude     │ │  Realtime)  │
  │  → Mistral ✨ │ └─────────────┘
  │  → Format     │
  └───────────────┘
```

### AI Diagnosis Pipeline (LangGraph)

The agent runs a deterministic 4-node state graph:

```
observe → diagnose_claude ──(success)──→ format_output → END
                          ──(rate limit)→ diagnose_mistral → format_output → END
```

| Node | Role |
|------|------|
| `observe` | Strips noise from raw logs; keeps ERROR/FAILED/exception lines + 2 lines of context |
| `diagnose_claude` | Calls Claude Sonnet 4.5 with compressed logs + team's past fixes injected as context |
| `diagnose_mistral` | Automatic fallback to Mistral Small on Claude rate-limit (429) |
| `format_output` | Builds the final structured human-readable diagnosis |

---

## 📁 Project Structure

```
DeployIQ/
├── index.html              # Main frontend entry point
├── app.js                  # Frontend logic (vanilla JS)
├── styles.css              # Core design system
├── styles-extra.css        # Extended UI components & animations
├── config.js               # Frontend configuration
├── requirements.txt        # Python dependencies
├── Dockerfile              # Multi-stage Docker build (builder + slim runtime)
├── docker-compose.yml      # Local dev: API (port 8000) + Frontend (port 5500)
├── render.yaml             # One-click Render.com deployment
├── railway.toml            # Railway.app deployment config
├── generate_config.py      # Config generator utility
├── .env.example            # Environment variable template
│
├── backend/
│   ├── main.py             # FastAPI app factory — wires routers + CORS + lifespan
│   ├── agent/
│   │   └── graph.py        # LangGraph state machine (Observe → Diagnose → Format)
│   ├── routes/
│   │   ├── auth.py         # Supabase JWT verification + /api/auth endpoints
│   │   ├── pipeline.py     # Webhook receiver + diagnosis orchestration
│   │   └── teams.py        # Team CRUD + member assignment
│   └── db/
│       ├── supabase_client.py  # Supabase client singleton
│       └── repository.py       # All DB read/write operations (single source of truth)
│
├── supabase/               # Supabase migrations & SQL functions
└── src/
    ├── hooks/              # Frontend custom hooks
    └── lib/                # Shared frontend utilities
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- A [Supabase](https://supabase.com) project (free tier works)
- An [Anthropic](https://console.anthropic.com) API key (Claude Sonnet)
- An [OpenAI](https://platform.openai.com) API key (for `text-embedding-3-small`)
- Docker (optional, for containerized local dev)

### 1. Clone & Set Up Environment

```bash
git clone https://github.com/your-username/DeployIQ.git
cd DeployIQ

# Copy the environment template
cp .env.example .env
```

### 2. Configure `.env`

```env
# ── Supabase ─────────────────────────────────────────────────
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...             # safe to expose in browser
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # NEVER expose — backend only

# ── Frontend (Vite) ──────────────────────────────────────────
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# ── AI Models ────────────────────────────────────────────────
OPENAI_API_KEY=sk-...                # for text-embedding-3-small
ANTHROPIC_API_KEY=sk-ant-...         # for Claude Sonnet 4.5

# ── Webhook Security ─────────────────────────────────────────
WEBHOOK_SECRET=your-random-secret   # shared with GitHub Actions / Jenkins

# ── Optional ─────────────────────────────────────────────────
MISTRAL_API_KEY=...                  # automatic fallback LLM
SLACK_BOT_TOKEN=xoxb-...            # Slack notifications
```

### 3. Run with Docker (Recommended)

```bash
docker-compose up --build
```

| Service | URL |
|---------|-----|
| FastAPI Backend | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Frontend | http://localhost:5500 |

### 4. Run Backend Locally (Without Docker)

```bash
# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start FastAPI
uvicorn backend.main:app --reload --port 8000
```

---

## 📡 API Reference

### Health

```
GET /health
→ { "status": "ok", "version": "2.0.0" }
```

### Authentication

```
GET  /api/auth/me          → Returns current user profile (requires Bearer token)
GET  /api/auth/session     → Lightweight session validity check
```

### Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/pipeline/webhook` | Receive a CI/CD failure event — runs full diagnosis |
| `GET`  | `/api/pipeline/failures/{team_id}` | List recent failures for a team |
| `GET`  | `/api/pipeline/diagnoses/{team_id}` | List recent diagnoses |
| `GET`  | `/api/pipeline/diagnosis/{diagnosis_id}` | Fetch a single diagnosis |
| `GET`  | `/api/pipeline/stats/{team_id}` | Team-level statistics |
| `POST` | `/api/pipeline/feedback` | Submit fix feedback (worked: true/false) |

#### Webhook Payload Example

```json
POST /api/pipeline/webhook
X-Webhook-Secret: your-random-secret

{
  "team_id": "uuid-of-your-team",
  "repo_url": "https://github.com/org/repo",
  "platform": "github_actions",
  "failed_stage": "build",
  "raw_logs": { "run_id": "12345", "logs": "..." },
  "compressed_logs": "Error: Cannot find module 'react'\n  at Function.Module..."
}
```

#### Diagnosis Response

```json
{
  "failure_id": "uuid",
  "diagnosis_id": "uuid",
  "confidence": "HIGH",
  "root_cause": "Missing peer dependency 'react' not installed before build step."
}
```

### Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/teams/` | Create a new team (caller becomes admin) |
| `GET`  | `/api/teams/{team_id}` | Get team info |
| `GET`  | `/api/teams/{team_id}/members` | List team members |
| `POST` | `/api/teams/{team_id}/assign` | Assign a user to a team |
| `GET`  | `/api/teams/{team_id}/stats` | Diagnosis statistics for a team |

---

## 🧠 Diagnosis Categories

The AI classifies every failure into one of six categories:

| Category | Description |
|----------|-------------|
| `dependency_conflict` | Package version mismatches, missing deps |
| `environment_misconfiguration` | Missing env vars, wrong runtime versions |
| `build_script_failure` | Errors in npm/make/gradle/etc. scripts |
| `infrastructure_error` | Container/runner/resource issues |
| `network_external` | Timeout or connectivity to external services |
| `test_quality_gate` | Test failures blocking the pipeline |

---

## 🗄️ Database Schema (Supabase)

| Table | Purpose |
|-------|---------|
| `users` | Auth users + team assignment + role |
| `teams` | Team profiles with slugs |
| `pipeline_failures` | Raw CI/CD failure events |
| `diagnoses` | Structured AI diagnosis results |
| `fix_embeddings` | pgvector embeddings for semantic similarity search |
| `fix_feedback` | User feedback on whether a fix worked |
| `team_diagnosis_stats` | Materialized view for team statistics |

### Semantic Similarity Search

When a new failure comes in, DeployIQ:
1. Embeds the compressed logs using `text-embedding-3-small` (1536 dims)
2. Calls the `match_similar_fixes` Postgres function via pgvector
3. Injects up to 3 past fixes (similarity ≥ 0.70) as context into the Claude prompt

This means the AI learns from your team's history and gets more accurate over time.

---

## ☁️ Deployment

### Render.com (One-Click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com)

The `render.yaml` is pre-configured. Just connect your repo and set the environment variables in the Render dashboard.

### Railway.app

```bash
# Install Railway CLI
npm install -g @railway/cli

railway login
railway up
```

Set env vars via the Railway dashboard or `railway variables set KEY=VALUE`.

### GitHub Actions CI/CD Integration

Add this step to your existing workflow to send failure events to DeployIQ:

```yaml
- name: Notify DeployIQ on failure
  if: failure()
  run: |
    curl -X POST "${{ secrets.DEPLOYIQ_API_URL }}/api/pipeline/webhook" \
      -H "Content-Type: application/json" \
      -H "X-Webhook-Secret: ${{ secrets.DEPLOYIQ_WEBHOOK_SECRET }}" \
      -d '{
        "team_id": "${{ secrets.DEPLOYIQ_TEAM_ID }}",
        "repo_url": "${{ github.server_url }}/${{ github.repository }}",
        "platform": "github_actions",
        "failed_stage": "${{ github.job }}",
        "raw_logs": {},
        "compressed_logs": "Build failed in job: ${{ github.job }}"
      }'
```

---

## 🔒 Security

- **JWT Validation**: Every protected endpoint validates the Supabase Bearer token via `get_current_user` dependency injection.
- **Webhook Secret**: The `/api/pipeline/webhook` endpoint validates `X-Webhook-Secret` header against `WEBHOOK_SECRET` env var.
- **Non-root Docker**: The container runs as a dedicated `deployiq` user (UID 1001).
- **Service Role Key**: The `SUPABASE_SERVICE_ROLE_KEY` is only used server-side and never exposed to the frontend.
- **CORS**: Controlled via `ALLOWED_ORIGINS` env var — defaults to `localhost` only.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | HTML5, Vanilla CSS, Vanilla JS |
| **Backend** | Python 3.11, FastAPI 0.111, Uvicorn |
| **AI Agent** | LangGraph 0.1.5, Claude Sonnet 4.5 (Anthropic), Mistral Small (fallback) |
| **Embeddings** | OpenAI `text-embedding-3-small` (1536 dims) |
| **Database** | Supabase (PostgreSQL + pgvector + Auth + Realtime) |
| **Auth** | Supabase Auth (Email OTP / OAuth) |
| **Containerization** | Docker (multi-stage), Docker Compose |
| **Deployment** | Render.com, Railway.app |
| **Validation** | Pydantic v2 |

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/your-feature`
3. **Commit** your changes: `git commit -m 'feat: add your feature'`
4. **Push** to your branch: `git push origin feat/your-feature`
5. **Open** a Pull Request

### Code Style

- Python: follow [PEP 8](https://peps.python.org/pep-0008/) — all existing files use type hints and docstrings
- All DB interactions go through `backend/db/repository.py` — no direct Supabase calls in routes
- New routes should use `Depends(get_current_user)` for authentication

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

Built with ❤️ by **Surajj and vyoumm**

> *"Stop debugging. Start shipping."*
