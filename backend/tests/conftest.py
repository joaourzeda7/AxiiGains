"""Configuração compartilhada dos testes.

As variáveis de ambiente são definidas ANTES de importar o app: o config.py lê tudo na
importação. Assim os testes usam um banco temporário, sem Gemini e sem tocar no seu .env
(o load_dotenv não sobrescreve variáveis que já existem).
"""
import os
import tempfile

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="axiigains-test-")
os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "chave-de-teste-" + "x" * 40
os.environ["GEMINI_API_KEY"] = ""
os.environ["REGISTRATION_CODE"] = ""

import itertools  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.ratelimit import ALL_LIMITERS  # noqa: E402

PASSWORD = "senha-forte-123"
_emails = itertools.count(1)


@pytest.fixture(scope="session")
def client():
    # O "with" dispara o lifespan do app, que roda as migrações no banco de teste
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_state(client):
    """Cada teste começa com o banco vazio e os limites de requisição zerados."""
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    for limiter in ALL_LIMITERS:
        limiter.reset()


@pytest.fixture
def register(client):
    """Cria um usuário e devolve (headers de autenticação, dados do usuário)."""

    def _register(name="João", email=None, password=PASSWORD):
        email = email or f"user{next(_emails)}@teste.com"
        r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
        assert r.status_code == 201, r.text
        body = r.json()
        return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]

    return _register


@pytest.fixture
def auth(register):
    """Headers de um usuário já logado (o caso mais comum nos testes)."""
    headers, _ = register()
    return headers


@pytest.fixture
def make_plan(client):
    def _make_plan(headers, name="Treino A", exercises=None):
        exercises = exercises if exercises is not None else [
            {"name": "Supino", "sets": series(("8-12", 40), ("8-12", 40), ("8-12", 40)), "rest_seconds": 90}
        ]
        r = client.post("/api/plans", headers=headers, json={"name": name, "exercises": exercises})
        assert r.status_code == 201, r.text
        return r.json()

    return _make_plan


@pytest.fixture
def make_session(client):
    def _make_session(headers, date, sets, plan=None):
        payload = {
            "plan_id": plan["id"] if plan else None,
            "plan_name": plan["name"] if plan else "Treino livre",
            "date": str(date),
            "sets": sets,
        }
        r = client.post("/api/sessions", headers=headers, json=payload)
        assert r.status_code == 201, r.text
        return r.json()

    return _make_session


def series(*pairs):
    """series(("12", 40), ("10", 45)) → séries planejadas de um exercício da ficha."""
    return [{"reps": reps, "weight": weight} for reps, weight in pairs]


def sets_of(exercise, *pairs):
    """sets_of("Supino", (10, 40), (8, 45)) → lista de séries (reps, carga)."""
    return [
        {"exercise_name": exercise, "set_number": i, "reps": reps, "weight": weight}
        for i, (reps, weight) in enumerate(pairs, start=1)
    ]
