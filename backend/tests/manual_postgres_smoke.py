"""Round-trip smoke test for PostgresStore against the live Supabase.

Uses clearly synthetic serials (SMOKE*) and deletes everything it wrote.
"""

from datetime import UTC, date, datetime
from decimal import Decimal

from app.config import get_settings
from app.domain.models import BillingEvent, ImportException, Pledge, PledgeNote, Upload
from app.store.postgres import PostgresStore

SERIAL = "SMOKE00000001"
store = PostgresStore(get_settings().supabase_db_url)
fails = []


def check(label, got, want):
    if got != want:
        fails.append(f"{label}: got {got!r} want {want!r}")
        print(f"  FAIL {label}: got {got!r} want {want!r}")
    else:
        print(f"  ok   {label}")


print("== pledge round trip ==")
p = Pledge(
    serial_no=SERIAL,
    donor_name="Synthetic Donor",
    donor_email="nobody@example.invalid",
    donor_mobile="09170000000",
    donor_dob=date(1990, 5, 4),
    gender="F",
    city="Cebu",
    country="PH",
    charity_code="STC",
    campaign_code="CMP1",
    site_name="Smoke Mall",
    location_name="Smoke Mall Atrium",
    agent_id="FPH999",
    fundraiser_name="Smoke Fundraiser",
    amount=Decimal("750.00"),
    currency="PHP",
    frequency="Monthly",
    frequency_raw="1",
    instrument_type="CREDIT CARD",
    masked_pan="542550********2906",
    expiry="0728",
    issuing_bank="HSBC",
    processing_bank="HSBC",
    signup_date=date(2026, 7, 1),
    submitted_at=date(2026, 7, 2),
    verified=True,
    app_status="SUBMISSION",
)
store.upsert_pledge(p)
got = store.get_pledge(SERIAL)
assert got is not None, "pledge did not come back"
for f in [
    "serial_no", "donor_name", "donor_email", "donor_mobile", "donor_dob", "gender",
    "city", "country", "charity_code", "campaign_code", "site_name", "location_name",
    "agent_id", "fundraiser_name", "amount", "currency", "frequency", "frequency_raw",
    "instrument_type", "masked_pan", "expiry", "issuing_bank", "processing_bank",
    "signup_date", "submitted_at", "verified", "app_status",
]:
    check(f, getattr(got, f), getattr(p, f))

print("== expiry leading zero preserved as TEXT ==")
check("expiry is '0728'", got.expiry, "0728")

print("== masked pan asterisks not normalized ==")
check("asterisk mask", got.masked_pan, "542550********2906")

print("== idempotent re-upsert ==")
store.upsert_pledge(p)
check("still one pledge", len([x for x in store.all_pledges() if x.serial_no == SERIAL]), 1)

print("== billing events append-only + dedupe ==")
upl = Upload(
    id=store.next_id("upl"), filename="smoke.xlsx", source_type="status_report",
    uploaded_at=datetime.now(UTC), uploaded_by="smoke@test", row_count=1,
    matched_count=1, new_record_count=0, exception_count=0, status="consolidated",
)
store.add_upload(upl)
ev = BillingEvent(
    id=store.next_id("evt"), serial_no=SERIAL, status_id=66,
    status_description="Billing Approved", status_date=date(2026, 7, 15),
    attempt_no=1, upload_id=upl.id,
)
check("first insert", store.add_billing_event(ev), True)
check("duplicate rejected", store.add_billing_event(ev), False)
evs = store.events_for(SERIAL)
check("one event", len(evs), 1)
check("status_description from join", evs[0].status_description, "Billing Approved")
check("events_from_upload", len(store.events_from_upload(upl.id)), 1)

print("== uploads ==")
check("get_upload", store.get_upload(upl.id).filename, "smoke.xlsx")
check("uploaded_by name kept", store.get_upload(upl.id).uploaded_by, "smoke@test")
store.replace_upload(upl.model_copy(update={"exception_count": 7}))
check("replace_upload", store.get_upload(upl.id).exception_count, 7)

print("== exceptions ==")
exc = ImportException(
    id=store.next_id("exc"), upload_id=upl.id, filename="smoke.xlsx", serial_no=SERIAL,
    problem="unknown_status_id", detail="STATUS ID 71 not in dictionary",
    raw_summary=f"{SERIAL} - 71", resolved=False, created_at=datetime.now(UTC),
)
check("added", store.add_exception(exc), True)
check("dedupe while open", store.add_exception(exc), False)
check("open count", store.open_exception_count(upl.id), 1)
back = [e for e in store.all_exceptions() if e.serial_no == SERIAL]
check("detail round trip", back[0].detail, "STATUS ID 71 not in dictionary")
check("raw_summary round trip", back[0].raw_summary, f"{SERIAL} - 71")
check("cleared", store.clear_exceptions_for(SERIAL), 1)
check("open count after clear", store.open_exception_count(upl.id), 0)

print("== notes ==")
note = PledgeNote(
    id=store.next_id("note"), serial_no=SERIAL, author="smoke@test",
    created_at=datetime.now(UTC), text="Called donor, confirmed.",
)
store.add_note(note)
check("note round trip", store.notes_for(SERIAL)[0].text, "Called donor, confirmed.")

print("== audit ==")
store.log("smoke@test", "smoke.run", "exercised the store")
entry = [a for a in store.all_audit() if a.action == "smoke.run"]
check("audit actor", entry[0].actor, "smoke@test")
check("audit detail", entry[0].detail, "exercised the store")

print("== team ==")
store.add_leader("Smoke Leader")
check("leader listed", "Smoke Leader" in store.all_leaders(), True)
seed = store.ensure_fundraiser("Smoke Fundraiser")
check("ensure_fundraiser", seed.name, "Smoke Fundraiser")

print("== sites ==")
store.ensure_site("Smoke Mall", location_name="Smoke Mall Atrium", country="PH", charity="STC")
check("site listed", any(s.name == "Smoke Mall" for s in store.all_sites()), True)

print("== settings persistence ==")
store.settings.create_missing_from_bank = False
store.save_settings()
store2 = PostgresStore(get_settings().supabase_db_url)
check("settings survived reconnect", store2.settings.create_missing_from_bank, False)
store2.settings.create_missing_from_bank = True
store2.save_settings()
store2.close()

print()
print("FAILURES:", len(fails))
for f in fails:
    print(" -", f)
store.close()
