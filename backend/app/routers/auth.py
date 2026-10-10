import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import REGISTRATION_CODE
from app.database import get_db
from app.models import User
from app.ratelimit import client_ip, login_limiter, register_limiter
from app.schemas import ProfileUpdate, Token, UserCreate, UserOut
from app.security import DUMMY_HASH, create_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.get("/register-info")
def register_info():
    """Diz ao frontend se o cadastro pede código de convite."""
    return {"invite_required": bool(REGISTRATION_CODE)}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, request: Request, db: Session = Depends(get_db)):
    register_limiter.check(client_ip(request))
    # compare_digest compara em tempo constante: não dá para adivinhar o código
    # medindo quanto tempo a comparação demora
    if REGISTRATION_CODE and not hmac.compare_digest(
        (data.invite_code or "").strip().encode(), REGISTRATION_CODE.encode()
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Código de convite inválido.")
    if db.scalar(select(User).where(User.email == data.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe uma conta com esse e-mail.")
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


# Recebe formulário (username + password) no padrão OAuth2,
# o que permite testar pelo botão "Authorize" em /docs.
@router.post("/login", response_model=Token)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    login_limiter.check(client_ip(request))
    user = db.scalar(select(User).where(User.email == form.username.strip().lower()))
    # Se o e-mail não existe, ainda assim rodamos o bcrypt (contra um hash qualquer).
    # Sem isso, a resposta viria bem mais rápida e entregaria quais e-mails têm conta.
    password_ok = verify_password(form.password, user.password_hash if user else DUMMY_HASH)
    if not user or not password_ok:
        # Mesma mensagem nos dois casos, pelo mesmo motivo
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha incorretos.")
    return Token(access_token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(
    data: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
