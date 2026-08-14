"""Bridges the store to the pure payroll rules.

Mirrors `getDerivedPayrollRun` in the frontend seam: assemble the payroll view
of each pledge from the append-only event history, then hand it to the tested
rules in `payroll.py`.
"""

from __future__ import annotations

from datetime import date

from app.domain.models import BonusLine, PayrollRunDetail
from app.services import bonuses as bonus_service
from app.services import payroll
from app.services.payroll import PaidCommission, PayrollPledge
from app.store.memory import Store


def payroll_view(store: Store) -> list[PayrollPledge]:
    """Every pledge, expressed as the slice payroll needs.

    `approved_billing_dates` comes from the event history rather than from a
    denormalized column, so the `on_n_billings` rule stays correct even after
    a late-arriving retry lands.
    """
    approved_by_serial: dict[str, list[date]] = {}
    for event in store.billing_events:
        if store.settings.classification_for(event.status_id) != "approved":
            continue
        approved_by_serial.setdefault(event.serial_no, []).append(event.status_date)

    out: list[PayrollPledge] = []
    for p in store.all_pledges():
        if p.signup_date is None:
            # No signup date means no plan can be selected; such a row is an
            # import problem, not a payroll one.
            continue
        out.append(
            PayrollPledge(
                serial_no=p.serial_no,
                fundraiser_name=p.fundraiser_name,
                charity_code=p.charity_code,
                amount=p.amount,
                currency=p.currency,
                signup_date=p.signup_date,
                submitted_at=p.submitted_at,
                debit_date=p.debit_date,
                cancellation_date=p.cancellation_date,
                cancelled=p.cancelled,
                current_classification=p.current_classification,
                approved_billing_dates=tuple(sorted(approved_by_serial.get(p.serial_no, []))),
                frequency=p.frequency or None,
                verified=p.verified,
            )
        )
    return out


def derive_run(store: Store, *, as_of: date) -> PayrollRunDetail:
    pledges = payroll_view(store)
    plans = store.settings.commission_plans
    cutoff = payroll.cutoff_for(as_of)
    lines = payroll.generate_draft_run(
        pledges,
        plans,
        cutoff,
        require_verification=store.settings.require_verification_for_payroll,
    )
    awards = bonus_service.award_bonuses(store.settings.bonus_rules, pledges, lines, cutoff)

    # Commission already paid, for clawback detection.
    #
    # The legacy Apps Tracker records a payout DATE but not the amount, so for
    # an imported row the amount is reconstructed from the plan in force at
    # sign-up — which is what the agency would have paid. Skipping those rows
    # instead would make every historic cancellation invisible to clawback,
    # which is precisely the money the business is trying to recover.
    by_serial = {p.serial_no: p for p in pledges}
    paid: list[PaidCommission] = []
    for p in store.all_pledges():
        if not p.payout_date:
            continue
        view = by_serial.get(p.serial_no)
        if view is None:
            continue
        amount = p.commission_amount
        if amount is None:
            plan = payroll.plan_for_pledge(view, plans)
            if plan is None:
                continue
            amount = payroll.commission_for(view, plan)
        paid.append(
            PaidCommission(
                serial_no=p.serial_no,
                commission=amount,
                paid_on=p.payout_date,
                currency=p.currency,
            )
        )

    clawbacks = payroll.clawback_candidates_for(paid, pledges, plans)

    return PayrollRunDetail(
        cutoff=cutoff,
        lines=lines,
        nets=payroll.net_by_fundraiser(lines, clawbacks, awards),
        clawbacks=clawbacks,
        bonuses=[
            BonusLine(
                fundraiser_name=a.fundraiser_name,
                currency=a.currency,  # type: ignore[arg-type]
                rule_id=a.rule_id,
                rule_name=a.rule_name,
                basis=a.basis,
                basis_value=a.basis_value,
                threshold=a.threshold,
                amount=a.amount,
            )
            for a in awards
        ],
    )
