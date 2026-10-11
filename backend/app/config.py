"""Configurações lidas das variáveis de ambiente (arquivo .env em desenvolvimento)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    """Lê uma variável tirando espaços, quebras de linha e aspas que vêm junto ao colar
    o valor em painéis como o do Railway (um erro bobo que quebra a chave inteira)."""
    return os.getenv(name, default).strip().strip("\"'").strip()


# "production" no deploy (definido no Dockerfile); qualquer outro valor = desenvolvimento
APP_ENV = os.getenv("APP_ENV", "development")
IS_PRODUCTION = APP_ENV == "production"

SECRET_KEY = _env("SECRET_KEY")
if not SECRET_KEY or SECRET_KEY.startswith("troque"):
    if IS_PRODUCTION:
        # Sem uma chave própria, o app usaria a chave de desenvolvimento, que está no GitHub.
        # Qualquer pessoa conseguiria forjar tokens e entrar na conta de qualquer usuário.
        raise RuntimeError("Defina a variável SECRET_KEY (pelo menos 32 caracteres) antes de subir em produção.")
    print("AVISO: SECRET_KEY nao definida no .env - usando chave de desenvolvimento.")
    SECRET_KEY = "chave-de-desenvolvimento-nao-use-em-producao"
elif IS_PRODUCTION and len(SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY curta demais: use pelo menos 32 caracteres aleatórios.")

GEMINI_API_KEY = _env("GEMINI_API_KEY")
if GEMINI_API_KEY.startswith("sua_chave"):
    GEMINI_API_KEY = ""
GEMINI_MODEL = _env("GEMINI_MODEL", "gemini-flash-latest")
# Modelos reserva, usados quando o principal está sobrecarregado ou sem cota (separados por vírgula)
GEMINI_FALLBACK_MODELS = [
    m.strip()
    for m in _env("GEMINI_FALLBACK_MODELS", "gemini-flash-lite-latest,gemini-3.7-flash,gemini-3.5-flash").split(",")
    if m.strip() and m.strip() != GEMINI_MODEL
]

# Código de convite: se definido, só quem souber o código consegue criar conta.
# Recomendado no deploy, para estranhos não usarem o app (e a sua cota do Gemini).
REGISTRATION_CODE = os.getenv("REGISTRATION_CODE", "").strip()

# E-mails com acesso ao painel de admin, separados por vírgula: "eu@gmail.com,outro@gmail.com"
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}

# Caminho relativo é resolvido a partir da pasta backend/, não de onde o comando foi rodado
DATA_DIR = Path(os.getenv("DATA_DIR", "."))
if not DATA_DIR.is_absolute():
    DATA_DIR = BACKEND_DIR / DATA_DIR
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DATA_DIR / 'axiigains.db'}"

TOKEN_EXPIRE_DAYS = 30

# Build do frontend (frontend/dist). Se existir, o backend também serve o app.
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"
