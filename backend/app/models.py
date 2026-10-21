"""Tabelas do banco de dados.

Usuário ─┬─ Fichas (WorkoutPlan) ── Exercícios (PlanExercise) ── Séries planejadas (PlanSet)
         ├─ Treinos realizados (WorkoutSession) ── Séries feitas (SetLog)
         └─ Medidas corporais (BodyMeasurement)
"""
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app import config
from app.database import Base


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Perfil usado pela IA (tudo opcional até o usuário preencher)
    goal: Mapped[str | None] = mapped_column(String(40))  # hipertrofia, emagrecimento...
    level: Mapped[str | None] = mapped_column(String(20))  # iniciante, intermediario, avancado
    days_per_week: Mapped[int | None] = mapped_column(Integer)
    equipment: Mapped[str | None] = mapped_column(String(200))

    plans: Mapped[list["WorkoutPlan"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_admin(self) -> bool:
        # Não é uma coluna: vem da variável ADMIN_EMAILS, então dá para mudar sem migração
        return self.email in config.ADMIN_EMAILS


class WorkoutPlan(Base):
    """Uma ficha de treino, ex.: 'Treino A — Peito e tríceps'."""

    __tablename__ = "workout_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="plans")
    exercises: Mapped[list["PlanExercise"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="PlanExercise.position",
    )


class PlanExercise(Base):
    __tablename__ = "plan_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("workout_plans.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)  # ordem na ficha
    name: Mapped[str] = mapped_column(String(80))
    rest_seconds: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(String(200))
    # True = emenda no próximo exercício sem descanso. A → B forma um bi-set;
    # A → B → C, um tri-set. Funciona mesmo depois de reordenar a ficha.
    linked_to_next: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    plan: Mapped[WorkoutPlan] = relationship(back_populates="exercises")
    # Cada série tem as próprias reps e carga: dá para montar pirâmide, drop-set etc.
    sets: Mapped[list["PlanSet"]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
        order_by="PlanSet.position",
    )


class PlanSet(Base):
    """Uma série planejada de um exercício da ficha, ex.: 12 reps com 40 kg."""

    __tablename__ = "plan_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("plan_exercises.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)  # 1ª, 2ª, 3ª série...
    reps: Mapped[str] = mapped_column(String(20), default="10")  # texto: aceita "8-12"
    weight: Mapped[float | None] = mapped_column(Float)  # carga em kg

    exercise: Mapped[PlanExercise] = relationship(back_populates="sets")


class WorkoutSession(Base):
    """Um treino que o usuário realmente fez em um dia."""

    __tablename__ = "workout_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Se a ficha for apagada, o histórico continua existindo (SET NULL)
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_plans.id", ondelete="SET NULL")
    )
    plan_name: Mapped[str] = mapped_column(String(80))  # cópia do nome da ficha
    date: Mapped[date] = mapped_column(Date, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    sets: Mapped[list["SetLog"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SetLog.id",
    )


class SetLog(Base):
    """Uma série executada: exercício, repetições e carga."""

    __tablename__ = "set_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True
    )
    # Guardamos o nome (e não o id do exercício da ficha) para o histórico
    # sobreviver mesmo se a ficha for editada ou apagada.
    exercise_name: Mapped[str] = mapped_column(String(80), index=True)
    set_number: Mapped[int] = mapped_column(Integer)
    reps: Mapped[int] = mapped_column(Integer)
    weight: Mapped[float] = mapped_column(Float, default=0)

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")


class BodyMeasurement(Base):
    __tablename__ = "body_measurements"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    weight: Mapped[float | None] = mapped_column(Float)  # kg
    body_fat: Mapped[float | None] = mapped_column(Float)  # %
    chest: Mapped[float | None] = mapped_column(Float)  # cm
    waist: Mapped[float | None] = mapped_column(Float)
    hips: Mapped[float | None] = mapped_column(Float)
    arm: Mapped[float | None] = mapped_column(Float)
    thigh: Mapped[float | None] = mapped_column(Float)
