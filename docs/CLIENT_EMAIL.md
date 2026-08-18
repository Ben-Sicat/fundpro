# Pre-meeting email — draft

**Attach ONLY these two:**

- `FundPro - How It Works (Finance).pdf`
- `FundPro - How It Works.pdf`

**Do NOT attach** the Meeting Brief (it contains "what not to promise" and our
risk list) or the Live Patching Runbook (internal operating commands). The
Findings document is written for developers; its one client-relevant section
is quoted in the email body instead.

---

**Subject:** FundPro — where we are, and what we need from you today

---

Hi [names],

Ahead of today's session, two short documents so nobody is reading cold.

**How It Works (Finance)** — plain language, no jargon: what happens to each
row of your spreadsheets, how every figure is calculated, and what the system
deliberately refuses to do. Written for your finance team rather than for
developers.

**How It Works** — the same thing as diagrams, if you prefer the overview.

**Where we are.** The processing engine is finished: it reads your Apps
Tracker and the bank's Status Report, matches them on SERIAL NO, works out
billing outcomes, payroll and clawbacks, and regenerates your existing
spreadsheets exactly. The website now runs on it end to end — we will show you
that live, using your own July files. What remains is permanent storage and
hosting, which we held back deliberately until the rules below are settled.

**One thing we found in your own data.** Your payroll workbook has a column
called STOPLIGHT that ranks each fundraiser DIAMOND / GOLD / GREEN / AMBER /
RED. Looking across about 900 rows, the commission multiplier tracks that
ranking closely — DIAMOND is ×3 on 83% of credit-card rows, and RED is the
only tier where ×0.5 appears. Debit cards price differently again, and every
single UNHCR MY row is ×4. We think this is the rule behind the multiplier,
but we would rather have you confirm it than assume.

**What we need from you.** Thirteen of the fourteen business rules in the
system are currently our best guess from your files. Nothing is blocked —
every one is a setting we can change in seconds — but a wrong guess quietly
mis-states numbers, so we would like to settle them today:

1. What decides the commission multiplier?
2. Does `Frequency = 1` mean monthly or annual?
3. Is `UNHCR MY` a separate contract from UNHCR?
4. Your actual bonus scheme, if you have one
5. Is the realization rate out of all sign-ups, or of those sent to the bank?
6. Is commission earned on sign-up, or on the first successful billing?
7. How long after payment can a cancellation still be clawed back?
8. Can you get the full status-code list from HSBC?
9. Is 7th / 13th-month pay in scope?
10. The list of internal terms you want used in the screens

Section 7 of the finance document explains what each one affects and what we
have assumed in the meantime.

See you at [time].

[your name]

---

## If you would rather send one line

> Hi [names] — two short documents ahead of today, attached. The finance one
> explains how your numbers are worked out in plain language; section 7 lists
> the ten things we need you to confirm. The engine is finished and the site
> now runs on it live against your July files, which we will demo. See you at
> [time].
