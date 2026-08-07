"""Cell normalizers — FINDINGS §2 traps 3, 4, 5, 6, 7, 9, 10.

One normalizer per concept, each handling every shape the value arrives in.
"""

from datetime import date, datetime
from decimal import Decimal

import pytest

from app.parsing import (
    CellParseError,
    is_blank,
    parse_amount,
    parse_date,
    parse_expiry,
    parse_int,
    parse_text,
)

# ---------------------------------------------------------------------------
# Blankness
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("value", [None, "", "   ", "\t", "\n  \n"])
def test_blank_values(value: object) -> None:
    assert is_blank(value) is True


@pytest.mark.parametrize("value", [0, "0", False, "x", Decimal(0), date(2026, 7, 8)])
def test_not_blank_values(value: object) -> None:
    """Zero and False are DATA. Treating them as blank silently drops rows."""
    assert is_blank(value) is False


# ---------------------------------------------------------------------------
# Amounts — trap 6: three shapes, one meaning
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1,000.00", Decimal("1000.00")),  # comma text (Status Report)
        (1000, Decimal("1000")),  # int (Apps Tracker)
        ("=75*13", Decimal("975")),  # formula
        (1000.50, Decimal("1000.50")),  # float from Excel
        ("1000", Decimal("1000")),
        ("  1,234.56  ", Decimal("1234.56")),
        (Decimal("999.99"), Decimal("999.99")),
        ("₱1,000.00", Decimal("1000.00")),  # stray currency symbol
        ("(500.00)", Decimal("-500.00")),  # accounting negative
        ("-250", Decimal("-250")),
    ],
)
def test_parse_amount_shapes(value: object, expected: Decimal) -> None:
    assert parse_amount(value) == expected


def test_parse_amount_float_does_not_inherit_binary_error() -> None:
    """Money is never a float. 0.1+0.2 problems must not reach the ledger."""
    assert parse_amount(1000.10) == Decimal("1000.10")
    assert str(parse_amount(0.1)) == "0.1"


@pytest.mark.parametrize("value", [None, "", "   "])
def test_parse_amount_blank_is_none(value: object) -> None:
    assert parse_amount(value) is None


@pytest.mark.parametrize("value", ["N/A", "pending", "=H2*2.5", "--", "1.2.3"])
def test_parse_amount_unparseable_raises(value: object) -> None:
    """Raises rather than guessing: the caller routes the row to exceptions.

    `=H2*2.5` is a cell reference with no cached value — genuinely unknowable
    here, so it must not become 0.
    """
    with pytest.raises(CellParseError):
        parse_amount(value)


# ---------------------------------------------------------------------------
# Dates — trap 7: three shapes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (datetime(2026, 7, 8), date(2026, 7, 8)),  # real datetime
        (date(2026, 7, 8), date(2026, 7, 8)),
        ("=DATE(2026,7,8)", date(2026, 7, 8)),  # formula string
        ("=DATE(2026, 7, 8)", date(2026, 7, 8)),  # with spaces
        ("2026-07-08", date(2026, 7, 8)),  # plain ISO string
        ("2026/07/08", date(2026, 7, 8)),
        ("08-Jul-2026", date(2026, 7, 8)),
        ("8 Jul 2026", date(2026, 7, 8)),
        ("2026-07-08 00:00:00", date(2026, 7, 8)),
    ],
)
def test_parse_date_shapes(value: object, expected: date) -> None:
    assert parse_date(value) == expected


def test_slashed_dates_are_day_first_by_default() -> None:
    """PH and MY both write DD/MM/YYYY. US-locale exports do not.

    The convention is a setting, not a guess baked into code.
    """
    assert parse_date("08/07/2026") == date(2026, 7, 8)
    assert parse_date("08/07/2026", dayfirst=False) == date(2026, 8, 7)


def test_unambiguous_slashed_date_ignores_the_setting() -> None:
    # 25 cannot be a month, so this is the 25th regardless of convention.
    assert parse_date("25/07/2026", dayfirst=False) == date(2026, 7, 25)


def test_excel_serial_number_dates() -> None:
    """A date column read as a number. 45000 = 2023-03-15 in Excel's epoch."""
    assert parse_date(45000) == date(2023, 3, 15)


@pytest.mark.parametrize("value", [None, "", "   "])
def test_parse_date_blank_is_none(value: object) -> None:
    assert parse_date(value) is None


@pytest.mark.parametrize(
    "value",
    ["=DATE(2026,7,)", "not a date", "2026-13-45", "=DATE(2026,2,30)", "99/99/9999"],
)
def test_parse_date_unparseable_raises(value: object) -> None:
    with pytest.raises(CellParseError):
        parse_date(value)


# ---------------------------------------------------------------------------
# Expiry — trap 5: the leading zero is load-bearing
# ---------------------------------------------------------------------------


def test_expiry_keeps_its_leading_zero() -> None:
    """The whole point. Numeric parsing turns 0728 into 728 and loses July."""
    assert parse_expiry("0728") == "0728"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1028", "1028"),
        ("0728", "0728"),
        (1028, "1028"),  # already numeric in the cell
        (728, "0728"),  # numeric AND already damaged — re-pad it
        ("07/28", "0728"),  # slashed
        ("07-28", "0728"),
        (" 1028 ", "1028"),
    ],
)
def test_parse_expiry_shapes(value: object, expected: str) -> None:
    result = parse_expiry(value)
    assert result == expected
    assert isinstance(result, str)
    assert len(result) == 4


@pytest.mark.parametrize("value", [None, "", "   "])
def test_parse_expiry_blank_is_none(value: object) -> None:
    assert parse_expiry(value) is None


@pytest.mark.parametrize("value", ["1328", "0028", "abcd", "12345", "13/28"])
def test_parse_expiry_rejects_impossible_months(value: object) -> None:
    with pytest.raises(CellParseError):
        parse_expiry(value)


# ---------------------------------------------------------------------------
# Text — trap 10: free-text drift
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("SM Light Mall ", "SM Light Mall"),  # trailing space, seen in the real file
        ("  Mactan  Cebu   Airport ", "Mactan Cebu Airport"),  # runs collapsed
        ("STC", "STC"),
        (123, "123"),
        ("FP", "FP"),
    ],
)
def test_parse_text(value: object, expected: str) -> None:
    assert parse_text(value) == expected


@pytest.mark.parametrize("value", [None, "", "   "])
def test_parse_text_blank_is_none(value: object) -> None:
    assert parse_text(value) is None


# ---------------------------------------------------------------------------
# Integers — STATUS ID
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("value", "expected"), [(66, 66), ("66", 66), (66.0, 66), (" 59 ", 59)])
def test_parse_int(value: object, expected: int) -> None:
    assert parse_int(value) == expected


def test_parse_int_rejects_a_lossy_float() -> None:
    # 66.5 as a STATUS ID means the column is not what we think it is.
    with pytest.raises(CellParseError):
        parse_int(66.5)


@pytest.mark.parametrize("value", ["", None])
def test_parse_int_blank_is_none(value: object) -> None:
    assert parse_int(value) is None
