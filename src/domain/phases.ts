/**
 * Máquina de fases. Espejo en dominio de la tabla de transiciones del contrato de
 * reglas (contracts/firestore-rules.md).
 *
 * La duplicación es deliberada: el dominio la usa para no ofrecer acciones
 * imposibles, y las reglas la hacen cumplir. **La del dominio es conveniencia; la
 * de las reglas es la autoridad.**
 */
import type { EffectivePhase, StoredPhase } from './types';

/** Pares (origen, destino) permitidos. Todo lo demás se rechaza. */
const TRANSICIONES: ReadonlyArray<readonly [StoredPhase, StoredPhase]> = [
  ['lobby', 'open'],
  ['open', 'revealed'],
  ['revealed', 'open'],
  ['revealed', 'podium'],
  ['podium', 'archived'],
  // FR-022: publicar una ronda nueva archiva la anterior, esté donde esté.
  // No rompe FR-023 porque `archived` es terminal.
  ['lobby', 'archived'],
  ['open', 'archived'],
  ['revealed', 'archived'],
];

export function canTransition(
  from: StoredPhase,
  to: StoredPhase,
  currentIndex: number,
  nextIndex: number,
  questionCount: number,
): boolean {
  // Repetir la fase es el doble clic. Se rechaza (FR-018).
  if (from === to) return false;
  if (!TRANSICIONES.some(([f, t]) => f === from && t === to)) return false;

  if (to === 'open') {
    // Estrictamente hacia adelante y sin saltarse preguntas (FR-023).
    const esperado = from === 'lobby' ? 0 : currentIndex + 1;
    return nextIndex === esperado && nextIndex < questionCount;
  }

  if (to === 'podium') {
    // Solo tras revelar la última.
    return currentIndex + 1 === questionCount;
  }

  return true;
}

/**
 * Instante de cierre de la pregunta en curso. Es **dato derivado**, no una acción:
 * queda fijado al abrir (FR-015) y nadie tiene que ejecutarlo.
 */
export function deadlineMs(openedAtMs: number, timeLimitSec: number): number {
  return openedAtMs + timeLimitSec * 1000;
}

/**
 * Fase que la UI debe pintar, que puede diferir de la almacenada.
 *
 * `closed` solo existe aquí: no hay transición almacenada que lo produzca ni que
 * salga de él, y las reglas no lo conocen.
 */
export function effectivePhase(
  stored: StoredPhase,
  openedAtMs: number | null,
  timeLimitSec: number | null,
  nowMs: number,
): EffectivePhase {
  if (stored !== 'open') return stored;
  if (openedAtMs === null || timeLimitSec === null) return stored;
  return nowMs >= deadlineMs(openedAtMs, timeLimitSec) ? 'closed' : 'open';
}

/**
 * Milisegundos restantes, nunca negativos.
 *
 * `nowMs` entra como argumento en lugar de leerse del reloj: así la función es
 * pura, y el llamador ve que el reloj del cliente solo sirve para pintar (FR-034).
 */
export function remainingMs(openedAtMs: number, timeLimitSec: number, nowMs: number): number {
  return Math.max(0, deadlineMs(openedAtMs, timeLimitSec) - nowMs);
}
