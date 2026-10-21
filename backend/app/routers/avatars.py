import re
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.avatars import MAX_UPLOAD_BYTES, InvalidImage, make_avatar
from app.config import AVATAR_DIR
from app.database import get_db
from app.models import User
from app.ratelimit import avatar_limiter
from app.schemas import UserOut
from app.security import get_current_user

router = APIRouter(tags=["Foto de perfil"])

# 32 caracteres hexadecimais + .webp. Qualquer outra coisa (ex.: "../../.env") é recusada.
AVATAR_NAME = re.compile(r"^[0-9a-f]{32}\.webp$")


def _remove_file(name: str | None) -> None:
    if name and AVATAR_NAME.match(name):
        (AVATAR_DIR / name).unlink(missing_ok=True)


# "def" (sem async): o processamento da imagem usa CPU e roda numa thread separada,
# sem travar as outras requisições.
@router.put("/auth/me/avatar", response_model=UserOut)
def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    avatar_limiter.check(f"user:{user.id}")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Foto grande demais (máximo 8 MB).")
    try:
        webp = make_avatar(data)
    except InvalidImage as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))

    # Nome aleatório: muda a cada troca (o navegador não mostra a foto antiga do cache)
    # e não dá para adivinhar o endereço da foto de outra pessoa
    name = f"{secrets.token_hex(16)}.webp"
    (AVATAR_DIR / name).write_bytes(webp)
    old, user.avatar = user.avatar, name
    db.commit()
    _remove_file(old)
    db.refresh(user)
    return user


@router.delete("/auth/me/avatar", response_model=UserOut)
def delete_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    old, user.avatar = user.avatar, None
    db.commit()
    _remove_file(old)
    db.refresh(user)
    return user


@router.get("/avatars/{name}", include_in_schema=False)
def get_avatar(name: str):
    """Serve a foto. O nome é aleatório (128 bits), então só quem recebeu o endereço chega nela."""
    path = AVATAR_DIR / name
    if not AVATAR_NAME.match(name) or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada.")
    # O arquivo nunca muda (trocar a foto gera um nome novo): pode ficar em cache para sempre
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable"})
