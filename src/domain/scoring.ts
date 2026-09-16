/**
 * Puntuación. FR-037 a FR-040.
 *
 * Se conserva la fórmula del prototipo, confirmada en Clarifications: 100 puntos por
 * acertar, más hasta 100 de bonificación proporcional al tiempo que quedaba.
 */
import type { QuestionOutcome } from './types';

export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 100;

/** Puntos de una respuesta. Cero si es incorrecta, aunque sea instantánea. */
export function pointsFor(correct: boolean, elapsedMs: number, timeLimitSec: number): number {
  if (!correct) return 0;
  const limitMs = timeLimitSec * 1000;
  if (limitMs <= 0) return BASE_POINTS;
  // Acotado a [0, 1]: nunca bonificación negativa, ni mayor que la máxima.
  const remaining = Math.min(1, Math.max(0, 1 - elapsedMs / limitMs));
  return BASE_POINTS + Math.round(MAX_SPEED_BONUS * remaining);
}

/**
 * Resultado imputado a una pregunta sin respuesta: cero puntos y el tiempo límite
 * **completo**, para que abstenerse nunca mejore el desempate (FR-040).
 */
export function unansweredOutcome(timeLimitSec: number): QuestionOutcome {
  return { correct: false, points: 0, elapsedMs: timeLimitSec * 1000 };
}

/**
 * Totales de un participante. `perQuestion[i]` ausente cuenta como no respondida; así
 * quien entró tarde recibe cero en las preguntas ya cerradas (FR-063).
 */
export function totalsFor(
  perQuestion: ReadonlyArray<QuestionOutcome | undefined>,
  timeLimits: ReadonlyArray<number>,
): { totalPoints: number; totalElapsedMs: number; correctCount: number } {
  let totalPoints = 0;
  let totalElapsedMs = 0;
  let correctCount = 0;
  timeLimits.forEach((limit, i) => {
    const o = perQuestion[i] ?? unansweredOutcome(limit);
    totalPoints += o.points;
    totalElapsedMs += Math.min(o.elapsedMs, limit * 1000);
    if (o.correct) correctCount++;
  });
  return { totalPoints, totalElapsedMs, correctCount };
}
