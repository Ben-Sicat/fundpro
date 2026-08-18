# Handover — 18 Aug 2026

State at `cf0bdc0`. Working tree clean, `main` pushed, nothing in flight.

Read `/CLAUDE.md` first — domain rules, conventions and environment quirks live
there and are not repeated here. This file covers what changed recently, what
is decided, and what is still open.

---

## Where things stand

| | |
|---|---|
| Backend | 379 tests pass, ruff clean. Runs on an **in-process store** — no database yet. |
| Frontend | Builds clean, 85 tests pass. **No mock data layer** — every figure comes from the service. |
| Repo | `main` rewritten to remove all Claude co-authors. Sole author Ben-Sicat. Rewritten commits are **unsigned** (GPG needs an interactive passphrase). Original signed history: local branch `backup/pre-rewrite-20260818` (`bf0a558`). |
| Vercel | Builds fine, **shows the error page** until `PREPROCESS_API_URL` / `PREPROCESS_API_KEY` are set. There is no data source without them. |
| Render | `render.yaml` + `backend/Dockerfile` are in. Image built and exercised against the real 121-row file. **Not yet deployed.** |

### Run it locally

```bash
# backend  (port 8000)
cd backend && uv run uvicorn app.asgi:app --port 8000

# frontend (port 3000) — needs .env.local with PREPROCESS_API_URL/KEY
cd frontend && pnpm build && pnpm start --port 3000
```

Both were running when this was written.

---

## Two decisions waiting on the owner

1. **Database host** — Supabase project, or a cheaper VPS Postgres? Nothing can
   move off the in-process store until this is answered. It also unpins the
   worker count (see below).
2. **The spec divergence** (next section) needs confirming with the client,
   because it changes what "no matching application" means in their reporting.

---

## The one deliberate divergence from the spec

**MASTER_SPEC §4.1:** *"Unknown serial → 'no_matching_pledge'."*

**What the platform does now:** builds a provisional application from the bank
row and marks it `PROVISIONAL (from bank file)`.

Changed on the owner's instruction 2026-08-18. A Status Report routinely
carries serials the Apps Tracker has not caught up with — the August file was
121 rows, none of which matched — and that bank row is the only place the
billing outcome will ever exist. Reversible with one setting
(`createMissingFromBank = false`), whose path is still tested. Full reasoning
in `docs/FINDINGS.md`.

---

## Bug classes found recently — worth knowing before touching related code

**Pydantic request models that silently drop the payload.** `RulesIn`,
`BonusRuleIn`, `BonusTierIn` and `PlanIn` were plain `BaseModel`s with
snake_case fields while the API emits camelCase. Nothing bound, each handler's
`if value is not None` guard skipped every field, and the endpoint returned
**200 with the old values echoed back**. Consequence: no commission plan field
was ever settable, including the ×3 multiplier. Fixed by extending `Wire`.
`tests/test_api_settings_binding.py` now fails the build if any request model
with a multi-word field lacks aliases. **Do not add a request model on plain
`BaseModel`.**

**Stale `.next` under a running server.** Rebuilding while `next start` is live
leaves the server serving an old build; symptoms range from missing CSS to
every page erroring. Always `pkill` the server, `rm -rf .next`, rebuild, then
start. Check `BUILD_ID` mtime against the server's start time when something
inexplicable happens.

**`pkill -f "next-server"` kills its own shell** — the pattern matches the
invoking command line. Use `pkill -f "[n]ext-server"`. This silently killed
several build commands mid-run and left stale artifacts behind.

---

## Recent work, briefly

**UI revamped** into an "operations console" — one design system in
`globals.css` (previously four stacked eras), frosted-glass panels over a 32px
grid with lights tracing it, and a monospace face on all data. Two type
classes matter: `.tabular` (mono — table cells, serials, codes, dates) and
`.figure` (sans, tabular numerals — headline numbers only; mono centres the
period so "50.0%" reads "50 . 0%" at display size). Signature element is the
lifecycle rail on the pledge page.

**Mock data layer deleted.** `lib/data/index.ts` is a thin remote facade;
`requireBackend()` throws when unconfigured rather than returning empty, so
"cannot reach the service" and "nothing uploaded yet" cannot look alike.
`lib/mock/users.ts` survives — those are sign-in credentials, not data, and go
when Supabase auth lands.

**New capability:** manual cancellations with a required reason (marked
`manual` so imports cannot overwrite them); retry counters per donor
(`failedAttempts`, `attemptsToSuccess`); custom exports from a 45-column
catalogue with charity scope enforced at the service layer.

---

## Deploying — the remaining steps

1. Render → New → Blueprint → point at the repo. It reads `render.yaml`, builds
   `backend/`, generates `API_KEY`. **Copy that value.**
2. Vercel → Environment Variables: `PREPROCESS_API_URL` = the Render URL,
   `PREPROCESS_API_KEY` = the same value. Redeploy.

Two things that were fixed to make this possible, so don't undo them:
`SUPABASE_DB_URL` is **optional** (it was required, so the container could not
boot before Postgres existed), and `/health` returns **200 "not configured"**
without a database (as a 503 the platform health check holds the container in
a restart loop).

**Worker count is pinned to 1** in the Dockerfile. The store is in-process, so
a second worker serves a different copy of the data and uploads appear to
vanish at random. It stays 1 until Postgres is the store.

Do **not** add a root `vercel.json` — the project's Root Directory is already
set to `frontend` and a root config would double the path on a working build.

---

## Still open

- **Database + moving the store off in-process** — blocked on the host decision.
- **"Standardize the results"** — the owner said a list is coming; never arrived.
- **Vocabulary pass** — blocked on the owners' internal term list.
- **FileZilla ingestion** — status reports come off FTP; direct-read automation
  was discussed, never scoped.
- **Realization-rate denominator** — the backend has one setting, the frontend
  historically had three definitions. Needs a client decision.
- **Legacy data merge** — the owner plans to backfill. Current upsert is
  last-write-wins and **blanks overwrite populated fields**. Verified, not
  fixed. Fix before any backfill.
- **Payroll draft run shows zeros** — 0 fundraisers / ₱0 with an empty table
  under a header row. Eligibility/data issue, not styling. Chase before demoing
  that page.
- **Mock donor card renders `548809XXXXXX3036`** — X's, where the rule is that
  the bank's asterisk mask is preserved exactly. Only affects seeded data, not
  the real path, but it would mislead in a demo.
- **Donors page** was never reviewed after the revamp.

---

## Handling notes

Real client data lives in `/doc/` and is gitignored, as is `*.xlsx`. Never
commit, email or share it. No PII in logs, error messages or seed data
(RA 10173). `charity_viewer` is scoped to one charity and can never see donor
contact, payment or payroll data — enforced at the service layer, not the UI.
Of the generated PDFs only **Finance** and **How It Works** are client-safe;
the Meeting Brief and Runbook are internal.

GPG signing cannot be automated here — it needs the passphrase interactively.
Either the owner commits, or commits are made with
`git -c commit.gpgsign=false` and are unsigned.
