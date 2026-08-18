"""The Store seam must stay closed, or the Postgres store is impossible.

Services may call Store's methods; they may not touch its collections. A
database cannot hand out a live mutable Python list, so `store.uploads.append`
works in memory and silently loses the write anywhere else. This is a lint
expressed as a test because the failure mode is invisible until the swap.
"""

from __future__ import annotations

import ast
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"

#: Collections on Store that are private to its implementation.
GUARDED = frozenset(
    {
        "pledges",
        "billing_events",
        "notes",
        "uploads",
        "exceptions",
        "fundraisers",
        "leaders",
        "sites",
        "export_runs",
        "audit",
    }
)

#: Store's own module is the implementation, so it is allowed to touch them.
EXEMPT = {APP / "store" / "memory.py"}


def _offences(path: Path) -> list[str]:
    tree = ast.parse(path.read_text())
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Attribute) or node.attr not in GUARDED:
            continue
        # Only flag access through a name bound to the store. Parse results
        # carry their own `.exceptions`, and `self.exceptions` on a parser
        # dataclass is unrelated to this rule.
        base = node.value
        if isinstance(base, ast.Name) and base.id == "store":
            found.append(f"{path.relative_to(APP)}:{node.lineno} store.{node.attr}")
    return found


def test_no_module_reaches_past_the_store_methods() -> None:
    offences: list[str] = []
    for path in sorted(APP.rglob("*.py")):
        if path in EXEMPT:
            continue
        offences.extend(_offences(path))

    assert not offences, (
        "These reach into Store's collections instead of calling a method. "
        "A Postgres-backed store cannot support this — add a method to Store:\n  "
        + "\n  ".join(offences)
    )
