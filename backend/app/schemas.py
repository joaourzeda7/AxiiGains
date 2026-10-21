"""Schemas Pydantic: definem o formato dos dados que entram e saem da API.

Os "...In" validam o que o frontend envia; os "...Out" definem o que devolvemos
(repare que UserOut não tem password_hash — nunca devolvemos a senha).
"""
from datetime import date, datetime, timedelta
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

Goal = Literal["hipertrofia", "forca", "emagrecimento", "resistencia", "saude"]
Level = Literal["iniciante", "intermediario", "avancado"]


def _plausible_date(value: date) -> date:
    # Barra datas absurdas (ano 1900, daqui a 10 anos) que bagunçariam gráficos e estatísticas.
    # Aceita até "amanhã" por causa da diferença de fuso entre o celular e o servidor.
    if value < date(2000, 1, 1) or value > date.today() + timedelta(days=1):
        raise ValueError("Data inválida")
    return value


PastDate = Annotated[date, AfterValidator(_plausible_date)]


class ORM(BaseModel):
    # Permite criar o schema direto a partir de um objeto do SQLAlchemy
    model_config = ConfigDict(from_attributes=True)


# ---------- Usuário / login ----------

class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=120)
    password: str = Field(min_length=8, max_length=72)
    invite_code: str | None = Field(default=None, max_length=100)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("E-mail inválido")
        return v

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Informe seu nome")
        return v

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, v: str) -> str:
        # O bcrypt só aceita até 72 BYTES. Letras acentuadas e emojis ocupam 2 a 4 bytes,
        # então 72 caracteres podem passar disso e o servidor quebraria (erro 500).
        if len(v.encode()) > 72:
            raise ValueError("Senha longa demais")
        return v


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    goal: Goal | None = None
    level: Level | None = None
    days_per_week: int | None = Field(default=None, ge=1, le=7)
    equipment: str | None = Field(default=None, max_length=200)


class UserOut(ORM):
    id: int
    name: str
    email: str
    goal: str | None
    level: str | None
    days_per_week: int | None
    equipment: str | None
    is_admin: bool = False


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Fichas ----------

class PlanSetIn(BaseModel):
    reps: str = Field(default="10", min_length=1, max_length=20)  # texto: aceita "8-12"
    weight: float | None = Field(default=None, ge=0, le=1000)


class PlanSetOut(ORM, PlanSetIn):
    pass


class ExerciseIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    sets: list[PlanSetIn] = Field(min_length=1, max_length=20)
    rest_seconds: int | None = Field(default=None, ge=0, le=900)
    notes: str | None = Field(default=None, max_length=200)


class ExerciseOut(ORM):
    id: int
    position: int
    name: str
    sets: list[PlanSetOut]
    rest_seconds: int | None
    notes: str | None


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    exercises: list[ExerciseIn] = Field(default_factory=list, max_length=40)


class PlanOut(ORM):
    id: int
    name: str
    notes: str | None
    exercises: list[ExerciseOut]


# ---------- Treinos realizados ----------

class SetIn(BaseModel):
    exercise_name: str = Field(min_length=1, max_length=80)
    set_number: int = Field(ge=1, le=50)
    reps: int = Field(ge=0, le=500)
    weight: float = Field(default=0, ge=0, le=1000)


class SetOut(ORM, SetIn):
    id: int


class SessionIn(BaseModel):
    plan_id: int | None = None
    plan_name: str = Field(min_length=1, max_length=80)
    date: PastDate
    notes: str | None = Field(default=None, max_length=1000)
    sets: list[SetIn] = Field(min_length=1, max_length=300)


class SessionOut(ORM):
    id: int
    plan_id: int | None
    plan_name: str
    date: date
    notes: str | None
    sets: list[SetOut]


# ---------- Medidas ----------

class MeasurementIn(BaseModel):
    date: PastDate
    weight: float | None = Field(default=None, gt=0, le=500)
    body_fat: float | None = Field(default=None, ge=0, le=80)
    chest: float | None = Field(default=None, gt=0, le=300)
    waist: float | None = Field(default=None, gt=0, le=300)
    hips: float | None = Field(default=None, gt=0, le=300)
    arm: float | None = Field(default=None, gt=0, le=150)
    thigh: float | None = Field(default=None, gt=0, le=200)


class MeasurementOut(ORM, MeasurementIn):
    id: int


# ---------- Progresso ----------

class ExerciseProgressPoint(BaseModel):
    date: date
    max_weight: float
    best_1rm: float  # 1RM estimada (fórmula de Epley)
    volume: float  # soma de reps x carga no dia


class DashboardOut(BaseModel):
    sessions_total: int
    sessions_this_week: int
    week_dates: list[date]  # dias desta semana com treino (para a faixa de dias)
    days_per_week: int | None
    last_session: SessionOut | None
    latest_weight: float | None
    weight_change: float | None  # diferença entre a última e a primeira pesagem
    next_plan: PlanOut | None


# ---------- Admin ----------

class AdminUser(BaseModel):
    id: int
    name: str
    email: str
    created_at: datetime
    plans_count: int
    sessions_count: int
    last_session: date | None


class AdminOverview(BaseModel):
    total_users: int
    active_last_7_days: int  # quem registrou treino nos últimos 7 dias
    total_sessions: int
    users: list[AdminUser]


# ---------- IA ----------

class AISuggestIn(BaseModel):
    goal: Goal
    level: Level
    days_per_week: int = Field(ge=1, le=7)
    equipment: str = Field(default="academia completa", max_length=200)
    session_minutes: int = Field(default=60, ge=15, le=180)
    notes: str | None = Field(default=None, max_length=500)


class AIExercise(BaseModel):
    name: str
    sets: int
    reps: str
    rest_seconds: int
    notes: str | None = None


class AIPlan(BaseModel):
    name: str
    notes: str | None = None
    exercises: list[AIExercise]


class AISuggestOut(BaseModel):
    summary: str
    plans: list[AIPlan]
    tips: list[str]
