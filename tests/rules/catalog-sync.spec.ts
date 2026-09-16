/**
 * T021 — Las dos copias del catálogo de apodos deben coincidir.
 *
 * `src/domain/nickname.ts` y `firestore.rules` llevan la misma lista duplicada. La
 * duplicación es inevitable: las reglas no pueden importar TypeScript. Lo que sí se
 * puede evitar es que divergan en silencio, y eso es lo que hace este test.
 *
 * Una divergencia rompería FR-054 —un apodo que el dominio genera y las reglas
 * rechazan bloquea entradas legítimas— o al contrario, dejaría pasar texto que el
 * dominio no genera. Ninguna de las dos se notaría hasta estar frente a la sala.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ADJECTIVES, ANIMALS } from '../../src/domain/nickname';

function listaDeReglas(nombre: string): string[] {
  const rules = readFileSync('firestore.rules', 'utf8');
  const m = new RegExp(`function ${nombre}\\(\\)\\s*\\{\\s*return \\[(.*?)\\];`, 's').exec(rules);
  if (m === null) throw new Error(`no se encontró la función ${nombre}() en firestore.rules`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

describe('sincronización del catálogo', () => {
  it('ADJECTIVES coincide elemento a elemento', () => {
    expect(listaDeReglas('ADJECTIVES')).toEqual([...ADJECTIVES]);
  });

  it('ANIMALS coincide elemento a elemento', () => {
    expect(listaDeReglas('ANIMALS')).toEqual([...ANIMALS]);
  });

  it('el espacio que validan las reglas también supera las 5000 combinaciones', () => {
    expect(
      listaDeReglas('ADJECTIVES').length * listaDeReglas('ANIMALS').length,
    ).toBeGreaterThanOrEqual(5000);
  });
});
