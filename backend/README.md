# FundPro preprocessing service

Python service that owns everything the UI does not: parsing the three legacy
xlsx trackers, consolidation on `SERIAL NO`, legacy-exact exports, payroll
derivation, and the HTTP API the Next.js frontend swaps onto. Build phases and
contract: [../docs/BACKEND_PROMPT.md](../docs/BACKEND_PROMPT.md).

## Run

```bash
cp .env.example .env    # set SUPABASE_DB_URL and API_KEY
uv sync
uv run uvicorn app.asgi:app --reload --port 8000
```

```bash
curl http://localhost:8000/health
# {"status":"ok","database":"reachable","tables":32}
```

Every other endpoint requires `Authorization: Bearer $API_KEY` (compared
constant-time; anything else is a 401). `/health` is deliberately
unauthenticated so probes work, and returns no error details when the DB is
down — the real error goes to the server log only.

## Test & lint

```bash
uv run pytest
uv run ruff check .
```

Tests never touch a real database; DB calls are monkeypatched.

## Database

**Drizzle owns the schema** (`../frontend/db/schema.ts`). This service
reads/writes but never migrates. To (re)push the schema:

```bash
cd ../frontend && DATABASE_URL=<session-pooler-url> pnpm db:push
```

Load-bearing invariants (also enforced in the DB — see BACKEND_PROMPT §3):
`billing_events` is append-only with dedupe key
`(pledge_id, status_id, status_date)`; current status derives from the latest
event; branch on `status_codes.classification`, never raw status ids; money is
`Decimal` end to end; masked PANs only.

## Security ground rules (RA 10173)

No PII in logs, error messages, or API error responses — log serials and
counts, never names/emails/cards. Real client files live in `../doc/`
(gitignored) and never enter git or CI.
