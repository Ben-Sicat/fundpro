# MASTER BUILD DOCUMENT — Donor Management Platform
### Complete specification & build guide · v1.0 · 27 Jul 2026

> Source of truth for the build. Where the real sample files contradict or
> extend this document, **docs/FINDINGS.md** records the verified reality and
> takes precedence for parser and scope decisions.

---

# PART 1 — PROJECT CONTEXT

## 1.1 The business

The client is a **face-to-face (F2F) fundraising agency** in the Philippines. Charity organizations (e.g., Save the Children — charity code **STC**) hire the agency to recruit recurring donors. Fundraisers work physical **sites** (airport terminals such as Mactan-Cebu International, malls, events), signing donors up for a monthly pledge charged to a credit/debit card through a **processing bank** (HSBC in current data).

Three money flows define the business:
- **Revenue:** the agency invoices the charity per realized donor. If a donor later cancels or never bills, the agency credits the charity back (invoice clawback).
- **Cost:** fundraisers earn a commission per pledge, paid on semi-monthly cutoffs; commissions are clawed back when pledges cancel/unrealize.
- **The metric that decides profitability:** **realization rate** — the % of sign-ups that become successfully billing donors. A high-volume, low-realization fundraiser loses the agency money twice (wasted commission + charity credit-back).

## 1.2 The current process (all manual, in Excel)

1. Fundraiser signs a donor → new row in the **Master Apps Tracker** (113 columns: donor PII, payment instrument, attribution codes, billing result, payroll bookkeeping — at least seven tables' worth of concerns in one sheet). Each application gets a unique **SERIAL NO** (e.g., `FES48402552`) — the universal join key.
2. Applications are submitted to the bank. The bank returns a daily **Status Report** (26 columns) with billing outcomes: STATUS ID 66 = Billing Approved, 59 = Billing Failed (DNH — will retry). More codes exist; the full dictionary is pending from the bank.
3. Someone manually appends each Status Report into the **Master Results Tracker** (identical 26-column schema — it is simply the accumulated history).
4. Someone manually VLOOKUPs the latest outcome back into the Apps Tracker (RESULTS/REASON columns), verifies records, and decides payroll and invoicing from it.

The platform automates steps 2–4: **ingest → match on serial → append billing events → derive payroll drafts → dashboards → one-click exports.**

## 1.3 Data quality facts discovered in the sample files (parser requirements)

- Cells contain literal formula strings like `=DATE(2026,7,8)` — must be evaluated/parsed, not treated as text.
- Amounts appear as comma-formatted text: `"1,000.00"`.
- The Apps Tracker contains two junk columns (one blank-named, one "Unnamed") — drop on import, exclude from exports.
- Location names are inconsistent free text ("Mactan Cebu International Airport Terminal 2" vs "Mactan-Cebu Airport Terminal 1") — reference tables fix this.
- Card numbers arrive already masked (`542550XXXXXX2906`) — store masked ONLY, never full PANs.
- Header quirks are load-bearing for legacy exports: `CUSTOMER'S NAME` (apostrophe), `CHQ/MO/PO`, `Fax AREACODE` (lowercase F), etc. Legacy exports must reproduce them exactly.

## 1.4 The seven lifecycle dates (backbone of all reporting)

| # | Date | Meaning |
|---|------|---------|
| 1 | Sign-up date | Acquisition in the field |
| 2 | Status date | Submitted to bank — not real-time; lag is inherent |
| 3 | **Debit date** | When the card was actually charged — the money moment (boss-flagged as the critical one) |
| 4 | Verification date | Donor **phoned** and confirmed to be a real human (quality gate, not clerical) |
| 5 | Cancellation date | If cancelled |
| 6 | Invoice date | Billed to the charity |
| 7 | Payroll date | Semi-monthly cutoffs: 1st–15th paid ~15th; 16th–EOM paid ~30th |

Every dashboard and export must offer a **date-basis selector** — "sales in July" differs by signup vs. debit basis.

## 1.5 Organizational structure

- **Fundraisers** work under **leaders** (many-to-many, can change over time → effective-dated).
- **Sites** are scheduled events: venue + date range + client charity + assigned fundraisers. Pledges link to the site of acquisition.
- Dashboards roll performance up per fundraiser AND per leader.

## 1.6 Database & hosting decision

- Engine: **PostgreSQL 16** in all environments.
- Development: **Neon free tier** ($0 — 0.5 GB storage, scale-to-zero; branching is used to safely test the legacy migration).
- Production (decide at deploy time): **Neon Launch (~$19/mo) + Vercel** for zero ops, or **single VPS (~$6/mo, Docker: app + Postgres)** for lowest cost and PH data-residency control. The VPS path REQUIRES automated offsite backups from day one — donor PII + payroll data.
- Background jobs: **Vercel cron** hitting internal job endpoints on the Neon/Vercel path (pg-boss polling defeats Neon's scale-to-zero); **pg-boss** if on VPS. The job layer is abstracted behind one interface so the choice is swappable.

---

# PART 2 — CLAUDE.md

See `/CLAUDE.md` at the repo root — it is the persistent-context copy of this
section, plus the verified findings promoted into it.

---

# PART 3 — COMPLETE DATABASE SCHEMA (v0.2 — reference SQL)

Implemented idiomatically in Drizzle at `/db/schema.ts` and `/db/auth-schema.ts`.

```sql
-- ================= Reference =================
CREATE TABLE charities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,                -- 'STC'
  name text NOT NULL,
  source_code text,                         -- CHARITY SOURCE CODE
  invoice_prefix text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,                       -- canonical venue name
  country text
);

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text UNIQUE NOT NULL,            -- 'FPH316', 'RC054'
  location_id uuid REFERENCES locations(id),
  description text
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id uuid NOT NULL REFERENCES charities(id),
  campaign_code text, fund_code text, appeal_code text,
  program_code text, event_code text,
  UNIQUE (charity_id, campaign_code, fund_code, appeal_code, program_code, event_code)
);

CREATE TABLE status_codes (
  status_id int PRIMARY KEY,                -- 59, 66, ...
  description text NOT NULL,
  classification text NOT NULL CHECK (classification IN
    ('approved','failed_retryable','failed_final','cancelled','other'))
);
INSERT INTO status_codes VALUES
  (66,'Billing Approved','approved'),
  (59,'Billing Failed (DNH - Will retry)','failed_retryable');

-- ================= People & teams =================
CREATE TABLE fundraisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  employee_code text UNIQUE,
  recruiter_code text,                      -- 'FP'
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fundraiser_id uuid REFERENCES fundraisers(id),  -- leaders often senior fundraisers
  full_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE fundraiser_leaders (            -- m2m, effective-dated
  fundraiser_id uuid NOT NULL REFERENCES fundraisers(id),
  leader_id uuid NOT NULL REFERENCES leaders(id),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  PRIMARY KEY (fundraiser_id, leader_id, effective_from)
);

-- ================= Sites (scheduled events) =================
CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id uuid REFERENCES charities(id),
  location_id uuid REFERENCES locations(id),
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  notes text
);

CREATE TABLE site_assignments (
  site_id uuid NOT NULL REFERENCES sites(id),
  fundraiser_id uuid NOT NULL REFERENCES fundraisers(id),
  assigned_on date,
  PRIMARY KEY (site_id, fundraiser_id)
);

-- ================= Donors =================
CREATE TABLE donors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text, first_name text, last_name text,
  full_name text NOT NULL,
  chinese_name text,
  national_id text,                         -- IC NUMBER / NRIC
  gender text, dob date,
  language text, spoken_language text,
  email text, tel_mobile text, tel_home text, tel_office text,
  address_1 text, address_2 text, address_3 text, address_4 text,
  postcode text, city text, state text, country text,
  postal_mail_ok boolean, email_ok boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON donors (lower(email));
CREATE INDEX ON donors (national_id);
CREATE INDEX ON donors (tel_mobile);

-- ================= Pledges (central entity) =================
CREATE TABLE pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_no text UNIQUE NOT NULL,
  donor_id uuid NOT NULL REFERENCES donors(id),
  charity_id uuid NOT NULL REFERENCES charities(id),
  fundraiser_id uuid REFERENCES fundraisers(id),
  agent_id uuid REFERENCES agents(id),
  location_id uuid REFERENCES locations(id),
  campaign_id uuid REFERENCES campaigns(id),
  site_id uuid REFERENCES sites(id),
  channel text, country text,
  profile_type text, pledge_type text, dobo_type text, principal text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'PHP',
  frequency text NOT NULL,
  processing_bank text,
  -- the seven lifecycle dates --
  signup_date date,                         -- 1: acquisition
  submitted_at date,                        -- 2: status/submission
  debit_date date,                          -- 3: actually charged
  verified_at date,                         -- 4: verification call
  cancellation_date date,                   -- 5
  -- (6: invoice date lives on invoices; 7: payroll date on payouts) --
  verification_method text,                 -- 'call'
  verification_caller text,
  verified boolean NOT NULL DEFAULT false,
  recruiter_batch_no text,
  anniversary int,
  app_status text,                          -- workflow: 'SUBMISSION' etc.
  current_status_id int REFERENCES status_codes(status_id),
  current_status_date date,
  cancelled boolean NOT NULL DEFAULT false,
  unrealized_report_month text,
  cs_template_submitted_at date,
  cs_team_action_at date,
  remarks text, other_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON pledges (donor_id);
CREATE INDEX ON pledges (fundraiser_id);
CREATE INDEX ON pledges (site_id);
CREATE INDEX ON pledges (current_status_id);
CREATE INDEX ON pledges (signup_date);
CREATE INDEX ON pledges (debit_date);

CREATE TABLE pledge_on_behalf (              -- corporate/proxy donors
  pledge_id uuid PRIMARY KEY REFERENCES pledges(id) ON DELETE CASCADE,
  biz_name text, designation text, title text,
  first_name text, last_name text,
  address_1 text, address_2 text, address_3 text, address_4 text,
  postcode text, city text, state text,
  gender text, dob date, email text, relationship text, tel text
);

-- ================= Payment methods (masked ONLY) =================
CREATE TABLE payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pledge_id uuid NOT NULL REFERENCES pledges(id) ON DELETE CASCADE,
  instrument_type text NOT NULL,            -- 'CREDIT CARD'|'DEBIT'|'GIRO'|'CHQ'
  masked_pan text,                          -- '542550XXXXXX2906'
  card_type text, expiry text,              -- 'MMYY'
  cardholder_name text, issuing_bank text,
  account_number text, bank_code text, branch_code text,
  giro_ref_num text, chq_mo_po text,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON payment_methods (pledge_id);

-- ================= Imports & billing history =================
CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('status_report','apps_upload','migration')),
  filename text, uploaded_by uuid,
  row_count int, matched_count int, unmatched_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_events (                -- APPEND-ONLY
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pledge_id uuid NOT NULL REFERENCES pledges(id),
  import_batch_id uuid REFERENCES import_batches(id),
  status_id int NOT NULL REFERENCES status_codes(status_id),
  reason text, reason_desc text,
  status_date date NOT NULL,
  bank_batch_no text,                       -- 'STC2607003012'
  attempt_no int, anniversary int,
  raw_row jsonb,                            -- full source row, audit
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON billing_events (pledge_id, status_date);
CREATE INDEX ON billing_events (import_batch_id);

CREATE TABLE import_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES import_batches(id),
  serial_no text,
  problem text NOT NULL,                    -- 'no_matching_pledge'|'name_mismatch'|'pan_mismatch'|'unknown_status_id'|'parse_error'
  raw_row jsonb NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_note text, resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ================= Payroll =================
CREATE TABLE commission_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  charity_id uuid REFERENCES charities(id),
  trigger_rule text NOT NULL,               -- 'on_submission'|'on_first_approval'|'on_n_billings'
  trigger_n int,
  amount numeric(12,2), pct_of_pledge numeric(5,2),
  realization_window_days int,
  clawback_on text[],                       -- {'cancelled','failed_final','unrealized'}
  effective_from date NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  cutoff_start date NOT NULL,               -- 1st or 16th
  cutoff_end date NOT NULL,                 -- 15th or EOM
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pledge_id uuid NOT NULL REFERENCES pledges(id),
  fundraiser_id uuid NOT NULL REFERENCES fundraisers(id),
  payroll_run_id uuid REFERENCES payroll_runs(id),
  amount numeric(12,2) NOT NULL,
  condition_applied text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','paid','clawed_back','excluded')),
  excluded_reason text,
  payout_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pledge_id, fundraiser_id)
);

CREATE TABLE clawbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES payouts(id),
  reason text NOT NULL,                     -- 'cancelled'|'unrealized'|'failed_final'
  report_month text,
  clawback_date date,
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_by uuid,
  netted_in_run uuid REFERENCES payroll_runs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ================= Charity invoicing =================
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charity_id uuid NOT NULL REFERENCES charities(id),
  invoice_no text UNIQUE NOT NULL,
  batch_no text,
  invoiced_date date,
  total numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  pledge_id uuid NOT NULL REFERENCES pledges(id),
  amount numeric(12,2) NOT NULL,
  line_type text NOT NULL DEFAULT 'charge' CHECK (line_type IN ('charge','clawback_credit'))
);

-- ================= Export system =================
CREATE TABLE export_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text,
  base_dataset text NOT NULL,               -- 'pledges'|'billing_events'|'lifecycle'|'payouts'|'invoices'
  columns jsonb NOT NULL,                   -- ordered [{field, header, format, enabled}]
  filters jsonb NOT NULL DEFAULT '{}',
  file_format text NOT NULL DEFAULT 'xlsx',
  pii_level text NOT NULL DEFAULT 'full' CHECK (pii_level IN ('full','masked','none')),
  is_builtin boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'everyone',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES export_templates(id),
  cadence text NOT NULL,                    -- 'daily'|'weekly'|'monthly'
  cadence_detail jsonb,                     -- {dow:1}|{dom:25}|{time:'08:00'}
  delivery text NOT NULL,                   -- 'email_attachment'|'email_link'|'folder'
  recipients jsonb NOT NULL,
  charity_scope uuid REFERENCES charities(id),  -- null=all; set=fan out per charity
  approved_by uuid,                         -- required when pii_level != 'none'
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES export_templates(id),
  schedule_id uuid REFERENCES export_schedules(id),
  run_by uuid,
  filters_applied jsonb,
  row_count int, file_name text,
  contains_pii boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ================= App plumbing =================
CREATE TABLE app_settings (
  key text PRIMARY KEY,                     -- 'org.name','import.status_report.mapping',...
  value jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,                     -- 'import.run','export.run','payroll.approve','settings.update',...
  entity text, entity_id text,
  detail jsonb,
  contains_pii boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (action, created_at);
```

Plus Auth.js user tables (users with role enum: admin, operations, payroll, viewer, charity_viewer; charity_viewer users carry charity_id). Age bands (18–24, 25–30, 31–40, 41–50, 51+) are computed from donors.dob in queries/views — never stored.

---

# PART 4 — FEATURE SPECIFICATIONS

## 4.1 Import pipeline (`/app/imports`) — the heart of the system

**Upload:** accepts .xlsx/.csv Status Reports. Column mapping stored in `app_settings` key `import.status_report.mapping` so bank format tweaks are settings edits. Expected 26 columns:

Charity Code · Bank · SERIAL NO · SG BATCH NO · NRIC · STATUS ID · STATUS DESCRIPTION · REASON · REASONDESC · STATUS DATE · CUSTOMERS NAME · ACCOUNT NUMBER · CHQ/MO/PO · CREDIT CARD · Anniversary · A0 Attempts · Recruiter Batch No · ExpiryDate · DonationAmount · Frequency · Recruiter Submission Date · AgentID · DEBIT_CREDIT_CARD · LocationCode · Channel · Recruiter Code

**Parse (defensive):** evaluate `=DATE(y,m,d)` strings; strip commas from amounts; tolerate date format variants; a bad row → import_exceptions('parse_error'), never a failed batch.

**Match:** exact serial_no → pledge. Secondary validation: donor full name (case/whitespace-insensitive) and masked PAN when present; mismatch → exception ('name_mismatch'/'pan_mismatch'), NOT a silent update. Unknown serial → 'no_matching_pledge'. Unknown STATUS ID → 'unknown_status_id' with an admin one-click "add to status_codes" action.

**Apply (transaction per batch):** insert billing_event with raw_row jsonb; update pledge.current_status_id/current_status_date; set pledge.debit_date on first 'approved' classification if null. Audit-log the batch.

**Review:** summary screen (read/matched/exceptions) + exceptions queue with resolve/retry.

**Duplicate protection:** re-uploading the same file (same serial+status_id+status_date rows) must not create duplicate billing_events — dedupe on that natural key within apply.

## 4.2 Pledge browser & donors (`/app/pledges`, `/app/donors`)

Searchable/filterable pledge table: serial, donor name, status, charity, fundraiser, leader, site, plus **date-basis filter across all seven dates**. Detail page: donor info (role-gated), payment method (masked, role-gated), full billing timeline, payroll status, activity log, and the **verification workflow** (record call: date, caller, outcome → sets verified_at/verification_caller). Donors page includes dedupe hints: same national_id/email/tel_mobile across donor records flagged for review (prevents double commissions on the same person).

## 4.3 Dashboard (`/app/dashboard`)

Global filter bar: date range + **date-basis selector** + charity + site + leader + fundraiser. Widgets (each a tested function in /lib/services/reporting.ts, each with an Export button):

1. **Sales tracker** — count + pledged value over time.
2. **Results split** — approved vs not approved donut + failure-reason breakdown.
3. **CC vs Debit ratio** — with approval rate per instrument beside it.
4. **Frequency mix.**
5. **Average donation** — overall + per fundraiser/site/client.
6. **Age groups** — bands from DOB, with realization rate per band (25–30 is the typical acquisition band per the boss).
7. **Fundraiser leaderboard** — sign-ups, realization rate, avg pledge, rank; toggle to roll up by leader.
8. **Sites view** — sales per site with venue/dates/staffing, filtered by client.
9. **Lag monitor** — avg days signup→submission→first debit, trended (the boss flagged the lag as inherent; measuring it is the value-add).

## 4.4 Payroll (`/app/payroll`)

- **Commission plans CRUD** (admin): trigger_rule (on_submission / on_first_approval / on_n_billings + n), amount or pct, realization_window_days, clawback_on[], effective_from. Plan applied to a pledge = the plan active at the pledge's signup_date (effective-dating protects history).
- **Run generation:** auto-suggest current cutoff (1–15 or 16–EOM); generate DRAFT run: eligible pledges → payout lines per plan; net confirmed clawbacks per fundraiser into the run.
- **Review & approve:** payroll role sees lines grouped by fundraiser with subtotals; can exclude lines with reason; approve locks the run (audit-logged).
- **Clawbacks:** auto-created as candidates when a *paid* pledge's classification becomes cancelled/failed_final/unrealized; admin confirms before netting.
- **Hard unit tests:** cutoff boundary dates, plan effective-dating, clawback netting, cancel-after-payment.

## 4.5 Export system (`/app/exports`)

Built-in templates (is_builtin=true), one-click with a filter modal, generated via the job layer, download when ready, export_runs logged with contains_pii. Then: template builder (duplicate built-in → toggle/reorder/rename columns; fields gated by role and template pii_level; save with visibility) and schedules (cadence + recipients + delivery; PII templates require admin approval of recipients; charity_scope fans out per charity).

### Built-in template catalog (14)

**A — Legacy-compatible**
- **A1 Master Apps Tracker** — full legacy layout, exact headers (111 named columns; verified against the real file, see FINDINGS.md):
IMPORTANT REMARKS · COUNTRY · CHARITY CODE · SUB-RECRUITER CODE · ORIGINAL BATCH NUM · ORIGINAL DONOR ID · PROFILE TYPE · SERIAL NO · TITLE · CUSTOMER'S NAME · FIRSTNAME · LAST NAME · CHINESENAME · IC NUMBER · GENDER · DOB · LANGUAGE · SPOKEN LANGUAGE · TEL HP COUNTRYCODE · TEL HP AREACODE · TEL HP · TEL HSE COUNTRYCODE · TEL HSE AREACODE · TEL HSE · TEL OFF COUNTRYCODE · TEL OFF AREACODE · TEL OFF · FAX COUNTRYCODE · Fax AREACODE · FAX NUMBER · EMAIL · ADDRESS 1 · ADDRESS 2 · ADDRESS 3 · ADDRESS 4 · POSTCODE · CITY · STATE · COUNTRY FOR ADDRESS · CAMPAIGN CODE · FUNDCODE · PROCESSING BANK · DONATION AMOUNT · FREQUENCY · CREDIT CARD · CARDTYPE · EXPIRY · NAME OF CARD HOLDER · ISSUING BANK · CARD TYPE · ACCOUNT NUMBER · BANKCODE · BRANCHCODE · GIRO_REF_NUM · CHQ/MO/PO · DATE PROCESSED · REMARKS · POSTALMAIL · ELECTRONICMAIL · CHANNEL · EVENT CODE · LOCATION CODE · APPEAL CODE · PROGRAM CODE · AGENT ID · SIGNUP DATE · STATUS DATE · VERIFIED · VERIFIEDBY · VERIFIEDDATE · STATUS · CHARITY SOURCE CODE · BIZ NAME · DESIGNATION · PLEDGETYPE · DOBOTYPE · PRINCIPAL · OnBehalf_Title · OnBehalf_FirstName · OnBehalf_LastName · OnBehalf_Add1 · OnBehalf_Add2 · OnBehalf_Add3 · OnBehalf_Add4 · OnBehalf_Postcode · OnBehalf_City · OnBehalf_State · OnBehalf_Gender · OnBehalf_DOB · OnBehalf_Email · OnBehalf_Relationship · OnBehalf_Tel · RESULTS · REASON · DEBIT DATE · Fundraiser Name · Paid to FR? · Payout Date · Payroll conditions · Clawback Date · Invoiced Date · Invoice No. · Batchno · CANCELLED/UNREALIZED? · CANCELLATION DATE · REPORT MONTH UNREALIZED · OTHER NOTES · CS TEMPLATE SUBMISSION DATE · CS TEAM ACTION DATE · FOR INVOICE CLAWBACK? · AGE
(AGE computed from DOB at export time; the legacy file's two junk columns are excluded.)
- **A2 Master Results Tracker** — the 26 columns listed in §4.1, flattened from billing_events.
- **A3 Daily Status Report snapshot** — A2 columns scoped to one import batch, + IMPORT BATCH ID · IMPORTED AT.

**B — Operational**
- **B1 Pledge Lifecycle**: SERIAL NO · CHARITY CODE · DONOR NAME · SIGNUP DATE · LOCATION · AGENT ID · FUNDRAISER · DONATION AMOUNT · FREQUENCY · SUBMITTED TO BANK DATE · FIRST BILLING DATE · FIRST BILLING RESULT · TOTAL ATTEMPTS · CURRENT STATUS · CURRENT STATUS DATE · DAYS SINCE SIGNUP · REALIZED? · CANCELLED? · CANCELLATION DATE · PAID TO FUNDRAISER? · INVOICED TO CHARITY? · NOTES
- **B2 Retry / Failed Billing Queue**: SERIAL NO · DONOR NAME · TEL HP · EMAIL · DONATION AMOUNT · LAST STATUS · LAST REASON · LAST STATUS DATE · ATTEMPTS SO FAR · DAYS IN FAILED STATE · CARD EXPIRY · EXPIRY RISK · FUNDRAISER · CS TEMPLATE SUBMISSION DATE · CS TEAM ACTION DATE · SUGGESTED ACTION
- **B3 Verification Backlog**: SERIAL NO · DONOR NAME · SIGNUP DATE · DAYS UNVERIFIED · FUNDRAISER · LOCATION · CHARITY CODE · DONATION AMOUNT · STATUS · ASSIGNED VERIFIER
- **B4 Import Exceptions**: IMPORT DATE · SOURCE FILE · SERIAL NO (AS RECEIVED) · PROBLEM TYPE · CUSTOMERS NAME (AS RECEIVED) · STATUS ID · STATUS DATE · RAW ROW SUMMARY · RESOLVED? · RESOLUTION NOTE · RESOLVED BY

**C — Payroll**
- **C1 Payroll Run** (detail sheet): PAYROLL RUN DATE · FUNDRAISER NAME · FUNDRAISER CODE · SERIAL NO · DONOR NAME · SIGNUP DATE · REALIZATION DATE · DONATION AMOUNT · COMMISSION AMOUNT · CONDITION APPLIED · LESS: CLAWBACKS THIS RUN · NET AMOUNT · STATUS · APPROVED BY; (summary sheet): FUNDRAISER NAME · FUNDRAISER CODE · PLEDGES PAID · GROSS COMMISSION · CLAWBACKS · NET PAYABLE
- **C2 Clawback Ledger**: CLAWBACK DATE · FUNDRAISER NAME · SERIAL NO · DONOR NAME · ORIGINAL PAYOUT DATE · ORIGINAL COMMISSION · CLAWBACK REASON · REPORT MONTH UNREALIZED · NETTED IN RUN · CONFIRMED? · CONFIRMED BY
- **C3 Fundraiser Performance Statement**: MONTH · FUNDRAISER NAME · SIGN-UPS · SUBMITTED · APPROVED (REALIZED) · FAILED FINAL · PENDING/RETRY · REALIZATION RATE % · AVG PLEDGE AMOUNT · GROSS COMMISSION · CLAWBACKS · NET EARNINGS · RANK

**D — Charity & financial**
- **D1 Charity Invoice**: INVOICE NO · INVOICED DATE · BATCH NO · CHARITY CODE · SERIAL NO · DONOR NAME · SIGNUP DATE · REALIZATION DATE · DONATION AMOUNT · LINE TYPE (CHARGE / CLAWBACK CREDIT) · LINE AMOUNT · CUMULATIVE INVOICE TOTAL
- **D2 Charity Donor Delivery** (pii_level='none'): MONTH · CHARITY CODE · CAMPAIGN CODE · NEW DONORS DELIVERED · MONTHLY PLEDGE VALUE ADDED · ACTIVE DONORS (CUMULATIVE) · CANCELLED THIS MONTH · RETENTION RATE % · AVG PLEDGE AMOUNT · LOCATIONS ACTIVE
- **D3 Management P&L**: MONTH · CHARITY CODE · SIGN-UPS · REALIZED · REALIZATION RATE % · INVOICED TO CHARITY · CLAWBACK CREDITS TO CHARITY · NET REVENUE · COMMISSIONS PAID · COMMISSIONS CLAWED BACK · NET COMMISSION COST · GROSS MARGIN · MARGIN %

**E — Outbound**
- **E1 Bank Submission File** — new verified applications formatted per the bank's spec (**pending from client**; interim assumption: the Apps Tracker's left-hand donor/payment/code columns).
- **E2 Full Database Backup** — multi-sheet workbook / zip of CSVs, one per table.

## 4.6 Settings & admin (`/app/settings`)

Org settings (name, logo for charity-facing exports, timezone Asia/Manila, financial month start) · reference data CRUD (charities, locations, agents, campaigns, sites + assignments, leaders + fundraiser_leaders) · **status_codes manager** (new bank code = 30-second admin edit; unknown codes flow in from import exceptions with one-click add) · import column-mapping editor · users & roles with permission toggles (see_pii, see_payment, see_payroll, run_exports, approve_payroll, edit_reference, edit_templates) · audit log viewer with search and PII-export highlighting.

## 4.7 Legacy migration CLI (`pnpm migrate:legacy`)

Ingests the three real full-size legacy files: builds reference tables from distinct codes; dedupes donors (national_id > email > phone precedence; ambiguous → report, not auto-merge); creates pledges from Apps rows; explodes Results Tracker into billing_events; reconstructs payouts/clawbacks/invoices from populated payroll columns; emits a reconciliation report (counts in/created, unmatched serials, merged donors, anomalies e.g. location-spelling drift). **Idempotent** — re-running the same files must not duplicate. Test against /docs/samples first; run real files against a Neon branch, review the report with the boss, then cut over.

---

# PART 5 — BUSINESS RULES: CONFIRMED vs CONFIGURABLE

Confirmed rules are hard requirements. Unconfirmed rules are built as configuration with a stated default, so the build never blocks on client answers.

| Rule | Status | Build as |
|---|---|---|
| Serial no is unique per pledge and the universal join key | CONFIRMED | Unique constraint |
| Status 66=approved, 59=failed_retryable | CONFIRMED | Seeded status_codes; rest via settings when bank dictionary arrives |
| Payroll cutoffs: 1–15 → ~15th run; 16–EOM → ~30th run | CONFIRMED | cutoff auto-suggestion |
| Payroll eligibility: acquisition alone vs acquisition+approval by cutoff | **OPEN** | commission_plans.trigger_rule; default 'on_first_approval' until client confirms |
| Commission amount/structure | **OPEN** | commission_plans.amount/pct; seed placeholder |
| Clawback trigger + window | **OPEN** | commission_plans.clawback_on + realization_window_days |
| Leader overrides on team sales (do leaders earn %?) | **OPEN** | If yes → new plan type; ask client |
| Invoice timing to charity (submission/approval/retention period) | **OPEN** | invoice rule per charity in settings; default 'on_first_approval' |
| Charity clawback-credit policy | **OPEN** | invoice_lines.line_type ready; policy in settings |
| Bank submission file format | **OPEN** | E1 template columns editable; get bank spec |
| Verification = phone call gate | CONFIRMED | verification workflow on pledge |
| Exact pay date (15th/30th or nearest business day) | **OPEN** | run_date editable on draft |

When client answers arrive: enter them in settings/plans — no code changes expected. Promote each resolved rule into CLAUDE.md.

Additional open questions raised by the real files are in **docs/FINDINGS.md §4**.

---

# PART 6 — BUILD SEQUENCE

**Prompt 0 — Scaffold.** ✅ Done. Next.js 15 App Router + TS strict, Tailwind, Drizzle + Postgres, Auth.js v5 with users table + role enum, Vitest, docker-compose.yml, /lib/jobs/scheduler.ts interface with vercel-cron driver and pg-boss stub, health check, protected /app layout, seeded admin.

**Prompt 1 — Schema.** ✅ Done. Full Drizzle schema from Part 3 (all tables incl. export system, audit_log). Seeded status_codes (66, 59). Migration + seed: charities, 3 leaders, 10 fundraisers (m2m), 2 sites with assignments, 200 donors/pledges over 3 months with varied billing histories, cancellations, payouts. NO real PII in seeds.

**Prompt 2 — Import pipeline.** Build §4.1 exactly. Write parser + matcher unit tests FIRST (including every trap in FINDINGS.md §2 and duplicate re-upload protection). Then the upload UI, summary, and exceptions queue. This is the heart — correctness over polish.

**Prompt 3 — Pledges & donors.** Build §4.2: browser with seven-date basis filter, role-gated detail page, verification workflow, donor dedupe hints.

**Prompt 4 — Dashboard.** Build §4.3: global filter bar with date-basis selector; the nine widgets as tested functions in /lib/services/reporting.ts; Export button per widget.

**Prompt 5 — Payroll.** Build §4.4: plans CRUD, draft run generation with cutoff logic and clawback netting, review/approve flow, clawback candidates. Hard unit tests on the run generator.

**Prompt 6 — Exports.** Build §4.5: the 14 built-in templates with exact headers (legacy headers verbatim, quirks included), one-click generation via the job layer, export_runs logging, then the template builder and schedules with PII recipient approval.

**Prompt 7 — Settings & admin.** Build §4.6 complete.

**Prompt 8 — Legacy migration.** Build §4.7. Test against /docs/samples; must be idempotent; emit the reconciliation report.

**Prompt 9 — Hardening.** Security/correctness pass: every route + server action enforces permissions; Playwright tests specifically proving charity_viewer isolation (UI AND direct API); no PII in logs/errors; rate-limit auth + upload; decimal money verified; full suite green; DEPLOY.md for both targets with backup automation documented for the VPS path.

---

# PART 7 — QUALITY GATES & WORKING PRACTICES

**Definition of done per phase:** tests pass · lint clean · audit_log entries written where the spec says · no PII in logs · committed to git.

**Security checklist (verify at Prompt 9, but build to it throughout):**
- charity_viewer can never reach donor contact, payment, or payroll data — enforced in services, proven by tests.
- Masked PAN only, everywhere, always.
- All exports logged with contains_pii; PII schedule recipients admin-approved.
- CRON endpoints require CRON_SECRET; uploads size-limited and type-checked; auth rate-limited.
- Backups: Neon = built-in PITR; VPS = automated nightly pg_dump offsite + tested restore. Non-negotiable before real data.

**Session discipline:**
1. One phase per session; review + commit before the next. If a phase goes sideways, revert and re-prompt — don't patch a mess.
2. End each session by listing assumptions made that aren't in CLAUDE.md — promote the good ones into CLAUDE.md.
3. Keep /docs current: this spec, the sample files, and (when they arrive) the client's confirmed rules and bank spec.
4. When the real full-size trackers arrive: run migration on a Neon branch, review the reconciliation report with the boss, only then cut over. Keep legacy exports (A1/A2) available from day one as the org's safety net.

**Still to obtain from client (does not block build):** full bank status-code dictionary · commission structure + eligibility rule · clawback policy/window · leader overrides yes/no · invoice timing + credit policy · bank submission file spec · real full-size files · site costs (unlocks Site-ROI feature later).

*End of master spec.*
