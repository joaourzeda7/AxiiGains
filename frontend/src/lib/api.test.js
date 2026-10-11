// Testes da "tentativa automática" quando o servidor está acordando (App Sleeping no Railway)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api, { isWakingUp } from "./api";

const fail = (status, data) => Object.assign(new Error("falhou"), { response: status ? { status, data } : undefined });

describe("isWakingUp", () => {
  it.each([
    ["sem resposta (rede)", fail(), true],
    ["502 do proxy", fail(502, "<html>Bad Gateway</html>"), true],
    ["504 do proxy", fail(504, ""), true],
    ["503 do nosso app (IA indisponível)", fail(503, { detail: "O Gemini está indisponível" }), false],
    ["401 (login inválido)", fail(401, { detail: "Sessão inválida" }), false],
    ["422 (dados inválidos)", fail(422, { detail: [] }), false],
    ["tempo esgotado", Object.assign(fail(), { code: "ECONNABORTED" }), false],
  ])("%s → %s", (_, error, expected) => {
    expect(isWakingUp(error)).toBe(expected);
  });
});

describe("tentativas automáticas", () => {
  let originalAdapter;
  beforeEach(() => {
    vi.useFakeTimers();
    originalAdapter = api.defaults.adapter;
  });
  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    vi.useRealTimers();
  });

  /** Adaptador falso: responde com a sequência de respostas dada, uma por chamada. */
  function fakeServer(...responses) {
    const calls = [];
    api.defaults.adapter = (config) => {
      calls.push(config.url);
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (next.status >= 400) {
        const error = Object.assign(new Error(`HTTP ${next.status}`), { config, response: { ...next, config } });
        return Promise.reject(error);
      }
      return Promise.resolve({ ...next, config, headers: {}, statusText: "OK" });
    };
    return calls;
  }

  it("tenta de novo enquanto o servidor acorda e entrega a resposta", async () => {
    const calls = fakeServer({ status: 502, data: "Bad Gateway" }, { status: 502, data: "" }, { status: 200, data: { ok: true } });
    const request = api.get("/auth/me");
    await vi.runAllTimersAsync();
    await expect(request).resolves.toMatchObject({ data: { ok: true } });
    expect(calls).toHaveLength(3);
  });

  it("desiste depois de 4 novas tentativas", async () => {
    const calls = fakeServer({ status: 502, data: "" });
    const request = api.get("/auth/me").catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await request).response.status).toBe(502);
    expect(calls).toHaveLength(5); // 1 original + 4 novas
  });

  it("não repete erros do próprio app", async () => {
    const calls = fakeServer({ status: 503, data: { detail: "Limite gratuito do Gemini atingido" } });
    const request = api.post("/ai/suggest").catch((e) => e);
    await vi.runAllTimersAsync();
    expect((await request).response.status).toBe(503);
    expect(calls).toHaveLength(1);
  });
});
