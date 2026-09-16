/**
 * T042 — Puntuación (FR-037, FR-038, FR-039, FR-040).
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_POINTS,
  MAX_SPEED_BONUS,
  pointsFor,
  totalsFor,
  unansweredOutcome,
} from '../../src/domain/scoring';

describe('pointsFor', () => {
  it('respuesta instantánea: bono completo', () => {
    expect(pointsFor(true, 0, 30)).toBe(BASE_POINTS + MAX_SPEED_BONUS);
  });

  it('en el último instante: bono cero, nunca negativo', () => {
    expect(pointsFor(true, 30_000, 30)).toBe(BASE_POINTS);
    expect(pointsFor(true, 45_000, 30)).toBe(BASE_POINTS);
  });

  it('a mitad del plazo: la mitad del bono', () => {
    expect(pointsFor(true, 15_000, 30)).toBe(BASE_POINTS + 50);
  });

  it('incorrecta: cero aunque sea instantánea (FR-038)', () => {
    expect(pointsFor(false, 0, 30)).toBe(0);
  });

  it('un tiempo transcurrido negativo no da más que el máximo', () => {
    expect(pointsFor(true, -5_000, 30)).toBe(BASE_POINTS + MAX_SPEED_BONUS);
  });
});

describe('totalsFor', () => {
  it('suma puntos, tiempo y aciertos (FR-039)', () => {
    const t = totalsFor(
      [
        { correct: true, points: 180, elapsedMs: 6_000 },
        { correct: false, points: 0, elapsedMs: 2_000 },
      ],
      [30, 30],
    );
    expect(t).toEqual({ totalPoints: 180, totalElapsedMs: 8_000, correctCount: 1 });
  });

  it('una pregunta no respondida aporta cero puntos y el tiempo límite completo (FR-040)', () => {
    const t = totalsFor([{ correct: true, points: 200, elapsedMs: 0 }, undefined], [30, 45]);
    expect(t).toEqual({ totalPoints: 200, totalElapsedMs: 45_000, correctCount: 1 });
  });

  it('abstenerse nunca mejora el desempate frente a responder mal a tiempo', () => {
    const abstuvo = totalsFor([undefined], [30]);
    const fallo = totalsFor([{ correct: false, points: 0, elapsedMs: 29_000 }], [30]);
    expect(abstuvo.totalPoints).toBe(fallo.totalPoints);
    expect(abstuvo.totalElapsedMs).toBeGreaterThan(fallo.totalElapsedMs);
  });

  it('unansweredOutcome es cero puntos y el límite en milisegundos', () => {
    expect(unansweredOutcome(20)).toEqual({ correct: false, points: 0, elapsedMs: 20_000 });
  });
});
