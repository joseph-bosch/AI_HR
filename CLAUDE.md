# AI HR System

AI-powered HR hiring system with resume screening, interview question generation, candidate evaluation, offer letter generation, candidate management, and pipeline management.

## Tech Stack

- **Backend:** Python 3.11, FastAPI, SQLAlchemy (async), aioodbc
- **Frontend:** React 18 + TypeScript, Vite, TailwindCSS, framer-motion, TanStack Query, react-i18next
- **Database:** Microsoft SQL Server Express (Windows Auth via ODBC Driver 17)
- **LLM:** Ollama (local) — model: `qwen3.5:9b` (configured in `.env`)
- **PDF Generation:** WeasyPrint (requires GTK3 Runtime on Windows)
- **Audio Transcription:** WhisperX + PyAnnote (optional)

## Architecture

```
frontend/ (React SPA on port 5173 dev / IIS production)
  └── /api/* proxied to backend

backend/ (FastAPI on port 8000)
  ├── app/api/          — Route handlers (REST endpoints)
  ├── app/models/       — SQLAlchemy ORM models
  ├── app/services/     — Business logic (screening, chat, questions, offers, etc.)
  ├── app/llm/          — LLM provider abstraction (Ollama)
  │   └── prompts/      — System/user prompt templates
  ├── app/config.py     — Pydantic settings (reads .env)
  ├── app/database.py   — Async engine + session factory
  └── app/main.py       — FastAPI app, lifespan, migrations
```

## Running Locally (Dev Machine)

```bash
# Backend (terminal 1)
cd backend
hr_env\Scripts\activate        # Windows venv
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (terminal 2)
cd frontend
npm run dev                    # Vite dev server on port 5173
```

Frontend proxies `/api/*` to `http://localhost:8000` via `vite.config.ts`.

## Production Deployment (Two-Server)

- **Server A** (restricted network): Backend (port 8000 via NSSM) + SQL Server + Ollama (port 11434)
- **Server B** (user network): IIS serving `frontend/dist/` + URL Rewrite/ARR reverse proxy → Server A:8000
- Firewall: Server B → Server A on TCP 8000 only
- Config: `frontend/web.config.production` (replace `SERVER_A_IP` with real IP)

## Key Conventions

- **i18n:** All UI text uses `useTranslation()` with keys in `frontend/src/i18n/locales/{en,zh}.json`
- **framer-motion variants:** Use `as const` on transition `type` fields (e.g., `type: 'spring' as const`) to satisfy TypeScript strict mode
- **Type imports:** Use `import { type ReactNode }` (verbatimModuleSyntax enabled)
- **LLM JSON mode:** Ollama provider strips `<think>` tags before JSON parsing; fallback regex extraction
- **LLM timeouts:** Default 300s (`LLM_TIMEOUT_SECONDS` in config); question generation uses `max_tokens=8192`
- **Translation service:** Background task auto-translates ALL generated content to the other language (en↔zh), including resume parsed data (summary, skills, experience, education), screening scores (explanation, strengths, weaknesses, additional_insights), evaluation reports, decision reports, and offer content
- **Database migrations:** Handled in `main.py` lifespan via `_run_migrations()` (idempotent ALTER TABLE statements using `IF NOT EXISTS`)
- **Services run as NSSM Windows services** in production (not IIS HttpPlatformHandler)
- **DB session auto-commit:** `get_db()` dependency auto-commits after handler returns; use `flush()` inside handlers (not `commit()`)
- **Archive pattern:** `Candidate.is_archived` + `archived_at` fields; archived candidates are excluded from all queries (screening, pipeline, chat, dashboard) by default via `include_archived=False`
- **Pydantic response schemas:** All ORM fields that should be returned by the API **must** be declared in the corresponding Pydantic response model (`schemas/candidate.py`), otherwise Pydantic silently drops them
- **Breadcrumb navigation:** `Breadcrumb.tsx` uses URL segments + `location.state` to build crumbs; pass `state={{ from: 'candidates' }}` or `state={{ jobId }}` on `<Link>` to control the breadcrumb trail

## Backend .env Configuration

```env
DB_SERVER=localhost\SQLEXPRESS
DB_NAME=AI_HR_DB
DB_DRIVER=ODBC Driver 17 for SQL Server
DB_TRUSTED_CONNECTION=yes
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.5:9b
CORS_ORIGINS=["http://localhost:5173"]
LLM_TIMEOUT_SECONDS=300
DEBUG=true
```

## Frontend Build

```bash
cd frontend
npm run build          # outputs to frontend/dist/
```

Chunk size warning (~800KB) is expected due to framer-motion + i18next bundles.

## Module Overview

| Module | Backend Service | API Routes | Frontend Pages |
|--------|----------------|------------|----------------|
| Jobs | — | `jobs.py` | `Jobs/` |
| Candidates | — | `candidates.py` | `Candidates/CandidateListPage` |
| Screening | `screening_service.py` | `screening.py`, `candidates.py` | `Screening/` |
| Questions | `question_service.py` | `question_sets.py` | `Questions/` |
| Interviews | `interview_service.py` | `interviews.py` | `Interviews/` |
| Pipeline | — | `pipeline.py` | `Pipeline/` |
| Decisions | `decision_service.py` | `decisions.py` | `Pipeline/DecisionPage` |
| Offers | `offer_service.py` | `offers.py`, `templates.py` | `Offers/` |
| Chat | `chat_service.py` | `chat.py` | `ChatWidget` component |
| PDF | `pdf_service.py` | (used by question_sets, offers) | — |
| Translation | `translation_service.py` | (background tasks) | — |
| Dashboard | — | `jobs.py` (stats) | `Dashboard/` |

## Candidate Management

- **Manage Candidates page** (`/candidates`): Search, filter, archive/unarchive, delete candidates with inline confirmation
- **Archive:** Sets `is_archived=True` + `archived_at` timestamp; archived candidates are excluded from screening rankings, pipeline lists, shortlisting, chat queries, and dashboard counts
- **Delete cascade:** Manually deletes `InterviewDecision`, `InterviewEvaluation`, `GeneratedOffer`, `ScreeningScore` before deleting the candidate (no DB-level CASCADE)
- **Candidate detail:** Click candidate name → `/screening/candidate/{id}` with translated resume content (summary, skills, experience, education) and AI insights from screening score
