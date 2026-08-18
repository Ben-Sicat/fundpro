"""Everything the dashboards and tables are computed from.

Two conventions worth stating once, because they are the difference between
numbers that agree across pages and numbers that do not:

- **Realized** means the pledge billed at least once and has not cancelled.
- **Realization rate** defaults to realized ÷ SUBMITTED-to-bank, not ÷ all
  sign-ups: pledges not yet sent to the bank have not had their chance, so
  counting them as failures understates the team. Both readings are
  defensible, so the denominator is a SETTING (`realization_basis`) — but
  whichever is chosen is used everywhere, consistently. The frontend currently
  has three different denominators, which is a known defect.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.domain.models import (
    AgeBand,
    BankPerformance,
    Donor,
    FundraiserPerformance,
    FundraiserRecord,
    InstrumentSplit,
    Kpis,
    LabelledCount,
    LeaderRecord,
    Pledge,
    SitePerformance,
    SplitSlice,
    TimePoint,
)
from app.store.memory import Store

CENTS = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


def _rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 6) if denominator else 0.0


def realization_denominator(store: Store, rows: list[Pledge]) -> int:
    """How many pledges the realization rate divides by.

    One function, used by every caller, so the headline number cannot mean
    different things on different pages.
    """
    if store.settings.realization_basis == "signups":
        return len(rows)
    return sum(1 for p in rows if is_submitted(p))


def is_realized(p: Pledge) -> bool:
    return p.debit_date is not None and not p.cancelled


def is_submitted(p: Pledge) -> bool:
    return p.submitted_at is not None


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

DATE_BASES = (
    "signupDate",
    "submittedAt",
    "debitDate",
    "verifiedAt",
    "cancellationDate",
    "invoicedDate",
    "payoutDate",
)

_BASIS_ATTR = {
    "signupDate": "signup_date",
    "submittedAt": "submitted_at",
    "debitDate": "debit_date",
    "verifiedAt": "verified_at",
    "cancellationDate": "cancellation_date",
    "invoicedDate": "invoiced_date",
    "payoutDate": "payout_date",
}


@dataclass
class PledgeFilters:
    q: str | None = None
    charity_code: str | None = None
    status: str | None = None
    fundraiser_name: str | None = None
    site_name: str | None = None
    leader_name: str | None = None
    verified: bool | None = None
    basis: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    #: Hard scope for a charity_viewer. Applied after every other filter and
    #: never overridable by a query parameter.
    force_charity: str | None = None


def matches(store: Store, p: Pledge, f: PledgeFilters) -> bool:
    if f.force_charity and p.charity_code != f.force_charity:
        return False

    if f.q:
        needle = f.q.casefold()
        haystack = (
            p.serial_no,
            p.donor_name,
            p.fundraiser_name,
            p.donor_email,
        )
        if not any(needle in (value or "").casefold() for value in haystack):
            return False

    if f.charity_code and p.charity_code != f.charity_code:
        return False
    if f.fundraiser_name and p.fundraiser_name != f.fundraiser_name:
        return False
    if f.site_name and p.site_name != f.site_name:
        return False
    if f.leader_name and f.leader_name not in store.leaders_of(p.fundraiser_name):
        return False
    if f.verified is not None and p.verified != f.verified:
        return False

    if f.status:
        cls = p.current_classification
        ok = {
            "realized": is_realized(p),
            "retrying": cls == "failed_retryable",
            "failed": cls == "failed_final",
            "cancelled": p.cancelled,
            "pending": p.submitted_at is None,
        }.get(f.status, True)
        if not ok:
            return False

    if f.basis and (f.date_from or f.date_to):
        value = getattr(p, _BASIS_ATTR.get(f.basis, "signup_date"))
        if value is None:
            return False
        if f.date_from and value < f.date_from:
            return False
        if f.date_to and value > f.date_to:
            return False

    return True


def select(store: Store, f: PledgeFilters) -> list[Pledge]:
    return [p for p in store.all_pledges() if matches(store, p, f)]


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


def kpis(store: Store, rows: list[Pledge], *, today: date) -> Kpis:
    realized = [p for p in rows if is_realized(p)]
    denominator = realization_denominator(store, rows)
    pledged = sum((p.amount for p in rows), Decimal(0))

    lags = [
        (p.debit_date - p.signup_date).days
        for p in rows
        if p.debit_date and p.signup_date
    ]
    month_start = today.replace(day=1)

    return Kpis(
        signups=len(rows),
        pledged_value=_q(pledged),
        realization_rate=_rate(len(realized), denominator),
        # Prior-period comparison is not derivable until there is history in
        # the store; reported as 0 rather than invented.
        realization_delta=0.0,
        avg_pledge=_q(pledged / len(rows)) if rows else Decimal(0),
        avg_lag_days=round(sum(lags) / len(lags), 2) if lags else 0.0,
        verified_pct=_rate(sum(1 for p in rows if p.verified), len(rows)),
        active_donors=len(realized),
        cancelled_this_month=sum(
            1 for p in rows if p.cancellation_date and p.cancellation_date >= month_start
        ),
    )


def time_series(rows: list[Pledge], *, today: date, weeks: int = 16) -> list[TimePoint]:
    """Weekly buckets, stopping at the last COMPLETE week.

    Including the current part-week draws a cliff on the right-hand edge of
    every trend line, which reads as a collapse in performance rather than as
    a bucket that is one day old.
    """
    buckets: dict[date, TimePoint] = {}
    for w in range(weeks, 0, -1):
        key = today - timedelta(days=w * 7)
        buckets[key] = TimePoint(date=key, signups=0, value=Decimal(0), realized=0)

    for p in rows:
        # Prefer the signup date. A record built from a bank file has no signup
        # date — the bank never sees one — so fall back to the submission date
        # rather than dropping the row out of the chart entirely. This is a
        # DISPLAY fallback; nothing fabricates a stored signup date.
        when = p.signup_date or p.submitted_at
        if when is None:
            continue
        week_index = (today - when).days // 7
        if week_index < 1 or week_index > weeks:
            continue
        bucket = buckets[today - timedelta(days=week_index * 7)]
        bucket.signups += 1
        bucket.value += p.amount
        if is_realized(p):
            bucket.realized += 1

    for bucket in buckets.values():
        bucket.value = _q(bucket.value)
    return list(buckets.values())


def results_split(rows: list[Pledge]) -> list[SplitSlice]:
    submitted = [p for p in rows if is_submitted(p)]
    slices = [
        SplitSlice(
            label="Approved",
            value=sum(1 for p in submitted if is_realized(p)),
            classification="approved",
        ),
        SplitSlice(
            label="Retrying",
            value=sum(
                1 for p in submitted if p.current_classification == "failed_retryable"
            ),
            classification="failed_retryable",
        ),
        SplitSlice(
            label="Failed final",
            value=sum(
                1 for p in submitted if p.current_classification == "failed_final"
            ),
            classification="failed_final",
        ),
        SplitSlice(
            label="Cancelled",
            value=sum(1 for p in submitted if p.cancelled),
            classification="cancelled",
        ),
    ]
    return [s for s in slices if s.value > 0]


def instrument_split(rows: list[Pledge]) -> list[InstrumentSplit]:
    out: list[InstrumentSplit] = []
    for instrument, label in (("CREDIT CARD", "Credit card"), ("DEBIT CARD", "Debit card")):
        group = [p for p in rows if p.instrument_type == instrument]
        submitted = [p for p in group if is_submitted(p)]
        realized = [p for p in group if is_realized(p)]
        out.append(
            InstrumentSplit(
                label=label,
                count=len(group),
                approval_rate=_rate(len(realized), len(submitted)),
            )
        )
    return out


AGE_BANDS: tuple[tuple[str, int, int], ...] = (
    ("18–24", 18, 24),
    ("25–30", 25, 30),
    ("31–40", 31, 40),
    ("41–50", 41, 50),
    ("51+", 51, 200),
)


def age_of(dob: date, today: date) -> int:
    """Computed at query time, never stored (MASTER_SPEC)."""
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def age_bands(store: Store, rows: list[Pledge], *, today: date) -> list[AgeBand]:
    out: list[AgeBand] = []
    for label, low, high in AGE_BANDS:
        group = [
            p for p in rows if p.donor_dob and low <= age_of(p.donor_dob, today) <= high
        ]
        realized = [p for p in group if is_realized(p)]
        out.append(
            AgeBand(
                band=label,
                count=len(group),
                realization_rate=_rate(len(realized), realization_denominator(store, group)),
            )
        )
    return out


def frequency_mix(rows: list[Pledge]) -> list[LabelledCount]:
    counts: dict[str, int] = defaultdict(int)
    for p in rows:
        if p.frequency:
            counts[p.frequency] += 1
    return [
        LabelledCount(label=label, value=value)
        for label, value in sorted(counts.items(), key=lambda kv: -kv[1])
    ]


def bank_performance(store: Store, rows: list[Pledge]) -> list[BankPerformance]:
    """Realization per bank — 'consolidate and show banks who fail'.

    Both roles are reported because they answer different questions: the
    ISSUING bank is the donor's own bank and drives whether a card clears; the
    PROCESSING bank is the agency's, and a bad rate there is an operational
    problem rather than a donor-quality one.
    """
    out: list[BankPerformance] = []

    for role, attr in (("issuing", "issuing_bank"), ("processing", "processing_bank")):
        groups: dict[str, list[Pledge]] = defaultdict(list)
        for p in rows:
            name = (getattr(p, attr) or "").strip()
            if name:
                groups[name].append(p)

        for bank, group in groups.items():
            submitted = [p for p in group if is_submitted(p)]
            out.append(
                BankPerformance(
                    bank=bank,
                    role=role,  # type: ignore[arg-type]
                    submitted=len(submitted),
                    approved=sum(1 for p in group if is_realized(p)),
                    failed_retryable=sum(
                        1 for p in group if p.current_classification == "failed_retryable"
                    ),
                    failed_final=sum(
                        1 for p in group if p.current_classification == "failed_final"
                    ),
                    cancelled=sum(1 for p in group if p.cancelled),
                    realization_rate=_rate(
                        sum(1 for p in group if is_realized(p)),
                        realization_denominator(store, group),
                    ),
                    pledged_value=_q(sum((p.amount for p in group), Decimal(0))),
                )
            )

    return sorted(out, key=lambda b: (b.role, -b.submitted, b.bank))


# ---------------------------------------------------------------------------
# Team & sites
# ---------------------------------------------------------------------------


def fundraiser_performance(
    store: Store, rows: list[Pledge], *, multiplier: Decimal
) -> list[FundraiserPerformance]:
    groups: dict[str, list[Pledge]] = defaultdict(list)
    for p in rows:
        groups[p.fundraiser_name].append(p)

    out: list[FundraiserPerformance] = []
    for name, group in groups.items():
        realized = [p for p in group if is_realized(p)]
        value = sum((p.amount for p in group), Decimal(0))
        out.append(
            FundraiserPerformance(
                name=name,
                leader_name=(store.leaders_of(name) or [""])[0],
                signups=len(group),
                realized=len(realized),
                realization_rate=_rate(len(realized), realization_denominator(store, group)),
                avg_pledge=_q(value / len(group)) if group else Decimal(0),
                pledged_value=_q(value),
                gross_commission=_q(
                    sum((p.amount for p in realized), Decimal(0)) * multiplier
                ),
                clawbacks=_q(
                    sum(
                        (p.amount for p in group if p.payout_status == "clawed_back"),
                        Decimal(0),
                    )
                    * multiplier
                ),
            )
        )
    return sorted(out, key=lambda f: -f.realized)


def fundraiser_records(store: Store, rows: list[Pledge]) -> list[FundraiserRecord]:
    by_name: dict[str, list[Pledge]] = defaultdict(list)
    for p in rows:
        by_name[p.fundraiser_name].append(p)

    out: list[FundraiserRecord] = []
    for seed in store.all_fundraisers():
        group = by_name.get(seed.name, [])
        realized = [p for p in group if is_realized(p)]
        value = sum((p.amount for p in group), Decimal(0))
        out.append(
            FundraiserRecord(
                name=seed.name,
                code=seed.code,
                active=seed.active,
                start_date=date.fromisoformat(seed.start_date) if seed.start_date else None,
                end_date=date.fromisoformat(seed.end_date) if seed.end_date else None,
                tier=seed.tier,
                leader_names=list(seed.leader_names),
                signups=len(group),
                realized=len(realized),
                realization_rate=_rate(len(realized), realization_denominator(store, group)),
                pledged_value=_q(value),
                avg_pledge=_q(value / len(group)) if group else Decimal(0),
                sites=sorted({p.site_name for p in group if p.site_name}),
            )
        )
    return sorted(out, key=lambda f: -f.realized)


def leader_records(store: Store, rows: list[Pledge]) -> list[LeaderRecord]:
    """Leader roll-up.

    A fundraiser under two leaders counts toward BOTH, so these deliberately
    do not sum to the company total. Anything else would either drop a team
    member or silently pick one leader as the 'real' one.
    """
    records = fundraiser_records(store, rows)
    out: list[LeaderRecord] = []

    for leader in store.all_leaders():
        team = [f for f in records if leader in f.leader_names]
        signups = sum(f.signups for f in team)
        realized = sum(f.realized for f in team)
        members = [p for p in rows if p.fundraiser_name in {f.name for f in team}]
        out.append(
            LeaderRecord(
                name=leader,
                team_size=len(team),
                fundraiser_names=[f.name for f in team],
                signups=signups,
                realized=realized,
                # Same denominator rule as everywhere else, so a leader's rate
                # is comparable with their own team members'.
                realization_rate=_rate(realized, realization_denominator(store, members)),
                pledged_value=_q(sum((f.pledged_value for f in team), Decimal(0))),
            )
        )
    return sorted(out, key=lambda leader_record: -leader_record.realized)


def site_performance(store: Store, rows: list[Pledge]) -> list[SitePerformance]:
    out: list[SitePerformance] = []
    for site in store.all_sites():
        group = [p for p in rows if p.site_name == site.name]
        realized = [p for p in group if is_realized(p)]
        out.append(
            SitePerformance(
                name=site.name,
                location_name=site.location_name,
                country=site.country,  # type: ignore[arg-type]
                charity_code=site.charity_code,
                starts_on=date.fromisoformat(site.starts_on) if site.starts_on else None,
                ends_on=date.fromisoformat(site.ends_on) if site.ends_on else None,
                staff_count=len({p.fundraiser_name for p in group if p.fundraiser_name}),
                signups=len(group),
                realized=len(realized),
                realization_rate=_rate(len(realized), realization_denominator(store, group)),
                pledged_value=_q(sum((p.amount for p in group), Decimal(0))),
            )
        )
    return sorted(out, key=lambda s: -s.signups)


# ---------------------------------------------------------------------------
# Donors
# ---------------------------------------------------------------------------


def donors(rows: list[Pledge]) -> list[Donor]:
    """One card per human, with duplicate candidates flagged.

    Duplicates are FLAGGED, never merged automatically: the risk being managed
    is paying commission twice on the same person, and an automatic merge
    would silently destroy the evidence.
    """
    groups: dict[str, list[Pledge]] = defaultdict(list)
    for p in rows:
        key = (p.donor_name or "").strip().casefold()
        if key:
            groups[key].append(p)

    # Index contact details so a repeat donor under a different spelling is
    # still caught.
    by_email: dict[str, list[str]] = defaultdict(list)
    by_mobile: dict[str, list[str]] = defaultdict(list)
    for key, group in groups.items():
        head = group[0]
        if head.donor_email:
            by_email[head.donor_email.casefold()].append(key)
        if head.donor_mobile:
            by_mobile[head.donor_mobile].append(key)

    out: list[Donor] = []
    for index, (key, group) in enumerate(sorted(groups.items()), start=1):
        head = group[0]
        signups = [p.signup_date for p in group if p.signup_date]

        duplicate_of: str | None = None
        signal: str | None = None
        for bucket, name in ((by_email, "email"), (by_mobile, "mobile")):
            for members in bucket.values():
                if len(members) > 1 and key in members and members[0] != key:
                    duplicate_of, signal = members[0], name
                    break
            if duplicate_of:
                break

        out.append(
            Donor(
                id=f"dnr_{index:04d}",
                full_name=head.donor_name,
                email=head.donor_email,
                mobile=head.donor_mobile,
                dob=head.donor_dob,
                city=head.city,
                country=head.country,
                pledge_count=len(group),
                total_monthly_value=_q(sum((p.amount for p in group), Decimal(0))),
                currency=head.currency,
                first_signup=min(signups) if signups else None,
                duplicate_of=duplicate_of,
                duplicate_signal=signal,  # type: ignore[arg-type]
            )
        )
    return sorted(out, key=lambda d: -d.pledge_count)
