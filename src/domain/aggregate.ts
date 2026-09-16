/**
 * Agregados por pregunta. FR-041, FR-044, FR-078.
 */

/** Conteo por opción sobre las respuestas **recibidas**, no sobre los presentes. */
export function distributionOf(
  answers: ReadonlyArray<{ optionIndex: number }>,
  optionCount: number,
): number[] {
  const counts = new Array<number>(optionCount).fill(0);
  for (const a of answers) {
    if (Number.isInteger(a.optionIndex) && a.optionIndex >= 0 && a.optionIndex < optionCount) {
      counts[a.optionIndex] = (counts[a.optionIndex] ?? 0) + 1;
    }
  }
  return counts;
}

/** Porcentaje entero de acierto. **0 con cero respuestas**, nunca `NaN` (FR-078). */
export function correctPctOf(
  answers: ReadonlyArray<{ optionIndex: number }>,
  correctIndex: number,
): number {
  if (answers.length === 0) return 0;
  const correct = answers.filter((a) => a.optionIndex === correctIndex).length;
  return Math.round((100 * correct) / answers.length);
}
