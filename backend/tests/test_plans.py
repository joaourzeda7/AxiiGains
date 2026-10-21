"""Fichas de treino: CRUD, validação e isolamento entre usuários."""
import pytest

from tests.conftest import series, sets_of

ONE = series(("10", None))  # uma série simples, para testes que não ligam para as séries


def test_create_and_get_plan_keeps_exercise_order(client, auth, make_plan):
    plan = make_plan(auth, exercises=[{"name": n, "sets": ONE} for n in ("Supino", "Crucifixo", "Tríceps")])
    assert [e["name"] for e in plan["exercises"]] == ["Supino", "Crucifixo", "Tríceps"]
    assert [e["position"] for e in plan["exercises"]] == [0, 1, 2]

    r = client.get(f"/api/plans/{plan['id']}", headers=auth)
    assert r.status_code == 200 and r.json() == plan


def test_list_plans_sorted_by_name(client, auth, make_plan):
    make_plan(auth, name="Treino C")
    make_plan(auth, name="Treino A")
    make_plan(auth, name="Treino B")
    names = [p["name"] for p in client.get("/api/plans", headers=auth).json()]
    assert names == ["Treino A", "Treino B", "Treino C"]


def test_update_replaces_exercises(client, auth, make_plan):
    plan = make_plan(auth, exercises=[{"name": "Supino", "sets": ONE}, {"name": "Crucifixo", "sets": ONE}])
    r = client.put(
        f"/api/plans/{plan['id']}",
        headers=auth,
        json={
            "name": "Treino A — Peito",
            "notes": "foco",
            "exercises": [{"name": "Supino inclinado", "sets": series(("10", 30))}],
        },
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
        {"name": "A", "exercises": [{"name": "", "sets": ONE}]},
        {"name": "A", "exercises": [{"name": "Supino"}]},  # sem séries
        {"name": "A", "exercises": [{"name": "Supino", "sets": []}]},
        {"name": "A", "exercises": [{"name": "Supino", "sets": ONE * 21}]},
        {"name": "A", "exercises": [{"name": "Supino", "sets": series(("10", -5))}]},
        {"name": "A", "exercises": [{"name": "Supino", "sets": series(("", 40))}]},
        {"name": "A", "exercises": [{"name": "Supino", "sets": ONE, "rest_seconds": 901}]},
        {"name": "A", "exercises": [{"name": f"Ex {i}", "sets": ONE} for i in range(41)]},
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


def test_each_set_keeps_its_own_reps_and_weight(client, auth, make_plan):
    """Pirâmide: cada série com reps e carga diferentes, na ordem em que foram enviadas."""
    pyramid = series(("12", 40), ("10", 45), ("8", 50), ("6-8", 52.5))
    plan = make_plan(auth, exercises=[{"name": "Supino", "sets": pyramid, "rest_seconds": 120}])
    saved = client.get(f"/api/plans/{plan['id']}", headers=auth).json()["exercises"][0]
    assert saved["sets"] == pyramid
    assert saved["rest_seconds"] == 120


def test_update_replaces_sets_too(client, auth, make_plan):
    plan = make_plan(auth, exercises=[{"name": "Supino", "sets": series(("10", 40), ("10", 40))}])
    r = client.put(
        f"/api/plans/{plan['id']}",
        headers=auth,
        json={"name": plan["name"], "exercises": [{"name": "Supino", "sets": series(("8", 50))}]},
    )
    assert r.json()["exercises"][0]["sets"] == series(("8", 50))
