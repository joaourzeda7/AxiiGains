"""Limite de requisições (rate limit) simples, em memória.

Exemplo: no máximo 10 tentativas de login a cada 5 minutos por IP.
Isso impede ataques de força bruta (testar milhares de senhas) e protege a cota do Gemini.

Limitação conhecida: os contadores ficam na memória do processo. Reiniciar o servidor
zera tudo, e com vários processos/servidores cada um teria o seu contador. Para um app
com um único servidor (o nosso caso) funciona bem; para escalar, use Redis.
"""
import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int, message: str):
        self.max_requests = max_requests
        self.window = window_seconds
        self.message = message
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()  # o FastAPI atende requisições em várias threads

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            # descarta as tentativas que já saíram da janela de tempo
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.max_requests:
                retry_after = math.ceil(hits[0] + self.window - now)
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    self.message,
                    headers={"Retry-After": str(max(retry_after, 1))},
                )
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(request: Request) -> str:
    # Atrás do proxy do Railway, o uvicorn (com --proxy-headers) já coloca aqui o IP real
    return request.client.host if request.client else "desconhecido"


login_limiter = RateLimiter(10, 5 * 60, "Muitas tentativas de login. Aguarde alguns minutos e tente de novo.")
register_limiter = RateLimiter(5, 60 * 60, "Muitos cadastros a partir desta rede. Tente mais tarde.")
ai_limiter = RateLimiter(8, 60 * 60, "Você atingiu o limite de 8 planos por hora. Tente de novo mais tarde.")

ALL_LIMITERS = (login_limiter, register_limiter, ai_limiter)
