/**
 * Orden final y podio. FR-047, FR-048, FR-049, FR-050.
 */
import type { ParticipantScore } from './types';

export type RankedParticipant = ParticipantScore & { readonly rank: number };

/**
 * Más puntos primero; a igualdad, menos tiempo acumulado (FR-048). Si el empate
 * persiste, comparten posición y la siguiente salta: 1, 1, 3.
 */
export function rankParticipants(scores: ReadonlyArray<ParticipantScore>): RankedParticipant[] {
  const sorted = [...scores].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      a.totalElapsedMs - b.totalElapsedMs ||
      a.uid.localeCompare(b.uid),
  );
  const ranked: RankedParticipant[] = [];
  sorted.forEach((s, i) => {
    const prev = ranked[i - 1];
    const tied =
      prev !== undefined &&
      prev.totalPoints === s.totalPoints &&
      prev.totalElapsedMs === s.totalElapsedMs;
    ranked.push({ ...s, rank: tied ? prev.rank : i + 1 });
  });
  return ranked;
}

/**
 * Las tres primeras **posiciones**. Con menos participantes devuelve menos (FR-050);
 * con un empate en la tercera puede devolver más, porque dejar fuera a un empatado
 * sería decidir el podio al azar.
 */
export function topThree(ranked: ReadonlyArray<RankedParticipant>): RankedParticipant[] {
  return ranked.filter((r) => r.rank <= 3);
}
