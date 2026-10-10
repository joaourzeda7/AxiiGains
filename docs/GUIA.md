# Guia de desenvolvimento

Anotações para quem for mexer no código: como testar, erros comuns e decisões técnicas.

## Testar no celular durante o desenvolvimento

Rode `npm run dev -- --host` e abra no celular o endereço "Network" que o Vite mostrar (o celular precisa estar no mesmo Wi-Fi). Dá para usar o app normalmente, mas **instalar como PWA exige HTTPS**, e isso só funciona depois do deploy.

Para simular um celular no computador, abra o DevTools (`F12`) e ative o modo dispositivo (`Ctrl+Shift+M`).

## Erros comuns

| Sintoma | Causa e solução |
|---|---|
| `Activate.ps1 não pode ser carregado` | Rode `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` uma vez |
| A IA diz "não configurada" | Falta a `GEMINI_API_KEY` no `.env`, ou o backend não foi reiniciado depois de editar (o `--reload` não percebe mudanças no `.env`) |
| A IA diz "limite atingido" | O plano gratuito do Gemini limita as requisições por minuto e por dia. Espere um pouco |
| Fiz login no Safari, mas o app instalado pede login de novo | É normal: no iPhone, o app instalado tem um armazenamento separado do Safari |
| O app instalado não atualiza | O service worker atualiza na próxima abertura. Feche o app completamente e abra de novo |
| Mudei um modelo em `models.py` e deu erro no banco | O `create_all` só cria tabelas novas e não altera as que já existem. Em desenvolvimento, apague o `axiigains.db`. Com usuários reais, use migrações (Alembic) |
| Os dados sumiram depois do deploy | Falta o volume persistente em `/data` (veja o README) |

## Decisões técnicas e o que muda se o app crescer

- **Um único serviço.** Em produção, o FastAPI serve a API (`/api`) e também o build do React. Fica uma só URL e não é preciso configurar CORS. Em desenvolvimento, o Vite faz proxy de `/api` para o backend.
- **SQLite.** Aguenta bem dezenas de usuários. Para muitos usuários simultâneos, troque para Postgres: com o SQLAlchemy, basta mudar a `DATABASE_URL` em `config.py`.
- **Migrações.** Antes de ter usuários reais, configure o Alembic. Assim você consegue mudar as tabelas sem perder dados.
- **Login.** Token JWT de 30 dias, salvo no `localStorage`. É simples e adequado para um app entre amigos. Para algo maior, considere tokens de curta duração com renovação automática.
- **Histórico independente das fichas.** Cada série registrada guarda o *nome* do exercício, e não um vínculo com a ficha. Por isso editar ou apagar uma ficha não altera o histórico.
- **Gemini.** A resposta é pedida em JSON, no formato do schema `AISuggestOut`. O plano gratuito tem limites de uso, e o Google pode usar os dados enviados para melhorar os modelos. Não envie informações sensíveis.

## Trocar o ícone e as splash screens

Edite `frontend/public/icon.svg` (o ícone) e `frontend/public/splash-logo.svg` (o logo da splash screen), depois rode:

```powershell
cd frontend
npm run icons
```

Se a Apple lançar novos tamanhos de tela, o gerador imprime as tags `<link rel="apple-touch-startup-image">`. Atualize essas tags no `index.html`.
