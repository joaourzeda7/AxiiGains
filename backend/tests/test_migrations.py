"""Migrações do Alembic: criam o banco certo, podem ser desfeitas e batem com os modelos."""
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from app.database import Base
from app.migrate import INITIAL_REVISION, run_migrations

TABLES = {"users", "workout_plans", "plan_exercises", "workout_sessions", "set_logs", "body_measurements"}


def _engine(tmp_path, name="teste.db"):
    return create_engine(f"sqlite:///{tmp_path / name}")


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
    """Bancos antigos (criados pelo create_all) recebem a marcação de versão e mantêm os dados."""
    engine = _engine(tmp_path)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (name, email, password_hash, created_at) VALUES ('A', 'a@a.com', 'x', '2026-01-01')"))

    run_migrations(engine)

    assert _version(engine) is not None
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM users")).scalar() == 1


def test_downgrade_removes_everything(tmp_path):
    from alembic.config import Config

    from app.config import BACKEND_DIR

    engine = _engine(tmp_path)
    run_migrations(engine)
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    with engine.begin() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "base")
    assert not (TABLES & set(inspect(engine).get_table_names()))


def test_initial_revision_constant_matches_first_migration():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from app.config import BACKEND_DIR

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    base = ScriptDirectory.from_config(config).get_base()
    assert base == INITIAL_REVISION
