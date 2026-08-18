"""Cell normalizers: one per concept, each handling every shape it arrives in.

Every shape handled here was observed in the client's real files
(docs/FINDINGS.md §2). The functions are pure and total: they return `None` for
a blank cell and raise `CellParseError` for content they cannot honestly
interpret. They never guess, and they never return a plausible-looking zero —
a silent zero in an amount column is a payroll error nobody catches.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from app.parsing.arithmetic import eval_literal_arithmetic


class CellParseError(ValueError):
    """A cell held content that could not be interpreted.

    Raised, not returned, so a caller cannot accidentally ignore it. The row
    handler catches this and routes the row to `import_exceptions`; it must
    never propagate far enough to fail a whole batch.

    The message must never contain donor PII — it ends up in logs.
    """

    def __init__(self, message: str, *, raw: object = None) -> None:
        super().__init__(message)
        self.raw = raw


def is_blank(value: object) -> bool:
    """True for empty cells only. Zero and False are data, not absence."""
    if value is None:
        return True
    return isinstance(value, str) and not value.strip()


def parse_text(value: object) -> str | None:
    """Trim and collapse internal whitespace runs.

    The real files carry `'SM Light Mall '` and doubled inner spaces; leaving
    them turns one venue into three in every group-by.
    """
    if is_blank(value):
        return None
    return re.sub(r"\s+", " ", str(value).strip())


# ---------------------------------------------------------------------------
# Amounts
# ---------------------------------------------------------------------------

# Currency symbols and codes seen or plausible in a PH/MY book.
_CURRENCY_JUNK = re.compile(r"[₱$RM\s]|(?<![A-Za-z])(?:PHP|MYR)(?![A-Za-z])", re.IGNORECASE)
_AMOUNT_TEXT = re.compile(r"^-?\d[\d,]*(?:\.\d+)?$")


def parse_amount(value: object) -> Decimal | None:
    """Normalize the three shapes amounts arrive in, plus accounting negatives.

    `1000` (int) · `"1,000.00"` (text) · `"=75*13"` (formula).

    Always returns Decimal — money is never a float. Floats coming out of
    openpyxl are converted via `str` so 1000.10 stays 1000.10 rather than
    acquiring binary representation error.
    """
    if is_blank(value):
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        raise CellParseError("boolean in an amount column", raw=value)
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))

    text = str(value).strip()

    if text.startswith("="):
        computed = eval_literal_arithmetic(text)
        if computed is None:
            # A cell reference such as '=H2*2.5' with no cached value. Genuinely
            # unknowable here; guessing would corrupt commission figures.
            raise CellParseError("amount formula could not be resolved", raw=text)
        return computed

    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative, text = True, text[1:-1].strip()

    text = _CURRENCY_JUNK.sub("", text)
    if not _AMOUNT_TEXT.match(text):
        raise CellParseError("value is not an amount", raw=str(value)[:40])

    try:
        amount = Decimal(text.replace(",", ""))
    except InvalidOperation as exc:  # pragma: no cover - regex already guards
        raise CellParseError("value is not an amount", raw=str(value)[:40]) from exc
    return -amount if negative else amount


def parse_int(value: object) -> int | None:
    """Whole numbers such as STATUS ID. A fractional value means the column is wrong."""
    if is_blank(value):
        return None
    if isinstance(value, bool):
        raise CellParseError("boolean in an integer column", raw=value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not value.is_integer():
            raise CellParseError("fractional value in an integer column", raw=value)
        return int(value)
    text = str(value).strip()
    if not re.match(r"^-?\d+$", text):
        raise CellParseError("value is not a whole number", raw=text[:40])
    return int(text)


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

# One or more leading "=" — the August 2026 bank file writes `==DATE(...)`,
# which is what a formula copied as text looks like. Requiring exactly one
# rejected every row in that file.
_DATE_FORMULA = re.compile(r"^=+\s*DATE\s*\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$", re.I)
_NUMERIC_DATE = re.compile(r"^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$")

_TEXT_DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
    "%d-%b-%Y",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d, %Y",
    "%d-%b-%y",
)

# Excel's day 0. The 1900 leap-year bug means serials below 61 are unreliable,
# and no real pledge date is anywhere near 1900 anyway.
_EXCEL_EPOCH = date(1899, 12, 30)
_MIN_SERIAL, _MAX_SERIAL = 61, 80_000


def parse_date(value: object, *, dayfirst: bool = True) -> date | None:
    """Normalize the three shapes dates arrive in.

    real `datetime` · `"=DATE(2026,7,8)"` · plain string (`VERIFIEDDATE`).

    `dayfirst` resolves the DD/MM vs MM/DD ambiguity. Both the Philippines and
    Malaysia write day-first, hence the default, but a US-locale export does
    not — so this is a knob, not a hard-coded assumption. Values that can only
    be read one way (a component above 12) ignore the setting.
    """
    if is_blank(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, bool):
        raise CellParseError("boolean in a date column", raw=value)
    if isinstance(value, int | float):
        return _from_excel_serial(value)

    text = str(value).strip()

    if match := _DATE_FORMULA.match(text):
        year, month, day = (int(g) for g in match.groups())
        return _build_date(year, month, day, raw=text)

    if text.startswith("="):
        raise CellParseError("date formula could not be resolved", raw=text[:40])

    if match := _NUMERIC_DATE.match(text):
        return _from_numeric_parts(match, dayfirst=dayfirst, raw=text)

    for fmt in _TEXT_DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue

    raise CellParseError("value is not a date", raw=text[:40])


def _from_excel_serial(value: int | float) -> date:
    if not (_MIN_SERIAL <= value <= _MAX_SERIAL):
        raise CellParseError("number is not a plausible Excel date serial", raw=value)
    return _EXCEL_EPOCH + timedelta(days=int(value))


def _from_numeric_parts(match: re.Match[str], *, dayfirst: bool, raw: str) -> date:
    first, second, third = (int(g) for g in match.groups())

    if len(match.group(1)) == 4:  # 2026/07/08 — unambiguous
        return _build_date(first, second, third, raw=raw)

    year = third if third > 99 else 2000 + third
    # A component above 12 can only be a day, whatever the locale convention.
    if first > 12:
        day, month = first, second
    elif second > 12:
        month, day = first, second
    else:
        day, month = (first, second) if dayfirst else (second, first)
    return _build_date(year, month, day, raw=raw)


def _build_date(year: int, month: int, day: int, *, raw: str) -> date:
    try:
        return date(year, month, day)
    except ValueError as exc:
        raise CellParseError("date components are out of range", raw=raw[:40]) from exc


# ---------------------------------------------------------------------------
# Card expiry
# ---------------------------------------------------------------------------

_EXPIRY_TEXT = re.compile(r"^(\d{1,2})\s*[/\-]?\s*(\d{2})$")


def parse_expiry(value: object) -> str | None:
    """Always returns 4-character zero-padded MMYY TEXT, never a number.

    `0728` is July 2028. Read as a number it becomes 728 and July is gone —
    FINDINGS §2 trap 5. Numeric input is re-padded on the way in, because by
    the time we see a 3-digit value the damage has already happened upstream.
    """
    if is_blank(value):
        return None
    if isinstance(value, bool):
        raise CellParseError("boolean in an expiry column", raw=value)

    text = str(int(value)) if isinstance(value, int | float) else str(value).strip()
    if isinstance(value, int | float):
        text = text.zfill(4)

    match = _EXPIRY_TEXT.match(text)
    if not match:
        raise CellParseError("value is not an MMYY expiry", raw=text[:10])

    month, year = match.group(1).zfill(2), match.group(2)
    if not 1 <= int(month) <= 12:
        raise CellParseError("expiry month is out of range", raw=text[:10])
    return f"{month}{year}"
