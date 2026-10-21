from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PlanExercise, PlanSet, User, WorkoutPlan
from app.schemas import PlanIn, PlanOut
from app.security import get_current_user

router = APIRouter(prefix="/plans", tags=["Fichas"])


def get_own_plan(plan_id: int, user: User, db: Session) -> WorkoutPlan:
    """Busca a ficha garantindo que ela pertence ao usuário logado.

    Erro comum: buscar só pelo id. Aí qualquer pessoa logada veria
    (ou apagaria) a ficha dos outros trocando o número na URL.
    """
    plan = db.get(WorkoutPlan, plan_id)
    if plan is None or plan.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ficha não encontrada.")
    return plan


def _build_exercises(data: PlanIn) -> list[PlanExercise]:
    return [
        PlanExercise(
            position=i,
            name=ex.name,
            rest_seconds=ex.rest_seconds,
            notes=ex.notes,
            sets=[PlanSet(position=j, reps=s.reps, weight=s.weight) for j, s in enumerate(ex.sets)],
        )
        for i, ex in enumerate(data.exercises)
    ]


@router.get("", response_model=list[PlanOut])
def list_plans(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(WorkoutPlan).where(WorkoutPlan.user_id == user.id).order_by(WorkoutPlan.name)
    ).all()


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(data: PlanIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = WorkoutPlan(user_id=user.id, name=data.name, notes=data.notes)
    plan.exercises = _build_exercises(data)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=PlanOut)
def get_plan(plan_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_own_plan(plan_id, user, db)


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(
    plan_id: int,
    data: PlanIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = get_own_plan(plan_id, user, db)
    plan.name = data.name
    plan.notes = data.notes
    # Mais simples do que comparar um a um: troca a lista inteira.
    # O cascade "delete-orphan" apaga os exercícios antigos.
    plan.exercises = _build_exercises(data)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_own_plan(plan_id, user, db))
    db.commit()
