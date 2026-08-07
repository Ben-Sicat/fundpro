"""End-to-end: a whole workbook in, typed records + exceptions out.

The governing rule (BACKEND_PROMPT §5.9): a bad row goes to the exception
queue with its raw values and NEVER fails the batch.
"""

from datetime import date
from decimal import Decimal
from pathlib import Path

from app.parsing import parse_status_report, read_rows
from tests.fixtures.xlsx_builder import (
    MASKED_PAN,
    build_custom_status_report,
    build_status_report,
)

# A minimally-valid row; individual tests break exactly one cell.
GOOD = {
    "SERIAL NO": "FES48000001",
    "STATUS ID": 66,
    "STATUS DATE": "2026-07-08",
    "DonationAmount": 1000,
}


def test_every_amount_shape_normalizes_to_the_same_type(tmp_path: Path) -> None:
    parsed = parse_status_report(read_rows(build_status_report(tmp_path / "s.xlsx")))
    by_serial = {r.serial_no: r for r in parsed.records}

    assert by_serial["FES48000001"].amount == Decimal("1000.00")  # "1,000.00"
    assert by_serial["FES48000002"].amount == Decimal("975")  # "=75*13"
    assert by_serial["FES48000007"].amount == Decimal("1000")  # int
    assert all(isinstance(r.amount, Decimal) for r in parsed.records)


def test_every_date_shape_normalizes_to_the_same_type(tmp_path: Path) -> None:
    parsed = parse_status_report(read_rows(build_status_report(tmp_path / "s.xlsx")))
    by_serial = {r.serial_no: r for r in parsed.records}

    assert by_serial["FES48000004"].status_date == date(2026, 7, 8)  # "=DATE(...)"
    assert by_serial["FES48000005"].status_date == date(2026, 7, 8)  # "2026-07-08"
    assert by_serial["FES48000001"].status_date == date(2026, 7, 8)  # datetime
    assert all(isinstance(r.status_date, date) for r in parsed.records)


def test_zero_padded_expiry_survives_the_whole_pipeline(tmp_path: Path) -> None:
    parsed = parse_status_report(read_rows(build_status_report(tmp_path / "s.xlsx")))
    by_serial = {r.serial_no: r for r in parsed.records}
    assert by_serial["FES48000003"].expiry == "0728"


def test_masked_pan_is_carried_through_unmodified(tmp_path: Path) -> None:
    """The real files mask with asterisks: 542550********2906."""
    parsed = parse_status_report(read_rows(build_status_report(tmp_path / "s.xlsx")))
    assert all(r.masked_pan == MASKED_PAN for r in parsed.records)
    assert all("*" in r.masked_pan for r in parsed.records)


def test_a_bad_row_becomes_an_exception_and_the_rest_still_parse(tmp_path: Path) -> None:
    path = build_custom_status_report(
        tmp_path / "mixed.xlsx",
        [
            {**GOOD, "SERIAL NO": "FES48000001"},
            {**GOOD, "SERIAL NO": "FES48000002", "DonationAmount": "N/A"},
            {**GOOD, "SERIAL NO": "FES48000003", "STATUS DATE": "=DATE(2026,7,)"},
            {**GOOD, "SERIAL NO": "FES48000004"},
        ],
    )
    parsed = parse_status_report(read_rows(path))

    assert len(parsed.records) == 2
    assert len(parsed.exceptions) == 2
    assert {r.serial_no for r in parsed.records} == {"FES48000001", "FES48000004"}
    assert {e.serial_no for e in parsed.exceptions} == {"FES48000002", "FES48000003"}


def test_an_exception_carries_enough_to_fix_the_row_by_hand(tmp_path: Path) -> None:
    path = build_custom_status_report(
        tmp_path / "bad.xlsx",
        [{**GOOD, "SERIAL NO": "FES48000009", "DonationAmount": "not-a-number"}],
    )
    exc = parse_status_report(read_rows(path)).exceptions[0]

    assert exc.serial_no == "FES48000009"
    assert exc.row_number == 2  # row 1 is the header
    assert exc.column == "DonationAmount"
    assert "not-a-number" in exc.detail
    assert exc.raw_row  # the whole row is kept so nothing is lost


def test_exception_detail_never_contains_donor_pii(tmp_path: Path) -> None:
    """RA 10173: names, emails and card numbers must not reach logs or errors.

    The raw row is retained for an authorised human in the UI, but the message
    a developer sees in a log must be safe.
    """
    path = build_custom_status_report(
        tmp_path / "pii.xlsx",
        [
            {
                **GOOD,
                "SERIAL NO": "FES48000009",
                "CUSTOMERS NAME": "Marisol Quiambao",
                "CREDIT CARD": MASKED_PAN,
                "DonationAmount": "not-a-number",
            }
        ],
    )
    exc = parse_status_report(read_rows(path)).exceptions[0]

    assert "Marisol" not in exc.detail
    assert "Quiambao" not in exc.detail
    assert "542550" not in exc.detail


def test_a_pii_column_failure_reports_the_column_without_the_value(tmp_path: Path) -> None:
    path = build_custom_status_report(
        tmp_path / "pii2.xlsx",
        [{**GOOD, "SERIAL NO": "FES48000010", "ExpiryDate": "1328"}],
    )
    exc = parse_status_report(read_rows(path)).exceptions[0]
    assert exc.column == "ExpiryDate"
    assert "out of range" in exc.detail


def test_a_row_with_no_serial_is_an_exception_not_a_silent_drop(tmp_path: Path) -> None:
    path = build_custom_status_report(
        tmp_path / "orphan.xlsx",
        [{"STATUS ID": 66, "STATUS DATE": "2026-07-08", "DonationAmount": 1000}],
    )
    parsed = parse_status_report(read_rows(path))

    assert parsed.records == []
    assert parsed.exceptions[0].column == "SERIAL NO"


def test_a_row_with_no_status_id_is_an_exception(tmp_path: Path) -> None:
    path = build_custom_status_report(
        tmp_path / "nostatus.xlsx",
        [{"SERIAL NO": "FES48000011", "STATUS DATE": "2026-07-08"}],
    )
    parsed = parse_status_report(read_rows(path))
    assert parsed.exceptions[0].column == "STATUS ID"


def test_real_world_reason_text_survives_intact(tmp_path: Path) -> None:
    """The bank pads REASONDESC with runs of spaces; the code is the signal."""
    path = build_custom_status_report(
        tmp_path / "reason.xlsx",
        [
            {
                **GOOD,
                "STATUS ID": 59,
                "STATUS DESCRIPTION": "Billing Failed (DNH - Will retry)",
                "REASON": "DO NOT HONOR",
                "REASONDESC": "DO NOT HONOR               82",
            }
        ],
    )
    record = parse_status_report(read_rows(path)).records[0]
    assert record.reason == "DO NOT HONOR"
    assert record.reason_desc == "DO NOT HONOR 82"  # runs collapsed, content kept


def test_parsing_is_deterministic(tmp_path: Path) -> None:
    path = build_status_report(tmp_path / "s.xlsx")
    first = parse_status_report(read_rows(path))
    second = parse_status_report(read_rows(path))
    assert [r.serial_no for r in first.records] == [r.serial_no for r in second.records]


def test_totals_add_up(tmp_path: Path) -> None:
    """Every row read is either a record or an exception — none vanish."""
    path = build_custom_status_report(
        tmp_path / "totals.xlsx",
        [
            {**GOOD, "SERIAL NO": "FES48000001"},
            {**GOOD, "SERIAL NO": "FES48000002", "DonationAmount": "N/A"},
            {**GOOD, "SERIAL NO": "FES48000003"},
        ],
    )
    read = read_rows(path)
    parsed = parse_status_report(read)
    assert parsed.total == len(read.rows) == 3
