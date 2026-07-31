import psycopg


def test_health_ok_returns_table_count(client, monkeypatch):
    monkeypatch.setattr("app.routes.health.count_public_tables", lambda settings: 32)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "database": "reachable", "tables": 32}


def test_health_db_down_is_503_without_error_details(client, monkeypatch):
    leaky_error = 'connection to "db.invalid" failed: password "secret-password" rejected'

    def boom(settings):
        raise psycopg.OperationalError(leaky_error)

    monkeypatch.setattr("app.routes.health.count_public_tables", boom)
    resp = client.get("/health")
    assert resp.status_code == 503
    assert resp.json() == {"status": "unavailable"}
    assert "secret-password" not in resp.text
    assert "db.invalid" not in resp.text


def test_health_unexpected_error_is_also_contained(client, monkeypatch):
    def boom(settings):
        raise RuntimeError("stack detail that must not leak")

    monkeypatch.setattr("app.routes.health.count_public_tables", boom)
    resp = client.get("/health")
    assert resp.status_code == 503
    assert "stack detail" not in resp.text
