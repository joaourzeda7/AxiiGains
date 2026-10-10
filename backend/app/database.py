from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _configure_sqlite(dbapi_connection, _):
    # O SQLite vem com as chaves estrangeiras DESLIGADAS por padrão.
    # Ligamos em cada conexão para que ON DELETE CASCADE / SET NULL funcionem.
    dbapi_connection.execute("PRAGMA foreign_keys=ON")
    # WAL: leituras não ficam bloqueadas enquanto alguém grava (melhor com vários usuários)
    dbapi_connection.execute("PRAGMA journal_mode=WAL")
    # Se o banco estiver ocupado, espera até 5s em vez de falhar na hora
    dbapi_connection.execute("PRAGMA busy_timeout=5000")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
