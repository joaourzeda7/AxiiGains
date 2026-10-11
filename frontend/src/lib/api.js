import axios from "axios";

const TOKEN_KEY = "axii_token";

// localStorage pode falhar (ex.: navegação privada no Safari), então protegemos com try/catch
export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* sem armazenamento: o login dura só enquanto a página estiver aberta */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nada a fazer */
    }
  },
};

// Em dev o Vite repassa /api para o FastAPI (proxy); em produção é o mesmo servidor
const api = axios.create({ baseURL: "/api", timeout: 60000 });

// Coloca o token em toda requisição
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const MAX_RETRIES = 4;

/** O servidor está "acordando"? (no deploy, ele dorme quando ninguém usa)
 *  Nesses casos a requisição nem chegou ao app, então é seguro tentar de novo. */
export function isWakingUp(error) {
  if (error.code === "ECONNABORTED") return false; // estourou o tempo: pode ter chegado ao servidor
  if (!error.response) return true; // sem resposta: falha de rede
  const { status, data } = error.response;
  // 502/503/504 vindos do proxy do Railway, e não do nosso app (os nossos sempre têm "detail")
  return [502, 503, 504].includes(status) && !data?.detail;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (config && isWakingUp(error) && (config.retries ?? 0) < MAX_RETRIES) {
      config.retries = (config.retries ?? 0) + 1;
      await wait(1000 * 2 ** (config.retries - 1)); // 1s, 2s, 4s, 8s
      return api(config);
    }
    // Token expirado/inválido → desloga em qualquer tela
    if (error.response?.status === 401 && tokenStore.get()) {
      tokenStore.clear();
      window.dispatchEvent(new Event("axii:logout"));
    }
    return Promise.reject(error);
  },
);

/** Transforma o erro da API em uma frase para mostrar ao usuário. */
export function errorMessage(error, fallback = "Algo deu errado. Tente novamente.") {
  if (!error.response) return "Sem conexão com o servidor.";
  const detail = error.response.data?.detail;
  if (typeof detail === "string") return detail;
  // Erros de validação do Pydantic vêm como lista
  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg.replace(/^Value error, /, "");
  }
  return fallback;
}

export default api;
