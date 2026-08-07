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

## Parsing (Phase 1)

`app/parsing/` turns a client workbook into typed records. Pure functions, no
database. The public surface is `read_rows(path)` → `parse_status_report(...)`.

Every defence exists because the real files needed it (docs/FINDINGS.md §2 and
the 2026-08-07 addendum):

- Sheets are chosen by **header signature**, never by name or index.
- Reported dimensions are ignored; reading stops after a run of blank rows.
- Cells are read twice — cached values and formulas — so `=DATE(2026,7,8)` and
  `=75*13` both resolve, and `=H2*2.5` resolves when Excel cached an answer.
- `ExpiryDate` stays **text**, so `0728` keeps its leading zero.
- Junk columns are preserved in the raw row, excluded from exports.
- A bad row becomes an `import_exception` and **never fails the batch**.

Formula arithmetic is evaluated by a hand-written parser in `arithmetic.py`,
not `eval` — spreadsheet cells are untrusted input.

The authoritative column lists are in `app/parsing/headers.py`, transcribed
from the real files. Test fixtures import them, so a fixture cannot drift from
the schema it reproduces.

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
