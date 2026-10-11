"""Proteções gerais: limites de requisição, cabeçalhos, arquivos estáticos e produção."""
import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.main import static_file_for
from app.routers import ai as ai_router
from tests.conftest import PASSWORD

BACKEND_DIR = Path(__file__).resolve().parent.parent


# ---------- limites de requisição (força bruta e cota da IA) ----------

def test_login_is_rate_limited(client, register):
    register(email="alvo@teste.com")
    for _ in range(10):
        r = client.post("/api/auth/login", data={"username": "alvo@teste.com", "password": "chute"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", data={"username": "alvo@teste.com", "password": PASSWORD})
    # até a senha certa é bloqueada: senão o atacante saberia que acertou
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_register_is_rate_limited(client):
    for i in range(5):
        r = client.post("/api/auth/register", json={"name": "A", "email": f"spam{i}@x.com", "password": PASSWORD})
        assert r.status_code == 201
    r = client.post("/api/auth/register", json={"name": "A", "email": "spam9@x.com", "password": PASSWORD})
    assert r.status_code == 429


def test_ai_is_rate_limited_per_user(client, register, monkeypatch):
    monkeypatch.setattr(ai_router, "GEMINI_API_KEY", "")  # sem chave: responde 503, mas conta no limite
    user_a, _ = register()
    user_b, _ = register()
    body = {"goal": "forca", "level": "iniciante", "days_per_week": 3}
    for _ in range(8):
        assert client.post("/api/ai/suggest", headers=user_a, json=body).status_code == 503
    assert client.post("/api/ai/suggest", headers=user_a, json=body).status_code == 429
    # o limite é por pessoa: outro usuário continua liberado
    assert client.post("/api/ai/suggest", headers=user_b, json=body).status_code == 503


# ---------- cabeçalhos de segurança ----------

def test_security_headers_on_api(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Cache-Control"] == "no-store"
    csp = r.headers["Content-Security-Policy"]
    assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp
    assert "Strict-Transport-Security" not in r.headers  # só em HTTPS


def test_hsts_only_on_https(client):
    r = client.get("https://testserver/api/health")
    assert "max-age=" in r.headers["Strict-Transport-Security"]


def test_unknown_api_route_is_404_json(client):
    r = client.get("/api/nao-existe")
    assert r.status_code == 404


# ---------- arquivos estáticos (path traversal) ----------

@pytest.fixture
def dist(tmp_path):
    root = tmp_path / "dist"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<html></html>")
    (root / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "segredo.env").write_text("SECRET_KEY=123")
    return root.resolve()


def test_static_serves_files_inside_dist(dist):
    assert static_file_for("assets/app.js", dist) == dist / "assets" / "app.js"
    assert static_file_for("index.html", dist) == dist / "index.html"


@pytest.mark.parametrize(
    "path",
    ["", "assets", "nao-existe.js", "../segredo.env", "assets/../../segredo.env", str(BACKEND_DIR / ".env.example")],
)
def test_static_never_leaves_dist(dist, path):
    assert static_file_for(path, dist) is None


# ---------- configuração de produção ----------

def _import_config(**env):
    """Importa app.config num processo novo, com as variáveis de ambiente dadas."""
    clean_env = {k: v for k, v in os.environ.items() if k not in ("SECRET_KEY", "APP_ENV")}
    return subprocess.run(
        [sys.executable, "-c", "import app.config"],
        cwd=BACKEND_DIR,
        env={**clean_env, **env},
        capture_output=True,
        text=True,
    )


@pytest.mark.parametrize("secret", ["", "troque_por_uma_string_aleatoria_longa", "curta"])
def test_production_refuses_to_start_without_a_strong_secret(secret):
    result = _import_config(APP_ENV="production", SECRET_KEY=secret)
    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_production_starts_with_a_strong_secret():
    assert _import_config(APP_ENV="production", SECRET_KEY="k" * 48).returncode == 0


def test_pasted_secrets_are_cleaned():
    """Valor colado com espaços, quebra de linha ou aspas (ex.: no painel do Railway) ainda funciona."""
    result = subprocess.run(
        [sys.executable, "-c", "import app.config as c; print(repr(c.GEMINI_API_KEY), repr(c.SECRET_KEY))"],
        cwd=BACKEND_DIR,
        env={**os.environ, "GEMINI_API_KEY": '  "AIzaChave123"\n', "SECRET_KEY": " 'k" + "x" * 40 + "'\n"},
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == "'AIzaChave123' 'k" + "x" * 40 + "'"
