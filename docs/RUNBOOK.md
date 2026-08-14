# Live patching runbook

**For changing things during a meeting.** Every command here is safe to run in
front of the client and takes effect immediately.

Keep this open on a second screen. The left column is what they will say; the
right column is what you type.

---

## 0. Before the meeting

Two terminals. In the first:

```bash
cd backend
SUPABASE_DB_URL="postgresql://unused@localhost/none" \
API_KEY="demo-key" \
uv run uvicorn app.asgi:app --port 8000
```

In the second, load their real files and check it took:

```bash
cd backend
export API_KEY=demo-key FUNDPRO_API=http://localhost:8000

uv run python -m app.cli load ../doc/*.xlsx
uv run python -m app.cli status
```

Expected:

```
pledges      2
uploads      3
exceptions   0
realization  50.0% (1 of 2 sign-ups billing)
settings     14 rules, 13 still assumed
```

`Payroll Reference - FundPro.xlsx` is **expected** to be rejected — it is a
third file shape we do not parse. Say so before they notice it.

> **The data is in memory.** Restarting the service empties it; re-run the
> `load` command. This is deliberate while the database is pinned. Do not
> restart mid-demo unless you have to.

Set a shell alias so the examples below are short:

```bash
api() { curl -s -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" "$@"; }
```

---

## 1. The one screen to open first

```bash
api $FUNDPRO_API/settings/configuration | python3 -m json.tool
```

Every business rule, its current value, and whether it is **confirmed** by
them or still our **assumption**. Thirteen of fourteen are assumptions.

Opening with this is the strongest move available: it invites them to correct
a list rather than to discover problems.

---

## 2. Changes they are likely to ask for

### "The commission should be ×2.5, not ×3"

```bash
api -X PUT $FUNDPRO_API/settings/commission-plans \
  -d '{"id":"default","pct_of_pledge":250,"effective_from":"2000-01-01"}'
```

Then re-open payroll: `api "$FUNDPRO_API/payroll/run?as_of=2026-07-08"`.

> Existing payroll is **not** re-priced — plans are dated by sign-up. To change
> history too, set `effective_from` earlier than the oldest sign-up.

### "Different charities pay different rates"

```bash
api -X PUT $FUNDPRO_API/settings/commission-plans \
  -d '{"id":"stc","name":"STC rate","pct_of_pledge":400,"charity_code":"STC","effective_from":"2000-01-01"}'
```

The most specific plan wins: charity+frequency beats charity beats the
catch-all.

### "Monthly pays ×2.5 but semi-annual pays ×3"

```bash
api -X PUT $FUNDPRO_API/settings/commission-plans \
  -d '{"id":"m","name":"Monthly","pct_of_pledge":250,"frequency":"Monthly","effective_from":"2000-01-01"}'
api -X PUT $FUNDPRO_API/settings/commission-plans \
  -d '{"id":"sa","name":"Semi-annual","pct_of_pledge":300,"frequency":"Semi-Annual","effective_from":"2000-01-01"}'
```

### "They earn on sign-up, not on first billing"

```bash
api -X PUT $FUNDPRO_API/settings/commission-plans \
  -d '{"id":"default","pct_of_pledge":300,"trigger_rule":"on_submission","effective_from":"2000-01-01"}'
```

Options: `on_submission` · `on_first_approval` · `on_n_billings` (add
`"trigger_n":3`).

### "There is a bonus for hitting N donors"

```bash
api -X PUT $FUNDPRO_API/settings/bonus-rules -d '{
  "id":"volume","name":"Monthly volume bonus",
  "basis":"realized_count","period":"month",
  "tiers":[{"threshold":5,"flat_amount":1500},{"threshold":10,"flat_amount":4000}],
  "effective_from":"2000-01-01"
}'
```

- `basis`: `realized_count` · `realized_value` · `realization_rate` · `signup_count`
- `period`: `cutoff` (the pay period) · `month`
- Reward: `flat_amount`, `pct_of_commission`, or both
- Scope to one charity with `"charity_code":"STC"`
- **Only the highest tier reached is paid.**

### "…but only if their quality is good"

Add `"min_realization_rate":0.7` to the rule. Below 70%, no bonus.

### "Bonus is a percentage of what they earned"

```json
"tiers":[{"threshold":5,"pct_of_commission":10}]
```

### "Remove that bonus"

```bash
api -X DELETE $FUNDPRO_API/settings/bonus-rules/volume
```

### "We don't claw back when a donor cancels"

```bash
api -X PUT $FUNDPRO_API/settings/commission-plans \
  -d '{"id":"default","pct_of_pledge":300,"clawback_on":["failed_final","unrealized"],"effective_from":"2000-01-01"}'
```

Reasons: `cancelled` · `failed_final` · `unrealized`.

### "The clawback window should be 60 days"

Add `"realization_window_days":60` to the plan.

### "The rate should be out of everyone we signed up"

```bash
api -X PUT $FUNDPRO_API/settings/rules -d '{"realization_basis":"signups"}'
```

Every figure on every page moves together. `submitted` is the other option.

### "They must be phone-verified before we pay"

```bash
api -X PUT $FUNDPRO_API/settings/rules -d '{"require_verification_for_payroll":true}'
```

### "The bank sent us a code you don't know"

```bash
api -X PUT $FUNDPRO_API/settings/status-codes \
  -d '{"statusId":77,"description":"Chargeback","classification":"failed_final"}'
```

Classifications: `approved` · `failed_retryable` · `failed_final` ·
`cancelled` · `other`. **Then re-upload the file** — rows that were set aside
will now consolidate. This is the single best live demo: show the exception,
add the code, re-upload, show it gone.

### "Frequency 1 means annual, not monthly"

```bash
api -X PUT $FUNDPRO_API/settings/frequency-map -d '{"1":"Annual"}'
```

> Applies to the **next** import, not retroactively. Re-upload the Apps
> Tracker to restate existing rows.

### "UNHCR Malaysia is a separate client"

```bash
api -X PUT $FUNDPRO_API/settings/charity-aliases -d '{"unhcr my":"UNHCR-MY"}'
```

Re-upload afterwards.

### "These two venue names are the same place"

```bash
api -X PUT $FUNDPRO_API/settings/location-aliases \
  -d '{"mactan cebu international airport terminal 2":"MCIA T2"}'
```

---

## 3. Showing them it worked

```bash
# What changed
api $FUNDPRO_API/settings/configuration | python3 -m json.tool

# The numbers now
uv run python -m app.cli status
api "$FUNDPRO_API/payroll/run?as_of=2026-07-08" | python3 -m json.tool | head -40

# Who changed what — every settings edit is audited
api $FUNDPRO_API/audit | python3 -m json.tool | head -30
```

Generate any report as a real Excel file they can open:

```bash
curl -s -H "Authorization: Bearer $API_KEY" -X POST \
  "$FUNDPRO_API/exports/A1" -o ~/Downloads/A1.xlsx
```

Codes: `A1` `A2` `A3` (legacy masters) · `B1`–`B4` (working lists) ·
`C1`–`C3` (payroll) · `D1`–`D3` (charity & management).

---

## 4. What you CANNOT change live

Be straight about these rather than improvising.

| They ask for | Reality |
|---|---|
| Renaming labels in the UI | Code change. Quick, but needs a redeploy — take the list |
| A new column in an export | Code change |
| A new report | Code change |
| 13th-month pay | Not modelled at all. Scope it, do not promise it |
| Anything to persist after restart | Database is not wired up yet — that is the pinned piece |
| The website showing this data | Frontend still runs on mock data; the two are not connected yet |

The honest framing: **the rules are adjustable today, the wiring is not
finished.** Parsing, consolidation, payroll, exports and the API are done and
tested. Connecting the website to it, and storing data permanently, are the
remaining pieces.

---

## 5. If something breaks

```bash
# Is it up?
curl -s localhost:8000/health
```

`{"status":"unavailable"}` is **expected** — health checks the database, which
is not connected. Everything else still works.

```bash
# Start clean
pkill -f "uvicorn app.asgi"
# then relaunch and re-run the load command from §0
```

If an upload is rejected, the message says why. The three real causes: not an
`.xlsx`, not a recognised tracker layout, or over 32MB.

If a row lands on the exceptions list, that is the system working — show them
`api $FUNDPRO_API/exceptions` and the reason.

---

## 6. Capture from the meeting

Write down against each of these; they are the assumptions currently in the
build (`§7` of the finance document has the full framing):

- [ ] Commission multiplier — what decides ×1 / ×2.5 / ×3 / ×4?
- [ ] `Frequency = 1` — monthly or annual?
- [ ] Commission earned on sign-up or on first billing?
- [ ] Clawback window in days
- [ ] Which failures actually claw back
- [ ] The real bonus scheme, if any
- [ ] Realization rate: of sign-ups, or of those sent to the bank?
- [ ] MYR pledges — charged in ringgit? Combined total ever needed?
- [ ] `UNHCR MY` — same client or separate contract?
- [ ] Full bank status-code list from HSBC
- [ ] 13th-month pay in scope?
- [ ] Fundraiser end date — last day worked, or last day earning?
- [ ] The vocabulary list (their internal terms for our labels)
