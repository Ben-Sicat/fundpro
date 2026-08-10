"""API models — the wire contract with the Next.js UI.

Every model here mirrors an interface in `frontend/lib/types.ts`. Field names
are snake_case in Python and serialise to camelCase, because the UI already
reads `serialNo`, `debitDate`, `currentClassification` and so on. Getting a
name wrong here is not a cosmetic bug: the seam swap silently yields
`undefined` in a component.

Money is `Decimal` in Python and a JSON number on the wire. It is never a
float internally — every arithmetic operation on it happens in Decimal.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel

# Decimal in, JSON number out. `when_used='json'` keeps the Python-side value a
# Decimal so no rounding creeps into payroll or invoice arithmetic.
Money = Annotated[
    Decimal,
    PlainSerializer(lambda v: float(v), return_type=float, when_used="json"),
]

StatusClassification = Literal[
    "approved", "failed_retryable", "failed_final", "cancelled", "other"
]
Country = Literal["PH", "MY"]
Currency = Literal["PHP", "MYR"]
PayoutStatus = Literal["unpaid", "paid", "clawed_back"]
ImportProblem = Literal[
    "no_matching_pledge",
    "name_mismatch",
    "pan_mismatch",
    "unknown_status_id",
    "parse_error",
]


class Wire(BaseModel):
    """Base: camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        ser_json_timedelta="iso8601",
    )


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------


class StatusCode(Wire):
    status_id: int
    description: str
    classification: StatusClassification


# ---------------------------------------------------------------------------
# Core records
# ---------------------------------------------------------------------------


class BillingEvent(Wire):
    """One bank outcome. Append-only — never updated, never deleted."""

    id: str
    serial_no: str
    status_id: int
    status_description: str
    reason: str | None = None
    reason_desc: str | None = None
    status_date: date
    bank_batch_no: str | None = None
    attempt_no: int
    upload_id: str


class Pledge(Wire):
    """An application enriched with its latest billing outcome."""

    serial_no: str
    donor_name: str
    donor_email: str = ""
    donor_mobile: str = ""
    donor_dob: date | None = None
    gender: str | None = None
    city: str = ""
    country: Country = "PH"

    charity_code: str = ""
    campaign_code: str = ""
    site_name: str = ""
    location_name: str = ""
    agent_id: str = ""
    fundraiser_name: str = ""
    leader_name: str = ""

    amount: Money = Decimal(0)
    currency: Currency = "PHP"
    frequency: str = ""
    instrument_type: str = ""
    #: Masked only. The real files mask with asterisks: 542550********2906.
    masked_pan: str = ""
    #: Zero-padded MMYY TEXT. '0728' must keep its leading zero.
    expiry: str = ""
    issuing_bank: str = ""
    processing_bank: str = ""

    # The seven lifecycle dates.
    signup_date: date | None = None
    submitted_at: date | None = None
    debit_date: date | None = None
    verified_at: date | None = None
    cancellation_date: date | None = None
    invoiced_date: date | None = None
    payout_date: date | None = None

    verified: bool = False
    verified_by: str | None = None
    app_status: str = ""
    current_status_id: int | None = None
    current_status_description: str | None = None
    current_status_date: date | None = None
    current_classification: StatusClassification | None = None
    attempts: int = 0
    cancelled: bool = False
    invoice_no: str | None = None
    commission_amount: Money | None = None
    payout_status: PayoutStatus | None = None


class PledgeNote(Wire):
    """A caller remark. A thread, not an overwritable field."""

    id: str
    serial_no: str
    author: str
    created_at: datetime
    text: str


class Upload(Wire):
    id: str
    filename: str
    source_type: Literal["status_report", "apps_tracker"]
    uploaded_at: datetime
    uploaded_by: str
    row_count: int
    matched_count: int
    new_record_count: int
    exception_count: int
    status: Literal["consolidated", "needs_review", "processing", "failed"]


class ImportException(Wire):
    id: str
    upload_id: str
    filename: str
    serial_no: str | None
    problem: ImportProblem
    detail: str
    raw_summary: str
    resolved: bool
    created_at: datetime


class Donor(Wire):
    id: str
    full_name: str
    email: str
    mobile: str
    dob: date | None
    city: str
    country: Country
    pledge_count: int
    total_monthly_value: Money
    currency: Currency
    first_signup: date | None
    duplicate_of: str | None = None
    duplicate_signal: Literal["email", "mobile", "national_id"] | None = None


# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------


class FundraiserRecord(Wire):
    name: str
    code: str
    active: bool
    start_date: date | None = None
    end_date: date | None = None
    leader_names: list[str] = []
    signups: int = 0
    realized: int = 0
    realization_rate: float = 0.0
    pledged_value: Money = Decimal(0)
    avg_pledge: Money = Decimal(0)
    sites: list[str] = []


class LeaderRecord(Wire):
    name: str
    team_size: int
    fundraiser_names: list[str]
    signups: int
    realized: int
    realization_rate: float
    pledged_value: Money


class SitePerformance(Wire):
    name: str
    location_name: str
    country: Country
    charity_code: str
    starts_on: date | None = None
    ends_on: date | None = None
    staff_count: int = 0
    signups: int = 0
    realization_rate: float = 0.0
    pledged_value: Money = Decimal(0)


class FundraiserPerformance(Wire):
    name: str
    leader_name: str
    signups: int
    realized: int
    realization_rate: float
    avg_pledge: Money
    pledged_value: Money
    gross_commission: Money
    clawbacks: Money


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


class Kpis(Wire):
    signups: int
    pledged_value: Money
    realization_rate: float
    realization_delta: float
    avg_pledge: Money
    avg_lag_days: float
    verified_pct: float
    active_donors: int
    cancelled_this_month: int


class TimePoint(Wire):
    date: date
    signups: int
    value: Money
    realized: int


class SplitSlice(Wire):
    label: str
    value: int
    classification: str


class InstrumentSplit(Wire):
    label: str
    count: int
    approval_rate: float


class AgeBand(Wire):
    band: str
    count: int
    realization_rate: float


class LabelledCount(Wire):
    label: str
    value: int


class BankPerformance(Wire):
    """Realization by bank — 'show banks who fail', raised 2026-08-07."""

    bank: str
    role: Literal["issuing", "processing"]
    submitted: int
    approved: int
    failed_retryable: int
    failed_final: int
    cancelled: int
    realization_rate: float
    pledged_value: Money


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------


class Cutoff(Wire):
    label: str
    start: date
    end: date
    run_date: date


class PayoutLine(Wire):
    serial_no: str
    fundraiser_name: str
    charity_code: str
    pledge_amount: Money
    currency: Currency
    commission: Money
    condition_applied: str
    eligibility_date: date
    plan_id: str


class ClawbackCandidate(Wire):
    """Proposed reversal. `confirmed` stays False until an admin agrees —
    an unconfirmed candidate must never reduce anyone's pay."""

    serial_no: str
    fundraiser_name: str
    original_commission: Money
    currency: Currency
    reason: Literal["cancelled", "unrealized", "failed_final"]
    triggered_on: date
    confirmed: bool = False


class FundraiserNet(Wire):
    fundraiser_name: str
    currency: Currency
    gross: Money
    clawbacks: Money
    net: Money
    pledge_count: int


class PayrollRunDetail(Wire):
    cutoff: Cutoff
    lines: list[PayoutLine]
    nets: list[FundraiserNet]
    clawbacks: list[ClawbackCandidate]


# ---------------------------------------------------------------------------
# Exports & uploads
# ---------------------------------------------------------------------------


class ExportTemplate(Wire):
    id: str
    code: str
    name: str
    description: str
    group: str
    column_count: int
    pii_level: Literal["full", "masked", "none"]
    legacy: bool
    rows: int | None = None


class ExportRun(Wire):
    id: str
    template_code: str
    template_name: str
    run_at: datetime
    run_by: str
    row_count: int
    file_name: str
    contains_pii: bool


class UploadImpact(Wire):
    upload_id: str
    newly_approved: int
    newly_retrying: int
    newly_failed_final: int
    newly_cancelled: int
    exceptions: int
    changed_master: bool
    new_pledges: int = 0


class AuditEntry(Wire):
    id: str
    at: datetime
    actor: str
    action: str
    detail: str
    contains_pii: bool = False
