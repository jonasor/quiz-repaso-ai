import { describe, expect, it } from 'vitest';
import { canTransition, deadlineMs, effectivePhase, remainingMs } from '../../src/domain/phases';
import type { StoredPhase } from '../../src/domain/types';

const TODAS: StoredPhase[] = ['lobby', 'open', 'revealed', 'podium', 'archived'];
const Q = 3; // cuestionario de 3 preguntas

describe('canTransition', () => {
  it('acepta exactamente las transiciones de la tabla del contrato de reglas', () => {
    expect(canTransition('lobby', 'open', -1, 0, Q)).toBe(true);
    expect(canTransition('open', 'revealed', 0, 0, Q)).toBe(true);
    expect(canTransition('revealed', 'open', 0, 1, Q)).toBe(true);
    expect(canTransition('revealed', 'podium', 2, 2, Q)).toBe(true);
    expect(canTransition('podium', 'archived', 2, 2, Q)).toBe(true);
  });

  it('acepta archivar desde cualquier fase, porque publicar una ronda nueva lo exige (FR-022)', () => {
    for (const from of ['lobby', 'open', 'revealed', 'podium'] as StoredPhase[]) {
      expect(canTransition(from, 'archived', 0, 0, Q)).toBe(true);
    }
  });

  it('rechaza repetir la fase, que es el doble clic (FR-018)', () => {
    for (const p of TODAS) {
      expect(canTransition(p, p, 0, 0, Q)).toBe(false);
    }
  });

  it('rechaza retroceder (FR-023)', () => {
    expect(canTransition('revealed', 'lobby', 1, 0, Q)).toBe(false);
    expect(canTransition('podium', 'open', 2, 0, Q)).toBe(false);
    expect(canTransition('open', 'lobby', 0, -1, Q)).toBe(false);
  });

  it('no permite salir de archived: es terminal', () => {
    for (const to of TODAS) {
      expect(canTransition('archived', to, 0, 0, Q)).toBe(false);
    }
  });

  it('rechaza saltarse preguntas al abrir la siguiente (FR-023)', () => {
    expect(canTransition('revealed', 'open', 0, 2, Q)).toBe(false); // salta la 1
    expect(canTransition('revealed', 'open', 1, 1, Q)).toBe(false); // repite la 1
  });

  it('no abre una pregunta que no existe', () => {
    expect(canTransition('revealed', 'open', 2, 3, Q)).toBe(false);
  });

  it('exige que lobby abra la pregunta 0', () => {
    expect(canTransition('lobby', 'open', -1, 1, Q)).toBe(false);
  });

  it('no va al podio antes de revelar la última', () => {
    expect(canTransition('revealed', 'podium', 0, 0, Q)).toBe(false);
    expect(canTransition('revealed', 'podium', 1, 1, Q)).toBe(false);
  });

  it('rechaza cualquier par que no esté en la tabla', () => {
    const permitidas = new Set([
      'lobby>open',
      'open>revealed',
      'revealed>open',
      'revealed>podium',
      'podium>archived',
      'lobby>archived',
      'open>archived',
      'revealed>archived',
    ]);
    for (const from of TODAS) {
      for (const to of TODAS) {
        if (permitidas.has(`${from}>${to}`)) continue;
        // con índices generosos, para que el rechazo venga del par y no del índice
        expect(canTransition(from, to, 2, 2, Q)).toBe(false);
      }
    }
  });
});

describe('effectivePhase', () => {
  const abierta = 1_000_000;
  const limite = 30;

  it('deriva closed cuando el plazo venció, aunque el almacenado siga siendo open', () => {
    expect(effectivePhase('open', abierta, limite, abierta + 30_001)).toBe('closed');
  });

  it('sigue open mientras queda plazo', () => {
    expect(effectivePhase('open', abierta, limite, abierta + 29_999)).toBe('open');
  });

  it('cierra en el instante exacto del vencimiento', () => {
    expect(effectivePhase('open', abierta, limite, abierta + 30_000)).toBe('closed');
  });

  it('no inventa closed en ninguna otra fase', () => {
    for (const p of ['lobby', 'revealed', 'podium', 'archived'] as StoredPhase[]) {
      expect(effectivePhase(p, abierta, limite, abierta + 999_999)).toBe(p);
    }
  });

  it('devuelve el almacenado si falta el plazo', () => {
    expect(effectivePhase('open', null, null, 5)).toBe('open');
    expect(effectivePhase('open', abierta, null, 5)).toBe('open');
  });
});

describe('remainingMs', () => {
  it('nunca es negativo', () => {
    expect(remainingMs(1000, 30, 1000 + 99_999)).toBe(0);
  });

  it('cuenta el plazo completo al abrir', () => {
    expect(remainingMs(1000, 30, 1000)).toBe(30_000);
  });

  it('decrece con el tiempo', () => {
    expect(remainingMs(1000, 30, 1000 + 10_000)).toBe(20_000);
  });
});

describe('deadlineMs', () => {
  it('es openedAt más el límite, que es lo que la regla evalúa', () => {
    expect(deadlineMs(1_000_000, 30)).toBe(1_030_000);
  });
});
