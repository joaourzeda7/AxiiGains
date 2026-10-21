"""Migrações do Alembic: criam o banco certo, podem ser desfeitas e batem com os modelos."""
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.config import Config
from sqlalchemy import create_engine, event, inspect, text

from app.config import BACKEND_DIR
from app.database import Base
from app.migrate import INITIAL_REVISION, run_migrations

TABLES = {
    "users", "workout_plans", "plan_exercises", "plan_sets", "workout_sessions", "set_logs", "body_measurements",
}


def _engine(tmp_path, name="teste.db"):
    """Banco de teste configurado IGUAL ao de produção: com as chaves estrangeiras ligadas.
    Sem isso, um ON DELETE CASCADE disparado por engano dentro de uma migração passaria batido."""
    engine = create_engine(f"sqlite:///{tmp_path / name}")

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_connection, _):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    return engine


def _alembic_config(connection):
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.attributes["connection"] = connection
    return config


def _migrate_to(engine, revision):
    with engine.begin() as conn:
        command.upgrade(_alembic_config(conn), revision)


def _version(engine):
    with engine.connect() as conn:
        return conn.execute(text("SELECT version_num FROM alembic_version")).scalar()


def test_migrations_create_all_tables_on_empty_database(tmp_path):
    engine = _engine(tmp_path)
    run_migrations(engine)
    assert TABLES <= set(inspect(engine).get_table_names())
    assert _version(engine) is not None


def test_running_migrations_twice_is_harmless(tmp_path):
    engine = _engine(tmp_path)
    run_migrations(engine)
    run_migrations(engine)  # ex.: o servidor reiniciou
    assert TABLES <= set(inspect(engine).get_table_names())


def test_models_and_migrations_are_in_sync(tmp_path):
    """Se alguém mudar models.py e esquecer de criar a migração, este teste falha."""
    engine = _engine(tmp_path)
    run_migrations(engine)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"render_as_batch": True}), Base.metadata)
    assert diff == [], f"Há mudanças nos modelos sem migração: rode 'alembic revision --autogenerate'. {diff}"


def test_database_created_before_alembic_is_adopted_without_losing_data(tmp_path):
    """Bancos antigos (criados pelo create_all, sem Alembic) recebem a versão e mantêm os dados."""
    engine = _engine(tmp_path)
    _migrate_to(engine, INITIAL_REVISION)  # mesmo esquema que o create_all criava na época
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE alembic_version"))
        conn.execute(text("INSERT INTO users (name, email, password_hash, created_at) VALUES ('A', 'a@a.com', 'x', '2026-01-01')"))

    run_migrations(engine)

    assert _version(engine) is not None
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar() == 1


def _seed_old_plans(engine):
    """Fichas no formato antigo: um valor de séries/reps/carga por exercício."""
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id, name, email, password_hash, created_at) VALUES (1, 'A', 'a@a.com', 'x', '2026-01-01')"))
        conn.execute(text("INSERT INTO workout_plans (id, user_id, name, created_at) VALUES (1, 1, 'Treino A', '2026-01-01')"))
        conn.execute(text(
            "INSERT INTO plan_exercises (id, plan_id, position, name, sets, reps, weight, rest_seconds) VALUES "
            "(1, 1, 0, 'Supino', 3, '8-12', 40, 90), (2, 1, 1, 'Crucifixo', 2, '15', NULL, 60)"
        ))


def test_old_plans_become_one_row_per_set_without_losing_data(tmp_path):
    engine = _engine(tmp_path)
    _migrate_to(engine, INITIAL_REVISION)
    _seed_old_plans(engine)

    run_migrations(engine)  # aplica a migração das séries

    with engine.connect() as conn:
        sets = conn.execute(text("SELECT exercise_id, position, reps, weight FROM plan_sets ORDER BY exercise_id, position")).all()
        exercises = conn.execute(text("SELECT id, name, rest_seconds FROM plan_exercises ORDER BY id")).all()
    assert [tuple(r) for r in sets] == [
        (1, 0, "8-12", 40.0), (1, 1, "8-12", 40.0), (1, 2, "8-12", 40.0),
        (2, 0, "15", None), (2, 1, "15", None),
    ]
    assert [tuple(r) for r in exercises] == [(1, "Supino", 90), (2, "Crucifixo", 60)]
    cols = {c["name"] for c in inspect(engine).get_columns("plan_exercises")}
    assert not ({"sets", "reps", "weight"} & cols)


def test_sets_migration_can_be_undone(tmp_path):
    engine = _engine(tmp_path)
    _migrate_to(engine, INITIAL_REVISION)
    _seed_old_plans(engine)
    run_migrations(engine)

    with engine.begin() as conn:
        command.downgrade(_alembic_config(conn), INITIAL_REVISION)

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT name, sets, reps, weight FROM plan_exercises ORDER BY id")).all()
    assert [tuple(r) for r in rows] == [("Supino", 3, "8-12", 40.0), ("Crucifixo", 2, "15", None)]
    assert "plan_sets" not in inspect(engine).get_table_names()


SETS_REVISION = "5388ecdbc120"


def test_superset_column_keeps_every_planned_set(tmp_path):
    """A coluna do bi-set não pode recriar plan_exercises (o cascade apagaria as séries)."""
    engine = _engine(tmp_path)
    _migrate_to(engine, INITIAL_REVISION)
    _seed_old_plans(engine)
    _migrate_to(engine, SETS_REVISION)
    with engine.connect() as conn:
        before = conn.execute(text("SELECT count(*) FROM plan_sets")).scalar()

    run_migrations(engine)  # aplica a do bi-set

    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM plan_sets")).scalar() == before == 5
        links = conn.execute(text("SELECT linked_to_next FROM plan_exercises ORDER BY id")).scalars().all()
    assert links == [0, 0]  # fichas existentes ficam sem bi-set

    with engine.begin() as conn:
        command.downgrade(_alembic_config(conn), SETS_REVISION)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM plan_sets")).scalar() == 5
    assert "linked_to_next" not in {c["name"] for c in inspect(engine).get_columns("plan_exercises")}


def test_downgrade_removes_everything(tmp_path):
    engine = _engine(tmp_path)
    run_migrations(engine)
    with engine.begin() as conn:
        command.downgrade(_alembic_config(conn), "base")
    assert not (TABLES & set(inspect(engine).get_table_names()))


def test_initial_revision_constant_matches_first_migration():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from app.config import BACKEND_DIR

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    base = ScriptDirectory.from_config(config).get_base()
    assert base == INITIAL_REVISION
