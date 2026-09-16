/**
 * T092, T093 — Requisitos de **ausencia** y de esquema.
 *
 * Su riesgo no es implementarlos mal, sino que alguien añada más adelante lo que está
 * prohibido sin notarlo. Por eso se comprueban mecánicamente contra el código y las reglas.
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
const rules = readFileSync('firestore.rules', 'utf8');
const source = walk('src').map((f) => [f, readFileSync(f, 'utf8')] as const);

/** Bloques `allow create...` que un participante anónimo puede ejecutar, con su lista de campos. */
function anonCreates(): Array<{ path: string; fields: string[] }> {
  const out: Array<{ path: string; fields: string[] }> = [];
  const re = /match\s+(\/\S+)\s*\{([\s\S]*?)\n\s{6}\}/g;
  for (const m of rules.matchAll(re)) {
    const body = m[2] ?? '';
    const create = /allow create[^;]*isAnon\(\)[\s\S]*?;/.exec(body);
    if (create === null) continue;
    const fields = /hasExactly\(\[([^\]]*)\]\)/.exec(create[0]);
    out.push({
      path: m[1] ?? '',
      fields: (fields?.[1] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/'/g, ''))
        .filter(Boolean),
    });
  }
  return out;
}

describe('T092 — ningún documento admite texto libre de un participante (FR-054, FR-055, SC-008)', () => {
  const creates = anonCreates();

  it('se encuentran las tres escrituras de participante: entrada, reserva y respuesta', () => {
    expect(creates.map((c) => c.path).sort()).toEqual([
      '/answers/{answerId}',
      '/nicknames/{nick}',
      '/participants/{uid}',
    ]);
  });

  it('cada una fija sus campos exactos, y ninguno es texto libre', () => {
    // Los únicos strings que escribe un participante: su uid (lo verifica la regla contra
    // request.auth.uid) y el apodo, acotado al catálogo.
    const permitidos = new Set([
      'uid',
      'adjective',
      'animal',
      'joinedAt',
      'questionIndex',
      'optionIndex',
      'submittedAt',
    ]);
    for (const c of creates) {
      expect(c.fields.length, c.path).toBeGreaterThan(0);
      for (const f of c.fields) expect(permitidos.has(f), `${c.path}: ${f}`).toBe(true);
    }
  });

  it('el apodo del participante está acotado al catálogo en la regla', () => {
    expect(rules).toMatch(
      /match \/participants\/\{uid\}[\s\S]*?inCatalog\(request\.resource\.data\)/,
    );
  });

  it('el único update de un participante es el incremento del contador', () => {
    expect(rules).toMatch(/function joinIncrement\(\)[\s\S]*?hasOnly\(\['participantCount'\]\)/);
  });
});

describe('T092 — el tope no reconoce dispositivos ni personas (FR-011)', () => {
  const identificadores =
    /\b(deviceId|fingerprint|userAgent|ipAddress|clientIp|navigator\.userAgent|localStorage)\b/;

  it('ni las reglas ni el código leen o guardan un identificador de dispositivo', () => {
    expect(identificadores.test(rules)).toBe(false);
    expect(source.filter(([, s]) => identificadores.test(s)).map(([f]) => f)).toEqual([]);
  });
});

describe('T093 — requisitos de ausencia', () => {
  it('no hay recuperación de identidad entre dispositivos (FR-005)', () => {
    const recuperacion =
      /\b(linkWithCredential|linkWithPopup|signInWithCustomToken|recoveryCode|codigoRecuperacion|exportIdentity|importIdentity)\b/;
    expect(source.filter(([, s]) => recuperacion.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('la superficie del participante no puede avanzar la partida (FR-025)', () => {
    const conduccion =
      /\b(openQuestion|revealQuestion|gradeCurrentQuestion|closeRound|archiveRound|publishRound|adjustMaxParticipants)\b/;
    const player = source.filter(([f]) => f.startsWith(join('src', 'ui', 'player')));
    expect(player.length).toBeGreaterThan(0);
    expect(player.filter(([, s]) => conduccion.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('en las reglas, un anónimo solo puede tocar la ronda para contarse al entrar (FR-025)', () => {
    const update =
      /allow update: if \(isPresenter\(\) && \(legalTransition\(\) \|\| adjustsCap\(\)\)\)\s*\|\| joinIncrement\(\);/;
    expect(rules).toMatch(update);
  });
});
