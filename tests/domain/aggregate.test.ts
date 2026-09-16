/**
 * T044 — Agregados (FR-041, FR-044, FR-078).
 */
import { describe, expect, it } from 'vitest';
import { correctPctOf, distributionOf } from '../../src/domain/aggregate';

const a = (...opts: number[]) => opts.map((optionIndex) => ({ optionIndex }));

describe('distributionOf', () => {
  it('cuenta por opción', () => {
    expect(distributionOf(a(0, 1, 1, 3), 4)).toEqual([1, 2, 0, 1]);
  });

  it('con cero respuestas, todo en cero', () => {
    expect(distributionOf([], 4)).toEqual([0, 0, 0, 0]);
  });

  it('ignora índices fuera de rango', () => {
    expect(distributionOf(a(0, 7, -1), 4)).toEqual([1, 0, 0, 0]);
  });
});

describe('correctPctOf', () => {
  it('con cero respuestas devuelve 0, nunca NaN (FR-078)', () => {
    const pct = correctPctOf([], 1);
    expect(pct).toBe(0);
    expect(Number.isNaN(pct)).toBe(false);
  });

  it('una sola respuesta es el 100% del total de respuestas, no de los presentes (FR-044)', () => {
    expect(correctPctOf(a(2), 2)).toBe(100);
    expect(distributionOf(a(2), 4)).toEqual([0, 0, 1, 0]);
  });

  it('redondea a entero', () => {
    expect(correctPctOf(a(1, 1, 0), 1)).toBe(67);
  });
});
