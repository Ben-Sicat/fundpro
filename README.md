# FundPro — Donor Management Platform

Platform for a face-to-face fundraising agency (PH + Malaysia). Replaces three
manually-merged Excel trackers with automated consolidation, dashboards,
payroll, and one-click legacy-compatible exports. Full spec:
[docs/MASTER_SPEC.md](docs/MASTER_SPEC.md).

## Repo layout

| Path | What it is |
|---|---|
| `frontend/` | Next.js 15 UI (currently mock-driven — no DB needed). Owns the Drizzle schema (`frontend/db/schema.ts`). |
| `backend/` | Python FastAPI service: xlsx parsing, consolidation, exports, payroll derivation. Build guide: [docs/BACKEND_PROMPT.md](docs/BACKEND_PROMPT.md). |
| `docs/` | Spec, verified findings, backend build prompt. |
| `doc/` | Real client files — **gitignored, never commit** (RA 10173). |
| `docker-compose.yml` | Local Postgres 16 on port **5433** (shared dev DB). |

## Frontend

```bash
cd frontend
pnpm install
pnpm dev        # http://localhost:3000 — sign in admin@fundpro.local / demo1234
pnpm test
pnpm build      # rm -rf .next afterwards before running dev again
```

Deployment: see [DEPLOY.md](DEPLOY.md).

## Backend

```bash
cd backend
cp .env.example .env   # fill in SUPABASE_DB_URL and API_KEY
uv sync
uv run pytest
uv run ruff check .
uv run uvicorn app.asgi:app --reload --port 8000
```

Schema is pushed by Drizzle from the frontend workspace (`pnpm db:push`);
the Python service reads/writes but never migrates.
