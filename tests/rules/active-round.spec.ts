/**
 * T029 — Una sola ronda activa: denegaciones 23 y 24, autorización 11 (FR-021, FR-022).
 *
 * Publicar una ronda escribe tres cosas atadas entre sí: la ronda nueva, el puntero
 * `config/activeRound` y, si había, el archivado de la anterior. Ninguna vale sola.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { QUIZ, ROUND, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;

function newRound(overrides: Record<string, unknown> = {}) {
  return {
    quizId: QUIZ,
    questionCount: 2,
    phase: 'lobby',
    currentIndex: -1,
    openedAt: null,
    timeLimitSec: null,
    maxParticipants: 60,
    participantCount: 0,
    active: true,
    startedAt: serverTimestamp(),
    endedAt: null,
    ...overrides,
  };
}

function presenterDb(): Firestore {
  return asPresenter(env).firestore() as unknown as Firestore;
}

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedQuiz(env);
});

describe('primera ronda, sin puntero previo', () => {
  it('se publica creando la ronda y el puntero en el mismo lote', async () => {
    const db = presenterDb();
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', 'r2'), newRound());
    b.set(doc(db, 'config', 'activeRound'), { roundId: 'r2' });
    await assertSucceeds(b.commit());
  });

  it('denegación 23: crear la ronda sin mover el puntero', async () => {
    const db = presenterDb();
    await assertFails(setDoc(doc(db, 'rounds', 'r2'), newRound()));
  });

  it('mover el puntero a una ronda que no existe o no queda activa', async () => {
    const db = presenterDb();
    await assertFails(setDoc(doc(db, 'config', 'activeRound'), { roundId: 'r2' }));
  });

  it('la ronda nace en lobby, sin participantes y con el recuento del cuestionario', async () => {
    const db = presenterDb();
    for (const bad of [
      { phase: 'open' },
      { participantCount: 5 },
      { questionCount: 7 },
      { maxParticipants: 0 },
      { active: false },
    ]) {
      const b = writeBatch(db);
      b.set(doc(db, 'rounds', 'r2'), newRound(bad));
      b.set(doc(db, 'config', 'activeRound'), { roundId: 'r2' });
      await assertFails(b.commit());
    }
  });
});

describe('con una ronda activa previa', () => {
  beforeEach(async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
  });

  it('autorización 11: ronda nueva, puntero movido y la anterior archivada, todo junto', async () => {
    const db = presenterDb();
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', 'r2'), newRound());
    b.set(doc(db, 'config', 'activeRound'), { roundId: 'r2' });
    b.update(doc(db, 'rounds', ROUND), { phase: 'archived', active: false });
    await assertSucceeds(b.commit());
  });

  it('denegación 24: ronda nueva y puntero movido, sin archivar la anterior', async () => {
    const db = presenterDb();
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', 'r2'), newRound());
    b.set(doc(db, 'config', 'activeRound'), { roundId: 'r2' });
    await assertFails(b.commit());
  });

  it('denegación 23 con ronda previa: archivar y crear, sin mover el puntero', async () => {
    const db = presenterDb();
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', 'r2'), newRound());
    b.update(doc(db, 'rounds', ROUND), { phase: 'archived', active: false });
    await assertFails(b.commit());
  });

  it('si la previa ya estaba archivada, basta con crear y mover el puntero', async () => {
    await env.clearFirestore();
    await seedQuiz(env);
    await seedRound(env, { phase: 'archived', active: false });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'config', 'activeRound'), { roundId: ROUND });
    });
    const db = presenterDb();
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', 'r2'), newRound());
    b.set(doc(db, 'config', 'activeRound'), { roundId: 'r2' });
    await assertSucceeds(b.commit());
  });

  it('un participante no publica rondas ni mueve el puntero', async () => {
    const db = asAnon(env, 'p1').firestore();
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', 'r2'), newRound());
    b.set(doc(db, 'config', 'activeRound'), { roundId: 'r2' });
    b.update(doc(db, 'rounds', ROUND), { phase: 'archived', active: false });
    await assertFails(b.commit());
  });
});
