"""Treinos realizados e medidas corporais."""
from datetime import date, timedelta

import pytest

from tests.conftest import sets_of


# ---------- treinos ----------

def test_create_session_and_list_newest_first(client, auth, make_plan, make_session):
    plan = make_plan(auth)
    make_session(auth, "2026-09-01", sets_of("Supino", (10, 40)), plan=plan)
    make_session(auth, "2026-09-15", sets_of("Supino", (8, 45), (8, 45)), plan=plan)

    sessions = client.get("/api/sessions", headers=auth).json()
    assert [s["date"] for s in sessions] == ["2026-09-15", "2026-09-01"]
    assert len(sessions[0]["sets"]) == 2


def test_session_without_plan_is_allowed(client, auth, make_session):
    s = make_session(auth, "2026-09-01", sets_of("Corrida", (1, 0)))
    assert s["plan_id"] is None


@pytest.mark.parametrize(
    "changes",
    [
        {"sets": []},  # treino sem nenhuma série
        {"date": str(date.today() + timedelta(days=5))},  # no futuro
        {"date": "1999-12-31"},  # antigo demais
        {"date": "2026-02-30"},  # data que não existe
        {"notes": "x" * 1001},
        {"sets": [{"exercise_name": "Supino", "set_number": 1, "reps": -1, "weight": 40}]},
        {"sets": [{"exercise_name": "Supino", "set_number": 1, "reps": 10, "weight": 5000}]},
    ],
)
def test_session_validation(client, auth, changes):
    payload = {"plan_name": "Treino", "date": "2026-09-01", "sets": sets_of("Supino", (10, 40)), **changes}
    assert client.post("/api/sessions", headers=auth, json=payload).status_code == 422


def test_session_date_accepts_tomorrow_because_of_timezones(client, auth, make_session):
    # À noite no Brasil o servidor (UTC) já pode estar no dia seguinte e vice-versa
    make_session(auth, date.today() + timedelta(days=1), sets_of("Supino", (10, 40)))


def test_cannot_log_session_on_someone_elses_plan(client, register, make_plan):
    owner, _ = register()
    intruder, _ = register()
    plan = make_plan(owner)
    payload = {"plan_id": plan["id"], "plan_name": "x", "date": "2026-09-01", "sets": sets_of("A", (1, 1))}
    assert client.post("/api/sessions", headers=intruder, json=payload).status_code == 404


def test_cannot_delete_someone_elses_session(client, register, make_session):
    owner, _ = register()
    intruder, _ = register()
    session = make_session(owner, "2026-09-01", sets_of("Supino", (10, 40)))
    assert client.delete(f"/api/sessions/{session['id']}", headers=intruder).status_code == 404
    assert client.delete(f"/api/sessions/{session['id']}", headers=owner).status_code == 204
    assert client.get("/api/sessions", headers=owner).json() == []


def test_sessions_list_limit(client, auth, make_session):
    for day in range(1, 6):
        make_session(auth, f"2026-09-0{day}", sets_of("Supino", (10, 40)))
    assert len(client.get("/api/sessions?limit=3", headers=auth).json()) == 3
    assert client.get("/api/sessions?limit=0", headers=auth).status_code == 422


# ---------- medidas ----------

def test_measurements_are_listed_chronologically(client, auth):
    for d, w in [("2026-09-20", 80), ("2026-09-01", 82), ("2026-09-10", 81)]:
        assert client.post("/api/measurements", headers=auth, json={"date": d, "weight": w}).status_code == 201
    items = client.get("/api/measurements", headers=auth).json()
    assert [m["date"] for m in items] == ["2026-09-01", "2026-09-10", "2026-09-20"]


def test_measurement_needs_at_least_one_value(client, auth):
    assert client.post("/api/measurements", headers=auth, json={"date": "2026-09-01"}).status_code == 422


@pytest.mark.parametrize("payload", [{"weight": 0}, {"weight": 501}, {"body_fat": 90}, {"waist": -1}])
def test_measurement_validation(client, auth, payload):
    r = client.post("/api/measurements", headers=auth, json={"date": "2026-09-01", **payload})
    assert r.status_code == 422


def test_cannot_delete_someone_elses_measurement(client, register):
    owner, _ = register()
    intruder, _ = register()
    m = client.post("/api/measurements", headers=owner, json={"date": "2026-09-01", "weight": 80}).json()
    assert client.delete(f"/api/measurements/{m['id']}", headers=intruder).status_code == 404
    assert client.get("/api/measurements", headers=intruder).json() == []
    assert len(client.get("/api/measurements", headers=owner).json()) == 1
