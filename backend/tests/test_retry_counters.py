"""Retry counters: how many goes did this donor take to actually bill."""

from __future__ import annotations

from datetime import date

from app.domain.models import BillingEvent, Pledge
from app.services.consolidate import recompute_pledge_state
from app.store.memory import Store


def _event(store: Store, serial: str, status_id: int, day: int) -> None:
    store.add_billing_event(
        BillingEvent(
            id=store.next_id("evt"),
            serial_no=serial,
            status_id=status_id,
            status_description=str(status_id),
            status_date=date(2026, 7, day),
            attempt_no=day,
            upload_id="u1",
        )
    )


APPROVED = 66
FAILED_RETRY = 59


def test_billing_first_time_is_one_attempt(store: Store) -> None:
    store.upsert_pledge(Pledge(serial_no="S1", donor_name="A"))
    _event(store, "S1", APPROVED, 1)

    p = recompute_pledge_state(store, "S1")

    assert p is not None
    assert p.attempts_to_success == 1
    assert p.failed_attempts == 0


def test_two_retries_then_success_is_three(store: Store) -> None:
    store.upsert_pledge(Pledge(serial_no="S2", donor_name="B"))
    _event(store, "S2", FAILED_RETRY, 1)
    _event(store, "S2", FAILED_RETRY, 2)
    _event(store, "S2", APPROVED, 3)

    p = recompute_pledge_state(store, "S2")

    assert p is not None
    assert p.attempts_to_success == 3
    assert p.failed_attempts == 2
    assert p.attempts == 3


def test_never_billed_has_no_success_count(store: Store) -> None:
    store.upsert_pledge(Pledge(serial_no="S3", donor_name="C"))
    _event(store, "S3", FAILED_RETRY, 1)
    _event(store, "S3", FAILED_RETRY, 2)

    p = recompute_pledge_state(store, "S3")

    assert p is not None
    assert p.attempts_to_success is None
    assert p.failed_attempts == 2


def test_a_failure_after_success_does_not_move_the_count(store: Store) -> None:
    """The money did move. A later failure is a clawback question.

    Same reasoning as `debit_date` never moving: the commission was earned on
    the approval, so "how many goes did it take" is answered once.
    """
    store.upsert_pledge(Pledge(serial_no="S4", donor_name="D"))
    _event(store, "S4", FAILED_RETRY, 1)
    _event(store, "S4", APPROVED, 2)
    _event(store, "S4", FAILED_RETRY, 3)

    p = recompute_pledge_state(store, "S4")

    assert p is not None
    assert p.attempts_to_success == 2
    assert p.debit_date == date(2026, 7, 2)
    # All three attempts still counted, two of them failures.
    assert p.attempts == 3
    assert p.failed_attempts == 2
