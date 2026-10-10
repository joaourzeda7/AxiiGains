"""Resumo da tela inicial, recordes e evolução por exercício."""
from datetime import date, timedelta

from tests.conftest import sets_of


def test_dashboard_for_new_user_is_empty(client, auth):
    d = client.get("/api/progress/dashboard", headers=auth).json()
    assert d == {
        "sessions_total": 0,
        "sessions_this_week": 0,
        "week_dates": [],
        "days_per_week": None,
        "last_session": None,
        "latest_weight": None,
        "weight_change": None,
        "next_plan": None,
    }


def test_dashboard_week_uses_the_date_sent_by_the_phone(client, auth, make_session):
    # quarta-feira, 07/10/2026 → a semana vai de segunda 05/10 a domingo 11/10
    make_session(auth, "2026-10-04", sets_of("Supino", (10, 40)))  # domingo anterior: fora
    make_session(auth, "2026-10-05", sets_of("Supino", (10, 40)))
    make_session(auth, "2026-10-07", sets_of("Supino", (10, 40)))
    make_session(auth, "2026-10-07", sets_of("Remada", (10, 40)))  # mesmo dia: conta uma vez na faixa

    d = client.get("/api/progress/dashboard", headers=auth, params={"today": "2026-10-07"}).json()
    assert d["week_dates"] == ["2026-10-05", "2026-10-07"]
    assert d["sessions_this_week"] == 3
    assert d["sessions_total"] == 4


def test_next_plan_rotates_after_last_workout(client, auth, make_plan, make_session):
    a = make_plan(auth, name="Treino A")
    b = make_plan(auth, name="Treino B")
    c = make_plan(auth, name="Treino C")
    dashboard = lambda: client.get("/api/progress/dashboard", headers=auth).json()  # noqa: E731

    assert dashboard()["next_plan"]["id"] == a["id"]  # nunca treinou: começa pela A
    make_session(auth, "2026-09-01", sets_of("Supino", (10, 40)), plan=a)
    assert dashboard()["next_plan"]["id"] == b["id"]
    make_session(auth, "2026-09-02", sets_of("Supino", (10, 40)), plan=c)
    assert dashboard()["next_plan"]["id"] == a["id"]  # depois da última, volta para a primeira


def test_weight_change_compares_latest_with_first(client, auth):
    for d, w in [("2026-08-01", 84.5), ("2026-09-01", 83.0), ("2026-10-01", 81.4)]:
        client.post("/api/measurements", headers=auth, json={"date": d, "weight": w})
    # uma medida sem peso não pode atrapalhar
    client.post("/api/measurements", headers=auth, json={"date": "2026-10-02", "waist": 85})

    d = client.get("/api/progress/dashboard", headers=auth).json()
    assert d["latest_weight"] == 81.4
    assert d["weight_change"] == -3.1


def test_records_are_the_heaviest_weight_per_exercise(client, auth, make_session):
    make_session(auth, "2026-09-01", sets_of("Supino", (10, 40), (8, 45)) + sets_of("Remada", (10, 50)))
    make_session(auth, "2026-09-08", sets_of("Supino", (6, 47.5)))
    assert client.get("/api/progress/records", headers=auth).json() == {"Supino": 47.5, "Remada": 50}


def test_exercise_progress_one_point_per_day(client, auth, make_session):
    make_session(auth, "2026-09-01", sets_of("Supino", (10, 40), (8, 45)))
    make_session(auth, "2026-09-08", sets_of("Supino", (5, 50)))

    points = client.get("/api/progress/exercise", headers=auth, params={"name": "Supino"}).json()
    assert [p["date"] for p in points] == ["2026-09-01", "2026-09-08"]
    first = points[0]
    assert first["max_weight"] == 45
    assert first["volume"] == 10 * 40 + 8 * 45
    # Epley: 45 × (1 + 8/30) = 57,0 é maior que 40 × (1 + 10/30) = 53,3
    assert first["best_1rm"] == 57.0
    assert points[1]["best_1rm"] == round(50 * (1 + 5 / 30), 1)


def test_exercises_list_most_recent_first(client, auth, make_session):
    make_session(auth, "2026-09-01", sets_of("Agachamento", (10, 60)))
    make_session(auth, "2026-09-10", sets_of("Supino", (10, 40)))
    assert client.get("/api/progress/exercises", headers=auth).json() == ["Supino", "Agachamento"]


def test_progress_is_private(client, register, make_session):
    owner, _ = register()
    other, _ = register()
    make_session(owner, str(date.today() - timedelta(days=1)), sets_of("Supino", (10, 40)))
    assert client.get("/api/progress/records", headers=other).json() == {}
    assert client.get("/api/progress/exercises", headers=other).json() == []
    assert client.get("/api/progress/exercise", headers=other, params={"name": "Supino"}).json() == []
    assert client.get("/api/progress/dashboard", headers=other).json()["sessions_total"] == 0
