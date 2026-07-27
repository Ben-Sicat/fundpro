# Donor Management Platform

## What this is
A web platform for a face-to-face (F2F) fundraising agency in the Philippines.
The agency is hired by charity clients (e.g., Save the Children, charity code
"STC") to recruit recurring donors at physical sites (airports, malls, events).
Donors pledge a monthly amount charged to a credit/debit card via a processing
bank (HSBC). The agency invoices the charity per realized donor and pays its
fundraisers commissions per pledge — with clawbacks when pledges cancel or
never bill successfully. Today everything runs on three manually-merged Excel
files. This platform replaces that with automated consolidation, dashboards,
payroll, and one-click exports. Full spec: /docs/MASTER_SPEC.md

## The three legacy files (schemas must stay reproducible as exports)
1. Master Apps Tracker — 113 cols, one row per donor application.
2. Master Results Tracker — 26 cols, accumulated bank status history.
3. Status Report — same 26 cols; daily file from the bank
   (STATUS ID 66 = Billing Approved, 59 = Billing Failed DNH/retry).
Universal join key: SERIAL NO (e.g., "FES48402552") — unique per pledge.
Sample files: /docs/samples/

## Core domain rules
- Seven lifecycle dates, all first-class and filterable: signup, status
  (submission), debit (when actually charged — the money moment),
  verification (donor PHONED and confirmed real — a quality gate),
  cancellation, invoice, payroll.
- Payroll is semi-monthly: cutoff 1st–15th paid in the ~15th run,
  16th–EOM in the ~30th run. Eligibility rule (acquisition alone vs.
  acquisition+approval) is CONFIGURABLE — never hard-code it.
- Fundraisers sit under leaders (many-to-many, effective-dated).
  Dashboards roll up per leader as well as per fundraiser.
- Sites are scheduled events (venue + date range + client charity +
  assigned fundraisers); pledges link to their acquisition site.
- billing_events is APPEND-ONLY. Current pledge status is derived from
  the latest event. Never overwrite billing history.
- Bank status codes live in status_codes with a classification column
  (approved / failed_retryable / failed_final / cancelled / other).
  New codes are added via admin settings, never hard-coded in logic.
- Realization rate (% of sign-ups that successfully bill) is the
  business's core quality metric — surface it everywhere performance
  is shown.

## Security & privacy (non-negotiable)
- NEVER store full card numbers. Masked PAN only (542550XXXXXX2906).
- Roles: admin, operations, payroll, viewer, charity_viewer.
  charity_viewer is scoped to ONE charity and can NEVER see donor
  contact details, payment data, or payroll data — enforced at the
  service layer, not just the UI.
- Audit-log every import, export, payroll approval, settings change.
  Exports containing PII are flagged in the log.
- PH Data Privacy Act (RA 10173) applies. No PII in logs, error
  messages, or seed data committed to git.

## Stack
- Next.js 15 (App Router, TypeScript strict)
- PostgreSQL 16 + Drizzle ORM (/db/schema.ts, drizzle-kit migrations)
- Dev DB: Neon free tier. Prod: Neon Launch + Vercel OR VPS + Docker
  (undecided; keep both paths viable).
- Auth.js v5 (credentials), role carried in session
- Tailwind CSS + shadcn/ui; Recharts for charts
- exceljs for xlsx parse/generate; Zod at all API boundaries
- Jobs behind /lib/jobs/scheduler.ts interface with two drivers:
  vercel-cron (default) and pg-boss (VPS). Never call a driver directly.
- Vitest (unit), Playwright (e2e for critical flows only)

## Conventions
- Server Actions for mutations; route handlers only for file
  upload/download and cron endpoints (cron endpoints auth via secret).
- Money: numeric/decimal only, never floats. Currency PHP default.
- Dates: date/timestamptz stored UTC, displayed Asia/Manila.
- Domain logic = pure functions in /lib/services/* with unit tests;
  components contain no business rules.
- Every table has created_at; mutable tables add updated_at.
- Excel parsing is defensive: handle literal "=DATE(2026,7,8)" strings,
  comma amounts ("1,000.00"), mixed date formats. Bad rows go to
  import_exceptions; a bad row must never fail the batch.
- Legacy export column headers must match the legacy files EXACTLY,
  including quirks ("CUSTOMER'S NAME", "CHQ/MO/PO", "Fax AREACODE").
- Age is computed from DOB at query time, never stored.

## Commands
pnpm dev · pnpm build · pnpm test · pnpm test:e2e ·
pnpm db:migrate · pnpm db:seed · pnpm migrate:legacy

---

# Facts verified against the real sample files (2026-07-27)

These were confirmed by inspecting `/doc/*.xlsx` directly. Full detail and
open questions: **/docs/FINDINGS.md**. Do not re-derive these.

## Parser requirements (all CONFIRMED present in the samples)
- **Never trust `worksheet.rowCount` / dimensions.** Two payroll sheets report
  ~1,048,570 rows but hold only ~436 real rows. Always skip all-empty rows and
  stop at trailing blanks, or a million phantom rows will be processed.
- **Never rely on sheet NAME.** The samples use `sheet1` (lowercase),
  `Sheet1`, and `Sheet2` for equivalent content. Always take the first
  worksheet, or match on header signature.
- **Literal formula strings** appear in data cells and must be evaluated:
  `=DATE(2026,7,8)` (dates) and `=75*13`, `=H2*2.5` (amounts).
- **`EXPIRY` / `ExpiryDate` is zero-padded MMYY TEXT** — values `1028`, `0728`.
  Parsing as a number destroys `0728`. Keep as text, always.
- **Amounts arrive in three shapes** across files: `"1,000.00"` (comma text),
  `1000` (int), and `=75*13` (formula). Normalize all three.
- **Dates arrive in three shapes**: real datetime, `=DATE(y,m,d)` string, and
  plain string (`VERIFIEDDATE` is a 10-char string). Normalize all three.
- Apps Tracker junk columns are at **position 4 (header `' '`)** and
  **position 109 (header empty)**. Position 4 is NOT empty — it carries a
  2-char value (looks like the `FP` recruiter code). Drop both from exports
  but preserve position 4's value in the raw-row JSON; do not silently lose it.

## Legacy export A1 — validated
The MASTER_SPEC A1 column list is **111 named columns** and matches the real
Apps Tracker **exactly**: same header text (quirks included) and same order,
once the 2 junk columns are removed. 113 = 111 + 2 junk. Verified
programmatically; treat the spec list as authoritative.

## Scope corrections to the original spec
- **Multiple charities, not just STC.** Samples contain `STC`, `UNHCR`,
  `WWF`, `World Vision` — with alias drift (`UNHCR` / `UNHCR MY` /
  `UNHCR Malaysia`; `World Vision` / `WV`). Charity name normalization is a
  settings-driven alias map, never hard-coded.
- **The operation is multi-country (PH + Malaysia), not PH-only.** Sample sites
  include `LRT Sri Rampai`, `Amcorp Mall`, `Lotus's Puchong`,
  `MRT Mutiara Damansara`. This is why `IC NUMBER`/`NRIC`, `CHINESENAME`,
  `SPOKEN LANGUAGE` and `SG BATCH NO` exist. Do NOT assume PHP-only currency
  or PH-only data residency.
- **Commission is a MULTIPLIER of pledge amount**, evidenced by formulas
  `=H2*2.5`, `=H3*3` (H = Pledge Amount) and 780 → 3120 (×4). The multiplier
  varies (×1, ×2.5, ×3, ×4) and may depend on frequency and/or campaign —
  still unconfirmed, so keep it configurable in commission_plans.
- **`Frequency` mixes codes and text**: `1`, `3`, `6`, `12`, `Monthly`,
  `Quarterly`, `Semi-Annual`, `Semi-annual`, `Annual`. The meaning of `1`
  is genuinely ambiguous (monthly vs once) — needs client confirmation;
  mapping lives in settings.
- **Card type casing drifts**: `CREDIT CARD`, `Credit Card`, `DEBIT CARD`.
- A **7th/13th-month pay** concept exists in the payroll reference that the
  spec does not model. Out of scope until confirmed.

## Environment notes
- `pnpm` is installed via corepack at `~/.local/bin/pnpm` (no root access to
  /usr/bin). Ensure `~/.local/bin` is on PATH.
- Local Postgres runs on **port 5433** (docker-compose.yml) to avoid clashing
  with the host's Postgres 17 on 5432.
- Network to the npm registry is slow and IPv6-only; pnpm is configured with a
  long `network-timeout`. Batch dependency installs rather than adding
  packages one at a time.
- Real client data lives in `/doc/` and is **gitignored** (as is `*.xlsx`).
  Never commit it.
- **`pnpm build` and `pnpm dev` share `.next/`** and their artifacts conflict:
  running dev after a production build gives
  `Cannot find module './vendor-chunks/…'` at runtime. Run `rm -rf .next`
  after a build before starting dev.
- Node 26 removed corepack, so `pnpm` is installed standalone via
  `npm install -g pnpm --prefix ~/.local`.
- Docker CLI defaults to a dead `desktop-linux` context here; use
  `docker context use default`. The credential helper blocks on an interactive
  GPG prompt, so image pulls need a clean `DOCKER_CONFIG` dir containing `{}`.
