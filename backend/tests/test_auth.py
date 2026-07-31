def test_missing_header_is_401(client):
    assert client.get("/pledges").status_code == 401


def test_wrong_token_is_401(client):
    resp = client.get("/pledges", headers={"Authorization": "Bearer wrong-key"})
    assert resp.status_code == 401


def test_non_bearer_scheme_is_401(client):
    resp = client.get("/pledges", headers={"Authorization": "Basic dGVzdA=="})
    assert resp.status_code == 401


def test_empty_token_is_401(client):
    resp = client.get("/pledges", headers={"Authorization": "Bearer"})
    assert resp.status_code == 401


def test_valid_token_passes_auth(client, auth_headers):
    # /pledges is not implemented yet, so passing auth means 404, not 401.
    assert client.get("/pledges", headers=auth_headers).status_code == 404


def test_bearer_scheme_is_case_insensitive(client):
    resp = client.get("/pledges", headers={"Authorization": "bearer test-api-key"})
    assert resp.status_code == 404


def test_401_body_has_no_detail_about_the_key(client):
    body = client.get("/pledges").json()
    assert body == {"detail": "Unauthorized"}


def test_health_is_reachable_without_auth(client):
    # Probe endpoint: must not 401. (It may 503 — no DB in tests.)
    assert client.get("/health").status_code != 401
