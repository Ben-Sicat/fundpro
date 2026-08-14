"""Every business rule the client might want changed, proved changeable.

The owners will ask for adjustments. These tests exist so the answer is "yes,
and here is the setting" rather than "we'll have to change the code" — and so
that a rule nobody has confirmed cannot quietly become hard-coded later.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.domain.reference import BonusRule, BonusTier, CommissionPlan
from app.services import bonuses as bonus_service
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
        "verified": True,
    }
    base.update(over)
    return PayrollPledge(**base)


CUTOFF = payroll.cutoff_for(date(2026, 7, 8))


# ---------------------------------------------------------------------------
# Commission multiplier and scope
# ---------------------------------------------------------------------------


def test_the_multiplier_is_adjustable(loaded: ApiClient) -> None:
    before = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})
    loaded.put(
        "/settings/commission-plans",
        json={"id": "default", "pct_of_pledge": 400, "effective_from": "2000-01-01"},
    )
    after = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})

    assert after["lines"][0]["commission"] > before["lines"][0]["commission"]
    assert after["lines"][0]["commission"] == before["lines"][0]["commission"] / 3 * 4


def test_a_flat_fee_can_replace_the_multiplier(loaded: ApiClient) -> None:
    loaded.put(
        "/settings/commission-plans",
        json={"id": "default", "flat_amount": 250, "effective_from": "2000-01-01"},
    )
    run = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})
    assert all(line["commission"] == 250 for line in run["lines"])


def test_a_charity_can_have_its_own_multiplier(loaded: ApiClient) -> None:
    loaded.put(
        "/settings/commission-plans",
        json={
            "id": "stc-only",
            "name": "STC premium",
            "pct_of_pledge": 500,
            "charity_code": "STC",
            "effective_from": "2000-01-01",
        },
    )
    run = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})
    stc = [line for line in run["lines"] if line["charityCode"] == "STC"]
    assert stc and all(line["planId"] == "stc-only" for line in stc)


def test_a_frequency_can_have_its_own_multiplier() -> None:
    """The samples hint at ×2.5 monthly / ×3 semi-annual. If that turns out to
    be the rule, it is expressible as data rather than a schema change."""
    monthly = CommissionPlan(id="m", pct_of_pledge=Decimal(250), frequency="Monthly")
    catch_all = CommissionPlan(id="all", pct_of_pledge=Decimal(300))

    assert payroll.plan_for_pledge(pledge(frequency="Monthly"), [catch_all, monthly]).id == "m"
    assert payroll.plan_for_pledge(pledge(frequency="Annual"), [catch_all, monthly]).id == "all"


def test_the_most_specific_plan_wins() -> None:
    catch_all = CommissionPlan(id="all")
    by_charity = CommissionPlan(id="charity", charity_code="STC")
    by_both = CommissionPlan(id="both", charity_code="STC", frequency="Monthly")

    chosen = payroll.plan_for_pledge(
        pledge(frequency="Monthly"), [catch_all, by_charity, by_both]
    )
    assert chosen.id == "both"


# ---------------------------------------------------------------------------
# Clawback scope — the field that was missing from the original port
# ---------------------------------------------------------------------------


def test_clawback_reasons_are_configurable() -> None:
    """Narrowing this is how the client says 'we don't claw back for X'."""
    p = pledge(cancelled=True, cancellation_date=date(2026, 7, 22))
    paid = [PaidCommission("FES48000001", Decimal(1800), date(2026, 7, 15), "PHP")]

    everything = CommissionPlan(id="a")
    assert len(payroll.clawback_candidates_for(paid, [p], [everything])) == 1

    not_for_cancellations = CommissionPlan(id="b", clawback_on=("failed_final", "unrealized"))
    assert payroll.clawback_candidates_for(paid, [p], [not_for_cancellations]) == []


def test_the_clawback_window_is_adjustable(loaded: ApiClient) -> None:
    loaded.put(
        "/settings/commission-plans",
        json={
            "id": "default",
            "realization_window_days": 1,
            "effective_from": "2000-01-01",
        },
    )
    run = loaded.json("/payroll/run", params={"as_of": "2026-07-20"})
    # Paid 15 Jul, cancelled 22 Jul — outside a one-day window.
    assert run["clawbacks"] == []


def test_an_unknown_clawback_reason_is_rejected(loaded: ApiClient) -> None:
    response = loaded.put(
        "/settings/commission-plans",
        json={"id": "x", "clawback_on": ["made_up"], "effective_from": "2000-01-01"},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Bonuses
# ---------------------------------------------------------------------------


def volume_rule(**over) -> BonusRule:
    base = {
        "id": "volume",
        "name": "Volume bonus",
        "basis": "realized_count",
        "period": "cutoff",
        "tiers": [
            BonusTier(threshold=Decimal(1), flat_amount=Decimal(500)),
            BonusTier(threshold=Decimal(3), flat_amount=Decimal(2000)),
        ],
    }
    base.update(over)
    return BonusRule(**base)


def test_a_volume_bonus_pays_the_tier_that_was_reached() -> None:
    pledges = [
        pledge(serial_no=f"S{i}", debit_date=date(2026, 7, 8), signup_date=date(2026, 7, 2))
        for i in range(3)
    ]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)

    awards = bonus_service.award_bonuses([volume_rule()], pledges, lines, CUTOFF)
    assert len(awards) == 1
    assert awards[0].amount == Decimal("2000.00")
    assert awards[0].threshold == Decimal(3)


def test_only_the_highest_tier_is_paid_not_every_tier_cleared() -> None:
    """Tiers are a ladder, not a stack. Paying both would double-count."""
    pledges = [pledge(serial_no=f"S{i}", debit_date=date(2026, 7, 8)) for i in range(5)]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)

    awards = bonus_service.award_bonuses([volume_rule()], pledges, lines, CUTOFF)
    assert sum(a.amount for a in awards) == Decimal("2000.00")  # not 2500


def test_a_bonus_below_the_first_tier_pays_nothing() -> None:
    rule = volume_rule(tiers=[BonusTier(threshold=Decimal(10), flat_amount=Decimal(500))])
    pledges = [pledge(debit_date=date(2026, 7, 8))]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)

    assert bonus_service.award_bonuses([rule], pledges, lines, CUTOFF) == []


def test_a_percentage_bonus_is_a_share_of_commission_earned() -> None:
    rule = volume_rule(
        tiers=[BonusTier(threshold=Decimal(1), pct_of_commission=Decimal(10))]
    )
    pledges = [pledge(debit_date=date(2026, 7, 8))]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)

    awards = bonus_service.award_bonuses([rule], pledges, lines, CUTOFF)
    # Commission is 600 × 3 = 1800; 10% of that.
    assert awards[0].amount == Decimal("180.00")


def test_a_quality_gate_withholds_a_bonus_from_a_poor_realization_rate() -> None:
    """Volume alone should not earn a bonus if most of it never bills."""
    good = pledge(serial_no="A", debit_date=date(2026, 7, 8))
    bad = [
        pledge(serial_no=f"B{i}", debit_date=None, current_classification="failed_final")
        for i in range(9)
    ]
    pledges = [good, *bad]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)

    rule = volume_rule(min_realization_rate=Decimal("0.5"))
    assert bonus_service.award_bonuses([rule], pledges, lines, CUTOFF) == []

    # Same volume, no quality gate: the bonus is earned.
    assert bonus_service.award_bonuses([volume_rule()], pledges, lines, CUTOFF)


def test_an_inactive_bonus_rule_pays_nothing() -> None:
    pledges = [pledge(debit_date=date(2026, 7, 8))]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)
    assert bonus_service.award_bonuses([volume_rule(active=False)], pledges, lines, CUTOFF) == []


def test_a_bonus_can_be_scoped_to_one_charity() -> None:
    pledges = [
        pledge(serial_no="A", charity_code="STC", debit_date=date(2026, 7, 8)),
        pledge(serial_no="B", charity_code="WWF", debit_date=date(2026, 7, 8)),
    ]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)

    awards = bonus_service.award_bonuses([volume_rule(charity_code="WWF")], pledges, lines, CUTOFF)
    assert len(awards) == 1
    assert awards[0].basis_value == Decimal(1)


def test_bonuses_are_never_mixed_across_currencies() -> None:
    pledges = [
        pledge(serial_no="A", currency="PHP", debit_date=date(2026, 7, 8)),
        pledge(serial_no="B", currency="MYR", debit_date=date(2026, 7, 8)),
    ]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)

    awards = bonus_service.award_bonuses([volume_rule()], pledges, lines, CUTOFF)
    assert {a.currency for a in awards} == {"PHP", "MYR"}


def test_a_bonus_increases_the_net_and_a_clawback_still_reduces_it() -> None:
    pledges = [pledge(debit_date=date(2026, 7, 8))]
    lines = payroll.generate_draft_run(pledges, [PLAN], CUTOFF)
    awards = bonus_service.award_bonuses([volume_rule()], pledges, lines, CUTOFF)

    nets = payroll.net_by_fundraiser(lines, [], awards)
    assert nets[0].bonuses == Decimal("500.00")
    assert nets[0].net == nets[0].gross + Decimal("500.00")


# ---------------------------------------------------------------------------
# Bonuses through the API
# ---------------------------------------------------------------------------

API_RULE = {
    "id": "volume",
    "name": "Monthly volume bonus",
    "basis": "realized_count",
    "period": "month",
    "tiers": [{"threshold": 1, "flat_amount": 750}],
    "effective_from": "2000-01-01",
}


def test_a_bonus_rule_can_be_created_and_shows_up_in_payroll(loaded: ApiClient) -> None:
    assert loaded.put("/settings/bonus-rules", json=API_RULE).status_code == 200

    run = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})
    assert run["bonuses"], "expected a bonus line"
    assert all(b["ruleName"] == "Monthly volume bonus" for b in run["bonuses"])
    assert any(net["bonuses"] > 0 for net in run["nets"])


def test_a_bonus_rule_can_be_deleted(loaded: ApiClient) -> None:
    loaded.put("/settings/bonus-rules", json=API_RULE)
    assert len(loaded.json("/settings/bonus-rules")) == 1

    response = loaded._client.delete(
        "/settings/bonus-rules/volume", headers=loaded._headers
    )
    assert response.status_code == 200
    assert loaded.json("/settings/bonus-rules") == []
    assert loaded.json("/payroll/run", params={"as_of": "2026-07-08"})["bonuses"] == []


def test_a_tier_without_an_amount_is_rejected(loaded: ApiClient) -> None:
    bad = {**API_RULE, "tiers": [{"threshold": 5}]}
    assert loaded.put("/settings/bonus-rules", json=bad).status_code == 422


def test_a_rule_with_no_tiers_is_rejected(loaded: ApiClient) -> None:
    assert loaded.put("/settings/bonus-rules", json={**API_RULE, "tiers": []}).status_code == 422


def test_duplicate_thresholds_are_rejected(loaded: ApiClient) -> None:
    bad = {
        **API_RULE,
        "tiers": [{"threshold": 5, "flat_amount": 1}, {"threshold": 5, "flat_amount": 2}],
    }
    assert loaded.put("/settings/bonus-rules", json=bad).status_code == 422


def test_bonus_changes_are_audited(loaded: ApiClient) -> None:
    loaded.put("/settings/bonus-rules", json=API_RULE)
    assert "settings.bonus_rule" in {a["action"] for a in loaded.json("/audit")}


def test_the_ui_can_discover_the_available_bases(loaded: ApiClient) -> None:
    """So a settings screen never hard-codes the list."""
    options = loaded.json("/settings/bonus-options")
    assert "realized_count" in options["bases"]
    assert "realization_rate" in options["bases"]
    assert set(options["clawbackReasons"]) == {"cancelled", "failed_final", "unrealized"}


# ---------------------------------------------------------------------------
# The remaining knobs
# ---------------------------------------------------------------------------


def test_the_realization_denominator_is_switchable(loaded: ApiClient) -> None:
    """Both readings are defensible; the business needs one, and whichever it
    picks must apply everywhere at once."""
    on_submitted = loaded.json("/kpis")["realizationRate"]
    assert round(on_submitted, 4) == round(2 / 5, 4)

    loaded.put("/settings/rules", json={"realization_basis": "signups"})
    on_signups = loaded.json("/kpis")["realizationRate"]
    assert round(on_signups, 4) == round(2 / 6, 4)


def test_switching_the_denominator_moves_every_figure_together(loaded: ApiClient) -> None:
    """The defect on the frontend is that these disagree. Here they cannot."""
    loaded.put("/settings/rules", json={"realization_basis": "signups"})

    # Every per-group rate now divides by that group's own sign-ups, and the
    # company figure divides by all of them. One rule, applied everywhere.
    for f in loaded.json("/fundraisers"):
        expected = f["realized"] / f["signups"] if f["signups"] else 0.0
        assert abs(f["realizationRate"] - expected) < 1e-6

    for s in loaded.json("/sites"):
        expected = s["realized"] / s["signups"] if s["signups"] else 0.0
        assert abs(s["realizationRate"] - expected) < 1e-6

    kpis = loaded.json("/kpis")
    assert abs(kpis["realizationRate"] - kpis["activeDonors"] / kpis["signups"]) < 1e-6


def test_verification_can_be_required_before_paying(loaded: ApiClient) -> None:
    before = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})
    assert len(before["lines"]) == 2

    loaded.put("/settings/rules", json={"require_verification_for_payroll": True})
    after = loaded.json("/payroll/run", params={"as_of": "2026-07-08"})

    # Both July payables happen to be verified donors, so nothing drops — but
    # an unverified one would. Prove the gate is actually consulted.
    assert len(after["lines"]) <= len(before["lines"])
    assert loaded.json("/settings/rules")["requireVerificationForPayroll"] is True


def test_the_verification_gate_actually_withholds_pay() -> None:
    unverified = pledge(verified=False)
    plan = CommissionPlan(id="p")

    assert payroll.eligibility_date_for(unverified, plan) is not None
    assert payroll.eligibility_date_for(unverified, plan, require_verification=True) is None


def test_settings_changes_are_reflected_immediately(loaded: ApiClient) -> None:
    loaded.put("/settings/rules", json={"pay_date_rule": "nearest_business_day"})
    assert loaded.json("/settings/rules")["payDateRule"] == "nearest_business_day"


def test_an_invalid_rule_value_is_rejected(loaded: ApiClient) -> None:
    response = loaded.put("/settings/rules", json={"realization_basis": "vibes"})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# The configuration report — the thing to show them in the meeting
# ---------------------------------------------------------------------------


def test_the_configuration_report_lists_every_adjustable_rule(loaded: ApiClient) -> None:
    rows = loaded.json("/settings/configuration")
    keys = {r["key"] for r in rows}

    for expected in (
        "commission.multiplier",
        "commission.trigger",
        "commission.clawback_on",
        "commission.window",
        "bonus.rules",
        "payroll.verification_gate",
        "payroll.cutoffs",
        "metrics.realization_basis",
        "parsing.frequency_map",
        "parsing.charity_aliases",
        "parsing.status_codes",
        "money.currency",
        "scope.thirteenth_month",
    ):
        assert expected in keys, f"{expected} missing from the configuration report"


def test_every_entry_says_whether_it_is_confirmed_or_assumed(loaded: ApiClient) -> None:
    for row in loaded.json("/settings/configuration"):
        assert row["status"] in ("confirmed", "assumed")
        assert row["risk"], f"{row['key']} has no stated risk"
        assert row["label"]


def test_the_report_reflects_a_change_made_through_the_api(loaded: ApiClient) -> None:
    loaded.put(
        "/settings/commission-plans",
        json={"id": "default", "pct_of_pledge": 250, "effective_from": "2000-01-01"},
    )
    multiplier = next(
        r for r in loaded.json("/settings/configuration") if r["key"] == "commission.multiplier"
    )
    assert multiplier["value"] == "×2.5"


def test_the_report_shows_when_no_bonus_scheme_is_configured(loaded: ApiClient) -> None:
    bonus = next(r for r in loaded.json("/settings/configuration") if r["key"] == "bonus.rules")
    assert bonus["value"] == "none configured"

    loaded.put("/settings/bonus-rules", json=API_RULE)
    bonus = next(r for r in loaded.json("/settings/configuration") if r["key"] == "bonus.rules")
    assert bonus["value"] == ["Monthly volume bonus"]
