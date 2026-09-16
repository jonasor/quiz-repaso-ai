/**
 * T074 — Comprobación mecánica de FR-056.
 *
 * El presentador **sí** está autorizado por las reglas a leer respuestas individuales:
 * las necesita para calificar. Por eso ninguna regla puede impedir que una vista suya las
 * muestre, y la garantía tiene que ser estructural. Este test falla la build si:
 *
 * - algún archivo de `src/ui/` importa Firebase directamente, saltándose `src/data/`;
 * - alguna consulta sobre la colección `answers` vive fuera de `src/data/scores.ts`;
 * - `src/data/scores.ts` exporta el lector de respuestas.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

const read = (p: string) => readFileSync(p, 'utf8');

describe('superficie del presentador (FR-056)', () => {
  it('ningún archivo de la interfaz importa Firebase directamente', () => {
    const offenders = walk('src/ui').filter((f) => /from\s+['"]firebase\//.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('la única consulta sobre respuestas ajenas vive en src/data/scores.ts', () => {
    const offenders = walk('src')
      .filter((f) => f !== join('src', 'data', 'scores.ts'))
      .filter((f) => {
        const src = read(f);
        return /['"]answers['"]/.test(src) && /\bgetDocs\s*\(/.test(src);
      });
    expect(offenders).toEqual([]);
  });

  it('el lector de respuestas no se exporta', () => {
    const src = read('src/data/scores.ts');
    expect(src).toMatch(/async function readAnswersForQuestion/);
    expect(src).not.toMatch(/export\s+(async\s+)?function\s+readAnswersForQuestion/);
    expect(src).not.toMatch(/export\s*\{[^}]*readAnswersForQuestion/);
  });

  it('src/data/answers.ts solo toca la respuesta propia y un conteo agregado', () => {
    const src = read('src/data/answers.ts');
    expect(src).not.toMatch(/\bgetDocs\b/);
    expect(src).toMatch(/getCountFromServer/);
  });
});
