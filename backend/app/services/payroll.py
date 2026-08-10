"""Payroll derivation — a faithful port of `frontend/lib/services/payroll.ts`.

Ported rather than reinvented: those rules were measured against the client's
own payroll workbook (FINDINGS §3.7) and carry 51 tests. Any divergence here
would mean the UI and the service disagree about what someone is owed.

All date arithmetic is on ISO strings / `date` objects in UTC. Never on a
local-time datetime: Asia/Manila is UTC+8, and a midnight rollover would move
a pledge into the wrong cutoff.

Money is Decimal throughout, rounded only at the boundary.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.domain.models import (
    ClawbackCandidate,
    Cutoff,
    FundraiserNet,
    PayoutLine,
)
from app.domain.reference import CommissionPlan

CENTS = Decimal("0.01")


def _round(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PayrollPledge:
    """The slice of a pledge payroll cares about."""

    serial_no: str
    fundraiser_name: str
    charity_code: str
    amount: Decimal
    currency: str
    signup_date: date
    submitted_at: date | None = None
    debit_date: date | None = None
    cancellation_date: date | None = None
    cancelled: bool = False
    current_classification: str | None = None
    #: Status dates of approved billings, ascending. For `on_n_billings`.
    approved_billing_dates: tuple[date, ...] = ()


# ---------------------------------------------------------------------------
# Cutoffs
# ---------------------------------------------------------------------------


def end_of_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def days_between(start: date, end: date) -> int:
    return (end - start).days


def cutoff_for(day: date) -> Cutoff:
    """The semi-monthly cutoff containing `day`.

    CONFIRMED: 1st–15th is paid in the ~15th run, 16th–EOM in the ~30th. The
    pay date stays editable on the draft because whether it lands on the 30th
    or the nearest business day is still unconfirmed.
    """
    eom = end_of_month(day.year, day.month)
    if day.day <= 15:
        return Cutoff(
            label=f"{day.year}-{day.month:02d} 1st–15th",
            start=date(day.year, day.month, 1),
            end=date(day.year, day.month, 15),
            run_date=date(day.year, day.month, 15),
        )
    return Cutoff(
        label=f"{day.year}-{day.month:02d} 16th–{eom}",
        start=date(day.year, day.month, 16),
        end=date(day.year, day.month, eom),
        # The 30th, or the 28th/29th in a short month — never an invalid date.
        run_date=date(day.year, day.month, min(30, eom)),
    )


def cutoffs_in_month(year: int, month: int) -> tuple[Cutoff, Cutoff]:
    return cutoff_for(date(year, month, 1)), cutoff_for(date(year, month, 16))


# ---------------------------------------------------------------------------
# Plan selection & eligibility
# ---------------------------------------------------------------------------


def plan_for_pledge(
    pledge: PayrollPledge, plans: list[CommissionPlan]
) -> CommissionPlan | None:
    """The plan in force for a pledge.

    The latest plan effective at or before its SIGN-UP date, preferring a
    charity-specific plan over the catch-all. Keying on signup date rather
    than today is what stops a new plan silently repricing historic payroll.
    """
    eligible = [
        p
        for p in plans
        if p.effective_from <= pledge.signup_date
        and (p.charity_code is None or p.charity_code == pledge.charity_code)
    ]
    if not eligible:
        return None
    eligible.sort(
        key=lambda p: (p.effective_from, 1 if p.charity_code is not None else 0),
        reverse=True,
    )
    return eligible[0]


def eligibility_date_for(
    pledge: PayrollPledge, plan: CommissionPlan
) -> date | None:
    """The date a pledge becomes payable, or None if it never has.

    Returning None rather than a fallback date is deliberate: a pledge with no
    eligibility date must be absent from payroll, not paid on a guessed date.

    Note that `on_first_approval` reads `debit_date`, which is the FIRST
    approved billing and never moves once set. That is what makes a pledge the
    bank first rejected and later approved payable in the cutoff containing
    the approval — and keeps it payable if a later billing fails.
    """
    if plan.trigger_rule == "on_submission":
        return pledge.submitted_at
    if plan.trigger_rule == "on_first_approval":
        return pledge.debit_date
    if plan.trigger_rule == "on_n_billings":
        n = plan.trigger_n or 1
        dates = list(pledge.approved_billing_dates) or (
            [pledge.debit_date] if pledge.debit_date else []
        )
        return dates[n - 1] if len(dates) >= n else None
    return None


def commission_for(pledge: PayrollPledge, plan: CommissionPlan) -> Decimal:
    if plan.flat_amount is not None:
        return _round(plan.flat_amount)
    return _round(pledge.amount * (plan.pct_of_pledge / Decimal(100)))


# ---------------------------------------------------------------------------
# Run generation
# ---------------------------------------------------------------------------


def generate_draft_run(
    pledges: list[PayrollPledge],
    plans: list[CommissionPlan],
    cutoff: Cutoff,
) -> list[PayoutLine]:
    """Payout lines for one cutoff: every pledge whose eligibility date falls
    inside the window, priced by the plan in force at its signup date."""
    lines: list[PayoutLine] = []
    for pledge in pledges:
        plan = plan_for_pledge(pledge, plans)
        if plan is None:
            continue
        eligible_on = eligibility_date_for(pledge, plan)
        if eligible_on is None:
            continue
        if eligible_on < cutoff.start or eligible_on > cutoff.end:
            continue

        lines.append(
            PayoutLine(
                serial_no=pledge.serial_no,
                fundraiser_name=pledge.fundraiser_name,
                charity_code=pledge.charity_code,
                pledge_amount=pledge.amount,
                currency=pledge.currency,  # type: ignore[arg-type]
                commission=commission_for(pledge, plan),
                condition_applied=plan.trigger_rule,
                eligibility_date=eligible_on,
                plan_id=plan.id,
            )
        )

    lines.sort(key=lambda line: (line.fundraiser_name, line.eligibility_date))
    return lines


@dataclass(frozen=True)
class PaidCommission:
    serial_no: str
    commission: Decimal
    paid_on: date
    currency: str | None = None


def clawback_candidates_for(
    paid: list[PaidCommission],
    pledges: list[PayrollPledge],
    plans: list[CommissionPlan],
) -> list[ClawbackCandidate]:
    """Commission already PAID on a pledge that has since gone bad.

    Candidates only — an admin confirms before anything is netted. An
    unconfirmed candidate must never reduce someone's pay.
    """
    by_serial = {p.serial_no: p for p in pledges}
    out: list[ClawbackCandidate] = []

    for payout in paid:
        pledge = by_serial.get(payout.serial_no)
        if pledge is None:
            continue
        plan = plan_for_pledge(pledge, plans)
        if plan is None:
            continue

        reason: str | None = None
        triggered_on: date | None = None

        if pledge.cancelled and pledge.cancellation_date:
            reason, triggered_on = "cancelled", pledge.cancellation_date
        elif pledge.current_classification == "failed_final":
            reason = "failed_final"
            triggered_on = pledge.debit_date or pledge.submitted_at
        elif pledge.debit_date is None:
            # Paid on submission but never billed.
            reason, triggered_on = "unrealized", pledge.submitted_at

        if reason is None or triggered_on is None:
            continue
        # Outside the window the commission is kept — that is the point of it.
        if days_between(payout.paid_on, triggered_on) > plan.realization_window_days:
            continue

        out.append(
            ClawbackCandidate(
                serial_no=pledge.serial_no,
                fundraiser_name=pledge.fundraiser_name,
                original_commission=payout.commission,
                currency=payout.currency or pledge.currency,  # type: ignore[arg-type]
                reason=reason,  # type: ignore[arg-type]
                triggered_on=triggered_on,
                confirmed=False,
            )
        )
    return out


def net_by_fundraiser(
    lines: list[PayoutLine], clawbacks: list[ClawbackCandidate]
) -> list[FundraiserNet]:
    """Net payable per fundraiser PER CURRENCY.

    Never summed across currencies: every fundraiser in the book holds both
    PHP and MYR pledges, and one total would be meaningless. Only CONFIRMED
    clawbacks are netted.
    """
    acc: dict[tuple[str, str], FundraiserNet] = {}

    def row(name: str, currency: str) -> FundraiserNet:
        key = (name, currency)
        if key not in acc:
            acc[key] = FundraiserNet(
                fundraiser_name=name,
                currency=currency,  # type: ignore[arg-type]
                gross=Decimal(0),
                clawbacks=Decimal(0),
                net=Decimal(0),
                pledge_count=0,
            )
        return acc[key]

    for line in lines:
        entry = row(line.fundraiser_name, line.currency)
        entry.pledge_count += 1
        entry.gross += line.commission

    for candidate in clawbacks:
        if not candidate.confirmed:
            continue
        row(candidate.fundraiser_name, candidate.currency).clawbacks += (
            candidate.original_commission
        )

    for entry in acc.values():
        entry.gross = _round(entry.gross)
        entry.clawbacks = _round(entry.clawbacks)
        entry.net = _round(entry.gross - entry.clawbacks)

    return sorted(acc.values(), key=lambda e: (e.fundraiser_name, e.currency))
