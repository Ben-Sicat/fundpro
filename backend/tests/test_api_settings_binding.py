"""Every request body must accept the camelCase the API itself emits.

THE BUG THIS GUARDS. `RulesIn` was a plain `BaseModel` with snake_case
fields and no aliases. GET /settings/rules returns camelCase, so anything
that read the rules and wrote them back sent camelCase — none of which bound.
Every field stayed None, the handler's `if value is not None` guard skipped
them all, and the endpoint returned 200 with the OLD values echoed back. A
settings write looked like it succeeded and changed nothing.

That silently disabled `createMissingFromBank`, which is why a 121-row bank
file could set every row aside for review with no way to turn the behaviour on.
"""

from __future__ import annotations

import inspect

import pytest

from tests.conftest import ApiClient


def test_rules_round_trip(api: ApiClient) -> None:
    """Read the rules, write them back changed, read again."""
    api.put("/settings/rules", json={"createMissingFromBank": True})

    assert api.json("/settings/rules")["createMissingFromBank"] is True


def test_every_rule_can_be_set(api: ApiClient) -> None:
    api.put(
        "/settings/rules",
        json={
            "realizationBasis": "signups",
            "requireVerificationForPayroll": True,
            "createMissingFromBank": True,
        },
    )

    rules = api.json("/settings/rules")
    assert rules["realizationBasis"] == "signups"
    assert rules["requireVerificationForPayroll"] is True
    assert rules["createMissingFromBank"] is True


def test_a_rules_write_is_audited(api: ApiClient) -> None:
    api.put("/settings/rules", json={"createMissingFromBank": True})

    assert any(e["action"] == "settings.rules" for e in api.json("/audit"))


@pytest.mark.parametrize(
    "module_name",
    ["settings", "team", "payroll", "pledges", "uploads", "exports"],
)
def test_no_request_model_silently_drops_camel_case(module_name: str) -> None:
    """Structural guard against the whole bug class.

    Any request model with a multi-word field must either extend `Wire` (whose
    config carries a camelCase alias_generator) or declare an alias per field.
    A plain BaseModel with bare snake_case fields accepts the request and
    throws the camelCase values away.
    """
    from pydantic import BaseModel

    module = __import__(f"app.routes.{module_name}", fromlist=["*"])

    offenders: list[str] = []
    for name, obj in inspect.getmembers(module, inspect.isclass):
        if not issubclass(obj, BaseModel) or obj.__module__ != module.__name__:
            continue
        if obj.model_config.get("alias_generator") is not None:
            continue  # Wire, or an equivalent generator.
        for field_name, field in obj.model_fields.items():
            if "_" not in field_name:
                continue
            if field.alias is None and field.validation_alias is None:
                offenders.append(f"{name}.{field_name}")

    assert not offenders, (
        "These fields only bind snake_case, so the UI's camelCase is dropped: "
        f"{offenders}. Extend `Wire` or declare an alias."
    )
