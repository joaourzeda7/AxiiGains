from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, WorkoutPlan, WorkoutSession
from app.schemas import AdminOverview, AdminUser
from app.security import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Só deixa passar quem está em ADMIN_EMAILS. Qualquer outra pessoa logada recebe 403."""
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso restrito.")
    return user


@router.get("/overview", response_model=AdminOverview)
def overview(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    # Uma consulta por tabela, agrupada por usuário (em vez de uma consulta por pessoa)
    sessions = {
        user_id: (count, last)
        for user_id, count, last in db.execute(
            select(WorkoutSession.user_id, func.count(), func.max(WorkoutSession.date)).group_by(
                WorkoutSession.user_id
            )
        )
    }
    plans = dict(
        db.execute(select(WorkoutPlan.user_id, func.count()).group_by(WorkoutPlan.user_id)).all()
    )
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()

    week_ago = date.today() - timedelta(days=7)
    return AdminOverview(
        total_users=len(users),
        active_last_7_days=sum(1 for _, last in sessions.values() if last and last >= week_ago),
        total_sessions=sum(count for count, _ in sessions.values()),
        users=[
            AdminUser(
                id=u.id,
                name=u.name,
                email=u.email,
                created_at=u.created_at,
                plans_count=plans.get(u.id, 0),
                sessions_count=sessions.get(u.id, (0, None))[0],
                last_session=sessions.get(u.id, (0, None))[1],
            )
            for u in users
        ],
    )
