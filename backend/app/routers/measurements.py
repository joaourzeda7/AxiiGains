from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BodyMeasurement, User
from app.schemas import MeasurementIn, MeasurementOut
from app.security import get_current_user

router = APIRouter(prefix="/measurements", tags=["Medidas"])


@router.get("", response_model=list[MeasurementOut])
def list_measurements(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Ordem cronológica: é o formato que o gráfico espera
    return db.scalars(
        select(BodyMeasurement)
        .where(BodyMeasurement.user_id == user.id)
        .order_by(BodyMeasurement.date, BodyMeasurement.id)
    ).all()


@router.post("", response_model=MeasurementOut, status_code=status.HTTP_201_CREATED)
def create_measurement(
    data: MeasurementIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    values = data.model_dump()
    if all(v is None for k, v in values.items() if k != "date"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Preencha pelo menos uma medida.")
    m = BodyMeasurement(user_id=user.id, **values)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_measurement(
    measurement_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    m = db.get(BodyMeasurement, measurement_id)
    if m is None or m.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medida não encontrada.")
    db.delete(m)
    db.commit()
