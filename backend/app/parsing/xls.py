"""Reads legacy `.xls` (BIFF/OLE2) workbooks behind an openpyxl-shaped façade.

The client's daily Submissions files are true BIFF documents — `file` reports
"Composite Document File V2" — and openpyxl cannot open them at all. That is
121 of the 210 files in the April–July 2026 archive, so this is not an edge
case.

Rather than branch the parsers, this exposes the small slice of the openpyxl
API that `reader.py` actually uses (`sheetnames`, `wb[name]`,
`sheet.iter_rows(values_only=True)`, `sheet.max_row`, `close`). Every defence
in the reader — header-signature sheet selection, blank-run termination, junk
column preservation — then applies to `.xls` unchanged.

Two differences from the xlsx path, both deliberate:

- **There is no separate formula read.** BIFF stores the last computed value
  and xlrd surfaces that; it does not expose formula text. So the caller gets
  the same workbook twice and `_coalesce` simply agrees with itself. The
  `=DATE(y,m,d)` trap is an xlsx-era problem and cannot arise here.
- **Dates arrive as floats and MUST be converted.** BIFF stores a date as a
  serial number, so a raw read turns 2026-06-09 into 46182.0. The workbook's
  `datemode` decides the epoch (1900 vs 1904), which is why conversion has to
  happen here where that flag is available, not in the normalizers.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import xlrd


class XlsSheet:
    """One BIFF worksheet, presented the way openpyxl presents one."""

    def __init__(self, sheet: Any, datemode: int) -> None:
        self._sheet = sheet
        self._datemode = datemode

    @property
    def max_row(self) -> int:
        return int(self._sheet.nrows)

    def iter_rows(
        self,
        min_row: int = 1,
        max_row: int | None = None,
        values_only: bool = True,
    ) -> Iterator[tuple[Any, ...]]:
        """Yield rows as value tuples, 1-based and inclusive like openpyxl."""
        last = self._sheet.nrows if max_row is None else min(max_row, self._sheet.nrows)
        for index in range(min_row - 1, last):
            yield tuple(
                _cell_value(self._sheet.cell(index, col), self._datemode)
                for col in range(self._sheet.ncols)
            )


class XlsWorkbook:
    def __init__(self, path: Path) -> None:
        # on_demand keeps only the requested sheet in memory; these files are
        # small but there are 121 of them in one migration run.
        self._book = xlrd.open_workbook(str(path), on_demand=True)

    @property
    def sheetnames(self) -> list[str]:
        return list(self._book.sheet_names())

    def __getitem__(self, name: str) -> XlsSheet:
        return XlsSheet(self._book.sheet_by_name(name), self._book.datemode)

    def close(self) -> None:
        self._book.release_resources()


def _cell_value(cell: Any, datemode: int) -> Any:
    """Convert one BIFF cell to the kind of value the normalizers expect."""
    kind = cell.ctype

    if kind == xlrd.XL_CELL_EMPTY or kind == xlrd.XL_CELL_BLANK:
        return None

    if kind == xlrd.XL_CELL_DATE:
        try:
            return xlrd.xldate.xldate_as_datetime(cell.value, datemode)
        except Exception:
            # An out-of-range serial is data corruption, not a reason to fail
            # the file. Passing the raw number through sends the row to
            # import_exceptions, which is where a human should see it.
            return cell.value

    if kind == xlrd.XL_CELL_BOOLEAN:
        return bool(cell.value)

    if kind == xlrd.XL_CELL_ERROR:
        # e.g. #N/A left behind by a VLOOKUP in the source sheet.
        return None

    if kind == xlrd.XL_CELL_NUMBER:
        # BIFF has one numeric type, so an integer arrives as 46182.0. Left as
        # a float it would render as "46182.0" and break exact-match joins on
        # anything numeric-but-textual, so collapse the exact integers.
        number = float(cell.value)
        return int(number) if number.is_integer() else number

    return cell.value


def open_xls(path: Path) -> XlsWorkbook:
    return XlsWorkbook(path)


__all__ = ["XlsSheet", "XlsWorkbook", "open_xls"]
