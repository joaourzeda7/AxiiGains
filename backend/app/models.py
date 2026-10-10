"""Tabelas do banco de dados.

Usuário ─┬─ Fichas (WorkoutPlan) ── Exercícios da ficha (PlanExercise)
         ├─ Treinos realizados (WorkoutSession) ── Séries feitas (SetLog)
         └─ Medidas corporais (BodyMeasurement)
"""
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
    sets: Mapped[int] = mapped_column(Integer, default=3)
    reps: Mapped[str] = mapped_column(String(20), default="10")  # texto: aceita "8-12"
    weight: Mapped[float | None] = mapped_column(Float)  # carga em kg
    rest_seconds: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(String(200))

    plan: Mapped[WorkoutPlan] = relationship(back_populates="exercises")


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
