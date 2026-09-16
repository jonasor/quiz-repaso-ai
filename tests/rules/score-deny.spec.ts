/**
 * T039 — Resultados individuales ajenos y revelación: denegaciones 2, 3, 9 y 13
 * (FR-018, FR-035, FR-052).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { ROUND, scoreDoc, seedDoc, seedParticipant, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;
const presenter = () => asPresenter(env).firestore() as unknown as Firestore;

function resultDoc(n = 0) {
  return {
    questionIndex: n,
    distribution: [0, 2, 0, 0],
    answerCount: 2,
    correctIndex: 1,
    correctPct: 100,
    revealedAt: serverTimestamp(),
  };
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
  await seedRound(env, {
    phase: 'revealed',
    currentIndex: 0,
    openedAtMs: Date.now() - 40_000,
    timeLimitSec: 30,
  });
  await seedParticipant(env, 'p1');
  await seedParticipant(env, 'p2', 'Sabio', 'Lince');
  await seedDoc(env, `rounds/${ROUND}/answers/p2_0`, {
    uid: 'p2',
    questionIndex: 0,
    optionIndex: 1,
    submittedAt: Timestamp.now(),
  });
  await seedDoc(env, `rounds/${ROUND}/scores/p2`, scoreDoc('p2'));
});

describe('denegación 2 — la respuesta de otro (FR-052)', () => {
  it('por ruta directa', async () => {
    await assertFails(getDoc(doc(anon('p1'), 'rounds', ROUND, 'answers', 'p2_0')));
  });

  it('listando la colección entera o filtrando por otro uid', async () => {
    const col = collection(anon('p1'), 'rounds', ROUND, 'answers');
    await assertFails(getDocs(col));
    await assertFails(getDocs(query(col, where('uid', '==', 'p2'))));
    await assertFails(getDocs(query(col, where('questionIndex', '==', 0))));
  });

  it('con un id que empieza como el suyo', async () => {
    await seedDoc(env, `rounds/${ROUND}/answers/p1x_0`, {
      uid: 'p1x',
      questionIndex: 0,
      optionIndex: 0,
      submittedAt: Timestamp.now(),
    });
    await assertFails(getDoc(doc(anon('p1'), 'rounds', ROUND, 'answers', 'p1x_0')));
  });
});

describe('denegación 3 — el puntaje de otro (FR-052)', () => {
  it('por ruta directa o listando', async () => {
    await assertFails(getDoc(doc(anon('p1'), 'rounds', ROUND, 'scores', 'p2')));
    await assertFails(getDocs(collection(anon('p1'), 'rounds', ROUND, 'scores')));
  });
});

describe('denegación 9 — escribir puntajes como participante (FR-035)', () => {
  it('el suyo propio', async () => {
    await assertFails(
      setDoc(doc(anon('p1'), 'rounds', ROUND, 'scores', 'p1'), scoreDoc('p1', 9999)),
    );
  });

  it('el agregado de la pregunta o el podio', async () => {
    await assertFails(setDoc(doc(anon('p1'), 'rounds', ROUND, 'results', '0'), resultDoc()));
    await assertFails(
      setDoc(doc(anon('p1'), 'rounds', ROUND, 'podium', 'final'), {
        top: [],
        participantCount: 2,
        closedAt: serverTimestamp(),
      }),
    );
  });
});

describe('denegación 13 — revelar dos veces (FR-018)', () => {
  it('el segundo create de results/{n} falla', async () => {
    await assertSucceeds(setDoc(doc(presenter(), 'rounds', ROUND, 'results', '0'), resultDoc()));
    await assertFails(setDoc(doc(presenter(), 'rounds', ROUND, 'results', '0'), resultDoc()));
  });

  it('el agregado no se escribe con la pregunta aún abierta, ni para otra pregunta', async () => {
    await env.clearFirestore();
    await seedQuiz(env);
    await seedRound(env, {
      phase: 'open',
      currentIndex: 0,
      openedAtMs: Date.now(),
      timeLimitSec: 30,
    });
    await assertFails(setDoc(doc(presenter(), 'rounds', ROUND, 'results', '0'), resultDoc()));

    await env.clearFirestore();
    await seedQuiz(env);
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
    await assertFails(setDoc(doc(presenter(), 'rounds', ROUND, 'results', '1'), resultDoc(1)));
  });

  it('el agregado no admite la nota pedagógica (FR-046)', async () => {
    await assertFails(
      setDoc(doc(presenter(), 'rounds', ROUND, 'results', '0'), {
        ...resultDoc(),
        teachingNote: 'x',
      }),
    );
  });
});
