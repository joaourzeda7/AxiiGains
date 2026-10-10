"""Cadastro, login, perfil e validação de tokens."""
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.config import SECRET_KEY
from app.routers import auth as auth_router
from tests.conftest import PASSWORD


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login", data={"username": email, "password": password})


# ---------- cadastro ----------

def test_register_returns_token_and_normalizes_email(client):
    r = client.post(
        "/api/auth/register",
        json={"name": "  Ana  ", "email": "  Ana@Email.COM ", "password": PASSWORD},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "ana@email.com"
    assert body["user"]["name"] == "Ana"
    assert "password_hash" not in body["user"]  # o hash nunca sai da API


def test_register_duplicate_email_is_rejected(client, register):
    register(email="dup@teste.com")
    r = client.post("/api/auth/register", json={"name": "X", "email": "DUP@teste.com", "password": PASSWORD})
    assert r.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "A", "email": "sem-arroba", "password": PASSWORD},
        {"name": "A", "email": "a@semponto", "password": PASSWORD},
        {"name": "A", "email": "a@b.com", "password": "curta"},
        {"name": "   ", "email": "a@b.com", "password": PASSWORD},
        {"name": "A", "email": "a@b.com", "password": "x" * 73},
    ],
)
def test_register_validation(client, payload):
    assert client.post("/api/auth/register", json=payload).status_code == 422


def test_password_over_72_bytes_is_rejected_not_a_server_error(client):
    # 40 "ç" = 40 caracteres, mas 80 bytes: passaria no limite de caracteres
    # e quebraria o bcrypt (erro 500) se não houvesse a validação por bytes
    r = client.post("/api/auth/register", json={"name": "A", "email": "a@b.com", "password": "ç" * 40})
    assert r.status_code == 422


def test_password_is_stored_hashed(client, register):
    from app.database import SessionLocal
    from app.models import User

    _, user = register(email="hash@teste.com")
    with SessionLocal() as db:
        stored = db.get(User, user["id"]).password_hash
    assert stored != PASSWORD and stored.startswith("$2")  # formato bcrypt


# ---------- código de convite ----------

def test_invite_code_required_when_configured(client, monkeypatch):
    monkeypatch.setattr(auth_router, "REGISTRATION_CODE", "lobo-branco")
    assert client.get("/api/auth/register-info").json() == {"invite_required": True}

    base = {"name": "A", "email": "a@b.com", "password": PASSWORD}
    assert client.post("/api/auth/register", json=base).status_code == 403
    assert client.post("/api/auth/register", json={**base, "invite_code": "errado"}).status_code == 403
    assert client.post("/api/auth/register", json={**base, "invite_code": " lobo-branco "}).status_code == 201


def test_invite_code_not_required_by_default(client):
    assert client.get("/api/auth/register-info").json() == {"invite_required": False}


# ---------- login ----------

def test_login_success_is_case_insensitive(client, register):
    register(email="login@teste.com")
    r = login(client, "LOGIN@Teste.com")
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "login@teste.com"


def test_wrong_password_and_unknown_email_give_the_same_answer(client, register):
    register(email="existe@teste.com")
    wrong_password = login(client, "existe@teste.com", "senha-errada")
    unknown_email = login(client, "nao-existe@teste.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    # mesma mensagem: não dá para descobrir quais e-mails têm conta
    assert wrong_password.json() == unknown_email.json()


# ---------- tokens ----------

def _token(**claims):
    payload = {"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(days=1), **claims}
    return jwt.encode({k: v for k, v in payload.items() if v is not None}, SECRET_KEY, algorithm="HS256")


@pytest.mark.parametrize(
    "header",
    [
        None,
        "Bearer lixo",
        "Bearer " + _token(exp=datetime.now(timezone.utc) - timedelta(minutes=1)),  # expirado
        "Bearer " + _token(exp=None),  # sem validade
        "Bearer " + _token(sub="abc"),  # sub não numérico
        "Bearer " + _token(sub="999999"),  # usuário inexistente
        "Bearer " + jwt.encode({"sub": "1", "exp": 9999999999}, "outra-chave-qualquer-com-32-caracteres", algorithm="HS256"),
        # o clássico "alg: none" (token sem assinatura)
        "Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxIiwiZXhwIjo5OTk5OTk5OTk5fQ.",
    ],
)
def test_invalid_tokens_are_rejected(client, header):
    headers = {"Authorization": header} if header else {}
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_valid_token_returns_profile(client, register):
    headers, user = register(name="Ciri")
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200 and r.json()["name"] == "Ciri"


# ---------- perfil ----------

def test_update_profile_partial(client, auth):
    r = client.patch("/api/auth/me", headers=auth, json={"goal": "forca", "days_per_week": 4})
    assert r.status_code == 200
    assert r.json()["goal"] == "forca" and r.json()["days_per_week"] == 4
    # só os campos enviados mudam
    r = client.patch("/api/auth/me", headers=auth, json={"level": "avancado"})
    assert r.json()["goal"] == "forca" and r.json()["level"] == "avancado"


@pytest.mark.parametrize("payload", [{"goal": "voar"}, {"days_per_week": 8}, {"days_per_week": 0}, {"level": "deus"}])
def test_update_profile_validation(client, auth, payload):
    assert client.patch("/api/auth/me", headers=auth, json=payload).status_code == 422


def test_profile_cannot_change_email_or_password(client, auth):
    r = client.patch("/api/auth/me", headers=auth, json={"email": "hacker@x.com", "password_hash": "x"})
    assert r.status_code == 200
    assert r.json()["email"] != "hacker@x.com"
