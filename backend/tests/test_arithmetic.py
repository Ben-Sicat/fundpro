"""Literal arithmetic evaluation — FINDINGS §2 trap 4.

Amount cells arrive as `=75*13`. These must be evaluated, never coerced to 0
and never passed to `eval` — the input is an untrusted client file.
"""

from decimal import Decimal

import pytest

from app.parsing import eval_literal_arithmetic


@pytest.mark.parametrize(
    ("expr", "expected"),
    [
        ("=75*13", Decimal("975")),
        ("=60*13", Decimal("780")),
        ("75*13", Decimal("975")),  # leading '=' optional
        ("=1000", Decimal("1000")),
        ("=1,000.00", Decimal("1000.00")),  # thousands separators tolerated
        ("=750*2.5", Decimal("1875.0")),
        ("=100+50", Decimal("150")),
        ("=200-50", Decimal("150")),
        ("=3000/4", Decimal("750")),
        ("=(600+400)*2", Decimal("2000")),
        ("= 75 * 13 ", Decimal("975")),  # whitespace
    ],
)
def test_evaluates_literal_arithmetic(expr: str, expected: Decimal) -> None:
    assert eval_literal_arithmetic(expr) == expected


@pytest.mark.parametrize(
    "expr",
    [
        "=H2*2.5",  # cell reference — unresolvable without the sheet
        "=SUM(A1:A9)",  # function call
        "=A1",
        "=IF(B2>0,1,0)",
        "=name*2",
        "",
        "=",
        "abc",
        "=75*",  # malformed
        "=*13",
        "=((75*13)",  # unbalanced
    ],
)
def test_returns_none_for_anything_not_pure_arithmetic(expr: str) -> None:
    assert eval_literal_arithmetic(expr) is None


def test_division_by_zero_is_none_not_an_exception() -> None:
    # A malformed client file must never take down an import batch.
    assert eval_literal_arithmetic("=100/0") is None


def test_does_not_execute_python() -> None:
    """The guard that matters: this is untrusted input from a client file."""
    for hostile in (
        "=__import__('os').system('echo pwned')",
        "=open('/etc/passwd').read()",
        "=1 if __import__('os') else 2",
        "=(lambda: 1)()",
    ):
        assert eval_literal_arithmetic(hostile) is None


def test_exponent_is_rejected_so_a_file_cannot_hang_the_parser() -> None:
    # 9**9**9 would occupy a CPU for a very long time. Not supported at all.
    assert eval_literal_arithmetic("=9**9**9") is None
    assert eval_literal_arithmetic("=9^9") is None
