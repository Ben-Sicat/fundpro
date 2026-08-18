# Meeting brief

Everything you need, in the order you need it. Verified against the running
system, not from memory.

---

## 1. Where the project actually is

| Piece | State |
|---|---|
| Frontend (the website) | Complete. 8 sections, 92 tests |
| Backend (parsing, consolidation, payroll, exports) | Complete. 41 endpoints, 342 tests |
| **Website connected to the backend** | **Done.** Every page reads live data |
| Excel upload from the UI | Works. Drop a file, it consolidates |
| Database (permanent storage) | **Not connected.** Data is in memory and clears on restart |
| Deployment | Not deployed. Runs locally |

Everything is verified against **their own July files**, not just test data.

**The one sentence to lead with:** *"The processing engine is finished and the
website runs on it — what's left is permanent storage and hosting, which we
deliberately held until you'd confirmed the business rules."*

---

## 2. Before you leave (15 minutes)

Three terminals. It takes about a minute.

```bash
# 1 — the processing service
cd backend
SUPABASE_DB_URL="postgresql://unused@localhost/none" API_KEY="demo-key" \
  uv run uvicorn app.asgi:app --port 8090

# 2 — load their real files
cd backend
export API_KEY=demo-key FUNDPRO_API=http://localhost:8090
uv run python -m app.cli load ../doc/*.xlsx
uv run python -m app.cli status

# 3 — the website  (.env.local already points at port 8090)
cd frontend
pnpm dev --port 3470
```

Then sign in at `http://localhost:3470` as `admin@fundpro.local` / `demo1234`
and click through every page once. If a page errors, terminal 1 shows why.

Expected from `status`:

```
pledges 2 · uploads 3 · exceptions 0 · realization 50.0% · 14 rules, 13 assumed
```

> **`Payroll Reference - FundPro.xlsx` is rejected on purpose.** It is a third
> file shape we do not parse. Say so before they spot it.

---

## 3. The demo, in order

**1. Show the Applications list.** Their real serials, `FES48402552` and
`FES48403358`, from their own July file. Open one — seven lifecycle dates,
billing history, caller notes.

**2. Upload a file live.** Uploads → Choose file → pick
`Status Report - 16JUL2026.xlsx`. It reports rows read, matched, and what
changed. **Then upload the same file again** — nothing doubles. That is the
single most convincing thing you can show: it is the failure mode their
current process has every day.

**3. Break it deliberately.** If you have time, edit a copy of the bank file
and change a `STATUS ID` to something unknown (e.g. `77`). Upload it. The row
lands on the review list instead of failing the file. Then add the code in
settings, re-upload, and watch it go through. Thirty seconds, no developer.

**4. Payroll.** The draft run for a cutoff, per person, per currency, with
clawback candidates listed but *not* deducted until confirmed.

**5. Exports.** Generate **A1** — their Master Apps Tracker, 111 columns in
the original order with the odd spellings intact. Open it in front of them.
Then generate **C4**, which is their own payroll working sheet layout.

**6. The configuration screen.** `GET /settings/configuration` — 14 business
rules, each marked *confirmed* or *assumed*. Thirteen are assumptions. Opening
this invites them to correct a list instead of hunting for gaps.

---

## 3a. Upload demo — exactly what to expect

**Which files work?** Not "any file" — three shapes are recognised, and the
rest are refused politely. All of this was tested against their real files.

| File | Result |
|---|---|
| Master Apps Tracker | Accepted — creates/updates applications |
| Status Report (the daily bank file) | Accepted — adds billing outcomes |
| Master Results Tracker | Accepted — same 26 columns as the Status Report |
| `Payroll Reference - FundPro.xlsx` | **422 refused** — a third shape we do not parse |
| Anything not a real .xlsx | **415 refused** — "not a readable .xlsx workbook" |
| A `.csv` | **415 refused** — extension check |

The system works out which of the two it is from the column headings; nobody
has to say.

### ORDER MATTERS — the one way to embarrass yourself

Applications must exist before bank rows can match them.

- **Apps Tracker first, then Status Report** → 2 rows, 2 matched, 0 exceptions.
- **Status Report into an empty system** → 2 rows, **0 matched, 2 exceptions**,
  all `no_matching_pledge`.

The second is correct behaviour, but on screen it reads as total failure. The
demo instance is pre-loaded with the Apps Tracker **only**, so the bank file is
your live moment. Do not reset it before the meeting.

### Beat 1 — upload the Status Report

State before: two applications, both with **no bank status**.

Upload `Status Report - 16JUL2026.xlsx`. Expect:

- Green banner: *"Status Report - 16JUL2026.xlsx consolidated."* with
  *"Status Report · 2 rows read · 2 matched"*
- `FES48403358` → **66, Billing Approved**
- `FES48402552` → **59, Billing Failed (DNH - Will retry)**
- Impact panel: 1 newly approved, 1 now retrying, 0 exceptions

Say: *"Those two statuses were derived from the bank file just now — that is
the VLOOKUP step, done."*

### Beat 2 — upload the SAME file again

This is the strongest thing in the demo. Expect:

- The same green banner (it read the file fine)
- Impact panel: **"This file changed nothing — every row already matched what
  was on record."**
- Billing history unchanged: still one event per pledge, not two

Say: *"Your bank file repeats yesterday's rows every day. Upload it twice here
and nothing doubles."*

### Beat 3 — the refusal

Upload `Payroll Reference - FundPro.xlsx`. Expect a **red** banner:
*"That workbook does not look like an Apps Tracker or a Status Report."*

Do this deliberately rather than letting them find it. Say: *"It refuses what
it does not recognise instead of guessing — that file is a third shape, and
it is on the list."*

### Beat 4 — the unknown bank code (optional, highest impact)

Take a copy of the Status Report, change one `STATUS ID` to `77`, upload.

- The row lands on the review list as `unknown_status_id`
- The rest of the file still imports

Then add code 77 in settings and re-upload: it goes through. Say: *"A new bank
code is a thirty-second settings edit, not a support ticket."*

### If something looks wrong

Every number on screen is reproducible from the terminal:

```bash
uv run python -m app.cli status
```

Expected right now: `pledges 2 · uploads 1 · exceptions 0 · realization 50.0%`.

Note the realization rate is already 50% **before** any bank file — their Apps
Tracker carries its own DEBIT DATE column from the manual process. Worth
mentioning if they ask: the system reads what they already recorded, then
derives it independently once the bank file arrives.

---

## 4. The one big finding — lead with this

We decoded their `Payroll Reference` file. It contains a column called
**STOPLIGHT** that we had never been told about: a per-fundraiser ranking of
**DIAMOND / GOLD / GREEN / AMBER / RED**.

The commission multiplier tracks it. Across ~900 rows, credit cards only:

| Tier | Rows | Dominant multiplier |
|---|---|---|
| DIAMOND | 119 | ×3.0 (83%) |
| GOLD | 161 | ×3.0 (60%) |
| GREEN | 97 | ×2.5 |
| AMBER | 48 | ×2.5 |
| RED | 17 | ×1.0, and the only tier showing ×0.5 |

**This is the closest thing to an answer on "what decides the commission
multiplier" — the question that has blocked us longest.** Two more findings
alongside it:

- **Debit cards price differently.** ×1.0 / ×0.5 dominate, against ×3.0 for
  credit.
- **Every `UNHCR MY` row is ×4.0**, without exception. That is evidence it is
  a separate contract, not just a different spelling of UNHCR — which is the
  opposite of what we had assumed.

Say plainly: *"We think your STOPLIGHT tier drives the rate. Here is the
evidence from your own file. Can you confirm?"* Commission rates can already
be set per tier and per card type, so if they confirm it, it is a settings
change, not development.

---

## 5. What to ask them

Thirteen of fourteen rules are our assumptions. In priority order:

1. **What decides the commission multiplier?** Show them the STOPLIGHT table.
   *Currently assumed: ×3 for everyone.*
2. **Does `Frequency = 1` mean monthly or annual?** *Assumed monthly. If
   wrong, every annual-value figure is wrong.*
3. **Is `UNHCR MY` a separate contract?** The ×4 evidence says yes.
4. **The real bonus scheme.** We built the machinery — tiers on a target, with
   an optional quality gate — but deliberately invented no rules.
5. **Realization rate: of all sign-ups, or of those sent to the bank?** Both
   defensible; they must pick one.
6. **Commission earned on sign-up or on first billing?** *Assumed: first billing.*
7. **Clawback window.** *Assumed 90 days.*
8. **Full bank status-code list from HSBC.** Only 66 and 59 are confirmed.
9. **13th / 7th-month pay** — in their file, not modelled. In scope?
10. **The vocabulary list.** Still owed from last meeting; it is the one change
    that needs a code edit rather than a setting.

---

## 6. What you can change live, and what you cannot

**Live, in front of them** (`docs/RUNBOOK.md` has the exact commands):
commission multiplier · per-charity and per-frequency rates · per-tier and
per-card-type rates · when commission is earned · bonus rules · what triggers
a clawback and its window · realization denominator · verification gate ·
bank status codes · charity and venue aliases · frequency mapping.

**Cannot change live — do not improvise a yes:**

| They ask for | Reality |
|---|---|
| Renaming labels in the UI | Code change. Quick, but needs a redeploy — take the list |
| A new column in an export | Code change |
| A brand-new report | Code change |
| 13th-month pay | Not modelled. Scope it, do not promise it |
| Data surviving a restart | Database not connected yet |
| Using it from their office | Not deployed yet |

---

## 7. Risks and honest answers

**"Is this real or a prototype?"** Real. 434 automated tests across both
halves, run against their actual files. The website you are looking at is
reading live output from the processing engine right now.

**"Why does it forget everything when you restart?"** Storage is the one piece
deliberately left until the rules were settled — everything else is finished
and tested. Connecting a database is a contained piece of work, not a rewrite.

**"Can we use it Monday?"** No. It runs locally. Deployment plus storage is
the remaining work, and it is small relative to what is done.

**If a page errors mid-demo:** terminal 1 prints the reason. Reload; the data
is still in memory. If the service itself died, restart it and re-run the
`load` command — 30 seconds.

**If they ask something you do not know:** *"That's on our open list — let me
write it down and confirm rather than guess."* Thirteen assumptions is a
credible answer, not an embarrassing one.

---

## 8. Known imperfections — say these before they find them

- The realization rate is shown three different ways on the **frontend**
  (the backend uses one consistent definition). Pending their decision on the
  denominator. If they compare pages closely, they may spot it.
- Past payroll runs show empty in live mode. There is no approval history yet;
  showing the old sample figures next to live data would have been worse.
- The Team page still shows the fundraiser tier as `N/A` — the tier lives in
  the payroll workbook we do not yet parse.

---

## 9. Documents to have open

| File | Use |
|---|---|
| `~/Downloads/FundPro - Live Patching Runbook.pdf` | Exact commands for changes they request |
| `~/Downloads/FundPro - How It Works (Finance).pdf` | Hand to the finance people |
| `~/Downloads/FundPro - Findings.pdf` | The STOPLIGHT evidence, §6 |
| `~/Downloads/FundPro - How It Works.pdf` | Visual flow, if they want the big picture |
| `docs/OWNER_MEETING_WORKSHEET.md` | The vocabulary list to fill in |
