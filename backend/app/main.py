from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import FRONTEND_DIST
from app.database import Base, engine
from app.routers import ai, auth, measurements, plans, progress, sessions

# Cria as tabelas que ainda não existem.
# ⚠️ create_all NÃO altera tabelas existentes. Se mudar um modelo depois que o app
# estiver em uso, vai precisar de migração (a ferramenta padrão é o Alembic).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AxiiGains API", version="1.0.0")

# Em desenvolvimento o Vite (porta 5173) repassa /api para cá via proxy,
# e em produção o próprio backend serve o frontend: mesma origem nos dois casos.
# O CORS fica só para quem quiser chamar a API direto do navegador em dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Todas as rotas da API ficam sob /api
api = APIRouter(prefix="/api")


@api.get("/health", tags=["Status"])
def health():
    return {"message": "AxiiGains API rodando!"}


for module in (auth, plans, sessions, measurements, progress, ai):
    api.include_router(module.router)
app.include_router(api)


# ---------- Frontend (produção) ----------
# Se o build do React existir (frontend/dist), o FastAPI serve o app.
# Assim o deploy é um único serviço, sem precisar configurar CORS.
if FRONTEND_DIST.is_dir():
    index_html = FRONTEND_DIST / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Rota da API não encontrada.")
        file = (FRONTEND_DIST / path).resolve()
        # is_relative_to impede acessar arquivos fora de dist/ com "../"
        if path and file.is_file() and file.is_relative_to(FRONTEND_DIST.resolve()):
            return FileResponse(file)
        # Qualquer outra rota (/fichas, /progresso...) é do React Router
        return FileResponse(index_html, headers={"Cache-Control": "no-cache"})
