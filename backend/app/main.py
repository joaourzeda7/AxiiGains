from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import FRONTEND_DIST, IS_PRODUCTION
from app.database import get_db
from app.migrate import run_migrations
from app.routers import ai, auth, measurements, plans, progress, sessions


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Ao iniciar, aplica as migrações pendentes do Alembic (cria/atualiza as tabelas)
    run_migrations()
    yield


app = FastAPI(
    title="AxiiGains API",
    version="1.0.0",
    lifespan=lifespan,
    # Em produção não publicamos a documentação: ela é um mapa da API para quem quiser atacar
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

# Em desenvolvimento o Vite (porta 5173) repassa /api para cá via proxy,
# e em produção o próprio backend serve o frontend: mesma origem nos dois casos.
# O CORS fica só para quem quiser chamar a API direto do navegador em dev.
if not IS_PRODUCTION:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Política de segurança de conteúdo: o navegador só executa scripts e carrega arquivos
# do próprio site. Se alguém conseguir injetar HTML (XSS), o script dele não roda.
CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",  # o React usa style="..." em alguns componentes
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"  # não "adivinhar" o tipo do arquivo
    response.headers["X-Frame-Options"] = "DENY"  # ninguém coloca o app dentro de um iframe
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if not request.url.path.startswith(("/docs", "/openapi.json")):
        response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
    if request.url.scheme == "https":
        # Avisa o navegador para usar sempre HTTPS neste domínio
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/"):
        # Respostas da API têm dados pessoais: não guardar em cache
        response.headers["Cache-Control"] = "no-store"
    return response


# Todas as rotas da API ficam sob /api
api = APIRouter(prefix="/api")


@api.get("/health", tags=["Status"])
def health(db: Session = Depends(get_db)):
    # Usado pelo Railway para saber se o app está de pé (inclui checar o banco)
    db.execute(text("SELECT 1"))
    return {"message": "AxiiGains API rodando!"}


for module in (auth, plans, sessions, measurements, progress, ai):
    api.include_router(module.router)
app.include_router(api)


# ---------- Frontend (produção) ----------
def static_file_for(path: str, dist_root: Path) -> Path | None:
    """Arquivo de dist/ correspondente à URL, ou None se não existir ou estiver fora de dist/."""
    if not path:
        return None
    file = (dist_root / path).resolve()
    # is_relative_to impede acessar arquivos fora de dist/ com "../" ou caminhos absolutos
    if file.is_relative_to(dist_root) and file.is_file():
        return file
    return None


# Se o build do React existir (frontend/dist), o FastAPI serve o app.
# Assim o deploy é um único serviço, sem precisar configurar CORS.
if FRONTEND_DIST.is_dir():
    dist_root = FRONTEND_DIST.resolve()
    index_html = dist_root / "index.html"

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/") or path == "api":
            raise HTTPException(404, "Rota da API não encontrada.")
        file = static_file_for(path, dist_root)
        if file:
            # Arquivos em /assets têm um hash no nome: podem ficar em cache "para sempre"
            cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
            return FileResponse(file, headers={"Cache-Control": cache})
        # Qualquer outra rota (/fichas, /progresso...) é do React Router
        return FileResponse(index_html, headers={"Cache-Control": "no-cache"})
