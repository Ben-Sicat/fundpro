# BACKEND BUILD PROMPT — Python preprocessing service + Supabase
### Paste-ready kickoff for a fresh Claude Code session · v1.0 · 31 Jul 2026

> **How to use:** open a fresh session in this repo and paste the one-liner
> from the section below for the phase you want. Each phase is one session;
> commit before starting the next. The frontend is DONE and mock-driven — this
> document exists so the backend is built against what the UI already expects,
> not re-invented.

---

## The kickoff prompt (paste this)

```
Read docs/BACKEND_PROMPT.md in full, then docs/FINDINGS.md and CLAUDE.md.
Execute Phase 0 exactly as specified. Stop when its Definition of Done passes
and list any assumptions you made that are not written down.
```

For later phases, replace "Phase 0" with the phase number.

---

## 1. Mission

Build the **Python service** that owns everything the UI does not:

1. **Parse** the three legacy xlsx artifacts (defensively — see §5, every trap
   is real and verified against the client's actual files).
2. **Consolidate**: match Status Report rows to applications on `SERIAL NO`,
   append to billing history, derive current status. Idempotent.
3. **Export**: regenerate the legacy master copies byte-compatibly, plus the
   derived reports.
4. **Derive payroll**: cutoffs, eligibility, commission, clawbacks, per-currency
   netting — porting the already-tested TypeScript rules.
5. **Serve an HTTP API** the Next.js UI swaps onto with zero component changes.

**Supabase is the database** (it is plain Postgres). The schema already exists
and is tested — see §3.

## 2. Where it lives, and the stack

- Create the service in **`backend/`** inside this repo. The verified findings,
  the sample files (`/doc`, gitignored) and the frontend contract all live
  here; a separate repo would orphan the backend from all three.
- **Python 3.12+, FastAPI, Pydantic v2** (models configured with camelCase
  aliases — the JSON must match the TypeScript types, see §4).
- **openpyxl in `read_only` mode** for parsing; **exceljs-equivalent output via
  openpyxl** for generation.
- **psycopg 3** with a direct Postgres connection to Supabase. Do NOT use
  PostgREST/supabase-py for consolidation — batch upserts inside one
  transaction need real SQL. Use the **session pooler** connection string
  (port 5432, `sslmode=require`); long import transactions do not belong on
  the transaction pooler.
- **pytest** (tests FIRST for the parser and payroll), **ruff** for lint.
  Use `uv` if available, else venv + pip. Pin dependencies.
- Env via `pydantic-settings`: `SUPABASE_DB_URL`, `API_KEY` (bearer token the
  Next.js server sends), `LOG_LEVEL`. Never commit any of them; extend
  `.env.example`.

## 3. Schema: already built — do not redesign it

`frontend/db/schema.ts` (Drizzle) is the complete, tested schema: 32 tables, 10 CHECK
constraints, the `billing_events` unique natural key, masked-PAN-only payment
columns. It pushes to Supabase unchanged because Supabase is Postgres:

```
cd frontend && DATABASE_URL=<supabase session-pooler url> pnpm db:push
```

**Drizzle stays the schema owner.** Python treats the schema as a read/write
contract but never migrates it — one migration system, not two fighting. If a
column is genuinely missing, change `frontend/db/schema.ts`, push, then use it.

Load-bearing invariants (enforced in DB, respect them in code):

- `billing_events` is **append-only**; dedupe key `(pledge_id, status_id,
  status_date)` makes re-uploads idempotent. Never update or delete a row.
- Current pledge status is **derived from the latest event**, then denormalized
  onto `pledges.current_status_id/current_status_date`.
- `pledges.debit_date` = first event whose status classifies as `approved`.
- Business logic branches on `status_codes.classification`, **never** on a raw
  status id. New bank codes are settings inserts.
- Money columns are `numeric` — use `Decimal` end to end, never float.
- No column may ever hold a full PAN. `542550XXXXXX2906` masked shapes only.

## 4. The API contract — the UI already defines it

The frontend reads exclusively through **`frontend/lib/data/index.ts`** (every function
async on purpose) and its response types are **`frontend/lib/types.ts`**. Your JSON
field names must match those TypeScript interfaces exactly (camelCase:
`serialNo`, `debitDate`, `currentClassification`, …). The final integration
step replaces each mock body with `fetch` + Zod — no component changes.

Endpoints to serve (mirror the seam one-to-one):

| Endpoint | Serves |
|---|---|
| `GET /pledges` (+ filters) | `getPledges` — q, charity, site, leader, fundraiser, status, verified, **date basis across all seven dates**, from/to |
| `GET /pledges/{serial}` | `getPledge` |
| `GET /pledges/{serial}/events` | `getBillingEvents` |
| `GET /kpis`, `/timeseries`, `/results-split`, `/instrument-split`, `/age-bands`, `/frequency-mix` | dashboard widgets (same filters) |
| `GET /fundraisers`, `/leaders`, `/sites` | team + site records incl. **multiple leaders per fundraiser** |
| `POST /uploads` (multipart) · `GET /uploads` · `GET /uploads/{id}/impact` | the consolidation pipeline + the what-changed panel |
| `GET /exceptions` · `POST /exceptions/{id}/resolve` | review queue |
| `GET /exports/templates` (with live row counts) · `POST /exports/{code}` → file | export presets; counts must come from the collection each report is built on |
| `GET /payroll/run?asOf=` | derived draft run: cutoff, lines, clawback candidates, per-currency nets |
| `GET /health` | DB reachability, no error details leaked |

Auth: every request carries `Authorization: Bearer $API_KEY`; compare
constant-time; 401 otherwise. This is server-to-server (Next.js → FastAPI), so
no CORS surface is needed.

## 5. Parser requirements — every one verified against the real files

These are **acceptance tests, not advice**. Real client files cannot be
committed (PII — RA 10173), so Phase 1 includes a **fixture builder** that
generates xlsx files reproducing each trap; tests run against those.
Full evidence: `docs/FINDINGS.md` §2.

1. **Never trust `max_row`/dimensions.** Real sheets report ~1,048,570 rows
   holding ~436. Stream rows, stop after ~50 consecutive blanks.
2. **Never select a sheet by name.** Samples use `sheet1`, `Sheet1`, `Sheet2`
   for equivalent content. Match on header signature.
3. **Literal formula strings in data cells**: `=DATE(2026,7,8)` (dates),
   `=75*13` (amounts — evaluate literal arithmetic only, never cell refs
   blindly, and NEVER `eval` untrusted input — write a tiny arithmetic parser).
4. **`EXPIRY`/`ExpiryDate` is zero-padded MMYY TEXT.** `0728` must survive.
   Any numeric coercion is a bug.
5. **Amounts in three shapes**: `"1,000.00"` text, `1000` int, `=75*13`.
6. **Dates in three shapes**: real datetime, `=DATE(y,m,d)` string, plain
   10-char string.
7. **Apps Tracker junk columns**: position 4 (header `' '`) carries a 2-char
   value — keep it in `raw_row` jsonb, exclude from exports. Position 109 is
   truly blank.
8. **Normalize via settings, not code**: charity aliases (`UNHCR MY`→`UNHCR`,
   `WV`→`World Vision`…), frequency map (`1/3/6/12` + text labels — the
   meaning of `1` is UNCONFIRMED, keep it data), card-type casing.
9. A bad row → `import_exceptions` with the raw row; it must **never** fail
   the batch. Unknown STATUS ID → its own exception type.
10. Secondary match validation: donor name (case/whitespace-insensitive) and
    masked PAN when present; mismatch → exception, never a silent update.

## 6. Payroll — port, don't reinvent

`frontend/lib/services/payroll.ts` + `frontend/lib/services/payroll.test.ts` (46 tests) encode
rules that were **measured from the client's own payroll workbook**
(FINDINGS §3.7). Port both the functions and every test case to Python:

- Eligibility default `on_first_approval` — evidence-backed: 545 reference
  rows show a bank failure reason where the commission would be.
- Commission = pledge × multiplier; **×3.0 default** (the measured mode).
  The driver of ×0.5…×4 variation is unknown → plan field, never inferred.
- Semi-monthly cutoffs incl. short months and leap February; no invalid
  `Feb-30` pay date.
- Plan effective-dating by **signup date** — a new plan must not reprice
  historic runs.
- A paid pledge that later cancels still gets its payout line; the reversal is
  a clawback candidate an admin confirms. Unconfirmed candidates never reduce
  pay. Nets can go negative.
- **Never sum across currencies.** Every fundraiser in the book has both PHP
  and MYR pledges; nets are per fundraiser **per currency**.

## 7. Exports — the deliverable that keeps trust

- **A1 Master Apps Tracker**: exactly the 111 named headers from
  MASTER_SPEC §4.5, byte-for-byte, in order, quirks included
  (`CUSTOMER'S NAME`, `Fax AREACODE`, `CHQ/MO/PO`, `Invoice No.`). `AGE` is
  computed from DOB at export time, never stored.
- **A2**: the 26 bank columns flattened from billing history. **A3**: A2
  scoped to one upload + batch id/time.
- Acceptance test: parse `/doc/Master Apps Tracker - 16JUL2026.xlsx` locally,
  regenerate it, and diff headers + row values. (Local only — samples never
  enter git or CI.)
- Log every export in `export_runs` with `contains_pii`; audit-log it.

## 8. Security & logging (non-negotiable)

- No PII in logs, error messages, or exceptions that reach the API response.
  Log serials and counts, never names/emails/cards.
- Audit-log every import, export, payroll approval, settings change.
- Uploads: size-limited, extension+content checked, parsed in a temp dir.
- `.gitignore` already blocks `*.xlsx` and `/doc` — keep it that way.

## 9. Phases

**Phase 0 — Scaffold.** `backend/` with FastAPI app factory, pydantic-settings,
bearer-auth middleware, `/health` that pings Supabase, pytest + ruff wired,
README with run instructions. Push the Drizzle schema to Supabase and prove
`/health` sees the tables. DoD: tests pass, ruff clean, `uvicorn` serves,
health returns table count.

**Phase 1 — Parser.** Fixture builder + tests for every trap in §5 FIRST, then
the parser: sheet detection, cell normalizers (amount/date/expiry), row
streamer. Pure functions, no DB. DoD: all trap tests green; parsing the local
real samples (manual run) yields the documented shapes.

**Phase 2 — Consolidator.** Match on serial, secondary validation, exceptions,
append events (dedupe on the natural key), derive current status + debit date,
upload impact summary, audit log — one transaction per batch. DoD: re-uploading
the same file changes nothing; every exception path has a test.

**Phase 3 — Exports.** A1/A2/A3 legacy-exact plus B/C/D reports from
`frontend/lib/exports/presets.ts` definitions. DoD: round-trip header diff against the
local sample is empty; row counts match the preset count rules.

**Phase 4 — API + payroll.** All §4 endpoints; port §6 payroll with its full
test suite. DoD: every endpoint returns `frontend/lib/types.ts`-shaped JSON validated in
tests; 46 payroll cases green in Python.

**Phase 5 — Swap the seam** (frontend session, this repo): replace each
`frontend/lib/data/index.ts` body with `fetch(PREPROCESS_API_URL)` + Zod schema parse;
add `loading.tsx`/Suspense boundaries now that latency is real. DoD: UI renders
identically against the live API; charity_viewer scoping enforced server-side.

## 10. Still unconfirmed — build as configuration, never hardcode

1. What drives the commission multiplier (×0.5…×4).
2. Whether `Frequency = 1` means monthly or annual.
3. The full bank status-code dictionary (only 66 and 59 confirmed; the payroll
   reference's failure strings in FINDINGS §3.7 are a usable head start).
4. Whether MY pledges settle in MYR (currency is per-pledge regardless).
5. 7th/13th-month pay — out of scope until the client confirms.
