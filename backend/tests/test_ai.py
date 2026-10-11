"""Sugestão de treino por IA. O Gemini é substituído por um "dublê" (fake):
os testes não dependem de internet nem gastam a cota gratuita."""
from types import SimpleNamespace

import pytest
from google.genai import errors

from app.routers import ai as ai_router
from app.schemas import AISuggestOut

REQUEST = {"goal": "hipertrofia", "level": "iniciante", "days_per_week": 3}
PRIMARY, FALLBACK_1, FALLBACK_2 = "modelo-principal", "reserva-1", "reserva-2"

PLAN = AISuggestOut(
    summary="Divisão ABC.",
    plans=[{"name": "Treino A — Peito", "exercises": [{"name": "Supino", "sets": 3, "reps": "10", "rest_seconds": 60}]}],
    tips=["Aqueça antes."],
)


def api_error(code):
    return errors.APIError(code, {"error": {"message": f"erro {code}"}})


class FakeGemini:
    """Imita o cliente do Gemini. `script` diz o que cada modelo responde, em ordem:
    {"modelo": [api_error(503), PLAN]} → 1ª chamada falha com 503, 2ª devolve o plano.
    O último item se repete se houver mais chamadas."""

    def __init__(self, script):
        self.script = script
        self.calls = []  # (modelo, kwargs) de cada chamada
        self.models = SimpleNamespace(generate_content=self._generate)

    def _generate(self, model, **kwargs):
        self.calls.append((model, kwargs))
        answers = self.script.get(model, [api_error(404)])
        answer = answers[min(sum(m == model for m, _ in self.calls) - 1, len(answers) - 1)]
        if isinstance(answer, Exception):
            raise answer
        return SimpleNamespace(parsed=answer)

    @property
    def models_called(self):
        return [m for m, _ in self.calls]


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setattr(ai_router, "GEMINI_MODEL", PRIMARY)
    monkeypatch.setattr(ai_router, "GEMINI_FALLBACK_MODELS", [FALLBACK_1, FALLBACK_2])
    monkeypatch.setattr(ai_router, "RETRY_DELAY_SECONDS", 0)  # testes não esperam de verdade

    def _install(script):
        fake = FakeGemini(script)
        monkeypatch.setattr(ai_router, "_get_client", lambda: fake)
        return fake

    return _install


def suggest(client, auth, **changes):
    return client.post("/api/ai/suggest", headers=auth, json={**REQUEST, **changes})


def test_without_api_key_returns_clear_error(client, auth):
    r = suggest(client, auth)
    assert r.status_code == 503
    assert "GEMINI_API_KEY" in r.json()["detail"]


def test_suggest_returns_structured_plan(client, auth, gemini):
    fake = gemini({PRIMARY: [PLAN]})
    r = suggest(client, auth, notes="dor no joelho")
    assert r.status_code == 200
    assert r.json()["plans"][0]["name"] == "Treino A — Peito"
    assert fake.models_called == [PRIMARY]

    # conferimos o que foi enviado ao Gemini
    call = fake.calls[0][1]
    assert call["config"].response_schema is AISuggestOut  # resposta em JSON estruturado
    assert "dor no joelho" in call["contents"]


def test_overloaded_model_is_retried_once(client, auth, gemini):
    # "This model is currently experiencing high demand" costuma passar em segundos
    fake = gemini({PRIMARY: [api_error(503), PLAN]})
    assert suggest(client, auth).status_code == 200
    assert fake.models_called == [PRIMARY, PRIMARY]


def test_falls_back_when_main_model_stays_overloaded(client, auth, gemini):
    fake = gemini({PRIMARY: [api_error(503)], FALLBACK_1: [PLAN]})
    assert suggest(client, auth).status_code == 200
    assert fake.models_called == [PRIMARY, PRIMARY, FALLBACK_1]


def test_quota_exhausted_goes_straight_to_fallback(client, auth, gemini):
    # cota é por modelo: não adianta insistir no mesmo, mas o reserva tem a dele
    fake = gemini({PRIMARY: [api_error(429)], FALLBACK_1: [PLAN]})
    assert suggest(client, auth).status_code == 200
    assert fake.models_called == [PRIMARY, FALLBACK_1]


def test_unavailable_model_is_skipped(client, auth, gemini):
    fake = gemini({PRIMARY: [api_error(404)], FALLBACK_1: [api_error(404)], FALLBACK_2: [PLAN]})
    assert suggest(client, auth).status_code == 200
    assert fake.models_called == [PRIMARY, FALLBACK_1, FALLBACK_2]


def test_invalid_key_stops_immediately(client, auth, gemini):
    fake = gemini({PRIMARY: [api_error(403)], FALLBACK_1: [PLAN]})
    r = suggest(client, auth)
    assert r.status_code == 503 and "chave" in r.json()["detail"]
    assert fake.models_called == [PRIMARY]  # outro modelo não resolveria chave errada


@pytest.mark.parametrize(
    "code, expected",
    [(503, "sobrecarregado"), (500, "sobrecarregado"), (429, "Limite gratuito"), (404, "Nenhum modelo")],
)
def test_message_when_every_model_fails(client, auth, gemini, code, expected):
    gemini({PRIMARY: [api_error(code)], FALLBACK_1: [api_error(code)], FALLBACK_2: [api_error(code)]})
    r = suggest(client, auth)
    assert r.status_code == 503
    assert expected in r.json()["detail"]


def test_empty_answer_tries_next_model(client, auth, gemini):
    empty = AISuggestOut(summary="", plans=[], tips=[])
    fake = gemini({PRIMARY: [empty], FALLBACK_1: [PLAN]})
    assert suggest(client, auth).status_code == 200
    assert fake.models_called == [PRIMARY, FALLBACK_1]


def test_only_empty_answers_returns_502(client, auth, gemini):
    empty = AISuggestOut(summary="", plans=[], tips=[])
    gemini({PRIMARY: [empty], FALLBACK_1: [empty], FALLBACK_2: [empty]})
    assert suggest(client, auth).status_code == 502


def test_failures_are_logged_with_the_real_error(client, auth, gemini, caplog):
    gemini({PRIMARY: [api_error(503)], FALLBACK_1: [PLAN]})
    with caplog.at_level("WARNING", logger="axiigains.ai"):
        suggest(client, auth)
    assert "503" in caplog.text and PRIMARY in caplog.text
    assert f"modelo reserva {FALLBACK_1}" in caplog.text


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
