"""Aplica as migrações do Alembic quando o app inicia.

Assim basta subir o servidor (local ou no deploy) que o banco fica na versão certa,
sem precisar lembrar de rodar "alembic upgrade head" antes.
"""
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect

from app.config import BACKEND_DIR
from app.database import engine as default_engine

# Primeira migração: a que cria as tabelas (migrations/versions/..._cria_tabelas_iniciais.py)
INITIAL_REVISION = "b036a0187aae"


def run_migrations(engine: Engine = default_engine) -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))

    with engine.begin() as connection:
        config.attributes["connection"] = connection
        tables = set(inspect(connection).get_table_names())

        if "users" in tables and "alembic_version" not in tables:
            # Banco criado antes do Alembic (pelo antigo create_all): as tabelas já existem
            # e são iguais às da migração inicial. Só marcamos essa versão como aplicada
            # e seguimos com as migrações mais novas, se houver.
            command.stamp(config, INITIAL_REVISION)

        command.upgrade(config, "head")
