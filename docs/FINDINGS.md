# Findings from the real sample files

Verified 2026-07-27 by direct inspection of `/doc/*.xlsx`. This document records
what the files actually contain, as opposed to what MASTER_SPEC.md assumed.
Anything marked **OPEN** needs a client answer; each is built as configuration
so the build is not blocked.

---

## 1. Validation of the spec — what held up

**The A1 legacy export column list is exactly right.** Compared
programmatically against the real Apps Tracker header row:

- Spec A1 list: **111 columns**
- Real file: **113 columns**, of which 2 are junk
- In spec but not real: **none**
- In real but not spec: **none**
- Order: **identical**, header text identical including every quirk
  (`CUSTOMER'S NAME` apostrophe, `Fax AREACODE` lowercase F, `CHQ/MO/PO`,
  `Invoice No.` trailing period)

So "113 columns" = 111 real + 2 junk. Treat the spec's A1 list as authoritative.

The 26-column Status Report and Results Tracker schemas also match the spec
exactly, and are identical to each other — confirming the Results Tracker is
simply accumulated Status Reports.

`STATUS ID` values 59 and 66 both appear, matching the seeded classifications.

---

## 2. Parser traps — every one of these must have a unit test

| # | Trap | Evidence | Requirement |
|---|---|---|---|
| 1 | **Phantom rows** | `15MAY2026` sheet reports `max_row=1048570` but has **436** real rows; `15JUL (from Master Trackers)` reports 1048187 vs **372** | Never trust `rowCount`/dimensions. Skip all-empty rows; stop at trailing blanks. A naive loop processes a million empty rows. |
| 2 | **Sheet name is unreliable** | Same logical content under `sheet1`, `Sheet1`, `Sheet2` | Take the first worksheet or match a header signature. Never look up by name. |
| 3 | **Formula strings in date cells** | `=DATE(2026,7,8)` in `STATUS DATE`, `Recruiter Submission Date` | Evaluate the pattern; do not treat as text. |
| 4 | **Formula strings in amount cells** | `=75*13`, `=60*13` in `Pledge Amount`; `=H2*2.5` in `INCENTIVES` | Evaluate arithmetic; do not coerce to 0 or NaN. |
| 5 | **Zero-padded MMYY text** | `EXPIRY` / `ExpiryDate` = `1028`, **`0728`** | Must stay TEXT. Numeric parsing silently destroys `0728` → `728`. |
| 6 | **Amounts in 3 shapes** | `"1,000.00"` (comma text, Status Report), `1000` (int, Apps Tracker), `=75*13` (formula) | One normalizer handling all three. |
| 7 | **Dates in 3 shapes** | real `datetime`, `=DATE(y,m,d)` string, plain 10-char string (`VERIFIEDDATE`) | One normalizer handling all three. |
| 8 | **Junk columns carry data** | Position 4 header is `' '` (single space) and holds a **2-char value**; position 109 header is empty and is truly blank | Exclude both from exports, but preserve position 4's value in `raw_row` jsonb. It looks like the `FP` recruiter code — do not silently discard. |
| 9 | **Case/format drift in enums** | `CREDIT CARD` / `Credit Card` / `DEBIT CARD`; `Semi-Annual` / `Semi-annual` | Normalize case on import via settings-driven maps. |
| 10 | **Free-text location drift** | `Mactan Cebu International Airport Terminal 2`, `Mactan-Cebu Airport Terminal 1`, `SM Light Mall ` (trailing space), `Laguindingan International...` | Trim and resolve against `locations` via an alias map. |

Note: `EVENT CODE` in the Apps Tracker holds long free text (44 and 30 chars) —
it carries the venue/event name, not a short code.

---

## 3. Scope corrections — the spec understates the business

### 3.1 Multiple charities, not just STC
Charity/campaign values found across the payroll sheets:

`STC`, `UNHCR`, `UNHCR MY`, `UNHCR Malaysia`, `WWF`, `World Vision`

Plus a sheet named `WV` (= World Vision). So there are at least **four distinct
charities** with **alias drift**. The `charities` table already supports this;
what's needed is a settings-driven alias map (`UNHCR MY` → `UNHCR`,
`WV` → `World Vision`). Never hard-code.

### 3.2 The operation is multi-country (Philippines **and** Malaysia)
MASTER_SPEC frames this as a PH-only agency. The payroll sheets contain
Malaysian sites: `LRT Sri Rampai`, `Amcorp Mall`, `Lotus's Puchong`,
`MRT Mutiara Damansara`, alongside PH sites (`Mactan Cebu International`,
`SM Light Mall`, `Laguindingan International`).

This explains legacy fields that looked vestigial: `IC NUMBER`/`NRIC`
(Malaysian identity number), `CHINESENAME`, `SPOKEN LANGUAGE`, `SG BATCH NO`.

**Consequences:**
- Currency cannot be assumed PHP. `pledges.currency` must be populated per
  pledge, not defaulted-and-ignored. **OPEN:** are MY pledges denominated MYR?
- "PH data residency" as a hosting driver is weaker than the spec implies if
  Malaysian donor data is in the same database.
- Dashboards likely need a country dimension.

### 3.3 Commission structure — real evidence (spec lists this as OPEN)
The `INCENTIVES` / `INCENTIVE` column is a **multiplier of pledge amount**:

| Evidence | Pledge | Incentive | Implied multiplier |
|---|---|---|---|
| `=H2*2.5` (H = Pledge Amount) | 600 Monthly | 1500 | ×2.5 |
| `=H3*3` | 600 Semi-annual | 1800 | ×3 |
| literal | 750 Monthly | 1875 | ×2.5 |
| literal | 780 Monthly | 3120 | ×4 |
| literal | 800 Monthly | 800 | ×1 |

So commission is `pledge_amount × multiplier`, where the multiplier varies
(×1, ×2.5, ×3, ×4). It plausibly depends on **frequency** and/or **campaign**
and/or the payroll period, but the samples are not conclusive.

**Impact on `commission_plans`:** `pct_of_pledge numeric(5,2)` can hold these
as percentages (250.00, 300.00, 400.00). But the schema has no dimension for
frequency, so a "×2.5 monthly / ×3 semi-annual" rule cannot currently be
expressed as data. **Recommend** adding a nullable frequency scope to
`commission_plans` when Phase 5 lands — not added yet, pending client answer.

**OPEN:** what determines the multiplier?

### 3.4 `Frequency` is genuinely ambiguous
Distinct values across sheets: `1`, `3`, `6`, `12`, `Monthly`, `Quarterly`,
`Semi-Annual`, `Semi-annual`, `Annual`.

The numeric codes co-exist with the text labels. `12` most likely means
12×/year = Monthly. But the Apps Tracker uses `FREQUENCY = 1` on what is
described as a monthly pledge, so `1` may mean "monthly" (period length in
months) rather than "once a year". The two conventions are contradictory.

**OPEN — must confirm with client.** A wrong mapping mis-states pledged annual
value on every dashboard. Mapping lives in settings, not code.

### 3.5 Data-quality anomalies to expect
- `STOPLIGHT` column contains a **serial number** (`FES44778253`) in
  `30APR2026 from Master`, but `N/A` in `15JUL (for payslips)`. That sheet has
  no `Serial #` column at all — the columns are effectively shifted. Sheet
  layouts are not stable across periods.
- The `INCENTIVE` column sometimes holds a failure reason instead of a number:
  `DO NOT HONOR`.
- Some rows have a pledge amount and no serial number.
- `CEBU 7th MONTH Final` and `WV` sheets are mostly empty; `WV` literally
  contains `No data for FP Team`.

### 3.6 A payroll concept the spec does not model
Sheet `CEBU 7th MONTH Final` has a `7TH MONTH PAY` column — i.e. 13th/7th-month
statutory-style pay. MASTER_SPEC's payroll model (commissions + clawbacks) has
no place for it. **OPEN / out of scope** until the client confirms whether the
platform must compute it.

---

## 3.7 How payroll is actually derived (measured, 2026-07-28)

Verified empirically across all 8 sheets of `Payroll Reference - FundPro.xlsx`
(2,431 rows carrying both a pledge amount and an incentive column).

### The eligibility rule — RESOLVED by evidence

**The `INCENTIVE` column is overloaded.** Every row holds *either* a commission
*or* the reason no commission was earned:

| Cell content | Rows | Meaning |
|---|---|---|
| number or `=H*n` formula | 780 | paid — commission earned |
| **text** | 545 | **not paid**, and the text is the bank failure reason |
| empty | 986 | not yet processed / pending |

Every one of the 545 text values is a billing failure: `DO NOT HONOR` (213),
`INSUFFICIENT FUNDS` (117), `GET NEW FORM OF PAYMENT` (61), `Cancelled` (24),
`RETRY AFTER 10 DAYS` (22), `Restricted Card`, `PICK UP CARD`, `Issuer Reject`,
`Incorrect CVV`, `TRANSACTION NOT ALLOWED`, `REFER TO ISSUER`,
`Contact Issuing Bank`.

So a fundraiser is paid **only when the pledge actually billed**. This settles
MASTER_SPEC Part 5's open question (acquisition alone vs acquisition+approval)
in favour of **acquisition + approval** — default `trigger_rule =
'on_first_approval'` is correct, and is now evidence-backed rather than assumed.

**Bonus:** those strings are effectively the bank's status dictionary in plain
words, which the client is still waiting on. They can seed `status_codes`
classifications now — retryable (`DO NOT HONOR`, `INSUFFICIENT FUNDS`,
`RETRY AFTER 10 DAYS`, `REFER TO ISSUER`) vs final (`GET NEW FORM OF PAYMENT`,
`PICK UP CARD`, `Restricted Card`, `TRANSACTION NOT ALLOWED`) vs `Cancelled`.

### The commission amount — multiplier confirmed, driver NOT found

Commission is unambiguously `pledge_amount × multiplier` (683 rows carry the
literal formula `=H{row}*n`, H being Pledge Amount). Observed multipliers:

| multiplier | rows |
|---|---|
| ×0.5 | 44 |
| ×1.5 | 2 |
| ×2.0 | 52 |
| ×2.5 | 184 |
| **×3.0** | **383** (mode) |
| ×4.0 | 18 |

**What does NOT explain the variation** — each was tested and ruled out:

- **Frequency** — every numeric-incentive row is `Monthly`; no discrimination.
- **Campaign** — mixed within a campaign (World Vision alone shows ×0.333,
  ×0.5, ×1.0, ×2.5, ×3.0).
- **Payroll period** — mixed within a single sheet.
- **Fundraiser** — 29 of 44 fundraisers have *several* different multipliers,
  so it is not a per-person tier or tenure rate.

The driver is therefore **not present in these sheets**. Remaining candidates,
in order of plausibility:

1. **A billing-count ladder** — commission grows as the pledge proves itself
   (×0.5 on a first partial, ×3 once fully realized). This fits the existing
   `on_n_billings` trigger and fits realization being the core metric.
2. Per-charity contract rate negotiated per intake batch.
3. Manually keyed per row (i.e. no rule at all).

**ASK THE CLIENT:** "Two donors both pledged ₱600/month in the same campaign,
same fundraiser, same month — one earned ×2.5 and one ×3. What makes them
different?" That single question resolves it.

Until answered, `commission_plans.pct_of_pledge` holds the rate and the default
is ×3.0 (the mode), NOT ×2.5 as originally seeded.

### Derivation, as implemented

`/lib/services/payroll.ts` — pure functions, unit-tested:

```
cutoffFor(date)            semi-monthly: 1–15 pays ~15th, 16–EOM pays ~30th
eligibilityDateFor(p, plan)  on_submission     -> submittedAt
                             on_first_approval -> debitDate   [default]
                             on_n_billings     -> date of Nth approved event
commissionFor(p, plan)     amount x (pctOfPledge / 100)
generateDraftRun(...)      pledges whose eligibility date falls in the cutoff
clawbackCandidatesFor(...) paid pledges later cancelled/failed within the
                           realization window -> admin confirms -> nets
netByFundraiser(...)       gross - confirmed clawbacks
```

---

## 4. Consolidated open questions for the client

1. What determines the commission multiplier (×1 / ×2.5 / ×3 / ×4) — frequency,
   campaign, tenure, or period?
2. What does `Frequency = 1` mean: monthly, or once per year?
3. Are Malaysian pledges denominated in MYR? Should reporting be
   multi-currency, and at what FX rate?
4. Is `UNHCR MY` a separate charity/contract from `UNHCR`, or the same client
   in a different country?
5. Must the platform compute 7th/13th-month pay?
6. Full bank status-code dictionary (only 59 and 66 are known).
7. The remaining OPEN items already listed in MASTER_SPEC Part 5.

---

# Addendum — verified 2026-08-07 while building the Phase 1 parser

Read directly from `doc/Master Apps Tracker - 16JUL2026.xlsx`,
`doc/Status Report - 16JUL2026.xlsx` and
`doc/Master Results Tracker - 16JUL2026.xlsx`. These CORRECT earlier
assumptions — the column names used before this date were guesses.

## 5.1 The authoritative column lists now live in code
`backend/app/parsing/headers.py` holds both header lists transcribed from the
real files, and the test fixtures import them rather than restating them, so a
fixture can no longer drift from the schema it claims to reproduce.

## 5.2 The 26-column bank schema — actual headers
```
Charity Code · Bank · SERIAL NO · SG BATCH NO · NRIC · STATUS ID ·
STATUS DESCRIPTION · REASON · REASONDESC · STATUS DATE · CUSTOMERS NAME ·
ACCOUNT NUMBER · CHQ/MO/PO · CREDIT CARD · Anniversary · A0 Attempts ·
Recruiter Batch No · ExpiryDate · DonationAmount · Frequency ·
Recruiter Submission Date · AgentID · DEBIT_CREDIT_CARD · LocationCode ·
Channel · Recruiter Code
```
The Status Report and Master Results Tracker headers are **byte-identical**,
confirming §1's conclusion that the Results Tracker is stacked Status Reports.

## 5.3 New quirks, all load-bearing for exports
- **`CUSTOMERS NAME` (Status Report) vs `CUSTOMER'S NAME` (Apps Tracker).**
  The apostrophe exists in one file and not the other. Both are correct.
- **Amount column differs by file**: `DonationAmount` vs `DONATION AMOUNT`.
- **The Apps Tracker has BOTH `CARDTYPE` (col 47) and `CARD TYPE` (col 51).**
  Two distinct columns. Any parser keying rows by header name alone will
  collapse them — rows must be held positionally.
- **Masked PANs use asterisks, not X's**: `542550********2906`. MASTER_SPEC and
  CLAUDE.md both said `542550XXXXXX2906`; both have been corrected. Store the
  mask exactly as sent; never normalize the mask character.

## 5.4 Trap 8 confirmed exactly as documented
Apps Tracker junk columns are at positions **4** (header `' '`) and **109**
(header `None`). Position 4 holds `'FP'` — and the Status Report has an
explicit `Recruiter Code` column also holding `'FP'`, confirming the earlier
guess about what that value is.

## 5.5 Signature matching must use UNIQUE columns
The two schemas overlap on `SERIAL NO`, `STATUS DATE`, `REASON`, `CHQ/MO/PO`,
`CREDIT CARD`, `ACCOUNT NUMBER` and `Frequency`/`FREQUENCY`. Detection keys on
columns unique to each file; a test asserts neither signature matches the
other's header list.

## 5.6 `Payroll Reference - FundPro.xlsx` is a third shape
It matches neither signature and is correctly rejected. Its per-period sheets
have unstable layouts (§3.5) and are a separate parser when payroll import is
scoped — currently out of scope.

## 5.7 Confirmed working against real data
All three tracker files parse with **zero exceptions**: `=DATE(2026,7,8)` →
`2026-07-08`, `"1,000.00"` → `Decimal("1000.00")`, and `ExpiryDate` `0728`
survives as the string `'0728'`.

---

# Addendum 2 — the payroll reference decoded, 2026-08-08

Read from `doc/Payroll Reference - FundPro.xlsx` (8 sheets, ~900 rows with a
computable commission multiplier). This is the file that shows what the client
actually PRODUCES, as opposed to what they receive, and it answers — partly —
the question that has blocked us longest.

## 6.1 STOPLIGHT is a fundraiser tier, and it drives the multiplier

Every payroll sheet carries a `STOPLIGHT` column we had never modelled. Its
values are a ranking:

`DIAMOND` · `GOLD` · `GREEN` · `AMBER` · `RED` (plus `N/A` / blank)

Cross-tabulating it against `INCENTIVE ÷ Pledge Amount`, restricted to credit
cards so the instrument does not confound it:

| Tier | n | Dominant multiplier |
|---|---|---|
| DIAMOND | 119 | **×3.0 (83%)** |
| GOLD | 161 | ×3.0 (60%) |
| GREEN | 97 | ×2.5 (37%) |
| AMBER | 48 | ×2.5 (35%) |
| RED | 17 | ×1.0 (29%), and the only tier where ×0.5 appears |

A clean monotonic ladder. It is **not deterministic** — something period- or
campaign-specific still varies on top — but the tier is clearly a driver, and
it is the best evidence we have for the commission-multiplier question.

## 6.2 Card type is a second driver

| Card type | n | Distribution |
|---|---|---|
| CREDIT CARD | 796 | ×3.0 50% · ×2.5 27% · ×1.0 11% |
| DEBIT CARD | 103 | ×1.0 36% · ×0.5 26% · ×4.0 21% |

Debit cards are priced very differently, and much lower on average.

## 6.3 `UNHCR MY` looks like a separate contract

All 28 `UNHCR MY` rows are **×4.0**, with no other multiplier appearing.
`UNHCR` and `UNHCR Malaysia` behave like the ordinary book. That is evidence
against merging `UNHCR MY` into `UNHCR` by alias, and it is worth putting to
the client directly (open question 6).

Frequency, by contrast, explains almost nothing: `Monthly` accounts for 882 of
899 rows, so the apparent "×2.5 monthly / ×3 semi-annual" split in §3.3 is not
supported at this sample size.

## 6.4 What they actually produce each cutoff

Every payroll sheet has the same 12 columns:

```
FR Name | Campaign | Donor Name | Site | Sign-up Date | Card Type |
Frequency | Pledge Amount | Age | INCENTIVE | Serial # | STOPLIGHT
```

and `15JUL (for payslips)` adds a pivot beside it — `Row Labels` /
`Sum of INCENTIVE` — which is one line per fundraiser with their total. That
pivot IS the payslip.

Two further shapes exist: `CEBU 7th MONTH Final` (a per-site sheet with a
`7TH MONTH PAY` column) and `WV` (a per-charity sheet with a `REASON` column
where the incentive would be — i.e. a failure list).

**Implemented:** export `C4` reproduces the 12-column working sheet exactly,
and `C5` reproduces the pivot with currency, bonuses and clawbacks added.
Fundraisers now carry a tier, and commission plans can be scoped by tier and
by instrument as well as by charity and frequency.

**Not implemented:** 7th-month pay (still out of scope pending confirmation).

## 6.5 A bug this found

Running the live service against the real July files returned a 500 from every
export. A blank `CARDTYPE` cell made `"".split()[0]` raise. All 334 tests
passed at the time because every fixture set a card type. Fixed, with a
regression test that blanks the column.
