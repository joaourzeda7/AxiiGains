// Testes das funções de data e número. Rodar com: npm test
//
// O fuso é fixado em São Paulo: os bugs de data mais comuns aparecem justamente à noite
// no Brasil, quando em UTC (o fuso do toISOString) já é o dia seguinte.
process.env.TZ = "America/Sao_Paulo";

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentWeekDates,
  estimateMinutes,
  firstNumber,
  formatKg,
  formatRelative,
  parseDate,
  parseNumber,
  sessionVolume,
  todayISO,
} from "./format";

afterEach(() => vi.useRealTimers());

const at = (iso) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

describe("todayISO", () => {
  it("usa o dia do aparelho, não o de UTC", () => {
    at("2026-10-10T02:30:00Z"); // 23h30 do dia 09 em São Paulo
    expect(todayISO()).toBe("2026-10-09");
  });

  it("de manhã coincide com UTC", () => {
    at("2026-10-10T12:00:00Z");
    expect(todayISO()).toBe("2026-10-10");
  });
});

describe("parseDate", () => {
  it("interpreta a data no fuso local (não volta um dia)", () => {
    const d = parseDate("2026-10-09");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 9]);
  });
});

describe("currentWeekDates", () => {
  it("vai de segunda a domingo", () => {
    at("2026-10-07T15:00:00Z"); // quarta
    expect(currentWeekDates()).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("no domingo à noite ainda é a mesma semana", () => {
    at("2026-10-12T02:00:00Z"); // domingo 11/10, 23h em São Paulo
    const week = currentWeekDates();
    expect(week[0]).toBe("2026-10-05");
    expect(week[6]).toBe("2026-10-11");
  });

  it("atravessa a virada do mês", () => {
    at("2026-09-30T15:00:00Z"); // quarta
    expect(currentWeekDates()).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("formatRelative", () => {
  it.each([
    ["2026-10-10", "Hoje"],
    ["2026-10-09", "Ontem"],
    ["2026-10-07", "Há 3 dias"],
  ])("%s → %s", (date, expected) => {
    at("2026-10-10T15:00:00Z");
    expect(formatRelative(date)).toBe(expected);
  });
});

describe("parseNumber", () => {
  it.each([
    ["12,5", 12.5], // teclado brasileiro
    ["12.5", 12.5],
    ["40", 40],
    ["", null],
    [null, null],
    ["abc", null],
  ])("%s → %s", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe("firstNumber", () => {
  it.each([
    ["8-12", 8],
    ["15", 15],
    ["30-45s", 30],
    ["até a falha", null],
    [undefined, null],
  ])("%s → %s", (input, expected) => {
    expect(firstNumber(input)).toBe(expected);
  });
});

describe("formatKg", () => {
  it("usa vírgula e no máximo uma casa decimal", () => {
    expect(formatKg(62.5)).toBe("62,5 kg");
    expect(formatKg(80)).toBe("80 kg");
    expect(formatKg(1480)).toBe("1.480 kg");
    expect(formatKg(null)).toBe("—");
  });
});

describe("estimateMinutes", () => {
  it("soma ~40s por série mais o descanso e arredonda para 5 min", () => {
    const plan = { exercises: [{ sets: 4, rest_seconds: 90 }, { sets: 3, rest_seconds: 60 }] };
    // 4 × 130s + 3 × 100s = 820s ≈ 13,7 min → 15
    expect(estimateMinutes(plan)).toBe(15);
  });

  it("usa 60s de descanso quando não informado e nunca devolve menos de 5", () => {
    expect(estimateMinutes({ exercises: [{ sets: 1, rest_seconds: null }] })).toBe(5);
  });
});

describe("sessionVolume", () => {
  it("soma repetições × carga", () => {
    expect(sessionVolume({ sets: [{ reps: 10, weight: 40 }, { reps: 8, weight: 45 }] })).toBe(760);
  });
});
