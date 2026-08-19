"""Verification calls: the quality gate, recorded by hand.

Verification is CONFIRMED in MASTER_SPEC 4.2 and can gate payroll, so this is
the one manual edit capable of moving money. It gets the same scrutiny as
cancellations.
"""

from __future__ import annotations

from tests.conftest import TODAY, ApiClient


def _first_serial(api: ApiClient) -> str:
    return api.json("/pledges")[0]["serialNo"]


def test_a_verification_call_can_be_recorded(loaded: ApiClient) -> None:
    serial = _first_serial(loaded)

    response = loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": TODAY, "reached": True, "method": "phone"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["verified"] is True
    assert body["verifiedAt"] == TODAY


def test_a_call_that_did_not_reach_the_donor_does_not_verify(loaded: ApiClient) -> None:
    """"Called and failed" is a different fact from "never called".

    The date is worth recording — it tells the desk this one has been chased —
    but the gate must stay shut.
    """
    serial = _first_serial(loaded)

    body = loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": TODAY, "reached": False},
    ).json()

    assert body["verified"] is False
    assert body["verifiedAt"] is None


def test_not_reached_clears_an_earlier_pass(loaded: ApiClient) -> None:
    """Otherwise a stale tick outlives the fact that later contact failed."""
    serial = _first_serial(loaded)

    loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": TODAY, "reached": True},
    )
    body = loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": TODAY, "reached": False},
    ).json()

    assert body["verified"] is False
    assert body["verifiedAt"] is None


def test_a_verification_can_be_cleared(loaded: ApiClient) -> None:
    """For a call logged against the wrong pledge."""
    serial = _first_serial(loaded)
    loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": TODAY, "reached": True},
    )

    body = loaded.patch(f"/pledges/{serial}/verification", json={"calledOn": None}).json()

    assert body["verified"] is False
    assert body["verifiedAt"] is None


def test_a_future_dated_call_is_rejected(loaded: ApiClient) -> None:
    serial = _first_serial(loaded)

    response = loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": "2099-01-01", "reached": True},
    )

    assert response.status_code == 422


def test_a_call_before_the_signup_is_rejected(loaded: ApiClient) -> None:
    """You cannot have verified a sign-up that had not happened yet."""
    serial = _first_serial(loaded)

    response = loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": "2000-01-01", "reached": True},
    )

    assert response.status_code == 422


def test_verification_is_audited(loaded: ApiClient) -> None:
    serial = _first_serial(loaded)
    loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": TODAY, "reached": True, "method": "phone"},
    )

    actions = [entry["action"] for entry in loaded.json("/audit")]

    assert "pledge.verification.set" in actions


def test_recording_verification_never_touches_billing_state(loaded: ApiClient) -> None:
    """The gate this opens is worth money, so it must not move anything else.

    Current status is derived from the append-only event history. A manual edit
    that could rewrite it would let someone mark a pledge realized by hand.
    """
    serial = _first_serial(loaded)
    before = loaded.json(f"/pledges/{serial}")

    after = loaded.patch(
        f"/pledges/{serial}/verification",
        json={"calledOn": TODAY, "reached": True},
    ).json()

    for field in (
        "currentStatusId",
        "currentStatusDate",
        "currentClassification",
        "attempts",
        "failedAttempts",
        "debitDate",
        "cancelled",
        "amount",
    ):
        assert after[field] == before[field], field
