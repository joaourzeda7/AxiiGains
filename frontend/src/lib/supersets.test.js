import { describe, expect, it } from "vitest";
import { groupExercises, groupLabel, groupLabelsByIndex } from "./supersets";

const ex = (name, linked = false) => ({ name, linked_to_next: linked });
const names = (groups) => groups.map((g) => g.map(({ exercise }) => exercise.name));

describe("groupExercises", () => {
  it("exercícios soltos ficam cada um no seu bloco", () => {
    expect(names(groupExercises([ex("A"), ex("B"), ex("C")]))).toEqual([["A"], ["B"], ["C"]]);
  });

  it("bi-set e tri-set na mesma ficha", () => {
    const plan = [ex("A", true), ex("B"), ex("C", true), ex("D", true), ex("E"), ex("F")];
    expect(names(groupExercises(plan))).toEqual([["A", "B"], ["C", "D", "E"], ["F"]]);
  });

  it("guarda o índice original de cada exercício", () => {
    const groups = groupExercises([ex("A"), ex("B", true), ex("C")]);
    expect(groups[1].map(({ index }) => index)).toEqual([1, 2]);
  });

  it("link no último exercício não cria bloco fantasma", () => {
    expect(names(groupExercises([ex("A"), ex("B", true)]))).toEqual([["A"], ["B"]]);
  });

  it("lista vazia", () => {
    expect(groupExercises([])).toEqual([]);
  });
});

describe("groupLabel", () => {
  it.each([
    [1, null],
    [2, "Bi-set"],
    [3, "Tri-set"],
    [4, "Circuito"],
    [6, "Circuito"],
  ])("%i exercícios → %s", (size, label) => {
    expect(groupLabel(size)).toBe(label);
  });
});

describe("groupLabelsByIndex", () => {
  it("rótulo de cada exercício pelo bloco em que está", () => {
    expect(groupLabelsByIndex([ex("A", true), ex("B"), ex("C")])).toEqual(["Bi-set", "Bi-set", null]);
  });
});
