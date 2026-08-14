"""Performance bonuses on top of per-pledge commission.

The owners flagged that bonuses exist and must be adjustable, so a bonus is a
settings row rather than code: pick a measurable basis, set threshold tiers,
optionally gate on quality.

Two rules that make the numbers defensible:

- **Only the highest tier a fundraiser reaches is awarded.** Tiers are a
  ladder, not a stack. Paying every tier a person cleared would double-count.
- **Bonuses are per currency**, like everything else in payroll. A fundraiser
  working both countries earns against each book separately.

There are no default rules. Inventing a bonus scheme would be worse than
having none — these come from the client.
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.domain.models import Cutoff, PayoutLine
from app.domain.reference import BonusRule, BonusTier
from app.services.payroll import PayrollPledge

CENTS = Decimal("0.01")


def _round(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


@dataclass
class BonusAward:
    fundraiser_name: str
    currency: str
    rule_id: str
    rule_name: str
    basis: str
    #: What the fundraiser actually achieved on that basis.
    basis_value: Decimal
    #: The tier they cleared.
    threshold: Decimal
    amount: Decimal


def _period_window(rule: BonusRule, cutoff: Cutoff) -> tuple[date, date]:
    """The window a rule measures over.

    'cutoff' is the pay period itself. 'month' is the whole calendar month the
    cutoff sits in, so a monthly target is not halved by being measured over a
    fortnight.
    """
    if rule.period == "month":
        start = cutoff.start.replace(day=1)
        last_day = calendar.monthrange(start.year, start.month)[1]
        return start, start.replace(day=last_day)
    return cutoff.start, cutoff.end


def _basis_value(
    basis: str, realized: list[PayrollPledge], signups: list[PayrollPledge]
) -> Decimal:
    if basis == "realized_count":
        return Decimal(len(realized))
    if basis == "realized_value":
        return sum((p.amount for p in realized), Decimal(0))
    if basis == "signup_count":
        return Decimal(len(signups))
    if basis == "realization_rate":
        submitted = [p for p in signups if p.submitted_at is not None]
        if not submitted:
            return Decimal(0)
        return Decimal(len(realized)) / Decimal(len(submitted))
    return Decimal(0)


def _best_tier(tiers: list[BonusTier], value: Decimal) -> BonusTier | None:
    cleared = [t for t in tiers if value >= t.threshold]
    return max(cleared, key=lambda t: t.threshold) if cleared else None


def award_bonuses(
    rules: list[BonusRule],
    pledges: list[PayrollPledge],
    lines: list[PayoutLine],
    cutoff: Cutoff,
) -> list[BonusAward]:
    """Bonuses earned in this run, per fundraiser per currency."""
    if not rules:
        return []

    # Commission earned this run, for percentage-of-commission tiers.
    commission: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    for line in lines:
        commission[(line.fundraiser_name, line.currency)] += line.commission

    # Everyone with either a payout line or activity in the window counts.
    people: set[tuple[str, str]] = set(commission)
    for p in pledges:
        people.add((p.fundraiser_name, p.currency))

    awards: list[BonusAward] = []

    for rule in rules:
        if not rule.active or rule.effective_from > cutoff.end:
            continue
        start, end = _period_window(rule, cutoff)

        for name, currency in sorted(people):
            scoped = [
                p
                for p in pledges
                if p.fundraiser_name == name
                and p.currency == currency
                and (rule.charity_code is None or p.charity_code == rule.charity_code)
            ]
            # Sign-ups are counted by when they were signed; realizations by
            # when the money actually moved. Measuring both on one date would
            # credit the wrong period.
            signups = [p for p in scoped if p.signup_date and start <= p.signup_date <= end]
            realized = [p for p in scoped if p.debit_date and start <= p.debit_date <= end]

            value = _basis_value(rule.basis, realized, signups)
            if value <= 0:
                continue

            if rule.min_realization_rate is not None:
                quality = _basis_value("realization_rate", realized, signups)
                if quality < rule.min_realization_rate:
                    continue

            tier = _best_tier(rule.tiers, value)
            if tier is None:
                continue

            amount = Decimal(0)
            if tier.flat_amount:
                amount += tier.flat_amount
            if tier.pct_of_commission:
                amount += commission[(name, currency)] * (
                    tier.pct_of_commission / Decimal(100)
                )
            if amount <= 0:
                continue

            awards.append(
                BonusAward(
                    fundraiser_name=name,
                    currency=currency,
                    rule_id=rule.id,
                    rule_name=rule.name,
                    basis=rule.basis,
                    basis_value=_round(value),
                    threshold=tier.threshold,
                    amount=_round(amount),
                )
            )

    return awards
