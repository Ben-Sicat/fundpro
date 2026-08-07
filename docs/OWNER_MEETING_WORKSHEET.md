# Owner meeting worksheet

Prepared 2026-08-07. Purpose: capture the agency's internal vocabulary and
close the domain questions that are still guesses in the build.

Fill in the blanks during the meeting. Anything left blank stays as-is.

---

## Part 1 — Vocabulary

The owners said wordings should match their internal codes. Below is every
concept the UI names, with the wordings currently in use. Where we say the
same thing several ways, that is listed as one row — pick **one** term per row
and we will make it consistent everywhere.

**Ask for the term they'd say out loud to a new hire, not the spreadsheet
column header.** The legacy export headers stay byte-identical regardless —
renaming in the UI does not touch the exported files.

| # | Concept | We currently say | They call it |
|---|---|---|---|
| 1 | One donor's signed form / record | **Application**, *pledge*, *sign-up* (all three, interchangeably) | |
| 2 | The person who signs donors up in the field | **Fundraiser** (but their ID is labelled *Agent ID* in one place, *Code* in another) | |
| 3 | The fundraiser's supervisor | **Leader** | |
| 4 | The charity being fundraised for | **Client** in filters, **Charity** everywhere else | |
| 5 | % of sign-ups that successfully bill | **Donors that stick**, *Stick rate*, *Started paying*, *Realized*, *realization rate* (5 wordings — see Part 2, this one also has a maths problem) | |
| 6 | A pledge that billed successfully | **Realized** / *Started paying* / *Approved* | |
| 7 | Payment failed, bank will retry | **Retrying** / *Payment retrying* / *Payment failed, retrying* / *Needs chasing* | |
| 8 | Payment failed, no more retries | **Failed** / *Failed for good* / *Failed final* | |
| 9 | Not yet sent to the bank | **Awaiting bank** / *Not submitted* / *Not yet sent to bank* | |
| 10 | The day the card is actually charged | **Debit date** / *First paid* / *Money collected* / *the money moment* | |
| 11 | The confirmation phone call | **Verification** / *Phone-verified* / *Called and confirmed* / *Not yet called* | |
| 12 | Total monthly pledge value | **Monthly giving** / *Monthly value* / *Monthly* / *pledged value* | |
| 13 | Average pledge size | **Average gift** / *Avg gift* | |
| 14 | Commission earned | **Earned** in one table, *Gross* in the next table on the same page | |
| 15 | Commission reversed after a cancellation | **Clawback** / *Reclaimed* / *money to reclaim* / *Clawback exposure* | |
| 16 | Net amount a fundraiser receives | **Take home** | |
| 17 | The semi-monthly pay period | **Cutoff** / *pay period* / *pay run* / *Draft run* | |
| 18 | A row from the bank file that wouldn't match | **Exception** / *Needs review* / *Needs a look* / *would not consolidate* / *Problem* | |
| 19 | Merging the bank file into the master | **Consolidation** / *filed* / *matched up* | |
| 20 | The venue/event where donors are recruited | **Site** (vs *Location* for the venue name) | |
| 21 | How often the donor gives | **How often** / *Frequency* | |
| 22 | The caller's remarks (new this week) | **Caller notes** / *verification desk* | |

**Also worth asking:** the app is called **FundPro** and the sections are
`Overview · Applications · Team · Donors · Uploads · Exports · Payroll ·
Settings`. Do those section names match how they'd describe their own workflow?

---

## Part 2 — Numbers that need a definition (not just a name)

These are decisions, not wording. **Item 1 is a live defect** — the same
headline metric is currently computed three different ways, so the owners will
see numbers that disagree between pages.

### 1. What is the denominator of the realization rate? ⚠

The tile labelled "Donors that stick" appears on three pages and means three
different things:

| Page | Formula | Its own caption says |
|---|---|---|
| Overview | realized ÷ **sent to bank** | "of sign-ups keep paying" ← caption contradicts the maths |
| Applications | realized ÷ **sent to bank** | "of those sent to the bank" ✓ consistent |
| Team | realized ÷ **all sign-ups** | "team average" |

And on the Team page alone, the "Stick rate" column uses ÷ sent-to-bank for
fundraisers but ÷ all-sign-ups for leaders — so a leader's rate will never
equal the average of their own team's rates. The Overview sparkline uses a
third denominator again, so the trend line doesn't match the number above it.

**Decide:** is the headline rate *"of everyone we signed up"* or *"of everyone
we actually submitted to the bank"*? Both are defensible; the business needs
one. (The second flatters the number, because pledges not yet submitted are
excluded.)

Answer: ______________________________________________

*If they want both, we can show them side by side — but they need different
names.*

### 2. When does a pledge count as "realized" if it later cancels?

Currently: a cancelled pledge stops counting as realized, even though it did
bill and commission was paid on it. That is why clawbacks exist.

Confirm this is right: ______________________________________________

### 3. Multi-currency reporting

Malaysian pledges are in MYR, Philippine in PHP. The payroll total currently
shows a PHP figure with ringgit listed separately per person. Should there be
one converted total, and if so at what FX rate and set by whom?

Answer: ______________________________________________

---

## Part 3 — Domain questions still open

From `docs/FINDINGS.md` §4, derived from the real sample files. Each of these
is currently a configurable guess in Settings rather than hard-coded — but
they need real answers before go-live.

1. **Commission multiplier.** The samples show ×1, ×2.5, ×3 and ×4 of the
   pledge amount. What determines which one applies — frequency, campaign,
   fundraiser tenure, or the period?
   → ______________________________________________

2. **`Frequency = 1`.** Does the code `1` mean *monthly* or *once*? Genuinely
   ambiguous in the data; everything downstream depends on it.
   → ______________________________________________

3. **Commission eligibility.** Does a fundraiser earn on acquisition alone, or
   only once the pledge actually bills? (Evidence in the samples points to
   acquisition + approval — worth confirming out loud.)
   → ______________________________________________

4. **`UNHCR MY` vs `UNHCR`.** Separate contract/client, or the same client in
   a different country? Affects invoicing and per-charity reporting.
   → ______________________________________________

5. **7th / 13th-month pay.** It exists in their payroll reference but is not
   modelled. In scope?
   → ______________________________________________

6. **Full bank status-code dictionary.** Only 66 (Billing Approved) and 59
   (Billing Failed, DNH/retry) are confirmed. Can they get the complete list
   from HSBC? New codes can be added in Settings without a deploy, but we're
   guessing at classifications until then.
   → ______________________________________________

7. **Charity name aliases.** Samples contain `UNHCR`/`UNHCR MY`/`UNHCR
   Malaysia` and `World Vision`/`WV`. Is the alias list we inferred complete?
   → ______________________________________________

---

## Part 4 — New since they last looked

Worth demoing and getting a reaction to:

- **Caller notes.** Applications → open any serial no → "Caller notes". A
  running thread per donor: author, timestamp, remark. Notes are never edited
  or deleted; a correction is added as a new note, so there's an audit trail.
  Hidden from charity viewers, since remarks quote donor conversations.
  - *Ask:* should notes have a category (no answer / confirmed / callback
    requested / complaint)? That would make them filterable and reportable —
    "show me everyone who asked for a callback" — instead of just readable.
  - *Ask:* should a note be able to flag an application for follow-up?

- **Fundraiser start and end dates.** Team → "Started" and "Until" columns.
  Blank ("present") while active.
  - *Ask:* is the end date the last day worked, or the last day they earn
    commission on trailing billings? Those differ, and it changes payroll.
  - *Ask:* do they need tenure-to-date anywhere (it may feed the commission
    multiplier — see Part 3 item 1).

---

## Part 5 — Things to raise if there's time

- **Role list.** Currently `admin · operations · payroll · viewer ·
  charity_viewer`. Do those match the actual job titles in the office, and who
  gets which?
- **Do the charities get logins?** `charity_viewer` is built (scoped to one
  charity, never sees donor contacts, payment data, or payroll) but nobody has
  said whether it will actually be used.
- **Internal codes displayed raw.** A few screens still show system values to
  users (`charity_viewer`, `failed_retryable`). These get friendly names as
  part of the wording pass.
