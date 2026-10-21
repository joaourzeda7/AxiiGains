"""foto de perfil

Adiciona users.avatar (nome do arquivo da foto em DATA_DIR/avatars).

Cuidado redobrado: users é a raiz de tudo (fichas, treinos, medidas apontam para ela com
ON DELETE CASCADE). Recriar essa tabela, como o batch_alter_table pode fazer no SQLite,
apagaria os dados de TODOS os usuários. Por isso só ALTER TABLE ADD/DROP COLUMN direto.

Revision ID: c5dea378e60b
Revises: 61d67182af81
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c5dea378e60b"
down_revision: Union[str, Sequence[str], None] = "61d67182af81"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar")
