"""How a parsed application row combines with what is already on file.

The backfill rule (owner's decision, 2026-08-18) is that historical files never
modify a populated field. The routine upload rule is the opposite — an operator
re-uploading a corrected sheet expects the correction to land. Both go through
`merge_application`, so both are pinned here.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from app.domain.models import Pledge
from app.services.consolidate import PROVISIONAL_APP_STATUS, merge_application


def test_an_absent_record_is_taken_as_is() -> None:
    incoming = Pledge(serial_no="FES1", donor_name="Ana")

    assert merge_application(None, incoming, prefer_existing=True) is incoming


def test_the_backfill_does_not_blank_a_populated_field() -> None:
    """The bug this was written for: a blank in the sheet erasing real data."""
    existing = Pledge(
        serial_no="FES1",
        donor_name="Ana Reyes",
        donor_mobile="09171234567",
        amount=Decimal("500"),
        verified_at=date(2026, 7, 1),
    )
    incoming = Pledge(serial_no="FES1", donor_name="Ana Reyes")

    merged = merge_application(existing, incoming, prefer_existing=True)

    assert merged.donor_mobile == "09171234567"
    assert merged.amount == Decimal("500")
    assert merged.verified_at == date(2026, 7, 1)


def test_the_backfill_fills_a_field_that_is_empty() -> None:
    existing = Pledge(serial_no="FES1", donor_name="Ana Reyes")
    incoming = Pledge(
        serial_no="FES1",
        donor_name="Ana Reyes",
        donor_email="ana@example.test",
        amount=Decimal("750"),
    )

    merged = merge_application(existing, incoming, prefer_existing=True)

    assert merged.donor_email == "ana@example.test"
    assert merged.amount == Decimal("750")


def test_the_backfill_leaves_a_populated_field_alone_even_when_both_differ() -> None:
    existing = Pledge(serial_no="FES1", donor_name="Ana Reyes", city="Cebu")
    incoming = Pledge(serial_no="FES1", donor_name="Ana R.", city="Manila")

    merged = merge_application(existing, incoming, prefer_existing=True)

    assert merged.city == "Cebu"
    assert merged.donor_name == "Ana Reyes"


def test_a_routine_upload_still_applies_corrections() -> None:
    """prefer_existing=False is the daily path and must not become read-only."""
    existing = Pledge(serial_no="FES1", donor_name="Ana Reyes", city="Cebu")
    incoming = Pledge(serial_no="FES1", donor_name="Ana Reyes", city="Manila")

    merged = merge_application(existing, incoming, prefer_existing=False)

    assert merged.city == "Manila"


def test_a_provisional_record_yields_to_the_real_application() -> None:
    """`create_missing_from_bank`'s documented contract.

    A provisional record's `fundraiser_name` is really an agent code and its
    `app_status` is a placeholder. Treating those as populated would pin every
    bank-created record to partial data for good — and in the August file that
    was all 121 rows.
    """
    existing = Pledge(
        serial_no="FES1",
        donor_name="Ana Reyes",
        fundraiser_name="FP12",
        agent_id="FP12",
        amount=Decimal("300"),
        app_status=PROVISIONAL_APP_STATUS,
    )
    incoming = Pledge(
        serial_no="FES1",
        donor_name="Ana Reyes",
        fundraiser_name="Marites Cruz",
        agent_id="FP12",
        amount=Decimal("500"),
        app_status="ACTIVE",
    )

    merged = merge_application(existing, incoming, prefer_existing=True)

    assert merged.fundraiser_name == "Marites Cruz"
    assert merged.app_status == "ACTIVE"
    assert merged.amount == Decimal("500")


def test_a_manual_cancellation_survives_a_reimport() -> None:
    """An application row carries none of this, and events cannot rebuild it.

    `recompute_pledge_state` protects a manual cancellation from bank history,
    but it runs after the record has been rebuilt from the sheet — by which
    point the reason and the author are already gone unless carried here.
    """
    cancelled_at = datetime(2026, 7, 20, 3, 0, tzinfo=UTC)
    existing = Pledge(
        serial_no="FES1",
        donor_name="Ana Reyes",
        cancelled=True,
        cancellation_date=date(2026, 7, 20),
        cancellation_reason="Donor phoned to stop the pledge",
        cancellation_source="manual",
        cancelled_by="ops@example.test",
        cancelled_at=cancelled_at,
    )
    incoming = Pledge(serial_no="FES1", donor_name="Ana Reyes")

    for prefer_existing in (True, False):
        merged = merge_application(existing, incoming, prefer_existing=prefer_existing)

        assert merged.cancellation_reason == "Donor phoned to stop the pledge"
        assert merged.cancellation_source == "manual"
        assert merged.cancelled_by == "ops@example.test"
        assert merged.cancelled_at == cancelled_at


def test_derived_billing_state_survives_a_reimport() -> None:
    """A pledge with no events gets no help from `recompute_pledge_state`."""
    existing = Pledge(
        serial_no="FES1",
        donor_name="Ana Reyes",
        current_status_id=66,
        current_status_description="Billing Approved",
        current_status_date=date(2026, 7, 15),
        current_classification="approved",
        attempts=3,
        failed_attempts=2,
        attempts_to_success=3,
        debit_date=date(2026, 7, 15),
    )
    incoming = Pledge(serial_no="FES1", donor_name="Ana Reyes")

    for prefer_existing in (True, False):
        merged = merge_application(existing, incoming, prefer_existing=prefer_existing)

        assert merged.current_status_id == 66
        assert merged.attempts == 3
        assert merged.failed_attempts == 2
        assert merged.attempts_to_success == 3
        assert merged.debit_date == date(2026, 7, 15)


def test_a_provisional_record_still_keeps_its_billing_history() -> None:
    """Yielding to the tracker is about descriptive fields, not the outcome.

    The whole reason a provisional record exists is to hold a billing outcome
    the tracker has not caught up with. Superseding it must not discard that.
    """
    existing = Pledge(
        serial_no="FES1",
        donor_name="Ana Reyes",
        app_status=PROVISIONAL_APP_STATUS,
        current_status_id=66,
        attempts=1,
        debit_date=date(2026, 7, 15),
    )
    incoming = Pledge(serial_no="FES1", donor_name="Ana Reyes", app_status="ACTIVE")

    merged = merge_application(existing, incoming, prefer_existing=True)

    assert merged.app_status == "ACTIVE"
    assert merged.current_status_id == 66
    assert merged.attempts == 1
    assert merged.debit_date == date(2026, 7, 15)
