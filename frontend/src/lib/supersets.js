/** Agrupa os exercícios em blocos: cada exercício com `linked_to_next` emenda no seguinte.
 *
 *   [A→, B, C→, D→, E]  vira  [[A, B], [C, D, E]]   (um bi-set e um tri-set)
 *
 * Cada item guarda o exercício e o índice original (para editar/atualizar o certo). */
export function groupExercises(exercises) {
  const groups = [];
  exercises.forEach((exercise, index) => {
    const joinsPrevious = index > 0 && exercises[index - 1].linked_to_next;
    if (joinsPrevious) groups.at(-1).push({ exercise, index });
    else groups.push([{ exercise, index }]);
  });
  return groups;
}

/** Nome do bloco pelo tamanho: 2 = bi-set, 3 = tri-set, 4+ = circuito. */
export function groupLabel(size) {
  if (size === 2) return "Bi-set";
  if (size === 3) return "Tri-set";
  if (size > 3) return "Circuito";
  return null;
}

/** Para cada índice, o rótulo do bloco em que ele está (ou null se estiver sozinho). */
export function groupLabelsByIndex(exercises) {
  const labels = new Array(exercises.length).fill(null);
  for (const group of groupExercises(exercises)) {
    for (const { index } of group) labels[index] = groupLabel(group.length);
  }
  return labels;
}
