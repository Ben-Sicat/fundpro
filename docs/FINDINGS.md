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
