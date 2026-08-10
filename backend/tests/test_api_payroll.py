"""Payroll through the API, plus the pure rules ported from TypeScript.

Money is the part of this system where a quiet mistake is expensive, so these
cover the cases the business gets wrong by hand: fail-then-approve, cancel
after payment, and mixing currencies.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.domain.reference import CommissionPlan
from app.services import payroll
from app.services.payroll import PaidCommission, PayrollPledge
from tests.conftest import ApiClient

PLAN = CommissionPlan(id="default")


def pledge(**over) -> PayrollPledge:
    base = {
        "serial_no": "FES48000001",
        "fundraiser_name": "Grace Tolentino",
        "charity_code": "STC",
        "amount": Decimal(600),
        "currency": "PHP",
        "signup_date": date(2026, 7, 2),
        "submitted_at": date(2026, 7, 4),
        "debit_date": date(2026, 7, 8),
        "current_classification": "approved",
    }
    base.update(over)
    return PayrollPledge(**base)


# ---------------------------------------------------------------------------
# Cutoffs
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("day", "start", "end", "run"),
    [
        ("2026-07-01", "2026-07-01", "2026-07-15", "2026-07-15"),
        ("2026-07-15", "2026-07-01", "2026-07-15", "2026-07-15"),
        ("2026-07-16", "2026-07-16", "2026-07-31", "2026-07-30"),
        ("2026-07-31", "2026-07-16", "2026-07-31", "2026-07-30"),
    ],
)
def test_semi_monthly_boundaries(day: str, start: str, end: str, run: str) -> None:
    cutoff = payroll.cutoff_for(date.fromisoformat(day))
    assert cutoff.start.isoformat() == start
    assert cutoff.end.isoformat() == end
    assert cutoff.run_date.isoformat() == run


def test_february_never_produces_an_invalid_pay_date() -> None:
    """The 30th does not exist in February; the run date must clamp."""
    assert payroll.cutoff_for(date(2026, 2, 20)).run_date == date(2026, 2, 28)
    assert payroll.cutoff_for(date(2028, 2, 20)).run_date == date(2028, 2, 29)  # leap


# ---------------------------------------------------------------------------
# Rejected, then approved — the owners' question, 2026-08-07
# ---------------------------------------------------------------------------


def test_a_rejected_then_approved_pledge_pays_in_the_approval_cutoff() -> None:
    p = pledge(submitted_at=date(2026, 7, 2), debit_date=date(2026, 7, 20))

    first_half = payroll.generate_draft_run([p], [PLAN], payroll.cutoff_for(date(2026, 7, 8)))
    second_half = payroll.generate_draft_run([p], [PLAN], payroll.cutoff_for(date(2026, 7, 20)))

    assert first_half == []
    assert len(second_half) == 1
    assert second_half[0].eligibility_date == date(2026, 7, 20)


def test_a_pledge_stays_payable_when_a_later_billing_fails() -> None:
    """Approved in July, a later monthly billing failed. The commission on the
    first success is still owed — current status must not unpay it."""
    p = pledge(current_classification="failed_retryable")
    run = payroll.generate_draft_run([p], [PLAN], payroll.cutoff_for(date(2026, 7, 8)))

    assert len(run) == 1
    assert run[0].commission > 0


def test_a_pledge_that_only_ever_failed_is_not_payable() -> None:
    p = pledge(debit_date=None, current_classification="failed_retryable")
    assert payroll.eligibility_date_for(p, PLAN) is None
    assert payroll.generate_draft_run([p], [PLAN], payroll.cutoff_for(date(2026, 7, 8))) == []


def test_two_approvals_in_one_window_pay_once() -> None:
    p = pledge(approved_billing_dates=(date(2026, 7, 8), date(2026, 7, 12)))
    assert len(payroll.generate_draft_run([p], [PLAN], payroll.cutoff_for(date(2026, 7, 8)))) == 1


# ---------------------------------------------------------------------------
# Commission, plans, clawbacks
# ---------------------------------------------------------------------------


def test_commission_is_a_multiplier_of_the_pledge() -> None:
    assert payroll.commission_for(pledge(amount=Decimal(600)), PLAN) == Decimal("1800.00")


def test_a_flat_plan_overrides_the_multiplier() -> None:
    flat = CommissionPlan(id="flat", flat_amount=Decimal(250))
    assert payroll.commission_for(pledge(amount=Decimal(9999)), flat) == Decimal("250.00")


def test_a_new_plan_does_not_reprice_historic_runs() -> None:
    """Plans are effective-dated by SIGN-UP date, not by today."""
    old = CommissionPlan(id="old", pct_of_pledge=Decimal(250), effective_from=date(2026, 1, 1))
    new = CommissionPlan(id="new", pct_of_pledge=Decimal(400), effective_from=date(2026, 8, 1))

    historic = pledge(signup_date=date(2026, 7, 2))
    assert payroll.plan_for_pledge(historic, [old, new]).id == "old"


def test_a_charity_specific_plan_beats_the_catch_all() -> None:
    catch_all = CommissionPlan(id="all", effective_from=date(2026, 1, 1))
    specific = CommissionPlan(id="stc", effective_from=date(2026, 1, 1), charity_code="STC")
    assert payroll.plan_for_pledge(pledge(), [catch_all, specific]).id == "stc"


def test_a_paid_pledge_that_later_cancels_is_a_clawback_candidate() -> None:
    p = pledge(cancelled=True, cancellation_date=date(2026, 7, 22))
    paid = [PaidCommission("FES48000001", Decimal(1800), date(2026, 7, 15), "PHP")]

    candidates = payroll.clawback_candidates_for(paid, [p], [PLAN])
    assert len(candidates) == 1
    assert candidates[0].reason == "cancelled"
    assert candidates[0].confirmed is False


def test_an_unconfirmed_clawback_never_reduces_pay() -> None:
    p = pledge(cancelled=True, cancellation_date=date(2026, 7, 22))
    paid = [PaidCommission("FES48000001", Decimal(1800), date(2026, 7, 15), "PHP")]
    candidates = payroll.clawback_candidates_for(paid, [p], [PLAN])

    lines = payroll.generate_draft_run([p], [PLAN], payroll.cutoff_for(date(2026, 7, 8)))
    nets = payroll.net_by_fundraiser(lines, candidates)
    assert nets[0].clawbacks == Decimal("0.00")
    assert nets[0].net == nets[0].gross


def test_a_confirmed_clawback_is_netted() -> None:
    p = pledge(cancelled=True, cancellation_date=date(2026, 7, 22))
    paid = [PaidCommission("FES48000001", Decimal(1800), date(2026, 7, 15), "PHP")]
    candidates = payroll.clawback_candidates_for(paid, [p], [PLAN])
    candidates[0].confirmed = True

    lines = payroll.generate_draft_run([p], [PLAN], payroll.cutoff_for(date(2026, 7, 8)))
    nets = payroll.net_by_fundraiser(lines, candidates)
    assert nets[0].clawbacks == Decimal("1800.00")
    assert nets[0].net == Decimal("0.00")


def test_a_net_can_go_negative() -> None:
    """Someone whose clawbacks exceed this period's earnings owes money back;
    clamping to zero would quietly write off the difference."""
    p = pledge(amount=Decimal(100), cancelled=True, cancellation_date=date(2026, 7, 22))
    paid = [PaidCommission("FES48000001", Decimal(5000), date(2026, 7, 15), "PHP")]
    candidates = payroll.clawback_candidates_for(paid, [p], [PLAN])
    candidates[0].confirmed = True

    lines = payroll.generate_draft_run([p], [PLAN], payroll.cutoff_for(date(2026, 7, 8)))
    assert payroll.net_by_fundraiser(lines, candidates)[0].net < 0


def test_a_cancellation_outside_the_window_is_not_clawed_back() -> None:
    plan = CommissionPlan(id="short", realization_window_days=10)
    p = pledge(cancelled=True, cancellation_date=date(2026, 12, 1))
    paid = [PaidCommission("FES48000001", Decimal(1800), date(2026, 7, 15), "PHP")]
    assert payroll.clawback_candidates_for(paid, [p], [plan]) == []


def test_currencies_are_never_summed() -> None:
    """Every fundraiser holds both PHP and MYR pledges; one total would be
    meaningless."""
    php = pledge(serial_no="A", currency="PHP", amount=Decimal(600))
    myr = pledge(serial_no="B", currency="MYR", amount=Decimal(100))
    lines = payroll.generate_draft_run([php, myr], [PLAN], payroll.cutoff_for(date(2026, 7, 8)))

    nets = payroll.net_by_fundraiser(lines, [])
    assert {n.currency for n in nets} == {"PHP", "MYR"}
    assert len(nets) == 2


# ---------------------------------------------------------------------------
# Through the API
# ---------------------------------------------------------------------------


def test_payroll_run_endpoint_returns_a_draft(loaded: ApiClient) -> None:
    run = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})
    assert run["cutoff"]["start"] == "2026-07-01"
    assert {line["serialNo"] for line in run["lines"]} == {"FES48000001", "FES48000005"}


def test_the_retry_approval_appears_in_the_second_cutoff(loaded: ApiClient) -> None:
    """End to end: the bank rejected 0002 on the 5th and approved it on the
    20th, so it is payable in the 16th–31st run."""
    first = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})
    second = loaded.json("/payroll/run", params={"as_of": "2026-07-20"})

    assert "FES48000002" not in {line["serialNo"] for line in first["lines"]}
    assert "FES48000002" in {line["serialNo"] for line in second["lines"]}


def test_the_cancelled_pledge_is_a_clawback_candidate_via_the_api(loaded: ApiClient) -> None:
    run = loaded.json("/payroll/run", params={"as_of": "2026-07-20"})
    candidates = {c["serialNo"]: c for c in run["clawbacks"]}
    assert "FES48000005" in candidates
    assert candidates["FES48000005"]["reason"] == "cancelled"
    assert candidates["FES48000005"]["confirmed"] is False


def test_nets_are_reported_per_currency_via_the_api(loaded: ApiClient) -> None:
    run = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})
    for net in run["nets"]:
        assert net["currency"] in ("PHP", "MYR")
        assert net["net"] == net["gross"] - net["clawbacks"]


def test_the_eligibility_rule_is_configurable_not_hard_coded(loaded: ApiClient) -> None:
    """Switching to 'on_submission' pays on acquisition instead of on billing.
    The client has not finally confirmed which they want."""
    before = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})

    loaded.put(
        "/settings/commission-plans",
        json={
            "id": "default",
            "pct_of_pledge": 300,
            "trigger_rule": "on_submission",
            "realization_window_days": 90,
            "effective_from": "2000-01-01",
        },
    )
    after = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})

    assert len(after["lines"]) > len(before["lines"])
    assert all(line["conditionApplied"] == "on_submission" for line in after["lines"])


def test_on_n_billings_requires_an_n(loaded: ApiClient) -> None:
    response = loaded.put(
        "/settings/commission-plans",
        json={"id": "x", "trigger_rule": "on_n_billings", "effective_from": "2000-01-01"},
    )
    assert response.status_code == 422


def test_the_cutoff_endpoint_agrees_with_the_run(loaded: ApiClient) -> None:
    cutoff = loaded.json("/payroll/cutoff", params={"as_of": "2026-07-20"})
    run = loaded.json("/payroll/run", params={"as_of": "2026-07-20"})
    assert cutoff == run["cutoff"]
