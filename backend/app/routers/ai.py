from fastapi import APIRouter, Depends, HTTPException, status
from google import genai
from google.genai import errors, types

from app.config import GEMINI_API_KEY, GEMINI_MODEL
from app.models import User
from app.ratelimit import ai_limiter
from app.schemas import AISuggestIn, AISuggestOut
from app.security import get_current_user

router = APIRouter(prefix="/ai", tags=["IA"])

GOALS = {
    "hipertrofia": "ganho de massa muscular (hipertrofia)",
    "forca": "ganho de força",
    "emagrecimento": "emagrecimento e condicionamento",
    "resistencia": "resistência muscular",
    "saude": "saúde geral e qualidade de vida",
}
LEVELS = {"iniciante": "iniciante", "intermediario": "intermediário", "avancado": "avançado"}

SYSTEM_PROMPT = """Você é um personal trainer experiente e responsável.
Monte planos de treino de musculação seguros, objetivos e realistas para academia.
Regras:
- Responda em português do Brasil.
- Crie exatamente uma ficha por dia de treino disponível.
- Nomeie as fichas como "Treino A — <foco>", "Treino B — <foco>" etc.
- Use nomes de exercícios comuns em academias brasileiras (ex.: "Supino reto com barra").
- "reps" é texto, ex.: "8-12" ou "15". "rest_seconds" é o descanso entre séries.
- Ajuste volume e complexidade ao nível do aluno; iniciantes devem ter exercícios simples.
- Use apenas os equipamentos disponíveis.
- Respeite as observações do aluno (lesões, preferências). Em caso de lesão, seja conservador.
- Em "summary", explique a divisão escolhida em 2 ou 3 frases.
- Em "tips", dê de 3 a 5 dicas curtas e práticas."""

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if not GEMINI_API_KEY:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "IA não configurada: defina GEMINI_API_KEY no arquivo backend/.env.",
        )
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


@router.post("/suggest", response_model=AISuggestOut)
def suggest_plan(data: AISuggestIn, user: User = Depends(get_current_user)):
    # Cada geração gasta a cota gratuita do Gemini: limitamos por usuário
    ai_limiter.check(f"user:{user.id}")
    prompt = f"""Monte um plano de treino para este aluno:
- Objetivo: {GOALS[data.goal]}
- Nível: {LEVELS[data.level]}
- Dias de treino por semana: {data.days_per_week}
- Tempo por treino: cerca de {data.session_minutes} minutos
- Equipamentos disponíveis: {data.equipment}
- Observações do aluno: {data.notes or "nenhuma"}"""

    # "def" normal (sem async): o FastAPI roda em uma thread separada,
    # então esperar o Gemini não trava as outras requisições.
    try:
        response = _get_client().models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                # Pedimos JSON no formato exato do schema → nada de "parsear" texto livre
                response_mime_type="application/json",
                response_schema=AISuggestOut,
                temperature=0.7,
            ),
        )
    except errors.APIError as e:
        if e.code == 429:
            detail = "Limite gratuito do Gemini atingido. Tente de novo em alguns minutos."
        elif e.code in (400, 401, 403):
            detail = "A chave do Gemini é inválida ou não tem permissão."
        elif e.code == 404:
            detail = f"Modelo '{GEMINI_MODEL}' não encontrado. Ajuste GEMINI_MODEL no .env."
        else:
            detail = "O Gemini está indisponível agora. Tente novamente."
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail)

    result = response.parsed
    if not isinstance(result, AISuggestOut) or not result.plans:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "A IA devolveu uma resposta inesperada. Tente de novo."
        )
    return result
