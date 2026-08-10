"""Report generation, including the byte-compatible legacy master copies.

The legacy exports are the deliverable that keeps the client's trust: if the
platform can regenerate the exact spreadsheets they use today, adopting it is
reversible. So A1's headers are the real 111 column names in the real order,
quirks and all (`CUSTOMER'S NAME`, `Fax AREACODE`, `Invoice No.`), with the two
junk columns dropped.

`AGE` is computed from DOB at export time and never stored.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO
from typing import Any

from openpyxl import Workbook

from app.domain.models import ExportTemplate, Pledge
from app.parsing.headers import (
    APPS_TRACKER_COLUMNS,
    APPS_TRACKER_JUNK_POSITIONS,
    STATUS_REPORT_COLUMNS,
)
from app.services import analytics
from app.services.analytics import PledgeFilters
from app.store.memory import Store

#: A1 — the 111 real columns: 113 minus the two junk ones (positions 4 and 109).
A1_COLUMNS: tuple[str, ...] = tuple(
    str(header)
    for index, header in enumerate(APPS_TRACKER_COLUMNS, start=1)
    if index not in APPS_TRACKER_JUNK_POSITIONS
)


@dataclass(frozen=True)
class Report:
    headers: tuple[str, ...]
    rows: list[list[Any]]

    @property
    def row_count(self) -> int:
        return len(self.rows)


Builder = Callable[[Store, PledgeFilters, dict[str, Any]], Report]


def _age(dob: date | None, today: date) -> int | None:
    return analytics.age_of(dob, today) if dob else None


def _yes_no(value: bool) -> str:
    return "Y" if value else ""


# ---------------------------------------------------------------------------
# A — legacy masters
# ---------------------------------------------------------------------------


def build_a1(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    """Master Apps Tracker, legacy layout, 111 columns in the original order."""
    today: date = opts.get("today") or datetime.now(UTC).date()
    rows: list[list[Any]] = []

    for p in analytics.select(store, filters):
        # Header → value. Anything not named here exports blank, which is what
        # the legacy sheet holds for those columns anyway.
        values: dict[str, Any] = {
            "COUNTRY": p.country,
            "CHARITY CODE": p.charity_code,
            "SERIAL NO": p.serial_no,
            "CUSTOMER'S NAME": p.donor_name,
            "GENDER": p.gender or "",
            "DOB": p.donor_dob,
            "EMAIL": p.donor_email,
            "TEL HP": p.donor_mobile,
            "CITY": p.city,
            "CAMPAIGN CODE": p.campaign_code,
            "PROCESSING BANK": p.processing_bank,
            "DONATION AMOUNT": p.amount,
            "FREQUENCY": p.frequency,
            "CREDIT CARD": p.masked_pan,
            "CARDTYPE": p.instrument_type,
            "EXPIRY": p.expiry,
            "ISSUING BANK": p.issuing_bank,
            "EVENT CODE": p.site_name,
            "LOCATION CODE": p.location_name,
            "AGENT ID": p.agent_id,
            "SIGNUP DATE": p.signup_date,
            "STATUS DATE": p.submitted_at,
            "VERIFIED": _yes_no(p.verified),
            "VERIFIEDBY": p.verified_by or "",
            "VERIFIEDDATE": p.verified_at,
            "STATUS": p.app_status,
            "RESULTS": p.current_status_description or "",
            "DEBIT DATE": p.debit_date,
            "Fundraiser Name": p.fundraiser_name,
            "Payout Date": p.payout_date,
            "Invoiced Date": p.invoiced_date,
            "Invoice No.": p.invoice_no or "",
            "CANCELLED/UNREALIZED?": _yes_no(p.cancelled),
            "CANCELLATION DATE": p.cancellation_date,
            # Computed at export time, never stored.
            "AGE": _age(p.donor_dob, today),
        }
        rows.append([values.get(header) for header in A1_COLUMNS])

    return Report(headers=A1_COLUMNS, rows=rows)


def _status_row(store: Store, event: Any, pledge: Pledge | None) -> list[Any]:
    values: dict[str, Any] = {
        "Charity Code": pledge.charity_code if pledge else "",
        "Bank": pledge.processing_bank if pledge else "",
        "SERIAL NO": event.serial_no,
        "STATUS ID": event.status_id,
        "STATUS DESCRIPTION": event.status_description,
        "REASON": event.reason or "",
        "REASONDESC": event.reason_desc or "",
        "STATUS DATE": event.status_date,
        "CUSTOMERS NAME": pledge.donor_name if pledge else "",
        "CREDIT CARD": pledge.masked_pan if pledge else "",
        "A0 Attempts": event.attempt_no,
        "Recruiter Batch No": event.bank_batch_no or "",
        "ExpiryDate": pledge.expiry if pledge else "",
        "DonationAmount": pledge.amount if pledge else None,
        "Frequency": pledge.frequency if pledge else "",
        "Recruiter Submission Date": pledge.submitted_at if pledge else None,
        "AgentID": pledge.agent_id if pledge else "",
        "DEBIT_CREDIT_CARD": (pledge.instrument_type or "").split()[0] if pledge else "",
        "LocationCode": pledge.location_name if pledge else "",
        "Channel": "F2F",
    }
    return [values.get(header) for header in STATUS_REPORT_COLUMNS]


def build_a2(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    """Master Results Tracker — the whole accumulated billing history."""
    visible = {p.serial_no for p in analytics.select(store, filters)}
    rows = [
        _status_row(store, event, store.get_pledge(event.serial_no))
        for event in sorted(store.billing_events, key=lambda e: (e.status_date, e.serial_no))
        if event.serial_no in visible
    ]
    return Report(headers=STATUS_REPORT_COLUMNS, rows=rows)


def build_a3(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    """Daily Status Report snapshot — A2 scoped to one upload, plus batch id."""
    upload_id = opts.get("upload_id")
    events = (
        store.events_from_upload(upload_id) if upload_id else list(store.billing_events)
    )
    headers = (*STATUS_REPORT_COLUMNS, "IMPORT BATCH ID", "IMPORTED AT")
    upload = next((u for u in store.uploads if u.id == upload_id), None)
    imported_at = upload.uploaded_at if upload else None

    rows = [
        [
            *_status_row(store, event, store.get_pledge(event.serial_no)),
            event.upload_id,
            imported_at,
        ]
        for event in sorted(events, key=lambda e: (e.status_date, e.serial_no))
    ]
    return Report(headers=headers, rows=rows)


# ---------------------------------------------------------------------------
# B — operational
# ---------------------------------------------------------------------------


def build_b1(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    headers = (
        "SERIAL NO", "CHARITY", "FUNDRAISER", "SITE", "AMOUNT", "CURRENCY", "FREQUENCY",
        "SIGNUP DATE", "SUBMITTED", "DEBIT DATE", "VERIFIED DATE", "CANCELLED DATE",
        "INVOICED DATE", "PAYOUT DATE", "CURRENT STATUS", "CLASSIFICATION",
        "ATTEMPTS", "REALIZED", "VERIFIED", "CANCELLED", "MASKED CARD", "EXPIRY",
    )
    rows = [
        [
            p.serial_no, p.charity_code, p.fundraiser_name, p.site_name, p.amount,
            p.currency, p.frequency, p.signup_date, p.submitted_at, p.debit_date,
            p.verified_at, p.cancellation_date, p.invoiced_date, p.payout_date,
            p.current_status_description or "", p.current_classification or "",
            p.attempts, _yes_no(analytics.is_realized(p)), _yes_no(p.verified),
            _yes_no(p.cancelled), p.masked_pan, p.expiry,
        ]
        for p in analytics.select(store, filters)
    ]
    return Report(headers=headers, rows=rows)


def build_b2(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    """Retry / failed billing queue — the call list."""
    today: date = opts.get("today") or datetime.now(UTC).date()
    headers = (
        "SERIAL NO", "DONOR", "MOBILE", "CHARITY", "AMOUNT", "CURRENCY",
        "CURRENT STATUS", "REASON", "ATTEMPTS", "LAST STATUS DATE", "DAYS IN STATE",
        "MASKED CARD", "EXPIRY", "CARD EXPIRED", "FUNDRAISER", "SITE",
    )
    rows: list[list[Any]] = []
    for p in analytics.select(store, filters):
        if p.current_classification not in ("failed_retryable", "failed_final"):
            continue
        last = store.events_for(p.serial_no)
        reason = last[-1].reason if last else ""
        days = (today - p.current_status_date).days if p.current_status_date else None
        # MMYY in the past means a retry cannot succeed until the donor gives a
        # new card, which changes the script the caller uses.
        expired = ""
        if len(p.expiry) == 4:
            month, year = int(p.expiry[:2]), 2000 + int(p.expiry[2:])
            expired = _yes_no((year, month) < (today.year, today.month))
        rows.append(
            [
                p.serial_no, p.donor_name, p.donor_mobile, p.charity_code, p.amount,
                p.currency, p.current_status_description or "", reason or "",
                p.attempts, p.current_status_date, days, p.masked_pan, p.expiry,
                expired, p.fundraiser_name, p.site_name,
            ]
        )
    return Report(headers=headers, rows=rows)


def build_b3(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    """Verification backlog, oldest wait first."""
    today: date = opts.get("today") or datetime.now(UTC).date()
    headers = (
        "SERIAL NO", "DONOR", "MOBILE", "CHARITY", "AMOUNT", "SIGNUP DATE",
        "DAYS WAITING", "FUNDRAISER", "SITE", "CURRENT STATUS",
    )
    rows: list[list[Any]] = []
    for p in analytics.select(store, filters):
        if p.verified:
            continue
        waiting = (today - p.signup_date).days if p.signup_date else 0
        rows.append(
            [
                p.serial_no, p.donor_name, p.donor_mobile, p.charity_code, p.amount,
                p.signup_date, waiting, p.fundraiser_name, p.site_name,
                p.current_status_description or "",
            ]
        )
    rows.sort(key=lambda r: -(r[6] or 0))
    return Report(headers=headers, rows=rows)


def build_b4(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    headers = (
        "ID", "UPLOAD", "FILE", "SERIAL NO", "PROBLEM", "DETAIL", "RAW", "RESOLVED", "CREATED",
    )
    rows = [
        [e.id, e.upload_id, e.filename, e.serial_no or "", e.problem, e.detail,
         e.raw_summary, _yes_no(e.resolved), e.created_at]
        for e in store.exceptions
        if not e.resolved
    ]
    return Report(headers=headers, rows=rows)


# ---------------------------------------------------------------------------
# C — payroll
# ---------------------------------------------------------------------------


def build_c1(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    from app.services import payroll_runs

    as_of: date = opts.get("today") or datetime.now(UTC).date()
    run = payroll_runs.derive_run(store, as_of=as_of)
    headers = (
        "FUNDRAISER", "SERIAL NO", "CHARITY", "PLEDGE AMOUNT", "CURRENCY",
        "COMMISSION", "CONDITION", "ELIGIBILITY DATE", "PLAN", "CUTOFF", "PAY DATE",
    )
    rows = [
        [
            line.fundraiser_name, line.serial_no, line.charity_code, line.pledge_amount,
            line.currency, line.commission, line.condition_applied, line.eligibility_date,
            line.plan_id, run.cutoff.label, run.cutoff.run_date,
        ]
        for line in run.lines
    ]
    return Report(headers=headers, rows=rows)


def build_c2(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    from app.services import payroll_runs

    as_of: date = opts.get("today") or datetime.now(UTC).date()
    run = payroll_runs.derive_run(store, as_of=as_of)
    headers = (
        "SERIAL NO", "FUNDRAISER", "ORIGINAL COMMISSION", "CURRENCY", "REASON",
        "TRIGGERED ON", "CONFIRMED",
    )
    rows = [
        [c.serial_no, c.fundraiser_name, c.original_commission, c.currency, c.reason,
         c.triggered_on, _yes_no(c.confirmed)]
        for c in run.clawbacks
    ]
    return Report(headers=headers, rows=rows)


def build_c3(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    rows_in = analytics.select(store, filters)
    multiplier = store.settings.commission_plans[0].pct_of_pledge / Decimal(100)
    headers = (
        "FUNDRAISER", "LEADER", "SIGN-UPS", "REALIZED", "REALIZATION RATE",
        "AVG PLEDGE", "PLEDGED VALUE", "GROSS COMMISSION", "CLAWBACKS",
    )
    rows = [
        [f.name, f.leader_name, f.signups, f.realized, f.realization_rate,
         f.avg_pledge, f.pledged_value, f.gross_commission, f.clawbacks]
        for f in analytics.fundraiser_performance(store, rows_in, multiplier=multiplier)
    ]
    return Report(headers=headers, rows=rows)


# ---------------------------------------------------------------------------
# D — charity & financial
# ---------------------------------------------------------------------------


def build_d1(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    """Charity invoice: realized donors as charges, cancellations as credits."""
    headers = (
        "SERIAL NO", "DONOR", "CHARITY", "AMOUNT", "CURRENCY", "DEBIT DATE",
        "LINE TYPE", "INVOICE NO", "INVOICED DATE",
    )
    rows: list[list[Any]] = []
    for p in analytics.select(store, filters):
        if analytics.is_realized(p):
            line_type = "charge"
        elif p.cancelled and p.debit_date:
            line_type = "credit"
        else:
            continue
        rows.append(
            [p.serial_no, p.donor_name, p.charity_code, p.amount, p.currency,
             p.debit_date, line_type, p.invoice_no or "", p.invoiced_date]
        )
    return Report(headers=headers, rows=rows)


def build_d2(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    """Aggregate delivery per charity. No PII — safe to send outward."""
    rows_in = analytics.select(store, filters)
    headers = (
        "CHARITY", "SIGN-UPS", "SUBMITTED", "REALIZED", "REALIZATION RATE",
        "CANCELLED", "MONTHLY VALUE", "CURRENCY",
    )
    groups: dict[tuple[str, str], list[Pledge]] = {}
    for p in rows_in:
        groups.setdefault((p.charity_code, p.currency), []).append(p)

    rows: list[list[Any]] = []
    for (charity, currency), group in sorted(groups.items()):
        submitted = [g for g in group if analytics.is_submitted(g)]
        realized = [g for g in group if analytics.is_realized(g)]
        rows.append(
            [
                charity, len(group), len(submitted), len(realized),
                round(len(realized) / len(submitted), 6) if submitted else 0.0,
                sum(1 for g in group if g.cancelled),
                sum((g.amount for g in group), Decimal(0)), currency,
            ]
        )
    return Report(headers=headers, rows=rows)


def build_d3(store: Store, filters: PledgeFilters, opts: dict[str, Any]) -> Report:
    """Management P&L: revenue against commission cost, per charity per month."""
    multiplier = store.settings.commission_plans[0].pct_of_pledge / Decimal(100)
    headers = ("MONTH", "CHARITY", "CURRENCY", "REALIZED", "REVENUE", "COMMISSION COST", "MARGIN")
    groups: dict[tuple[str, str, str], list[Pledge]] = {}
    for p in analytics.select(store, filters):
        if not analytics.is_realized(p) or p.debit_date is None:
            continue
        month = p.debit_date.strftime("%Y-%m")
        groups.setdefault((month, p.charity_code, p.currency), []).append(p)

    rows: list[list[Any]] = []
    for (month, charity, currency), group in sorted(groups.items()):
        revenue = sum((g.amount for g in group), Decimal(0))
        cost = revenue * multiplier
        rows.append([month, charity, currency, len(group), revenue, cost, revenue - cost])
    return Report(headers=headers, rows=rows)


# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TemplateSpec:
    code: str
    name: str
    description: str
    group: str
    pii_level: str
    legacy: bool
    build: Builder
    #: None when the report is an aggregate and a row count is not comparable.
    counts: str | None = "pledges"


TEMPLATES: tuple[TemplateSpec, ...] = (
    TemplateSpec("A1", "Master Apps Tracker",
                 "The full legacy layout, 111 columns, headers byte-for-byte.",
                 "Legacy", "full", True, build_a1),
    TemplateSpec("A2", "Master Results Tracker",
                 "All 26 bank columns, flattened from the accumulated billing history.",
                 "Legacy", "full", True, build_a2, counts="events"),
    TemplateSpec("A3", "Daily Status Report snapshot",
                 "The 26 columns scoped to a single upload, plus import batch id and time.",
                 "Legacy", "full", True, build_a3, counts="per-upload"),
    TemplateSpec("B1", "Pledge Lifecycle",
                 "One row per application across all seven dates, with realization flags.",
                 "Operational", "masked", False, build_b1),
    TemplateSpec("B2", "Retry / Failed Billing Queue",
                 "Everything currently failing, with attempts, days in state and card expiry risk.",
                 "Operational", "full", False, build_b2),
    TemplateSpec("B3", "Verification Backlog",
                 "Unverified sign-ups ranked by days waiting on a call.",
                 "Operational", "full", False, build_b3),
    TemplateSpec("B4", "Import Exceptions",
                 "Every row that would not consolidate, with the raw values.",
                 "Operational", "masked", False, build_b4, counts="exceptions"),
    TemplateSpec("C1", "Payroll Run",
                 "Detail for one semi-monthly cutoff.",
                 "Payroll", "masked", False, build_c1, counts=None),
    TemplateSpec("C2", "Clawback Ledger",
                 "Commissions proposed for reversal, and why.",
                 "Payroll", "masked", False, build_c2, counts=None),
    TemplateSpec("C3", "Fundraiser Performance Statement",
                 "Sign-ups, realization rate and earnings per fundraiser.",
                 "Payroll", "none", False, build_c3, counts=None),
    TemplateSpec("D1", "Charity Invoice",
                 "Charge and clawback-credit lines.",
                 "Charity & financial", "masked", False, build_d1),
    TemplateSpec("D2", "Charity Donor Delivery",
                 "Aggregate delivery per charity. No PII at all — safe to send outward.",
                 "Charity & financial", "none", False, build_d2, counts=None),
    TemplateSpec("D3", "Management P&L",
                 "Revenue, commission cost and margin per charity per month.",
                 "Charity & financial", "none", False, build_d3, counts=None),
)

TEMPLATES_BY_CODE = {spec.code: spec for spec in TEMPLATES}


def catalogue(store: Store, filters: PledgeFilters) -> list[ExportTemplate]:
    """Templates with a live row count.

    Counted from the collection the report is actually built on. A wrong count
    is worse than none: "Import Exceptions — 420 rows" when six rows failed
    sends someone hunting for a problem that does not exist.
    """
    matching = len(analytics.select(store, filters))
    out: list[ExportTemplate] = []
    for spec in TEMPLATES:
        if spec.counts == "pledges":
            rows: int | None = matching
        elif spec.counts == "events":
            rows = len(store.billing_events)
        elif spec.counts == "exceptions":
            rows = sum(1 for e in store.exceptions if not e.resolved)
        else:
            rows = None
        out.append(
            ExportTemplate(
                id=spec.code.lower(),
                code=spec.code,
                name=spec.name,
                description=spec.description,
                group=spec.group,
                column_count=len(spec.build(store, PledgeFilters(), {}).headers),
                pii_level=spec.pii_level,  # type: ignore[arg-type]
                legacy=spec.legacy,
                rows=rows,
            )
        )
    return out


def _cell(value: Any) -> Any:
    """Coerce a value into something openpyxl will write.

    Two conversions, both lossless for our purposes:
      - Decimal → float. Display only; the authoritative figure was already
        computed in Decimal and rounded before it got here.
      - Aware datetime → naive UTC. Excel has no concept of a timezone and
        openpyxl refuses an aware value outright, so the offset is applied
        and dropped rather than the export failing.
    """
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime) and value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


def to_xlsx(report: Report, *, sheet_title: str = "Sheet1") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]
    ws.append([str(h) for h in report.headers])
    for row in report.rows:
        ws.append([_cell(c) for c in row])

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
