"""Sugestão de treino por IA. O Gemini é substituído por um "dublê" (fake):
os testes não dependem de internet nem gastam a cota gratuita."""
from types import SimpleNamespace

import pytest
from google.genai import errors

from app.routers import ai as ai_router
from app.schemas import AISuggestOut

REQUEST = {"goal": "hipertrofia", "level": "iniciante", "days_per_week": 3}

PLAN = AISuggestOut(
    summary="Divisão ABC.",
    plans=[{"name": "Treino A — Peito", "exercises": [{"name": "Supino", "sets": 3, "reps": "10", "rest_seconds": 60}]}],
    tips=["Aqueça antes."],
)


class FakeGemini:
    """Imita o cliente do Gemini: guarda a chamada e devolve o que mandarmos."""

    def __init__(self, parsed=None, error=None):
        self.calls = []
        self.models = SimpleNamespace(generate_content=self._generate)
        self._parsed, self._error = parsed, error

    def _generate(self, **kwargs):
        self.calls.append(kwargs)
        if self._error:
            raise self._error
        return SimpleNamespace(parsed=self._parsed)


@pytest.fixture
def gemini(monkeypatch):
    def _install(**kwargs):
        fake = FakeGemini(**kwargs)
        monkeypatch.setattr(ai_router, "_get_client", lambda: fake)
        return fake

    return _install


def test_without_api_key_returns_clear_error(client, auth):
    r = client.post("/api/ai/suggest", headers=auth, json=REQUEST)
    assert r.status_code == 503
    assert "GEMINI_API_KEY" in r.json()["detail"]


def test_suggest_returns_structured_plan(client, auth, gemini):
    fake = gemini(parsed=PLAN)
    r = client.post("/api/ai/suggest", headers=auth, json={**REQUEST, "notes": "dor no joelho"})
    assert r.status_code == 200
    assert r.json()["plans"][0]["name"] == "Treino A — Peito"

    # conferimos o que foi enviado ao Gemini
    call = fake.calls[0]
    assert call["config"].response_schema is AISuggestOut  # resposta em JSON estruturado
    assert "dor no joelho" in call["contents"]
    assert "3" in call["contents"]


@pytest.mark.parametrize(
    "code, expected",
    [(429, "Limite gratuito"), (403, "chave"), (404, "Modelo"), (500, "indisponível")],
)
def test_gemini_errors_become_friendly_messages(client, auth, gemini, code, expected):
    gemini(error=errors.APIError(code, {"error": {"message": "x"}}))
    r = client.post("/api/ai/suggest", headers=auth, json=REQUEST)
    assert r.status_code == 503
    assert expected in r.json()["detail"]


def test_empty_answer_from_gemini_is_handled(client, auth, gemini):
    gemini(parsed=AISuggestOut(summary="", plans=[], tips=[]))
    assert client.post("/api/ai/suggest", headers=auth, json=REQUEST).status_code == 502


@pytest.mark.parametrize(
    "payload",
    [
        {**REQUEST, "goal": "virar bruxo"},
        {**REQUEST, "days_per_week": 0},
        {**REQUEST, "notes": "x" * 501},
        {**REQUEST, "session_minutes": 500},
    ],
)
def test_suggest_validation(client, auth, payload):
    assert client.post("/api/ai/suggest", headers=auth, json=payload).status_code == 422


def test_suggest_requires_login(client):
    assert client.post("/api/ai/suggest", json=REQUEST).status_code == 401
