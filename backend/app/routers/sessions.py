from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SetLog, User, WorkoutSession
from app.routers.plans import get_own_plan
from app.schemas import SessionIn, SessionOut
from app.security import get_current_user

router = APIRouter(prefix="/sessions", tags=["Treinos realizados"])


@router.get("", response_model=list[SessionOut])
def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .order_by(WorkoutSession.date.desc(), WorkoutSession.id.desc())
        .limit(limit)
    ).all()


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    data: SessionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if data.plan_id is not None:
        get_own_plan(data.plan_id, user, db)  # só pode registrar treino de ficha própria
    session = WorkoutSession(
        user_id=user.id,
        plan_id=data.plan_id,
        plan_name=data.plan_name,
        date=data.date,
        notes=data.notes,
    )
    session.sets = [SetLog(**s.model_dump()) for s in data.sets]
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    session = db.get(WorkoutSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Treino não encontrado.")
    db.delete(session)
    db.commit()
