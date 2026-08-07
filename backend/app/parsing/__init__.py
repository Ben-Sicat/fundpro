"""Defensive parsing of the client's legacy xlsx trackers.

Public surface for the rest of the service. Everything here is a pure function
over a file or a value — no database, no I/O beyond reading the workbook.

Traps handled, all verified against the client's real files: see
docs/FINDINGS.md §2 and the tests in `backend/tests/`.
"""

from app.parsing.arithmetic import eval_literal_arithmetic
from app.parsing.normalize import (
    CellParseError,
    is_blank,
    parse_amount,
    parse_date,
    parse_expiry,
    parse_int,
    parse_text,
)
from app.parsing.reader import (
    APPS_TRACKER,
    BLANK_RUN_LIMIT,
    SIGNATURES,
    STATUS_REPORT,
    HeaderSignature,
    NoDataSheetError,
    RawRow,
    ReadResult,
    detect_signature,
    read_rows,
)
from app.parsing.status_report import (
    ParseResult,
    RowException,
    StatusReportRecord,
    parse_status_report,
)

__all__ = [
    "APPS_TRACKER",
    "BLANK_RUN_LIMIT",
    "SIGNATURES",
    "STATUS_REPORT",
    "CellParseError",
    "HeaderSignature",
    "NoDataSheetError",
    "ParseResult",
    "RawRow",
    "ReadResult",
    "RowException",
    "StatusReportRecord",
    "detect_signature",
    "eval_literal_arithmetic",
    "is_blank",
    "parse_amount",
    "parse_date",
    "parse_expiry",
    "parse_int",
    "parse_status_report",
    "parse_text",
    "read_rows",
]
