"""Evaluate the literal arithmetic that appears in client spreadsheet cells.

Amount cells arrive as `=75*13` and `=H2*2.5` (FINDINGS §2 trap 4). The first
is computable; the second references another cell and is not knowable here.

This is a hand-written recursive-descent parser over a fixed grammar rather
than `eval` or `ast.literal_eval`, because the input is an untrusted file from
outside the organisation. Anything that is not a number, an operator or a
parenthesis is rejected outright — there is no path from a spreadsheet cell to
code execution.

Exponentiation is deliberately unsupported: `9**9**9` is a denial-of-service
in one cell.
"""

from __future__ import annotations

import re
from decimal import Decimal, DivisionByZero, InvalidOperation

# Numbers (with optional thousands separators), operators, parentheses. Any
# character outside this set makes the whole expression unevaluable.
_TOKEN = re.compile(r"\s*(?:(?P<num>\d[\d,]*(?:\.\d+)?|\.\d+)|(?P<op>[-+*/()]))")

_MAX_LENGTH = 200


def eval_literal_arithmetic(expr: object) -> Decimal | None:
    """Evaluate a pure-arithmetic expression, or return None.

    None means "this is not something we can compute" — a cell reference, a
    function call, a malformed expression. The caller decides whether that is
    an exception or simply a value it did not need.
    """
    if not isinstance(expr, str):
        return None
    text = expr.strip()
    if text.startswith("="):
        text = text[1:].strip()
    if not text or len(text) > _MAX_LENGTH:
        return None

    tokens = _tokenize(text)
    if tokens is None:
        return None
    try:
        parser = _Parser(tokens)
        value = parser.parse_expression()
        if not parser.at_end:
            return None
    except (_ParseError, InvalidOperation, DivisionByZero, ArithmeticError):
        return None
    return value


class _ParseError(Exception):
    pass


def _tokenize(text: str) -> list[str] | None:
    tokens: list[str] = []
    position = 0
    while position < len(text):
        match = _TOKEN.match(text, position)
        if match is None:
            return None  # a letter, a colon, anything unexpected
        tokens.append(match.group("num") or match.group("op"))
        position = match.end()
    return tokens or None


class _Parser:
    """expression := term (('+'|'-') term)*
    term       := factor (('*'|'/') factor)*
    factor     := ('-'|'+')? (NUMBER | '(' expression ')')
    """

    def __init__(self, tokens: list[str]) -> None:
        self._tokens = tokens
        self._index = 0

    @property
    def at_end(self) -> bool:
        return self._index >= len(self._tokens)

    def _peek(self) -> str | None:
        return None if self.at_end else self._tokens[self._index]

    def _take(self) -> str:
        if self.at_end:
            raise _ParseError("unexpected end of expression")
        token = self._tokens[self._index]
        self._index += 1
        return token

    def parse_expression(self) -> Decimal:
        value = self._parse_term()
        while (op := self._peek()) in ("+", "-"):
            self._take()
            right = self._parse_term()
            value = value + right if op == "+" else value - right
        return value

    def _parse_term(self) -> Decimal:
        value = self._parse_factor()
        while (op := self._peek()) in ("*", "/"):
            self._take()
            right = self._parse_factor()
            if op == "/":
                if right == 0:
                    raise _ParseError("division by zero")
                value = value / right
            else:
                value = value * right
        return value

    def _parse_factor(self) -> Decimal:
        symbol = self._take()
        if symbol == "-":
            return -self._parse_factor()
        if symbol == "+":
            return self._parse_factor()
        if symbol == "(":
            value = self.parse_expression()
            if self._peek() != ")":
                raise _ParseError("unbalanced parenthesis")
            self._take()
            return value
        if symbol in ("*", "/", ")"):
            raise _ParseError(f"unexpected operator {symbol!r}")
        return Decimal(symbol.replace(",", ""))
