"""bi-set entre exercícios

Adiciona plan_exercises.linked_to_next: True = o exercício emenda no próximo sem descanso
(A → B é um bi-set; A → B → C, um tri-set). Fichas existentes ficam sem bi-set (False).

Cuidado: aqui NÃO usamos batch_alter_table. No SQLite ele pode recriar a tabela, e como
plan_sets aponta para plan_exercises com ON DELETE CASCADE, recriá-la apagaria as séries de
todas as fichas. Adicionar coluna o SQLite faz direto (ALTER TABLE ADD COLUMN), sem recriar.

Revision ID: 61d67182af81
Revises: 5388ecdbc120
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "61d67182af81"
down_revision: Union[str, Sequence[str], None] = "5388ecdbc120"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "plan_exercises",
        sa.Column("linked_to_next", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    # SQLite 3.35+ remove coluna direto (DROP COLUMN), também sem recriar a tabela
    op.drop_column("plan_exercises", "linked_to_next")
