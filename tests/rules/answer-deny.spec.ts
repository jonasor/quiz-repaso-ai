/**
 * T036 — Respuestas: denegaciones 4 a 7 (FR-028, FR-029, FR-030, FR-036).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, type Firestore } from 'firebase/firestore';
import { asAnon, setupTestEnv } from './helpers';
import { ROUND, answer, seedOpenRound, seedParticipant, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;
const answerRef = (uid: string, n = 0) => doc(anon(uid), 'rounds', ROUND, 'answers', `${uid}_${n}`);

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

describe('denegación 4 — sin puntaje ni veredicto en la respuesta (FR-036)', () => {
  beforeEach(async () => {
    await seedOpenRound(env);
    await seedParticipant(env, 'p1');
  });

  it('con points', async () => {
    await assertFails(setDoc(answerRef('p1'), { ...answer('p1'), points: 999 }));
  });

  it('con correct', async () => {
    await assertFails(setDoc(answerRef('p1'), { ...answer('p1'), correct: true }));
  });
});

describe('denegación 5 — plazo vencido (FR-029)', () => {
  it('abierta hace más que el tiempo límite, con la fase todavía en open', async () => {
    await seedOpenRound(env, 31_000);
    await seedParticipant(env, 'p1');
    await assertFails(setDoc(answerRef('p1'), answer('p1')));
  });
});

describe('denegación 6 — pregunta no abierta (FR-030)', () => {
  for (const phase of ['lobby', 'revealed', 'podium'] as const) {
    it(`en fase ${phase}`, async () => {
      await seedRound(env, {
        phase,
        currentIndex: phase === 'lobby' ? -1 : 0,
        openedAtMs: Date.now(),
        timeLimitSec: 30,
      });
      await seedParticipant(env, 'p1');
      await assertFails(setDoc(answerRef('p1', phase === 'lobby' ? -1 : 0), answer('p1', 0)));
    });
  }

  it('a una pregunta distinta de la que está en curso', async () => {
    await seedOpenRound(env);
    await seedParticipant(env, 'p1');
    await assertFails(setDoc(answerRef('p1', 1), answer('p1', 1)));
  });
});

describe('denegación 7 — responder dos veces (FR-028)', () => {
  beforeEach(async () => {
    await seedOpenRound(env);
    await seedParticipant(env, 'p1');
  });

  it('la segunda escritura sobre el mismo id falla y la primera queda', async () => {
    await assertSucceeds(setDoc(answerRef('p1'), answer('p1', 0, 1)));
    await assertFails(setDoc(answerRef('p1'), answer('p1', 0, 2)));
  });

  it('corregirla o retirarla', async () => {
    await assertSucceeds(setDoc(answerRef('p1'), answer('p1', 0, 1)));
    await assertFails(updateDoc(answerRef('p1'), { optionIndex: 2 }));
    await assertFails(deleteDoc(answerRef('p1')));
  });
});

describe('quién puede responder', () => {
  it('una identidad que nunca entró a la ronda', async () => {
    await seedOpenRound(env);
    await assertFails(setDoc(answerRef('intruso'), answer('intruso')));
  });

  it('a nombre de otro participante', async () => {
    await seedOpenRound(env);
    await seedParticipant(env, 'p1');
    await seedParticipant(env, 'p2', 'Sabio', 'Lince');
    await assertFails(setDoc(doc(anon('p1'), 'rounds', ROUND, 'answers', 'p2_0'), answer('p2')));
    await assertFails(setDoc(answerRef('p1'), answer('p2')));
  });
});
