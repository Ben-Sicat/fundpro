# How the system handles your numbers

**For the finance team.** No technical knowledge assumed.

This explains what the system does with your spreadsheets, how each figure is
worked out, and — just as importantly — what it refuses to do. Every rule
below is enforced by an automated check that runs before any change ships, so
these are guarantees rather than intentions.

At the end there is a list of **questions we need you to answer**. Some of our
rules are still educated guesses taken from your own files. We would rather
ask than assume.

---

## 1. What you do now, and what changes

Today someone opens the bank's daily file, copies it into the Results Tracker,
then uses VLOOKUP to paste the outcome back into the Apps Tracker. Payroll and
invoicing are read off the merged sheet.

The system does the copying and matching. **You keep doing the judgement:**
approving payroll, confirming clawbacks, deciding who to call.

Nothing is deleted, and nothing you upload is changed. The original files stay
exactly as they are on your computer.

---

## 2. What happens when you upload a file

You drag in either the Apps Tracker or the bank's Status Report. You do not
have to say which — the system recognises it from the column headings.

Then, for every single row:

1. **Find the matching application** using `SERIAL NO`.
2. **Check it really is the same person** — the donor's name and the last four
   digits of the card must agree with what is on file.
3. **Record the outcome** in that pledge's billing history.

Three promises about this, each one tested:

> **A bad row never stops the file.**
> If one row is unreadable, the other 400 still import. The bad one goes to a
> "needs review" list with its original values, for a human to look at.

> **Uploading the same file twice changes nothing.**
> The bank's daily file repeats yesterday's rows. The system recognises rows
> it has already seen. You cannot double-count by uploading twice.

> **No row is ever silently dropped.**
> Every row ends up either as a recorded outcome or on the review list. The
> counts always add up. If ten rows go in, ten rows are accounted for.

### What lands on the review list

| What went wrong | What it usually means |
|---|---|
| Serial number not found | The application has not been imported yet, or a typo |
| Donor name does not match | The file is misaligned — a row has shifted |
| Card number does not match | Same as above, or the donor changed cards |
| Unrecognised status code | The bank used a code nobody has told us about |
| Could not read the value | A date or amount is malformed in the file |

An unrecognised bank code is **never guessed**. Rather than assume a new code
means failure, the system sets that row aside and waits. Someone with admin
access adds the code and what it means, re-uploads, and it goes through. That
takes about thirty seconds and does not need a developer.

---

## 3. The messy things in your files that we handle

These are all real, taken from the files you gave us. We mention them so you
know the system has seen them and copes.

| What is in the file | What we do |
|---|---|
| Amounts written as `1,000.00`, as `1000`, and as `=75*13` | All three read as 1,000 / 975. A formula is worked out, never treated as text |
| Dates written as `=DATE(2026,7,8)` and as `2026-07-08` | Both read as 8 July 2026 |
| Card expiry `0728` | Kept as text so the leading zero survives. Read as a number it becomes 728 and July is lost |
| Sheets claiming a million rows but holding 400 | We stop at the real end of the data |
| The same tab named `sheet1`, `Sheet1`, `Sheet2` | We find the data by its headings, not the tab name |
| `UNHCR`, `UNHCR MY`, `UNHCR Malaysia` | All treated as one charity |
| `CREDIT CARD`, `Credit Card`, `credit` | All treated as one card type |
| A column with a blank heading that still holds data | Kept, not thrown away |

---

## 4. How each figure is worked out

### Realization rate — the number that matters most

> **Realization rate = donors who actually billed ÷ applications sent to the bank**

Note the denominator: **sent to the bank**, not total sign-ups. An application
signed yesterday that has not reached the bank yet has not had its chance, so
counting it as a failure would understate the team.

A pledge counts as *realized* when it has billed at least once **and** has not
since cancelled.

*(Your website currently shows this three different ways on three pages — we
flagged that separately. The system uses one definition everywhere.)*

### The seven dates, and why they are separate

Every report can be filtered on any of these. "How did we do in July?" gives a
different answer depending on which one you mean.

| Date | What it means |
|---|---|
| Sign-up | The donor signed in the field |
| Status | Sent to the bank |
| **Debit** | **The card was actually charged — the money moment** |
| Verification | Someone phoned and confirmed the donor is real |
| Cancellation | The donor stopped |
| Invoice | The charity was billed |
| Payroll | The fundraiser was paid |

Sign-ups are a promise. **Debits are revenue.**

### Commission

> **Commission = pledge amount × a multiplier**

The multiplier is a setting, currently ×3, which is the most common value in
your own payroll file. It is not written into the program — an admin can
change it, and can set different multipliers for different charities.

**When it is earned** is also a setting. The default is *on the first
successful billing*: the fundraiser earns when the money actually moves, not
when the form is signed. That can be switched to pay on sign-up instead.

A change to the multiplier **never re-prices past payroll**. Rules are dated,
and each pledge uses the rule that applied on the day it was signed.

### Pay periods

The 1st–15th is paid in the ~15th run. The 16th to month-end is paid in the
~30th run. In February the second run date moves to the 28th or 29th — the
system never produces an impossible date like 30 February.

### Rejected, then approved

You raised this. Here is exactly what happens.

A donor is declined on 3 July and approved on retry on 20 July.

- The pledge becomes **payable in the run covering 20 July**, not the earlier one.
- If the bank later fails a *subsequent* monthly billing, the commission on
  that first success is **still owed**. A later failure does not un-earn it.
- A pledge that has only ever been declined is **not payable at all**.

The system looks at the *history* of what the bank said, not just the latest
line, which is why a status flipping from rejected to approved is handled
correctly rather than needing a manual fix.

### Clawbacks

If a donor cancels after the fundraiser has been paid, the commission becomes
a **clawback candidate**. Two safeguards:

> **A candidate never reduces anyone's pay on its own.** It waits in a review
> list until a person confirms it.

> **Outside the window, the money is kept.** If a cancellation comes more than
> 90 days (a setting) after payment, no clawback is proposed.

A fundraiser's net **can go negative** if confirmed clawbacks exceed what they
earned this period. We do not quietly round that up to zero — that would write
off money the agency is owed.

### Currencies are never mixed

Philippine and Malaysian pledges are counted and paid **separately**. A
fundraiser with both gets two lines, one in pesos and one in ringgit. There is
no combined total anywhere, because adding them would be meaningless without
an exchange rate nobody has agreed.

---

## 5. What the system refuses to do

- **It never stores a full card number.** Only the masked form the bank sends
  (`542550********2906`). There is no place in the database capable of holding
  a complete card number, so it cannot happen by accident.
- **It never changes billing history.** Outcomes are only ever added. You can
  always see how a pledge reached its current state.
- **It never deletes a caller note.** A correction is added as a new note, so
  the record of what was believed and when survives.
- **It never guesses a bank code, an amount, or a date.** Anything ambiguous
  becomes a review item.
- **It never lets a charity see another charity's data.** A charity login is
  locked to one charity and can never see donor contact details, card data or
  payroll. Asking for another charity's record returns "not found" — it does
  not even confirm the record exists.
- **It never writes donor names or card numbers into its logs.** Required by
  the Data Privacy Act (RA 10173).

Every export that contains personal data is **flagged and logged** with who
generated it and when. The report designed to be sent to charities contains no
personal data at all, and that is verified automatically rather than trusted.

---

## 6. What you can get out of it

Thirteen reports, all as Excel files.

**The safety net** — these reproduce your current spreadsheets exactly, same
111 columns in the same order, including the odd spellings like
`CUSTOMER'S NAME` and `Fax AREACODE`. If you ever want to stop using the
system, you can, and nothing is stranded.

**Working lists** — who to call about a failed payment (including whose card
has expired), who is still waiting on a verification call, and what would not
import.

**Payroll** — what to pay each person this period, and what to reclaim.

**For charities and management** — invoices, delivery summaries with no
personal data, and revenue against commission cost per charity per month.

Every report shows how many rows you will get **before** you generate it.

---

## 6a. What you can change yourselves

Nothing below needs a developer or a new release. An admin changes it in
settings and the next calculation uses the new value.

### Commission

| Setting | Now | What you can do |
|---|---|---|
| Multiplier | ×3 | Any multiplier, or a flat fee per pledge instead |
| Per charity | one rule for all | A different multiplier for each charity |
| Per frequency | one rule for all | e.g. ×2.5 monthly, ×3 semi-annual |
| When it is earned | on first successful billing | On sign-up, or after N successful billings |
| Effective date | — | Rules are dated. A new rule **never** re-prices past payroll |

### Bonuses

Bonuses are set up as **tiers on a target**. Pick what to measure, set the
rungs, and optionally add a quality gate.

- **Measure:** donors who billed · value of those donors · realization rate ·
  sign-ups regardless of outcome
- **Period:** the pay period, or the whole calendar month
- **Reward:** a fixed amount, a percentage of the commission earned, or both
- **Quality gate:** no bonus unless realization is above a rate you set
- **Scope:** all charities or just one

Two rules worth knowing. **Only the highest tier reached is paid** — tiers are
a ladder, not a stack, so clearing "20 donors" does not also pay the "10
donors" rung. And bonuses are **per currency**, like everything else.

*Example: "₱2,500 once someone gets 5 billing donors in a month, but only if
at least 70% of their sign-ups actually bill."* That is one settings entry.

**No bonus scheme is configured yet.** We deliberately did not invent one —
tell us the real rules and we will enter them.

### Clawbacks

| Setting | Now | What you can do |
|---|---|---|
| What triggers one | cancelled, failed for good, never billed | Remove any of these |
| Window | 90 days after payment | Any number of days |

### Everything else

| Setting | Now |
|---|---|
| Realization rate denominator | of those sent to the bank *(or: of all sign-ups)* |
| Require a verification call before paying | off |
| Pay date when it falls on a weekend | the 15th / 30th as-is *(or: previous business day)* |
| Bank status codes | 8 known, add more any time |
| Charity name aliases | UNHCR MY → UNHCR, etc. |
| Frequency codes | 1 → Monthly, 3 → Quarterly, … |
| Venue name aliases | for tidying free-text site names |
| Currency conversion | never combined |

There is a single screen (`Settings → Configuration`) that lists all of these
with their current value and marks each one **confirmed** or **assumed**, so
you can see at a glance which rules we are still guessing at. Right now that
is **13 of 14**.

---

## 7. Questions we need you to answer

We would rather ask than guess. Each of these is currently a setting with our
best estimate in it, so nothing is blocked — but a wrong guess quietly
mis-states numbers, so please correct us.

**1. What decides the commission multiplier?**
Your payroll file shows ×1, ×2.5, ×3 and ×4 on different rows. We cannot see
the pattern. Is it the frequency, the charity, the campaign, how long the
fundraiser has been with you, or something else?
*Currently assumed: ×3 for everyone.*

**2. What does `Frequency = 1` mean — monthly, or once a year?**
Your files use both `1` and `12`, and also the words "Monthly" and "Annual".
`12` looks like twelve payments a year. By that logic `1` would mean once a
year, but the Apps Tracker uses `1` on pledges described as monthly.
*Currently assumed: monthly. If wrong, every annual-value figure is wrong.*

**3. When exactly is commission earned?**
On the first successful billing, or as soon as the application is signed?
*Currently assumed: on the first successful billing.*

**4. How long after payment can a cancellation still be clawed back?**
*Currently assumed: 90 days.*

**5. Are Malaysian pledges actually charged in ringgit?**
And if you need a combined company total, whose exchange rate do we use, and
who updates it?
*Currently assumed: ringgit for Malaysia, pesos for the Philippines, never combined.*

**6. Is `UNHCR MY` a separate contract from `UNHCR`, or the same client in
another country?** This changes whether they are invoiced together or apart.
*Currently assumed: the same client.*

**7. Can you get the full list of bank status codes from HSBC?**
We only know two for certain: 66 (approved) and 59 (failed, will retry). We
have made sensible guesses at the rest. Any code we do not know is set aside
rather than guessed, so nothing is silently miscounted — but the more codes we
have, the less lands on the review list.

**8. Does the system need to calculate 7th/13th-month pay?**
It appears in your payroll file but we have not built it.
*Currently assumed: out of scope.*

**9. On the realization rate — of everyone signed up, or of everyone sent to
the bank?** Both are defensible. We need one.
*Currently assumed: of everyone sent to the bank.*

**10. When a fundraiser leaves, does their end date mean their last day
worked, or the last day they earn commission on billings that arrive later?**
Those are different dates and it changes what they are paid.

---

## 8. How we know this actually works

Fair question, and the honest answer is that you should not take our word for
it.

There are **300 automated checks** that run before any change is released. If
any single one fails, the change does not ship. They include:

- Uploading the same file twice and confirming nothing doubles
- Confirming `0728` is still `0728` after going all the way through
- A donor declined then approved, and checking they become payable in the
  right pay period
- Confirming an unconfirmed clawback does not reduce anyone's pay
- Confirming the charity report contains no donor names, emails or card numbers
- Confirming a charity login cannot reach another charity's data even when
  asking for it directly
- Regenerating your Apps Tracker and checking all 111 column headings match
  the original exactly

We also run the system against **your actual files** — the July trackers you
sent — not only against test data. That is how we found that your card numbers
are masked with asterisks rather than X's, and that the Status Report writes
`CUSTOMERS NAME` while the Apps Tracker writes `CUSTOMER'S NAME`. Both now
handled.

If anything in this document does not match how you actually work, that is the
most useful thing you can tell us.
