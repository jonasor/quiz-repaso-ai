import { describe, expect, it } from 'vitest';
import {
  ADJECTIVES,
  ANIMALS,
  displayNickname,
  generateNickname,
  isGeneratable,
  nicknameDocId,
} from '../../src/domain/nickname';

describe('catálogo', () => {
  it('supera las 5000 combinaciones que FR-008 exige', () => {
    // Dos órdenes de magnitud sobre los ~50 participantes de la escala objetivo.
    expect(ADJECTIVES.length * ANIMALS.length).toBeGreaterThanOrEqual(5000);
  });

  it('no tiene entradas repetidas, que reducirían el espacio en silencio', () => {
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(ANIMALS).size).toBe(ANIMALS.length);
  });

  it('no tiene entradas vacías ni con separadores que rompan el id de reserva', () => {
    for (const w of [...ADJECTIVES, ...ANIMALS]) {
      expect(w.length).toBeGreaterThan(0);
      expect(w).not.toContain('_');
      expect(w).not.toContain(' ');
    }
  });
});

describe('generateNickname', () => {
  it('es determinista con un rng inyectado', () => {
    const rng = () => 0;
    expect(generateNickname(rng)).toEqual({ adjective: ADJECTIVES[0], animal: ANIMALS[0] });
  });

  it('cubre el último elemento sin desbordar', () => {
    const rng = () => 0.999999;
    const n = generateNickname(rng);
    expect(n.adjective).toBe(ADJECTIVES[ADJECTIVES.length - 1]);
    expect(n.animal).toBe(ANIMALS[ANIMALS.length - 1]);
  });

  it('siempre produce un apodo del catálogo', () => {
    let seed = 42;
    const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 500; i++) {
      expect(isGeneratable(generateNickname(rng))).toBe(true);
    }
  });
});

describe('isGeneratable', () => {
  it('rechaza texto fuera del catálogo, que es lo que impide colar un nombre real', () => {
    expect(isGeneratable({ adjective: 'Jonathan', animal: 'Ortega' })).toBe(false);
    expect(isGeneratable({ adjective: ADJECTIVES[0]!, animal: 'Ortega' })).toBe(false);
    expect(isGeneratable({ adjective: 'Jonathan', animal: ANIMALS[0]! })).toBe(false);
  });

  it('rechaza cadena vacía y variantes de caja', () => {
    expect(isGeneratable({ adjective: '', animal: '' })).toBe(false);
    expect(isGeneratable({ adjective: ADJECTIVES[0]!.toLowerCase(), animal: ANIMALS[0]! })).toBe(
      false,
    );
  });
});

describe('formato', () => {
  it('compone el texto visible con un espacio', () => {
    expect(displayNickname({ adjective: 'Astuto', animal: 'Zorro' })).toBe('Astuto Zorro');
  });

  it('usa guion bajo en el id de reserva, distinto del separador visible', () => {
    expect(nicknameDocId({ adjective: 'Astuto', animal: 'Zorro' })).toBe('Astuto_Zorro');
  });

  it('produce un id único por combinación', () => {
    const ids = new Set<string>();
    for (const a of ADJECTIVES)
      for (const n of ANIMALS) ids.add(nicknameDocId({ adjective: a, animal: n }));
    expect(ids.size).toBe(ADJECTIVES.length * ANIMALS.length);
  });
});
