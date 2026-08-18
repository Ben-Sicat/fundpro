"""Turn raw Status Report rows into typed records, or into exceptions.

The governing rule (BACKEND_PROMPT §5.9): **a bad row never fails the batch.**
Each row is parsed inside its own try; anything unparseable becomes a
`RowException` carrying the raw values, and the remaining rows import normally.

Nothing here touches a database — that is Phase 2. These are pure functions so
the traps stay cheap to test.
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
    parse_int,
    parse_text,
)
from app.parsing.reader import RawRow, ReadResult


@dataclass(frozen=True)
class StatusReportRecord:
    """One bank outcome, normalized. Mirrors the billing_events contract."""

    serial_no: str
    status_id: int
    status_description: str | None
    status_date: date
    reason: str | None
    reason_desc: str | None
    amount: Decimal | None
    masked_pan: str | None
    expiry: str | None
    donor_name: str | None
    charity_code: str | None
    bank: str | None
    attempts: int | None
    frequency: str | None
    agent_id: str | None
    recruiter_code: str | None
    recruiter_batch_no: str | None
    submitted_at: date | None
    #: The bank's DEBIT_CREDIT_CARD column: 'CREDIT' / 'DEBIT'.
    instrument_hint: str | None
    row_number: int
    raw_row: dict[str, Any] = field(repr=False)


@dataclass(frozen=True)
class RowException:
    """A row that could not be parsed, with enough context to fix it by hand."""

    row_number: int
    serial_no: str | None
    column: str | None
    detail: str
    raw_row: dict[str, Any] = field(repr=False)


@dataclass(frozen=True)
class ParseResult:
    records: list[StatusReportRecord]
    exceptions: list[RowException]

    @property
    def total(self) -> int:
        return len(self.records) + len(self.exceptions)


def parse_status_report(read_result: ReadResult) -> ParseResult:
    records: list[StatusReportRecord] = []
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

    return ParseResult(records=records, exceptions=exceptions)


class _RowError(Exception):
    def __init__(self, *, serial_no: str | None, column: str | None, detail: str) -> None:
        super().__init__(detail)
        self.serial_no = serial_no
        self.column = column
        self.detail = detail


def _parse_row(row: RawRow) -> StatusReportRecord:
    serial_no = parse_text(row.get("SERIAL NO"))

    def field_value(column: str, parser: Any) -> Any:
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
            detail="row has no SERIAL NO, so it cannot be matched to an application",
        )

    status_id = field_value("STATUS ID", parse_int)
    if status_id is None:
        raise _RowError(
            serial_no=serial_no,
            column="STATUS ID",
            detail="row has no STATUS ID, so its billing outcome is unknown",
        )

    status_date = field_value("STATUS DATE", parse_date)
    if status_date is None:
        raise _RowError(
            serial_no=serial_no,
            column="STATUS DATE",
            detail="row has no STATUS DATE, so it cannot be placed in billing history",
        )

    return StatusReportRecord(
        serial_no=serial_no,
        status_id=status_id,
        status_description=field_value("STATUS DESCRIPTION", parse_text),
        status_date=status_date,
        reason=field_value("REASON", parse_text),
        reason_desc=field_value("REASONDESC", parse_text),
        amount=field_value("DonationAmount", parse_amount),
        masked_pan=field_value("CREDIT CARD", parse_text),
        expiry=field_value("ExpiryDate", parse_expiry),
        donor_name=field_value("CUSTOMERS NAME", parse_text),
        charity_code=field_value("Charity Code", parse_text),
        bank=field_value("Bank", parse_text),
        attempts=field_value("A0 Attempts", parse_int),
        frequency=field_value("Frequency", parse_text),
        agent_id=field_value("AgentID", parse_text),
        recruiter_code=field_value("Recruiter Code", parse_text),
        recruiter_batch_no=field_value("Recruiter Batch No", parse_text),
        submitted_at=field_value("Recruiter Submission Date", parse_date),
        instrument_hint=field_value("DEBIT_CREDIT_CARD", parse_text),
        row_number=row.number,
        raw_row=row.as_dict(),
    )


def _safe_detail(column: str, exc: CellParseError) -> str:
    """Build a message safe to log: the offending value, unless it is PII."""
    if column in PII_COLUMNS or exc.raw is None:
        return f"{column}: {exc}"
    return f"{column}: {exc} ({exc.raw!r})"
