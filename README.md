<p align="center">
  <img src="frontend/public/pwa-192x192.png" width="96" alt="Ícone do AxiiGains" />
</p>

<h1 align="center">AxiiGains</h1>

<p align="center">
  App de treinos de academia com plano gerado por IA.<br />
  PWA instalável no iPhone e no Android.
</p>

<p align="center">
  <img src="docs/screenshots/inicio.png" width="200" alt="Tela inicial com o próximo treino e a semana" />
  <img src="docs/screenshots/treino.png" width="200" alt="Treino em andamento com cronômetro de descanso" />
  <img src="docs/screenshots/conclusao.png" width="200" alt="Animação de treino concluído com novo recorde" />
</p>
<p align="center">
  <img src="docs/screenshots/progresso.png" width="200" alt="Gráfico de evolução de carga" />
  <img src="docs/screenshots/ia.png" width="200" alt="Geração de plano com IA" />
  <img src="docs/screenshots/login.png" width="200" alt="Tela de login" />
</p>

## Funcionalidades

- **Fichas de treino:** exercícios com séries, repetições, carga e descanso.
- **Modo treino:** registro série a série, cronômetro de descanso e o recorde de cada exercício à vista. O progresso é salvo automaticamente se o app fechar.
- **Sinal conjurado:** ao concluir um treino, uma animação do olho de bruxo apresenta o resumo (duração, séries, volume) e os novos recordes.
- **Início:** próximo treino da rotação (A → B → C), meta semanal com os dias treinados e a variação de peso.
- **Progresso:** histórico de treinos, evolução de carga por exercício (com 1RM estimada) e medidas corporais.
- **Axii IA:** o Gemini monta um plano personalizado a partir do objetivo, do nível e dos dias disponíveis, e o plano vira fichas com um toque.
- **App instalável:** ícone, splash screens para iOS e funcionamento em tela cheia.

## Tecnologias

**Backend:** FastAPI · SQLAlchemy · Alembic · SQLite · JWT · Google Gemini (`google-genai`)<br />
**Frontend:** React · Vite · Tailwind CSS · shadcn/ui · Recharts · vite-plugin-pwa<br />
**Qualidade:** pytest · Vitest · GitHub Actions (testes, auditoria de dependências e build da imagem Docker)

## Rodando localmente

Requer Python 3.14+ e Node.js 20+.

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate          # Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # e preencha as variáveis
uvicorn app.main:app --reload
```

```bash
# Frontend (em outro terminal)
cd frontend
npm install
npm run dev
```

O app abre em http://localhost:5173 e a documentação da API em http://localhost:8000/docs. As tabelas do banco são criadas e atualizadas automaticamente (migrações do Alembic) quando o backend inicia.

### Testes

```bash
cd backend && pip install -r requirements-dev.txt && pytest   # API, segurança e migrações
cd frontend && npm test                                       # funções de data e número
```

### Variáveis de ambiente (`backend/.env`)

| Variável | Descrição |
|---|---|
| `SECRET_KEY` | Chave que assina os tokens de login. Gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `GEMINI_API_KEY` | Chave da API do Gemini ([obtenha aqui](https://aistudio.google.com/apikey)). Sem ela, o resto do app funciona normalmente |
| `GEMINI_MODEL` | Modelo usado (padrão: `gemini-flash-latest`) |
| `DATA_DIR` | Pasta do banco SQLite (padrão: `backend/`) |
| `REGISTRATION_CODE` | Opcional. Se definido, o cadastro exige esse código de convite |
| `APP_ENV` | `production` no deploy (já definido no Dockerfile): exige uma `SECRET_KEY` forte e desliga o `/docs` |

## Deploy

O [`Dockerfile`](Dockerfile) gera o frontend e roda tudo em um único serviço, onde o FastAPI serve a API e o app. Exemplo no [Railway](https://railway.com):

1. Crie um projeto a partir deste repositório. O Dockerfile e o [`railway.json`](railway.json) (com o health check) são detectados automaticamente.
2. Adicione um **Volume** com o *mount path* `/data`. Sem ele, o banco é apagado a cada deploy.
3. Defina as variáveis `SECRET_KEY`, `GEMINI_API_KEY` e, recomendado, `REGISTRATION_CODE`.
4. Gere um domínio público e abra a URL no celular para instalar o app.
5. Opcional, para gastar menos: em **Settings → Serverless**, ative o App Sleeping. O servidor dorme depois de 10 minutos sem uso e acorda no primeiro acesso; o app tenta de novo sozinho enquanto ele acorda.

## Estrutura

```
backend/
  app/
    main.py        # app FastAPI, cabeçalhos de segurança; serve o frontend em produção
    models.py      # tabelas (usuários, fichas, treinos, medidas)
    schemas.py     # validação com Pydantic
    security.py    # bcrypt + JWT
    ratelimit.py   # limite de tentativas (login, cadastro, IA)
    routers/       # auth, plans, sessions, measurements, progress, ai
  migrations/      # migrações do Alembic
  tests/           # testes com pytest
frontend/src/
  pages/           # telas
  components/      # layout e componentes (ui/ = shadcn)
  context/         # autenticação
  lib/             # cliente da API e utilitários
```

Mais detalhes técnicos, erros comuns e decisões de arquitetura estão em [docs/GUIA.md](docs/GUIA.md).

---

<sub>O nome e o visual são uma homenagem à série <i>The Witcher</i>: o sinal Axii e os olhos de gato dos bruxos. O projeto não tem afiliação com a CD PROJEKT RED nem com Andrzej Sapkowski.</sub>
