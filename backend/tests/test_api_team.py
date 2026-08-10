"""Team roster CRUD, and caller notes.

Both were owner requests: recruitment is continuous so there must be a way to
add a joiner, and remarks are free text anyone can add.
"""

from __future__ import annotations

from tests.conftest import ApiClient

NEW = {
    "name": "Teodora Villanueva",
    "code": "FR011",
    "leaderNames": ["Adora Lumbre", "Jhon Magno"],
    "active": True,
    "startDate": "2026-08-03",
}


def test_a_new_joiner_can_be_added(loaded: ApiClient) -> None:
    response = loaded.post("/team/fundraisers", json=NEW)

    assert response.status_code == 201
    body = response.json()
    assert body["code"] == "FR011"
    assert body["leaderNames"] == ["Adora Lumbre", "Jhon Magno"]
    # A new joiner has no sign-ups until their first one lands.
    assert body["signups"] == 0
    assert body["realizationRate"] == 0.0


def test_the_new_joiner_appears_on_the_roster(loaded: ApiClient) -> None:
    loaded.post("/team/fundraisers", json=NEW)
    assert "FR011" in {f["code"] for f in loaded.json("/team/fundraisers")}


def test_a_duplicate_id_number_is_refused(loaded: ApiClient) -> None:
    assert loaded.post("/team/fundraisers", json={**NEW, "code": "FR001"}).status_code == 409


def test_an_unknown_leader_is_refused(loaded: ApiClient) -> None:
    response = loaded.post("/team/fundraisers", json={**NEW, "leaderNames": ["Nobody"]})
    assert response.status_code == 422


def test_at_least_one_leader_is_required(loaded: ApiClient) -> None:
    assert loaded.post("/team/fundraisers", json={**NEW, "leaderNames": []}).status_code == 422


def test_a_retired_fundraiser_needs_an_end_date(loaded: ApiClient) -> None:
    """The end date is what stops commission accruing, so a blank one is a
    payroll problem rather than a cosmetic gap."""
    response = loaded.post("/team/fundraisers", json={**NEW, "active": False})
    assert response.status_code == 422
    assert "end date" in response.json()["detail"].lower()


def test_an_active_fundraiser_may_not_have_an_end_date(loaded: ApiClient) -> None:
    response = loaded.post("/team/fundraisers", json={**NEW, "endDate": "2026-12-01"})
    assert response.status_code == 422


def test_an_end_date_before_the_start_is_refused(loaded: ApiClient) -> None:
    response = loaded.post(
        "/team/fundraisers",
        json={**NEW, "active": False, "endDate": "2026-01-01"},
    )
    assert response.status_code == 422


def test_someone_can_be_retired(loaded: ApiClient) -> None:
    response = loaded.put(
        "/team/fundraisers/FR001",
        json={
            "name": "Almara Pasco",
            "code": "FR001",
            "leaderNames": ["Adora Lumbre"],
            "active": False,
            "startDate": "2024-03-04",
            "endDate": "2026-08-31",
        },
    )
    assert response.status_code == 200
    assert response.json()["active"] is False
    assert response.json()["endDate"] == "2026-08-31"


def test_someone_can_be_moved_to_another_leader(loaded: ApiClient) -> None:
    response = loaded.put(
        "/team/fundraisers/FR001",
        json={
            "name": "Almara Pasco",
            "code": "FR001",
            "leaderNames": ["Mark Ramayrat"],
            "active": True,
            "startDate": "2024-03-04",
        },
    )
    assert response.json()["leaderNames"] == ["Mark Ramayrat"]
    # And the pledge filter follows the new assignment immediately.
    assert len(loaded.json("/pledges", params={"leader": "Mark Ramayrat"})) == 6


def test_a_rename_carries_the_sign_up_history(loaded: ApiClient) -> None:
    """Pledges reference a fundraiser by NAME. A rename that did not update
    them would silently orphan every sign-up the person had made."""
    before = loaded.json("/team/fundraisers/FR001")["signups"]
    assert before == 3

    renamed = loaded.put(
        "/team/fundraisers/FR001",
        json={
            "name": "Almara Pasco-Reyes",
            "code": "FR001",
            "leaderNames": ["Adora Lumbre"],
            "active": True,
            "startDate": "2024-03-04",
        },
    ).json()

    assert renamed["name"] == "Almara Pasco-Reyes"
    assert renamed["signups"] == before
    assert loaded.json("/pledges", params={"fundraiser": "Almara Pasco"}) == []
    assert len(loaded.json("/pledges", params={"fundraiser": "Almara Pasco-Reyes"})) == before


def test_editing_someone_keeps_their_own_id(loaded: ApiClient) -> None:
    """Saving without changing the ID must not clash with themselves."""
    response = loaded.put(
        "/team/fundraisers/FR001",
        json={
            "name": "Almara Pasco",
            "code": "FR001",
            "leaderNames": ["Adora Lumbre"],
            "active": True,
            "startDate": "2024-03-04",
        },
    )
    assert response.status_code == 200


def test_an_unknown_fundraiser_is_a_404(loaded: ApiClient) -> None:
    assert loaded.get("/team/fundraisers/NOPE").status_code == 404
    assert loaded.put("/team/fundraisers/NOPE", json=NEW).status_code == 404


def test_a_leader_can_be_added(loaded: ApiClient) -> None:
    response = loaded.post("/team/leaders", params={"name": "Rhea Santos"})
    assert response.status_code == 201
    assert "Rhea Santos" in response.json()


def test_roster_changes_are_audited(loaded: ApiClient) -> None:
    loaded.post("/team/fundraisers", json=NEW)
    actions = {a["action"] for a in loaded.json("/audit")}
    assert "team.create" in actions


# ---------------------------------------------------------------------------
# Caller notes
# ---------------------------------------------------------------------------


def test_a_note_can_be_added_and_read_back(loaded: ApiClient) -> None:
    response = loaded.post(
        "/pledges/FES48000001/notes",
        json={"text": "No answer at 10am. Will try again after office hours."},
        headers={"X-Actor": "Rhea Santos"},
    )
    assert response.status_code == 201
    assert response.json()["author"] == "Rhea Santos"

    notes = loaded.json("/pledges/FES48000001/notes")
    assert len(notes) == 1
    assert notes[0]["text"].startswith("No answer")


def test_notes_are_a_thread_newest_first(loaded: ApiClient) -> None:
    for text in ("first call", "second call", "third call"):
        loaded.post("/pledges/FES48000001/notes", json={"text": text})

    notes = loaded.json("/pledges/FES48000001/notes")
    assert len(notes) == 3
    assert [n["createdAt"] for n in notes] == sorted(
        (n["createdAt"] for n in notes), reverse=True
    )


def test_there_is_no_way_to_edit_or_delete_a_note(loaded: ApiClient, client) -> None:
    """Append-only by construction: a correction is a new note, so the trail
    of what was believed and when survives."""
    loaded.post("/pledges/FES48000001/notes", json={"text": "original"})
    note_id = loaded.json("/pledges/FES48000001/notes")[0]["id"]

    for method in ("put", "patch", "delete"):
        response = getattr(client, method)(f"/pledges/FES48000001/notes/{note_id}")
        assert response.status_code in (401, 404, 405)


def test_an_empty_note_is_refused(loaded: ApiClient) -> None:
    assert loaded.post("/pledges/FES48000001/notes", json={"text": ""}).status_code == 422


def test_an_overlong_note_is_refused(loaded: ApiClient) -> None:
    response = loaded.post("/pledges/FES48000001/notes", json={"text": "x" * 2001})
    assert response.status_code == 422


def test_a_note_on_an_unknown_application_is_a_404(loaded: ApiClient) -> None:
    assert loaded.post("/pledges/NOPE/notes", json={"text": "hi"}).status_code == 404


def test_the_note_body_never_reaches_the_audit_log(loaded: ApiClient) -> None:
    """Notes quote donor conversations, so the text is PII."""
    loaded.post(
        "/pledges/FES48000001/notes",
        json={"text": "Donor Marisol said her card ends 2906"},
    )
    audit = loaded.json("/audit")
    assert all("Marisol" not in a["detail"] for a in audit)
    assert all("2906" not in a["detail"] for a in audit)
