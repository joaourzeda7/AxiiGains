"""Painel de admin: só quem está em ADMIN_EMAILS acessa."""
from datetime import date, timedelta

import pytest

from app import config
from tests.conftest import sets_of

ADMIN = "dono@axiigains.com"


@pytest.fixture
def admin_headers(register, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_EMAILS", {ADMIN})
    headers, _ = register(name="Dono", email=ADMIN)
    return headers


def test_regular_user_gets_403(client, auth, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_EMAILS", {ADMIN})
    assert client.get("/api/admin/overview", headers=auth).status_code == 403


def test_not_logged_in_gets_401(client):
    assert client.get("/api/admin/overview").status_code == 401


def test_nobody_is_admin_when_variable_is_empty(client, register, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_EMAILS", set())
    headers, _ = register(email=ADMIN)
    assert client.get("/api/admin/overview", headers=headers).status_code == 403


def test_me_tells_the_frontend_who_is_admin(client, admin_headers, auth):
    assert client.get("/api/auth/me", headers=admin_headers).json()["is_admin"] is True
    assert client.get("/api/auth/me", headers=auth).json()["is_admin"] is False


def test_admin_cannot_be_gained_by_editing_profile(client, auth, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_EMAILS", {ADMIN})
    client.patch("/api/auth/me", headers=auth, json={"email": ADMIN, "is_admin": True})
    assert client.get("/api/admin/overview", headers=auth).status_code == 403


def test_overview_counts_users_plans_and_sessions(client, admin_headers, register, make_plan, make_session):
    ana, _ = register(name="Ana", email="ana@teste.com")
    register(name="Bia", email="bia@teste.com")  # cadastrou e nunca treinou
    make_plan(ana)
    make_plan(ana, name="Treino B")
    recent = date.today() - timedelta(days=2)
    make_session(ana, date.today() - timedelta(days=30), sets_of("Supino", (10, 40)))
    make_session(ana, recent, sets_of("Supino", (10, 42.5)))

    r = client.get("/api/admin/overview", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total_users"] == 3
    assert body["active_last_7_days"] == 1
    assert body["total_sessions"] == 2

    by_email = {u["email"]: u for u in body["users"]}
    assert by_email["ana@teste.com"] == {
        **by_email["ana@teste.com"],
        "name": "Ana",
        "plans_count": 2,
        "sessions_count": 2,
        "last_session": str(recent),
    }
    assert by_email["bia@teste.com"]["sessions_count"] == 0
    assert by_email["bia@teste.com"]["last_session"] is None
    # mais recentes primeiro
    assert body["users"][0]["email"] == "bia@teste.com"


def test_overview_never_exposes_passwords(client, admin_headers):
    text = client.get("/api/admin/overview", headers=admin_headers).text
    assert "password" not in text and "$2b$" not in text
