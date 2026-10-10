from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BodyMeasurement, SetLog, User, WorkoutPlan, WorkoutSession
from app.schemas import DashboardOut, ExerciseProgressPoint
from app.security import get_current_user

router = APIRouter(prefix="/progress", tags=["Progresso"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    # O app envia a data do aparelho: o servidor pode estar em outro fuso (no deploy é UTC)
    today: date | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Resumo para a tela inicial."""
    today = today or date.today()
    week_start = today - timedelta(days=today.weekday())  # segunda-feira

    sessions_total = db.scalar(
        select(func.count()).select_from(WorkoutSession).where(WorkoutSession.user_id == user.id)
    )
    week_dates = db.scalars(
        select(WorkoutSession.date)
        .where(WorkoutSession.user_id == user.id, WorkoutSession.date >= week_start)
        .distinct()
        .order_by(WorkoutSession.date)
    ).all()
    sessions_this_week = db.scalar(
        select(func.count())
        .select_from(WorkoutSession)
        .where(WorkoutSession.user_id == user.id, WorkoutSession.date >= week_start)
    )
    last_session = db.scalar(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .order_by(WorkoutSession.date.desc(), WorkoutSession.id.desc())
        .limit(1)
    )

    weights = select(BodyMeasurement.weight).where(
        BodyMeasurement.user_id == user.id, BodyMeasurement.weight.is_not(None)
    )
    latest_weight = db.scalar(
        weights.order_by(BodyMeasurement.date.desc(), BodyMeasurement.id.desc()).limit(1)
    )
    first_weight = db.scalar(weights.order_by(BodyMeasurement.date, BodyMeasurement.id).limit(1))
    weight_change = (
        round(latest_weight - first_weight, 1) if latest_weight is not None else None
    )

    # Próxima ficha: a que vem depois da última treinada (A → B → C → A...)
    plans = db.scalars(
        select(WorkoutPlan).where(WorkoutPlan.user_id == user.id).order_by(WorkoutPlan.name)
    ).all()
    next_plan = None
    if plans:
        ids = [p.id for p in plans]
        if last_session and last_session.plan_id in ids:
            next_plan = plans[(ids.index(last_session.plan_id) + 1) % len(plans)]
        else:
            next_plan = plans[0]

    return DashboardOut(
        sessions_total=sessions_total,
        sessions_this_week=sessions_this_week,
        week_dates=week_dates,
        days_per_week=user.days_per_week,
        last_session=last_session,
        latest_weight=latest_weight,
        weight_change=weight_change,
        next_plan=next_plan,
    )


@router.get("/records", response_model=dict[str, float])
def records(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Maior carga já usada em cada exercício: {"Supino reto": 45.0, ...}"""
    rows = db.execute(
        select(SetLog.exercise_name, func.max(SetLog.weight))
        .join(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .group_by(SetLog.exercise_name)
    ).all()
    return {name: weight for name, weight in rows}


@router.get("/exercises", response_model=list[str])
def exercises_done(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Nomes de todos os exercícios que o usuário já registrou."""
    return db.scalars(
        select(SetLog.exercise_name)
        .join(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .group_by(SetLog.exercise_name)
        .order_by(func.max(WorkoutSession.date).desc())
    ).all()


@router.get("/exercise", response_model=list[ExerciseProgressPoint])
def exercise_progress(
    name: str = Query(min_length=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Evolução de um exercício: um ponto por dia de treino."""
    rows = db.execute(
        select(WorkoutSession.date, SetLog.reps, SetLog.weight)
        .join(WorkoutSession)
        .where(WorkoutSession.user_id == user.id, SetLog.exercise_name == name)
        .order_by(WorkoutSession.date)
    ).all()

    by_day: dict[date, ExerciseProgressPoint] = {}
    for day, reps, weight in rows:
        # Epley: 1RM ≈ carga × (1 + reps/30). Boa estimativa até ~10 reps.
        one_rm = weight * (1 + reps / 30) if reps > 0 else 0
        point = by_day.setdefault(
            day, ExerciseProgressPoint(date=day, max_weight=0, best_1rm=0, volume=0)
        )
        point.max_weight = max(point.max_weight, weight)
        point.best_1rm = round(max(point.best_1rm, one_rm), 1)
        point.volume += reps * weight
    return list(by_day.values())
