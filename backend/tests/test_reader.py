"""Workbook reading — FINDINGS §2 traps 1, 2, 8.

Sheet selection by header signature, phantom-row defence, junk-column handling.
"""

from pathlib import Path

import pytest

from app.parsing import (
    APPS_TRACKER,
    STATUS_REPORT,
    NoDataSheetError,
    detect_signature,
    read_rows,
)
from tests.fixtures.xlsx_builder import (
    build_apps_tracker,
    build_empty_sheet,
    build_inflated_dimensions,
    build_multi_sheet,
    build_status_report,
)

# ---------------------------------------------------------------------------
# Trap 2: sheet name is unreliable
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("sheet_name", ["sheet1", "Sheet1", "Sheet2", "15JUL2026", "data"])
def test_finds_the_data_sheet_whatever_it_is_called(tmp_path: Path, sheet_name: str) -> None:
    path = build_status_report(tmp_path / "s.xlsx", sheet_name=sheet_name)
    result = read_rows(path)
    assert result.signature is STATUS_REPORT
    assert len(result.rows) == 7


def test_skips_a_decorative_first_sheet(tmp_path: Path) -> None:
    """Taking the first worksheet blindly would read a cover page."""
    path = build_multi_sheet(tmp_path / "m.xlsx")
    result = read_rows(path)
    assert result.sheet_name == "Sheet1"
    assert result.signature is STATUS_REPORT
    assert len(result.rows) == 1


def test_detects_which_kind_of_file_it_is(tmp_path: Path) -> None:
    """The UI lets users drop either file; the parser works out which."""
    status = read_rows(build_status_report(tmp_path / "s.xlsx"))
    apps = read_rows(build_apps_tracker(tmp_path / "a.xlsx"))
    assert status.signature is STATUS_REPORT
    assert apps.signature is APPS_TRACKER


def test_unrecognised_workbook_raises(tmp_path: Path) -> None:
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.append(["Fruit", "Colour", "Price"])
    wb.active.append(["Apple", "Red", 10])
    path = tmp_path / "nope.xlsx"
    wb.save(path)

    with pytest.raises(NoDataSheetError):
        read_rows(path)


def test_detect_signature_tolerates_case_and_spacing_drift() -> None:
    headers = [
        "status description",
        "  REASONDESC",
        "Sg Batch No",
        "a0 attempts",
        "DONATIONAMOUNT",
    ]
    assert detect_signature(headers) is STATUS_REPORT


def test_detect_signature_returns_none_when_too_few_columns_match() -> None:
    assert detect_signature(["SERIAL NO", "SOMETHING", "ELSE"]) is None


def test_the_two_schemas_do_not_match_each_other(tmp_path: Path) -> None:
    """Both files share SERIAL NO, STATUS DATE, REASON and CHQ/MO/PO.

    Signatures therefore key on columns unique to each; this is the test that
    catches it if someone later adds a shared column to a signature.
    """
    from app.parsing.headers import APPS_TRACKER_COLUMNS, STATUS_REPORT_COLUMNS

    apps = [h for h in APPS_TRACKER_COLUMNS if h]
    status = list(STATUS_REPORT_COLUMNS)

    assert detect_signature(apps) is APPS_TRACKER
    assert detect_signature(status) is STATUS_REPORT
    assert not STATUS_REPORT.matches(apps)
    assert not APPS_TRACKER.matches(status)


# ---------------------------------------------------------------------------
# Trap 1: phantom rows
# ---------------------------------------------------------------------------


def test_stops_at_trailing_blanks_rather_than_the_reported_dimensions(
    tmp_path: Path,
) -> None:
    path = build_inflated_dimensions(tmp_path / "big.xlsx", real_rows=5)
    result = read_rows(path)
    assert len(result.rows) == 5
    # The sheet CLAIMS a million rows; proving we ignored that is the point.
    assert result.reported_max_row > 1_000_000
    assert result.rows_scanned < 200


def test_trailing_blank_rows_are_not_returned(tmp_path: Path) -> None:
    path = build_status_report(tmp_path / "s.xlsx", phantom_rows=500)
    result = read_rows(path)
    assert len(result.rows) == 7


def test_a_blank_row_in_the_middle_does_not_end_the_read(tmp_path: Path) -> None:
    """The fixture has a blank row before its last record."""
    result = read_rows(build_status_report(tmp_path / "s.xlsx"))
    serials = [r.get("SERIAL NO") for r in result.rows]
    assert "FES48000007" in serials, "the row after the mid-file blank was dropped"


def test_headers_only_file_yields_no_rows(tmp_path: Path) -> None:
    result = read_rows(build_empty_sheet(tmp_path / "e.xlsx"))
    assert result.rows == []
    assert result.signature is STATUS_REPORT


# ---------------------------------------------------------------------------
# Trap 8: junk columns
# ---------------------------------------------------------------------------


def test_junk_column_value_is_preserved(tmp_path: Path) -> None:
    """Position 4's header is a single space but it carries the recruiter code.

    Dropping it because the header looks empty silently loses data.
    """
    result = read_rows(build_apps_tracker(tmp_path / "a.xlsx"))
    raw = result.rows[0].as_dict()
    assert "FP" in raw.values()


def test_junk_columns_are_flagged_for_export_exclusion(tmp_path: Path) -> None:
    result = read_rows(build_apps_tracker(tmp_path / "a.xlsx"))
    # Both the ' ' header and the '' header are junk; neither belongs in an export.
    assert len(result.junk_columns) == 2


def test_row_keys_stay_unique_even_when_headers_collide(tmp_path: Path) -> None:
    """Two blank-ish headers must not overwrite each other in the raw row."""
    result = read_rows(build_apps_tracker(tmp_path / "a.xlsx"))
    raw = result.rows[0].as_dict()
    assert len(raw) == len(result.headers)


def test_rows_carry_their_sheet_row_number(tmp_path: Path) -> None:
    """Exceptions must point a human at the right line of the spreadsheet."""
    result = read_rows(build_status_report(tmp_path / "s.xlsx"))
    assert result.rows[0].number == 2  # row 1 is the header
    assert [r.number for r in result.rows] == sorted(r.number for r in result.rows)


# ---------------------------------------------------------------------------
# Reading is defensive about the file itself
# ---------------------------------------------------------------------------


def test_a_file_that_is_not_a_workbook_raises_cleanly(tmp_path: Path) -> None:
    path = tmp_path / "fake.xlsx"
    path.write_bytes(b"this is not a zip archive")
    with pytest.raises(NoDataSheetError):
        read_rows(path)


def test_row_get_is_case_and_space_insensitive(tmp_path: Path) -> None:
    result = read_rows(build_status_report(tmp_path / "s.xlsx"))
    row = result.rows[0]
    assert row.get("SERIAL NO") == row.get("serial no") == row.get(" Serial No ")
