"""séries planejadas por exercício

Antes: cada exercício da ficha tinha UM valor de séries, reps e carga ("3 × 10 com 40 kg").
Agora: cada série é uma linha em plan_sets, com as próprias reps e carga (pirâmide, drop-set...).

Cuidados (o autogenerate tinha gerado só "cria tabela + apaga colunas"):
1. Os dados antigos precisam ser copiados, senão as séries de todas as fichas somem.
2. No SQLite, apagar colunas RECRIA a tabela (cria nova, copia, apaga a antiga). Com as
   chaves estrangeiras ligadas, apagar a antiga dispara o ON DELETE CASCADE e levaria junto
   tudo o que aponta para ela. Por isso lemos os dados para a memória e mexemos em
   plan_exercises ANTES de existir plan_sets apontando para ela (e o contrário no downgrade).

Revision ID: 5388ecdbc120
Revises: b036a0187aae
Create Date: 2026-10-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "5388ecdbc120"
down_revision: Union[str, Sequence[str], None] = "b036a0187aae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    # 1. Guarda os dados antigos na memória
    old = conn.execute(sa.text("SELECT id, sets, reps, weight FROM plan_exercises")).all()

    # 2. Remove as colunas antigas (ainda não há tabela apontando para plan_exercises)
    with op.batch_alter_table("plan_exercises", schema=None) as batch_op:
        batch_op.drop_column("weight")
        batch_op.drop_column("sets")
        batch_op.drop_column("reps")

    # 3. Cria a tabela nova
    op.create_table(
        "plan_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("reps", sa.String(length=20), nullable=False),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["exercise_id"], ["plan_exercises.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("plan_sets", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_plan_sets_exercise_id"), ["exercise_id"], unique=False)

    # 4. Converte cada exercício em N séries iguais: "3 × 10 com 40 kg" → 3 linhas (10, 40)
    rows = [
        {"exercise_id": ex_id, "position": i, "reps": reps or "10", "weight": weight}
        for ex_id, sets, reps, weight in old
        for i in range(max(int(sets or 1), 1))
    ]
    if rows:
        conn.execute(
            sa.text(
                "INSERT INTO plan_sets (exercise_id, position, reps, weight) "
                "VALUES (:exercise_id, :position, :reps, :weight)"
            ),
            rows,
        )


def downgrade() -> None:
    conn = op.get_bind()
    # 1. Resume as séries de cada exercício na memória: quantidade, reps da 1ª e maior carga
    summary = {
        ex_id: (count, reps, weight)
        for ex_id, count, reps, weight in conn.execute(
            sa.text(
                """
                SELECT exercise_id, COUNT(*),
                       (SELECT s2.reps FROM plan_sets s2 WHERE s2.exercise_id = s.exercise_id
                        ORDER BY s2.position LIMIT 1),
                       MAX(weight)
                FROM plan_sets s GROUP BY exercise_id
                """
            )
        )
    }

    # 2. Remove plan_sets antes de recriar plan_exercises (evita o cascade)
    with op.batch_alter_table("plan_sets", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_plan_sets_exercise_id"))
    op.drop_table("plan_sets")

    # 3. Recoloca as colunas antigas e preenche
    with op.batch_alter_table("plan_exercises", schema=None) as batch_op:
        batch_op.add_column(sa.Column("reps", sa.VARCHAR(length=20), nullable=False, server_default="10"))
        batch_op.add_column(sa.Column("sets", sa.INTEGER(), nullable=False, server_default="3"))
        batch_op.add_column(sa.Column("weight", sa.FLOAT(), nullable=True))
    for ex_id, (count, reps, weight) in summary.items():
        conn.execute(
            sa.text("UPDATE plan_exercises SET sets = :sets, reps = :reps, weight = :weight WHERE id = :id"),
            {"sets": count, "reps": reps or "10", "weight": weight, "id": ex_id},
        )
