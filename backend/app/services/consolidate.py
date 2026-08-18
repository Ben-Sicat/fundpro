"""Consolidation — the manual VLOOKUP step, automated.

Match each Status Report row to an application on `SERIAL NO`, validate it is
really the same pledge, append to the append-only billing history, then derive
the pledge's current state from that history.

Three properties this must have, all of them things the spreadsheet process
gets wrong:

1. **Idempotent.** Re-uploading the same file changes nothing. The daily bank
   file repeats rows, so this is the normal case, not an edge case.
2. **Total.** Every input row ends as either an event or an exception. A row
   never silently disappears.
3. **Non-destructive.** History is appended; current status is recomputed from
   it. A late-arriving row for an old date cannot erase a newer outcome.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from app.domain.models import (
    BillingEvent,
    ImportException,
    ImportProblem,
    Pledge,
    Upload,
    UploadImpact,
)
from app.parsing.apps_tracker import AppsParseResult, AppsTrackerRecord
from app.parsing.status_report import ParseResult, RowException, StatusReportRecord
from app.store.memory import Store


@dataclass
class ConsolidationResult:
    upload: Upload
    impact: UploadImpact
    exceptions: list[ImportException]


#: `app_status` stamped on a record assembled from a bank row. Load-bearing:
#: it is how `merge_application` recognises a record whose fields are bank
#: placeholders rather than real application data.
PROVISIONAL_APP_STATUS = "PROVISIONAL (from bank file)"


def _norm_name(value: str | None) -> str:
    """Case- and whitespace-insensitive name key for the secondary check."""
    return " ".join((value or "").split()).casefold()


def _pan_tail(value: str | None) -> str:
    """Last four digits of a masked PAN.

    The mask CHARACTER differs between files (asterisks in the bank file), so
    comparing the whole string produces false mismatches. The tail is the part
    that actually identifies the card.
    """
    digits = [c for c in (value or "") if c.isdigit()]
    return "".join(digits[-4:]) if len(digits) >= 4 else ""


# ---------------------------------------------------------------------------
# Status Report → billing events
# ---------------------------------------------------------------------------


def consolidate_status_report(
    store: Store,
    parsed: ParseResult,
    *,
    filename: str,
    uploaded_by: str,
) -> ConsolidationResult:
    upload_id = store.next_id("upl")
    now = datetime.now(UTC)
    exceptions: list[ImportException] = []

    def fail(
        row_exc: RowException | None,
        *,
        problem: ImportProblem,
        serial: str | None,
        detail: str,
        raw: str,
    ) -> None:
        exceptions.append(
            ImportException(
                id=store.next_id("exc"),
                upload_id=upload_id,
                filename=filename,
                serial_no=serial,
                problem=problem,
                detail=detail,
                raw_summary=raw,
                resolved=False,
                created_at=now,
            )
        )

    # Rows the parser itself could not read.
    for row_exc in parsed.exceptions:
        fail(
            row_exc,
            problem="parse_error",
            serial=row_exc.serial_no,
            detail=row_exc.detail,
            raw=f"row {row_exc.row_number}",
        )

    matched = 0
    provisional = 0
    touched: set[str] = set()

    for record in parsed.records:
        pledge = store.get_pledge(record.serial_no)

        if not store.settings.knows_status(record.status_id):
            fail(
                None,
                problem="unknown_status_id",
                serial=record.serial_no,
                detail=(
                    f"STATUS ID {record.status_id} is not in the status dictionary; "
                    "add it in Settings and re-run"
                ),
                raw=f"{record.serial_no} · STATUS ID {record.status_id}",
            )
            continue

        if pledge is None:
            if not store.settings.create_missing_from_bank:
                fail(
                    None,
                    problem="no_matching_pledge",
                    serial=record.serial_no,
                    detail="SERIAL NO is not in the applications master",
                    raw=f"{record.serial_no} · STATUS ID {record.status_id}",
                )
                continue
            pledge = _provisional_pledge(store, record)
            store.upsert_pledge(pledge)
            provisional += 1

        # Secondary validation. A serial that matches but a donor who does not
        # means the file is misaligned — updating silently would corrupt the
        # wrong person's record.
        if (
            record.donor_name
            and pledge.donor_name
            and _norm_name(record.donor_name) != _norm_name(pledge.donor_name)
        ):
            fail(
                None,
                problem="name_mismatch",
                serial=record.serial_no,
                detail="donor name on the bank row does not match the application",
                raw=f"{record.serial_no} · STATUS ID {record.status_id}",
            )
            continue

        if (
            record.masked_pan
            and pledge.masked_pan
            and _pan_tail(record.masked_pan)
            and _pan_tail(record.masked_pan) != _pan_tail(pledge.masked_pan)
        ):
            fail(
                None,
                problem="pan_mismatch",
                serial=record.serial_no,
                detail="masked card number differs from the stored instrument",
                raw=f"{record.serial_no} · STATUS ID {record.status_id}",
            )
            continue

        matched += 1
        added = store.add_billing_event(
            BillingEvent(
                id=store.next_id("evt"),
                serial_no=record.serial_no,
                status_id=record.status_id,
                status_description=(
                    record.status_description
                    or store.settings.status_description_for(record.status_id)
                    or "Unknown"
                ),
                reason=record.reason,
                reason_desc=record.reason_desc,
                status_date=record.status_date,
                bank_batch_no=record.recruiter_batch_no,
                attempt_no=record.attempts or 1,
                upload_id=upload_id,
            )
        )
        if added:
            touched.add(record.serial_no)
        # This row is through, so whatever complaint it raised before is now
        # answered.
        store.clear_exceptions_for(record.serial_no)

    for serial in touched:
        recompute_pledge_state(store, serial)

    upload = Upload(
        id=upload_id,
        filename=filename,
        source_type="status_report",
        uploaded_at=now,
        uploaded_by=uploaded_by,
        row_count=parsed.total,
        matched_count=matched,
        new_record_count=provisional,
        exception_count=len(exceptions),
        status="needs_review" if exceptions else "consolidated",
    )
    store.add_upload(upload)
    added = [e for e in exceptions if store.add_exception(e)]
    upload = upload.model_copy(update={"exception_count": len(added)})
    store.replace_upload(upload)
    store.log(
        uploaded_by,
        "import.status_report",
        f"{filename}: {parsed.total} rows, {matched} matched, {len(exceptions)} exceptions",
    )

    impact = impact_of(store, upload_id).model_copy(
        update={"new_pledges": provisional}
    )
    return ConsolidationResult(upload=upload, impact=impact, exceptions=exceptions)


# ---------------------------------------------------------------------------
# Apps Tracker → pledges
# ---------------------------------------------------------------------------


def consolidate_apps_tracker(
    store: Store,
    parsed: AppsParseResult,
    *,
    filename: str,
    uploaded_by: str,
    prefer_existing: bool = False,
) -> ConsolidationResult:
    """Load an Apps Tracker file.

    `prefer_existing` is the legacy-backfill rule — see `merge_application`. It
    defaults to False so a routine upload still applies the sheet's
    corrections, which is what an operator re-uploading a fixed row expects.
    """
    upload_id = store.next_id("upl")
    now = datetime.now(UTC)
    exceptions: list[ImportException] = []
    created = 0
    updated = 0

    for row_exc in parsed.exceptions:
        exceptions.append(
            ImportException(
                id=store.next_id("exc"),
                upload_id=upload_id,
                filename=filename,
                serial_no=row_exc.serial_no,
                problem="parse_error",
                detail=row_exc.detail,
                raw_summary=f"row {row_exc.row_number}",
                resolved=False,
                created_at=now,
            )
        )

    for record in parsed.records:
        existing = store.get_pledge(record.serial_no)
        existed = existing is not None
        store.upsert_pledge(
            merge_application(
                existing,
                _pledge_from_apps_record(store, record),
                prefer_existing=prefer_existing,
            )
        )
        if existed:
            updated += 1
        else:
            created += 1

        if record.fundraiser_name:
            store.ensure_fundraiser(record.fundraiser_name)
        if record.event_code:
            store.ensure_site(
                record.event_code,
                location_name=record.location_code or record.event_code,
                country=record.country,
                charity=store.settings.canonical_charity(record.charity_code),
            )
        # A tracker row may already carry a billing outcome from the client's
        # own VLOOKUP. Re-derive so it does not override real event history.
        recompute_pledge_state(store, record.serial_no)

    upload = Upload(
        id=upload_id,
        filename=filename,
        source_type="apps_tracker",
        uploaded_at=now,
        uploaded_by=uploaded_by,
        row_count=parsed.total,
        matched_count=created + updated,
        new_record_count=created,
        exception_count=len(exceptions),
        status="needs_review" if exceptions else "consolidated",
    )
    store.add_upload(upload)
    added = [e for e in exceptions if store.add_exception(e)]
    upload = upload.model_copy(update={"exception_count": len(added)})
    store.replace_upload(upload)
    store.log(
        uploaded_by,
        "import.apps_tracker",
        f"{filename}: {parsed.total} rows, {created} new, {updated} updated, "
        f"{len(exceptions)} exceptions",
    )

    impact = impact_of(store, upload_id)
    impact = impact.model_copy(update={"new_pledges": created})
    return ConsolidationResult(upload=upload, impact=impact, exceptions=exceptions)


def _provisional_pledge(store: Store, r: StatusReportRecord) -> Pledge:
    """An application assembled from a BANK row.

    Only used when `create_missing_from_bank` is on. The bank file carries the
    donor name, amount, frequency, card and charity — enough to place the
    billing outcome — but not the email, date of birth, site or fundraiser, so
    the record is marked PROVISIONAL and cannot be attributed. Importing the
    real Apps Tracker later overwrites it with the full record.
    """
    settings = store.settings
    return Pledge(
        serial_no=r.serial_no,
        donor_name=r.donor_name or "",
        charity_code=settings.canonical_charity(r.charity_code),
        amount=r.amount if r.amount is not None else Decimal(0),
        currency="MYR" if r.serial_no.startswith("FEH") else "PHP",
        frequency=settings.canonical_frequency(r.frequency),
        frequency_raw=r.frequency or "",
        instrument_type=settings.canonical_card_type(r.instrument_hint),
        masked_pan=r.masked_pan or "",
        expiry=r.expiry or "",
        processing_bank=r.bank or "",
        agent_id=r.agent_id or "",
        # The bank names no fundraiser, but it does give the recruiter's agent
        # code. Using it keeps the row attributable instead of collapsing every
        # provisional record into one blank row in the per-fundraiser charts.
        # It is visibly a code, not a person's name, so nobody mistakes it.
        fundraiser_name=r.agent_id or "",
        submitted_at=r.submitted_at,
        app_status=PROVISIONAL_APP_STATUS,
    )


#: Set by a human, and not reconstructible from billing history. An Apps
#: Tracker row carries none of these, so a record built from one leaves them
#: at their defaults — which is why they are carried across explicitly rather
#: than left to `recompute_pledge_state`, whose `pledge.cancellation_source or
#: ...` guard cannot help once the value has already been dropped.
_MANUAL_FIELDS = (
    "cancellation_reason",
    "cancellation_source",
    "cancelled_by",
    "cancelled_at",
)

#: Derived from the append-only billing history, never from an application
#: row. `recompute_pledge_state` restores these immediately after, but only
#: for pledges that have events — so preserving them here is what keeps a
#: re-import from blanking the state of a pledge that has none.
_DERIVED_FIELDS = (
    "current_status_id",
    "current_status_description",
    "current_status_date",
    "current_classification",
    "attempts",
    "failed_attempts",
    "attempts_to_success",
    "debit_date",
)


def _is_blank(value: object) -> bool:
    """Whether a field holds "nothing" rather than a real value.

    Pydantic defaults are the only signal available that a source row said
    nothing about a field: a missing string arrives as `""`, a missing amount
    as `Decimal(0)`, a missing count as `0`. There is deliberately no attempt
    to distinguish "the file said zero" from "the file was silent" — for the
    fields this runs over (amount, dates, contact details) zero and absent
    mean the same thing operationally.
    """
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, bool):
        return value is False
    if isinstance(value, Decimal | int):
        return value == 0
    return False


def merge_application(
    existing: Pledge | None,
    incoming: Pledge,
    *,
    prefer_existing: bool,
) -> Pledge:
    """Combine a freshly-parsed application row with what is already on file.

    `prefer_existing` is the backfill rule (owner's decision, 2026-08-18): when
    loading historical files, a populated field already in the platform is
    never modified, and the incoming row only fills gaps. Routine Apps Tracker
    uploads pass False, because there the sheet is a correction — an operator
    fixing a mobile number expects the fix to land.

    Two things hold regardless of the flag:

    - A PROVISIONAL record always yields. Its fields are bank placeholders,
      including a `fundraiser_name` that is really an agent code, so treating
      them as "populated" would permanently pin every provisional record to
      partial data. The real Apps Tracker superseding it is the documented
      contract of `create_missing_from_bank`.
    - Manual and derived fields are carried across. An application row cannot
      speak to either, so letting its defaults through is pure data loss.
    """
    if existing is None:
        return incoming

    carried: dict[str, object] = {}

    provisional = existing.app_status == PROVISIONAL_APP_STATUS
    if prefer_existing and not provisional:
        for name in type(incoming).model_fields:
            if name in _DERIVED_FIELDS or name in _MANUAL_FIELDS:
                continue
            current = getattr(existing, name)
            if not _is_blank(current):
                carried[name] = current

    for name in (*_MANUAL_FIELDS, *_DERIVED_FIELDS):
        current = getattr(existing, name)
        if not _is_blank(current):
            carried[name] = current

    return incoming.model_copy(update=carried) if carried else incoming


def _pledge_from_apps_record(store: Store, r: AppsTrackerRecord) -> Pledge:
    settings = store.settings
    existing = store.get_pledge(r.serial_no)
    country = "MY" if r.country == "MY" else "PH"

    return Pledge(
        serial_no=r.serial_no,
        donor_name=r.donor_name,
        donor_email=r.donor_email,
        donor_mobile=r.donor_mobile,
        donor_dob=r.donor_dob,
        gender=r.gender,
        city=r.city,
        country=country,
        charity_code=settings.canonical_charity(r.charity_code),
        campaign_code=r.campaign_code,
        site_name=r.event_code,
        location_name=r.location_code or r.event_code,
        agent_id=r.agent_id,
        fundraiser_name=r.fundraiser_name,
        leader_name=(store.leaders_of(r.fundraiser_name) or [""])[0],
        amount=r.amount if r.amount is not None else Decimal(0),
        # Currency follows the country of acquisition. OPEN with the client
        # (FINDINGS §3.2) — kept per-pledge rather than assumed globally.
        currency="MYR" if country == "MY" else "PHP",
        frequency=settings.canonical_frequency(r.frequency),
        frequency_raw=r.frequency,
        instrument_type=settings.canonical_card_type(r.card_type),
        masked_pan=r.masked_pan,
        expiry=r.expiry,
        issuing_bank=r.issuing_bank,
        processing_bank=r.processing_bank,
        signup_date=r.signup_date,
        submitted_at=r.status_date,
        # Derived from events; seeded from the sheet only when no event exists.
        debit_date=existing.debit_date if existing else r.debit_date,
        verified_at=r.verified_at,
        cancellation_date=r.cancellation_date,
        invoiced_date=r.invoiced_date,
        payout_date=r.payout_date,
        verified=r.verified,
        verified_by=r.verified_by,
        app_status=r.app_status,
        cancelled=r.cancelled,
        invoice_no=r.invoice_no,
        payout_status="paid" if r.payout_date else None,
    )


# ---------------------------------------------------------------------------
# Derivation
# ---------------------------------------------------------------------------


def recompute_pledge_state(store: Store, serial_no: str) -> Pledge | None:
    """Recompute a pledge's current state from its billing history.

    Rules (BACKEND_PROMPT §3):
      - current status = the LATEST event by status date
      - debit_date     = the FIRST event classifying as `approved`
      - attempts       = number of events

    `debit_date` deliberately does not move once set, and does not clear when a
    later billing fails: the money did move, the commission was earned, and a
    later failure is a clawback question rather than a reason to rewrite
    history. This is what makes a rejected-then-approved pledge payable.

    Retry counters, for the "how many goes did this take" question:
      - failed_attempts     = events the bank rejected
      - attempts_to_success = events up to AND INCLUDING the first approval,
                              or None if it has never billed

    A MANUAL cancellation is never overwritten here. Someone typed a date and
    a reason; recomputing from bank history must not silently discard that.
    Bank cancellations still win when no manual one has been recorded.
    """
    pledge = store.get_pledge(serial_no)
    if pledge is None:
        return None

    events = store.events_for(serial_no)
    if not events:
        return pledge

    settings = store.settings
    latest = events[-1]
    approved = [
        e for e in events if settings.classification_for(e.status_id) == "approved"
    ]
    cancelled_events = [
        e for e in events if settings.classification_for(e.status_id) == "cancelled"
    ]

    failed_attempts = sum(
        1
        for e in events
        if settings.classification_for(e.status_id)
        in ("failed_retryable", "failed_final")
    )
    # Position of the first approval in the event sequence, 1-based: billed on
    # the third go = 3. None while it has never billed.
    attempts_to_success: int | None = None
    if approved:
        first = approved[0]
        attempts_to_success = next(
            i for i, e in enumerate(events, start=1) if e is first
        )

    # A manual cancellation is a human decision and outranks re-derivation.
    if pledge.cancellation_source == "manual":
        cancellation_date = pledge.cancellation_date
    elif cancelled_events:
        cancellation_date = cancelled_events[-1].status_date
    else:
        cancellation_date = pledge.cancellation_date

    updated = pledge.model_copy(
        update={
            "current_status_id": latest.status_id,
            "current_status_description": latest.status_description,
            "current_status_date": latest.status_date,
            "current_classification": settings.classification_for(latest.status_id),
            "attempts": len(events),
            "failed_attempts": failed_attempts,
            "attempts_to_success": attempts_to_success,
            "debit_date": approved[0].status_date if approved else pledge.debit_date,
            "cancelled": bool(cancelled_events) or pledge.cancelled,
            "cancellation_date": cancellation_date,
            "cancellation_source": (
                pledge.cancellation_source
                or ("bank" if cancelled_events else None)
            ),
        }
    )
    store.upsert_pledge(updated)
    return updated


def impact_of(store: Store, upload_id: str) -> UploadImpact:
    """What one upload changed, derived from the events it carried."""
    events = store.events_from_upload(upload_id)
    settings = store.settings

    def count(classification: str) -> int:
        return sum(
            1 for e in events if settings.classification_for(e.status_id) == classification
        )

    return UploadImpact(
        upload_id=upload_id,
        newly_approved=count("approved"),
        newly_retrying=count("failed_retryable"),
        newly_failed_final=count("failed_final"),
        newly_cancelled=count("cancelled"),
        exceptions=store.open_exception_count(upload_id),
        changed_master=bool(events),
    )
