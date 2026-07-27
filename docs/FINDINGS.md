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
