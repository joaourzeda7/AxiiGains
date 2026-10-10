"""Configuração do Alembic: diz onde está o banco e quais são os modelos.

Comandos úteis (rodar dentro de backend/, com a venv ativa):
    alembic revision --autogenerate -m "descrição"   # cria uma migração comparando models.py com o banco
    alembic upgrade head                              # aplica as migrações pendentes
    alembic downgrade -1                              # desfaz a última
    alembic history                                   # lista as migrações
"""
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app import models  # noqa: F401  (importar registra as tabelas no Base.metadata)
from app.config import DATABASE_URL
from app.database import Base

config = context.config

# Quando o próprio app roda as migrações (app/migrate.py), ele passa a conexão pronta
# e não queremos que o Alembic reconfigure os logs do servidor.
external_connection = config.attributes.get("connection")
if external_connection is None and config.config_file_name is not None:
    fileConfig(config.config_file_name)

# O autogenerate compara os modelos (Base.metadata) com o banco
target_metadata = Base.metadata


def run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # O SQLite não sabe alterar/remover colunas direto. O "batch mode" recria a tabela
        # por baixo dos panos (copia os dados para uma nova). Sem isso, migrações quebram.
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    # Modo offline: só gera o SQL (alembic upgrade head --sql), sem conectar
    context.configure(url=DATABASE_URL, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
elif external_connection is not None:
    run_migrations(external_connection)
else:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as connection:
        run_migrations(connection)
