export const GOALS = {
  hipertrofia: "Hipertrofia",
  forca: "Força",
  emagrecimento: "Emagrecimento",
  resistencia: "Resistência",
  saude: "Saúde geral",
};

export const LEVELS = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
};

/** Data de hoje no fuso do aparelho, no formato "AAAA-MM-DD".
 *  (toISOString() sozinho usa UTC e à noite já "vira" o dia seguinte no Brasil.) */
export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** "2026-10-09" → Date local (sem o problema de fuso de new Date("2026-10-09")). */
export function parseDate(iso) {
  return new Date(`${iso}T00:00:00`);
}

export function formatDate(iso, options = { day: "2-digit", month: "short" }) {
  return parseDate(iso).toLocaleDateString("pt-BR", options).replace(".", "");
}

export function formatRelative(iso) {
  const days = Math.round((parseDate(todayISO()) - parseDate(iso)) / 86400000);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7) return `Há ${days} dias`;
  return formatDate(iso, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatKg(value) {
  if (value == null) return "—";
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}

/** Aceita "12,5" (teclado brasileiro) e "12.5". Vazio → null. */
export function parseNumber(text) {
  if (text === "" || text == null) return null;
  const n = Number(String(text).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "8-12" → 8, "15" → 15 */
export function firstNumber(reps) {
  const match = String(reps ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function sessionVolume(session) {
  return session.sets.reduce((total, s) => total + s.reps * s.weight, 0);
}
