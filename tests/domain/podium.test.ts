/**
 * T046 — Podio (FR-047, FR-048, FR-050).
 */
import { describe, expect, it } from 'vitest';
import { rankParticipants, topThree } from '../../src/domain/podium';
import type { ParticipantScore } from '../../src/domain/types';

function s(uid: string, totalPoints: number, totalElapsedMs: number): ParticipantScore {
  return {
    uid,
    adjective: 'Astuto',
    animal: 'Zorro',
    perQuestion: [],
    totalPoints,
    totalElapsedMs,
    correctCount: 0,
    rank: null,
  };
}

const ranks = (xs: ReturnType<typeof rankParticipants>) => xs.map((x) => [x.uid, x.rank]);

describe('rankParticipants', () => {
  it('más puntos primero', () => {
    expect(ranks(rankParticipants([s('a', 100, 0), s('b', 300, 0), s('c', 200, 0)]))).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('empate en puntos resuelto por menos tiempo acumulado (FR-048)', () => {
    expect(ranks(rankParticipants([s('lento', 200, 9_000), s('rapido', 200, 3_000)]))).toEqual([
      ['rapido', 1],
      ['lento', 2],
    ]);
  });

  it('empate exacto: comparten posición y la siguiente salta', () => {
    expect(
      ranks(rankParticipants([s('a', 200, 5_000), s('b', 200, 5_000), s('c', 100, 0)])),
    ).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
  });

  it('cero participantes', () => {
    expect(rankParticipants([])).toEqual([]);
  });

  it('todos con cero puntos: decide el tiempo', () => {
    const r = rankParticipants([s('a', 0, 60_000), s('b', 0, 30_000)]);
    expect(ranks(r)).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });
});

describe('topThree', () => {
  it('uno y dos participantes: solo las posiciones que existen (FR-050)', () => {
    expect(topThree(rankParticipants([s('a', 1, 0)]))).toHaveLength(1);
    expect(topThree(rankParticipants([s('a', 1, 0), s('b', 2, 0)]))).toHaveLength(2);
  });

  it('con más de tres, las tres primeras', () => {
    const r = rankParticipants([s('a', 4, 0), s('b', 3, 0), s('c', 2, 0), s('d', 1, 0)]);
    expect(topThree(r).map((x) => x.uid)).toEqual(['a', 'b', 'c']);
  });

  it('un empate en la tercera posición no deja fuera a nadie', () => {
    const r = rankParticipants([s('a', 4, 0), s('b', 3, 0), s('c', 2, 0), s('d', 2, 0)]);
    expect(topThree(r).map((x) => x.uid)).toEqual(['a', 'b', 'c', 'd']);
  });
});
