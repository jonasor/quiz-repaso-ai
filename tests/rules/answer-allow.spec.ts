/**
 * T037 — Respuestas: autorización 2, y validación de optionIndex (FR-027).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { asAnon, setupTestEnv } from './helpers';
import { ROUND, answer, seedOpenRound, seedParticipant, seedQuiz } from './fixtures';

let env: RulesTestEnvironment;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;
const answerRef = (uid: string) => doc(anon(uid), 'rounds', ROUND, 'answers', `${uid}_0`);

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedQuiz(env);
  await seedOpenRound(env);
  await seedParticipant(env, 'p1');
});

describe('autorización 2', () => {
  it('responde una vez, en open, dentro del plazo', async () => {
    await assertSucceeds(setDoc(answerRef('p1'), answer('p1', 0, 3)));
  });

  it('puede comprobar su propia respuesta aunque todavía no exista (FR-061)', async () => {
    await assertSucceeds(getDoc(answerRef('p1')));
    await assertSucceeds(setDoc(answerRef('p1'), answer('p1')));
    await assertSucceeds(getDoc(answerRef('p1')));
  });
});

describe('optionIndex', () => {
  it('fuera de las opciones de la pregunta', async () => {
    await assertFails(setDoc(answerRef('p1'), { ...answer('p1'), optionIndex: 4 }));
  });

  it('la última opción válida se acepta', async () => {
    await assertSucceeds(setDoc(answerRef('p1'), { ...answer('p1'), optionIndex: 3 }));
  });

  it('negativo', async () => {
    await assertFails(setDoc(answerRef('p1'), { ...answer('p1'), optionIndex: -1 }));
  });

  it('no entero', async () => {
    await assertFails(setDoc(answerRef('p1'), { ...answer('p1'), optionIndex: 1.5 }));
    await assertFails(setDoc(answerRef('p1'), { ...answer('p1'), optionIndex: '1' }));
  });

  it('faltante', async () => {
    const { optionIndex: _sin, ...rest } = answer('p1');
    void _sin;
    await assertFails(setDoc(answerRef('p1'), rest));
  });
});
