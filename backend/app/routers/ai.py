import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status
from google import genai
from google.genai import errors, types

from app.config import GEMINI_API_KEY, GEMINI_FALLBACK_MODELS, GEMINI_MODEL
from app.models import User
from app.ratelimit import ai_limiter
from app.schemas import AISuggestIn, AISuggestOut
from app.security import get_current_user

router = APIRouter(prefix="/ai", tags=["IA"])
logger = logging.getLogger("axiigains.ai")

RETRYABLE = {500, 503, 504}  # erros temporários do lado do Google
ATTEMPTS_PER_MODEL = 2
RETRY_DELAY_SECONDS = 1.5

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
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        # Pedimos JSON no formato exato do schema → nada de "parsear" texto livre
        response_mime_type="application/json",
        response_schema=AISuggestOut,
        temperature=0.7,
    )
    return _generate_with_fallback(prompt, config)


def _generate_with_fallback(prompt: str, config: types.GenerateContentConfig) -> AISuggestOut:
    """Tenta o modelo principal e, se ele falhar, os reservas (GEMINI_FALLBACK_MODELS).

    - 500/503/504 (Google sobrecarregado, "high demand"): tenta mais uma vez o mesmo
      modelo após uma pausa e depois passa para o próximo.
    - 429 (cota esgotada) ou 404 (modelo indisponível): passa direto para o próximo.
      No plano gratuito a cota é separada por modelo, então o reserva costuma funcionar.
    - 400/401/403 (chave inválida): não adianta tentar outro modelo; para na hora.
    """
    client = _get_client()
    last_code = None
    for model in [GEMINI_MODEL, *GEMINI_FALLBACK_MODELS]:
        for attempt in range(1, ATTEMPTS_PER_MODEL + 1):
            try:
                response = client.models.generate_content(model=model, contents=prompt, config=config)
            except errors.APIError as e:
                last_code = e.code
                # O erro real vai para o log do servidor (no Railway: Deployments → View logs)
                logger.warning("Gemini %s falhou (tentativa %d): %s %s", model, attempt, e.code, e.message)
                if e.code in (400, 401, 403):
                    raise HTTPException(
                        status.HTTP_503_SERVICE_UNAVAILABLE,
                        "A chave do Gemini é inválida ou não tem permissão.",
                    )
                if e.code in RETRYABLE and attempt < ATTEMPTS_PER_MODEL:
                    time.sleep(RETRY_DELAY_SECONDS)
                    continue
                break  # próximo modelo

            result = response.parsed
            if isinstance(result, AISuggestOut) and result.plans:
                if model != GEMINI_MODEL:
                    logger.warning("Gemini: plano gerado com o modelo reserva %s", model)
                return result
            logger.warning("Gemini %s devolveu resposta vazia ou fora do formato", model)
            break  # próximo modelo

    if last_code == 429:
        detail = "Limite gratuito do Gemini atingido. Tente de novo em alguns minutos."
    elif last_code == 404:
        detail = "Nenhum modelo do Gemini configurado está disponível. Ajuste GEMINI_MODEL."
    elif last_code is None:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "A IA devolveu uma resposta inesperada. Tente de novo.")
    else:
        detail = "O Gemini está sobrecarregado agora (pico de uso no Google). Tente de novo em alguns minutos."
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail)
