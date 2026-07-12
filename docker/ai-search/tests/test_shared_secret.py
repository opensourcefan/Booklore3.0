"""Tests for optional AI Search shared-secret middleware."""

import os

from fastapi.testclient import TestClient


def test_v1_open_when_secret_unset(monkeypatch):
    monkeypatch.delenv("AI_SEARCH_SHARED_SECRET", raising=False)
    # Re-import is awkward; instead patch the module attribute after import.
    import app as ai_app

    monkeypatch.setattr(ai_app, "SHARED_SECRET", "")
    client = TestClient(ai_app.app)
    # /health always open
    resp = client.get("/health")
    assert resp.status_code == 200
    # /v1 without secret when unset should not 401 (may 4xx/5xx for other reasons)
    resp = client.post("/v1/search", json={})
    assert resp.status_code != 401


def test_v1_requires_secret_when_configured(monkeypatch):
    import app as ai_app

    monkeypatch.setattr(ai_app, "SHARED_SECRET", "test-secret-value")
    client = TestClient(ai_app.app)

    denied = client.post("/v1/search", json={})
    assert denied.status_code == 401

    wrong = client.post(
        "/v1/search",
        json={},
        headers={"X-Fable-Ai-Search-Secret": "wrong"},
    )
    assert wrong.status_code == 401

    allowed = client.post(
        "/v1/search",
        json={},
        headers={"X-Fable-Ai-Search-Secret": "test-secret-value"},
    )
    # Authenticated past middleware; missing query still fails validation (400)
    assert allowed.status_code != 401

    # Health stays open without header
    health = client.get("/health")
    assert health.status_code == 200
