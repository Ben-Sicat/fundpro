"""Turn raw Apps Tracker rows into typed application records.

Same discipline as the Status Report parser: one row at a time, inside its own
try, so a bad row becomes an exception and never fails the batch.

This file is where a 113-column spreadsheet becomes a domain object. The
column names come from `headers.py` (transcribed from the real workbook), not
from memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from app.parsing.headers import PII_COLUMNS
from app.parsing.normalize import (
    CellParseError,
    parse_amount,
    parse_date,
    parse_expiry,
    parse_text,
)
from app.parsing.reader import RawRow, ReadResult
from app.parsing.status_report import RowException


@dataclass(frozen=True)
class AppsTrackerRecord:
    """One application, normalized. Everything the UI's Pledge needs."""

    serial_no: str
    donor_name: str
    donor_email: str
    donor_mobile: str
    donor_dob: date | None
    gender: str | None
    city: str
    country: str

    charity_code: str
    campaign_code: str
    event_code: str
    location_code: str
    agent_id: str
    fundraiser_name: str
    recruiter_code: str

    amount: Decimal | None
    frequency: str
    card_type: str
    masked_pan: str
    expiry: str
    issuing_bank: str
    processing_bank: str

    signup_date: date | None
    status_date: date | None
    debit_date: date | None
    verified_at: date | None
    cancellation_date: date | None
    invoiced_date: date | None
    payout_date: date | None

    verified: bool
    verified_by: str | None
    app_status: str
    results: str
    reason: str
    cancelled: bool
    invoice_no: str | None
    remarks: str | None
    other_notes: str | None

    row_number: int
    raw_row: dict[str, Any] = field(repr=False)


@dataclass(frozen=True)
class AppsParseResult:
    records: list[AppsTrackerRecord]
    exceptions: list[RowException]

    @property
    def total(self) -> int:
        return len(self.records) + len(self.exceptions)


# Values in CANCELLED/UNREALIZED? and VERIFIED that mean "yes". The column is
# free text in the samples, so this is a tolerant match rather than a strict one.
_TRUTHY = frozenset({"y", "yes", "true", "1", "cancelled", "unrealized", "cancel"})


def _truthy(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().casefold() in _TRUTHY


class _RowError(Exception):
    def __init__(self, *, serial_no: str | None, column: str | None, detail: str) -> None:
        super().__init__(detail)
        self.serial_no = serial_no
        self.column = column
        self.detail = detail


def parse_apps_tracker(read_result: ReadResult) -> AppsParseResult:
    records: list[AppsTrackerRecord] = []
    exceptions: list[RowException] = []

    for row in read_result.rows:
        try:
            records.append(_parse_row(row))
        except _RowError as exc:
            exceptions.append(
                RowException(
                    row_number=row.number,
                    serial_no=exc.serial_no,
                    column=exc.column,
                    detail=exc.detail,
                    raw_row=row.as_dict(),
                )
            )

    return AppsParseResult(records=records, exceptions=exceptions)


def _parse_row(row: RawRow) -> AppsTrackerRecord:
    serial_no = parse_text(row.get("SERIAL NO"))

    def value(column: str, parser: Any) -> Any:
        try:
            return parser(row.get(column))
        except CellParseError as exc:
            raise _RowError(
                serial_no=serial_no,
                column=column,
                detail=_safe_detail(column, exc),
            ) from exc

    if serial_no is None:
        raise _RowError(
            serial_no=None,
            column="SERIAL NO",
            detail="row has no SERIAL NO, so it cannot be tracked or matched",
        )

    # Phone number is split across country code / area code / number columns.
    mobile = "".join(
        part
        for part in (
            parse_text(row.get("TEL HP COUNTRYCODE")) or "",
            parse_text(row.get("TEL HP AREACODE")) or "",
            parse_text(row.get("TEL HP")) or "",
        )
        if part
    )

    country_raw = (parse_text(row.get("COUNTRY")) or "").upper()
    # 'MY', 'MALAYSIA', 'PH', 'PHILIPPINES' all appear plausible; anything we do
    # not recognise defaults to PH rather than failing the row.
    country = "MY" if country_raw.startswith("M") else "PH"

    return AppsTrackerRecord(
        serial_no=serial_no,
        donor_name=value("CUSTOMER'S NAME", parse_text) or "",
        donor_email=value("EMAIL", parse_text) or "",
        donor_mobile=mobile,
        donor_dob=value("DOB", parse_date),
        gender=value("GENDER", parse_text),
        city=value("CITY", parse_text) or "",
        country=country,
        charity_code=value("CHARITY CODE", parse_text) or "",
        campaign_code=value("CAMPAIGN CODE", parse_text) or "",
        event_code=value("EVENT CODE", parse_text) or "",
        location_code=value("LOCATION CODE", parse_text) or "",
        agent_id=value("AGENT ID", parse_text) or "",
        # `Fundraiser Name` is the Master Apps Tracker's column. The daily
        # Submissions files carry the same person under `AGENT NAME` and have no
        # `Fundraiser Name` at all, so reading only the first name left every
        # pledge in the April–July 2026 archive unattributed — 0 fundraisers on
        # the Team page and empty per-fundraiser payroll, from 2,500 sign-ups
        # that all name their recruiter.
        fundraiser_name=(
            value("Fundraiser Name", parse_text) or value("AGENT NAME", parse_text) or ""
        ),
        # The junk column at position 4 carries this; fall back to the named one.
        recruiter_code=(
            parse_text(row.cells[3] if len(row.cells) > 3 else None)
            or value("SUB-RECRUITER CODE", parse_text)
            or ""
        ),
        amount=value("DONATION AMOUNT", parse_amount),
        frequency=value("FREQUENCY", parse_text) or "",
        # CARDTYPE (col 47) is the instrument; CARD TYPE (col 51) is a separate
        # column in the real file. Positional reading keeps them distinct.
        card_type=value("CARDTYPE", parse_text) or "",
        masked_pan=value("CREDIT CARD", parse_text) or "",
        expiry=value("EXPIRY", parse_expiry) or "",
        issuing_bank=value("ISSUING BANK", parse_text) or "",
        processing_bank=value("PROCESSING BANK", parse_text) or "",
        signup_date=value("SIGNUP DATE", parse_date),
        status_date=value("STATUS DATE", parse_date),
        debit_date=value("DEBIT DATE", parse_date),
        verified_at=value("VERIFIEDDATE", parse_date),
        cancellation_date=value("CANCELLATION DATE", parse_date),
        invoiced_date=value("Invoiced Date", parse_date),
        payout_date=value("Payout Date", parse_date),
        verified=_truthy(row.get("VERIFIED")) or row.get("VERIFIEDDATE") is not None,
        verified_by=value("VERIFIEDBY", parse_text),
        app_status=value("STATUS", parse_text) or "",
        results=value("RESULTS", parse_text) or "",
        reason=value("REASON", parse_text) or "",
        cancelled=_truthy(row.get("CANCELLED/UNREALIZED?"))
        or row.get("CANCELLATION DATE") is not None,
        invoice_no=value("Invoice No.", parse_text),
        remarks=value("REMARKS", parse_text),
        other_notes=value("OTHER NOTES", parse_text),
        row_number=row.number,
        raw_row=row.as_dict(),
    )


def _safe_detail(column: str, exc: CellParseError) -> str:
    """Message safe to log: the offending value, unless the column is PII."""
    if column in PII_COLUMNS or exc.raw is None:
        return f"{column}: {exc}"
    return f"{column}: {exc} ({exc.raw!r})"
