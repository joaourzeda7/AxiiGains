"""Fichas de treino: CRUD, validação e isolamento entre usuários."""
import pytest

from tests.conftest import sets_of


def test_create_and_get_plan_keeps_exercise_order(client, auth, make_plan):
    plan = make_plan(auth, exercises=[{"name": "Supino"}, {"name": "Crucifixo"}, {"name": "Tríceps"}])
    assert [e["name"] for e in plan["exercises"]] == ["Supino", "Crucifixo", "Tríceps"]
    assert [e["position"] for e in plan["exercises"]] == [0, 1, 2]
    # valores padrão
    assert plan["exercises"][0]["sets"] == 3 and plan["exercises"][0]["reps"] == "10"

    r = client.get(f"/api/plans/{plan['id']}", headers=auth)
    assert r.status_code == 200 and r.json() == plan


def test_list_plans_sorted_by_name(client, auth, make_plan):
    make_plan(auth, name="Treino C")
    make_plan(auth, name="Treino A")
    make_plan(auth, name="Treino B")
    names = [p["name"] for p in client.get("/api/plans", headers=auth).json()]
    assert names == ["Treino A", "Treino B", "Treino C"]


def test_update_replaces_exercises(client, auth, make_plan):
    plan = make_plan(auth, exercises=[{"name": "Supino"}, {"name": "Crucifixo"}])
    r = client.put(
        f"/api/plans/{plan['id']}",
        headers=auth,
        json={"name": "Treino A — Peito", "notes": "foco", "exercises": [{"name": "Supino inclinado", "weight": 30}]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Treino A — Peito" and body["notes"] == "foco"
    assert [e["name"] for e in body["exercises"]] == ["Supino inclinado"]


def test_delete_plan_keeps_workout_history(client, auth, make_plan, make_session):
    plan = make_plan(auth)
    make_session(auth, "2026-10-01", sets_of("Supino", (10, 40)), plan=plan)

    assert client.delete(f"/api/plans/{plan['id']}", headers=auth).status_code == 204
    assert client.get(f"/api/plans/{plan['id']}", headers=auth).status_code == 404

    history = client.get("/api/sessions", headers=auth).json()
    assert len(history) == 1
    assert history[0]["plan_id"] is None  # ON DELETE SET NULL
    assert history[0]["plan_name"] == plan["name"]


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": "x" * 81},
        {"name": "A", "notes": "x" * 1001},
        {"name": "A", "exercises": [{"name": ""}]},
        {"name": "A", "exercises": [{"name": "Supino", "sets": 0}]},
        {"name": "A", "exercises": [{"name": "Supino", "sets": 21}]},
        {"name": "A", "exercises": [{"name": "Supino", "weight": -5}]},
        {"name": "A", "exercises": [{"name": "Supino", "rest_seconds": 901}]},
        {"name": "A", "exercises": [{"name": f"Ex {i}"} for i in range(41)]},
    ],
)
def test_plan_validation(client, auth, payload):
    assert client.post("/api/plans", headers=auth, json=payload).status_code == 422


def test_plans_require_login(client):
    assert client.get("/api/plans").status_code == 401
    assert client.post("/api/plans", json={"name": "A"}).status_code == 401


def test_user_cannot_see_or_change_someone_elses_plan(client, register, make_plan):
    """IDOR: trocar o número na URL não pode dar acesso aos dados de outra pessoa."""
    owner, _ = register()
    intruder, _ = register()
    plan = make_plan(owner)
    url = f"/api/plans/{plan['id']}"

    assert client.get(url, headers=intruder).status_code == 404
    assert client.put(url, headers=intruder, json={"name": "hackeado"}).status_code == 404
    assert client.delete(url, headers=intruder).status_code == 404
    assert client.get("/api/plans", headers=intruder).json() == []
    # a ficha continua intacta para o dono
    assert client.get(url, headers=owner).json()["name"] == plan["name"]


def test_unknown_plan_returns_404(client, auth):
    assert client.get("/api/plans/999999", headers=auth).status_code == 404
