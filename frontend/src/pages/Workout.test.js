// "Atualizar a ficha com as cargas de hoje": a carga muda série por série
import { describe, expect, it } from "vitest";
import { planWithTodaysWeights } from "./Workout";

const plan = {
  name: "Treino A",
  notes: null,
  exercises: [
    {
      name: "Supino",
      rest_seconds: 90,
      notes: null,
      sets: [
        { reps: "12", weight: 40 },
        { reps: "10", weight: 45 },
        { reps: "8", weight: 50 },
      ],
    },
    { name: "Crucifixo", rest_seconds: 60, notes: null, sets: [{ reps: "15", weight: null }] },
  ],
};

const draft = (supinoSets, crucifixo = [{ reps: "15", weight: "", done: false }]) => ({
  exercises: [
    { name: "Supino", sets: supinoSets },
    { name: "Crucifixo", sets: crucifixo },
  ],
});

describe("planWithTodaysWeights", () => {
  it("mantém a pirâmide: cada série recebe a carga usada nela", () => {
    const result = planWithTodaysWeights(
      plan,
      draft([
        { reps: "12", weight: "42,5", done: true },
        { reps: "10", weight: "47,5", done: true },
        { reps: "8", weight: "52,5", done: true },
      ]),
    );
    expect(result.exercises[0].sets).toEqual([
      { reps: "12", weight: 42.5 },
      { reps: "10", weight: 47.5 },
      { reps: "8", weight: 52.5 },
    ]);
  });

  it("série não feita ou sem carga mantém o valor da ficha", () => {
    const result = planWithTodaysWeights(
      plan,
      draft([
        { reps: "12", weight: "60", done: false }, // não marcou: ignora
        { reps: "10", weight: "", done: true }, // marcou sem carga: ignora
        { reps: "8", weight: "55", done: true },
      ]),
    );
    expect(result.exercises[0].sets.map((s) => s.weight)).toEqual([40, 45, 55]);
    expect(result.exercises[1].sets).toEqual([{ reps: "15", weight: null }]);
  });

  it("séries extras feitas no treino não entram na ficha", () => {
    const result = planWithTodaysWeights(
      plan,
      draft([
        { reps: "12", weight: "40", done: true },
        { reps: "10", weight: "45", done: true },
        { reps: "8", weight: "50", done: true },
        { reps: "6", weight: "55", done: true },
      ]),
    );
    expect(result.exercises[0].sets).toHaveLength(3);
  });

  it("não mistura exercícios se o rascunho estiver desatualizado", () => {
    const stale = { exercises: [{ name: "Agachamento", sets: [{ weight: "100", done: true }] }] };
    expect(planWithTodaysWeights(plan, stale).exercises[0].sets.map((s) => s.weight)).toEqual([40, 45, 50]);
  });
});

describe("planWithTodaysWeights e bi-set", () => {
  it("finalizar o treino não desfaz o bi-set da ficha", () => {
    const linked = { ...plan, exercises: [{ ...plan.exercises[0], linked_to_next: true }, plan.exercises[1]] };
    const result = planWithTodaysWeights(linked, draft([{ reps: "12", weight: "40", done: true }]));
    expect(result.exercises.map((e) => e.linked_to_next)).toEqual([true, undefined]);
  });
});
