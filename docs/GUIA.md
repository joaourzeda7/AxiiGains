# Guia de desenvolvimento

Anotações para quem for mexer no código: como testar, como mudar o banco, segurança, erros comuns e decisões técnicas.

## Mudar o banco de dados (Alembic)

As tabelas são controladas por **migrações**: cada mudança na estrutura vira um arquivo em `backend/migrations/versions/`, e o app aplica as pendentes sozinho quando inicia. É assim que dá para alterar tabelas sem apagar os dados de quem já usa o app.

Para criar uma coluna, tabela ou índice:

1. Altere o modelo em `backend/app/models.py`.
2. Gere a migração (dentro de `backend/`, com a venv ativa):
   ```powershell
   alembic revision --autogenerate -m "adiciona cor na ficha"
   ```
3. **Leia o arquivo gerado.** O autogenerate não percebe tudo; renomear uma coluna, por exemplo, aparece como "apaga uma e cria outra", o que perderia os dados.
4. Reinicie o backend (ou rode `alembic upgrade head`) e commite o arquivo da migração junto com o modelo.

Outros comandos úteis: `alembic history` (lista as migrações), `alembic current` (versão do banco) e `alembic downgrade -1` (desfaz a última).

> O teste `test_models_and_migrations_are_in_sync` falha se alguém mudar `models.py` e esquecer de gerar a migração.

## Testes

```powershell
cd backend
pip install -r requirements-dev.txt
pytest                    # todos
pytest tests/test_auth.py # um arquivo
pytest -k idor -v         # só os que têm "idor" no nome, mostrando cada um
```

```powershell
cd frontend
npm test
```

O que os testes cobrem:

- **Backend:** todas as rotas, isolamento entre usuários (ninguém acessa dados de outra pessoa trocando o número na URL), tokens inválidos/expirados/forjados, limites de tentativas, cabeçalhos de segurança, proteção de arquivos (`../`), configuração de produção e migrações (subir, desfazer, adotar bancos antigos).
- **Frontend:** funções de data e número, incluindo os casos de fuso horário (à noite no Brasil já é o dia seguinte em UTC).
- **IA:** o Gemini é substituído por um "dublê" nos testes, então eles não precisam de internet nem gastam a cota.

O GitHub Actions (`.github/workflows/ci.yml`) roda tudo isso a cada push, audita as dependências e constrói a imagem Docker. Se algo quebrar, aparece um ❌ no commit.

## Segurança

| Proteção | Onde |
|---|---|
| Senhas com bcrypt; limite de 72 **bytes** (acentos ocupam mais de 1 byte) | `security.py`, `schemas.py` |
| Login com tempo de resposta igual para e-mail existente ou não | `routers/auth.py` |
| Limite de tentativas: login (10 a cada 5 min por IP), cadastro (5/h por IP), IA (8/h por usuário) | `ratelimit.py` |
| Código de convite opcional para cadastro (`REGISTRATION_CODE`) | `routers/auth.py` |
| Painel de admin só para quem está em `ADMIN_EMAILS` (os outros recebem 403); senhas nunca aparecem | `routers/admin.py` |
| Foto de perfil: só JPG/PNG/WebP/GIF de verdade, até 8 MB, sem bombas de descompressão; regravada em 256×256 **sem EXIF** (remove o GPS); nome aleatório de 128 bits | `avatars.py`, `routers/avatars.py` |
| Requisições acima de 10 MB recusadas antes de serem lidas | `main.py` |
| Toda consulta filtra pelo dono dos dados (evita IDOR) | `routers/*.py` |
| JWT com algoritmo fixo e validade obrigatória | `security.py` |
| Em produção: não sobe sem `SECRET_KEY` forte; `/docs` desligado | `config.py`, `main.py` |
| Cabeçalhos: CSP, `X-Frame-Options`, `nosniff`, HSTS (em HTTPS), `no-store` na API | `main.py` |

Limitação conhecida: os contadores de tentativas ficam na memória do servidor. Reiniciar zera tudo, e com mais de um servidor cada um conta separado. Para escalar, use Redis.

## Testar no celular durante o desenvolvimento

Rode `npm run dev -- --host` e abra no celular o endereço "Network" que o Vite mostrar (o celular precisa estar no mesmo Wi-Fi). Dá para usar o app normalmente, mas **instalar como PWA exige HTTPS**, e isso só funciona depois do deploy.

Para simular um celular no computador, abra o DevTools (`F12`) e ative o modo dispositivo (`Ctrl+Shift+M`).

## Erros comuns

| Sintoma | Causa e solução |
|---|---|
| `Activate.ps1 não pode ser carregado` | Rode `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` uma vez |
| A IA diz "não configurada" | Falta a `GEMINI_API_KEY` no `.env`, ou o backend não foi reiniciado depois de editar (o `--reload` não percebe mudanças no `.env`) |
| A IA diz "limite atingido" | O plano gratuito do Gemini limita as requisições por minuto e por dia. Espere um pouco |
| A IA diz "sobrecarregado" | O Google recusou por excesso de demanda (erro 503 "high demand"), mesmo após tentar os modelos reserva. É temporário. O erro real de cada tentativa aparece no log do Railway (*Deployments → View logs*) |
| O `uvicorn --reload` fica parado em "Reloading..." | Conexões abertas pelo proxy do Vite seguram o servidor antigo. Pare com `Ctrl+C` e suba de novo |
| Fiz login no Safari, mas o app instalado pede login de novo | É normal: no iPhone, o app instalado tem um armazenamento separado do Safari |
| O app instalado não atualiza | O service worker atualiza na próxima abertura. Feche o app completamente e abra de novo |
| Mudei `models.py` e deu erro de coluna inexistente | Faltou gerar a migração (veja "Mudar o banco de dados") |
| O deploy não sobe: "Defina a variável SECRET_KEY" | Em produção o app exige uma `SECRET_KEY` própria com 32+ caracteres |
| Os dados sumiram depois do deploy | Falta o volume persistente em `/data` (veja o README) |
| `npm run build` falha com `ERR_DLOPEN_FAILED` / erro 4551 | O Controle Inteligente de Aplicativos do Windows 11 bloqueou um binário nativo. O rollup já usa a versão WebAssembly (`overrides` no `package.json`); se outro pacote nativo for bloqueado, procure a versão `wasm` dele em vez de desligar a proteção |

## Decisões técnicas e o que muda se o app crescer

- **Um único serviço.** Em produção, o FastAPI serve a API (`/api`) e também o build do React. Fica uma só URL e não é preciso configurar CORS. Em desenvolvimento, o Vite faz proxy de `/api` para o backend.
- **SQLite.** Aguenta bem dezenas de usuários (com o modo WAL ligado, leituras não esperam gravações). Para muitos usuários simultâneos, troque para Postgres: com o SQLAlchemy e o Alembic, basta mudar a `DATABASE_URL` em `config.py`.
- **Backup.** O banco inteiro é o arquivo `/data/axiigains.db` no volume. Faça cópias de vez em quando.
- **Servidor que dorme (App Sleeping).** No deploy, o servidor pode desligar quando ninguém usa. A primeira requisição depois disso recebe 502 do proxy enquanto ele acorda. Por isso o `lib/api.js` tenta de novo sozinho (até 4 vezes, com 1s, 2s, 4s e 8s de espera) nos erros que vêm do proxy, e o login só é apagado num 401 de verdade.
- **Login.** Token JWT de 30 dias, salvo no `localStorage`. É simples e adequado para um app entre amigos (a CSP reduz o risco de roubo do token). Para algo maior, considere tokens de curta duração com renovação automática.
- **Histórico independente das fichas.** Cada série registrada guarda o *nome* do exercício, e não um vínculo com a ficha. Por isso editar ou apagar uma ficha não altera o histórico.
- **Gemini.** A resposta é pedida em JSON, no formato do schema `AISuggestOut`. O plano gratuito tem limites de uso, e o Google pode usar os dados enviados para melhorar os modelos. Não envie informações sensíveis.

## Trocar o ícone e as splash screens

Edite `frontend/public/icon.svg` (o ícone) e `frontend/public/splash-logo.svg` (o logo da splash screen), depois rode:

```powershell
cd frontend
npm run icons
```

Se a Apple lançar novos tamanhos de tela, o gerador imprime as tags `<link rel="apple-touch-startup-image">`. Atualize essas tags no `index.html`.
