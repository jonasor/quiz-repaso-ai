/**
 * T040 — Autorizaciones 3, 4, 6 y 7 (FR-035, FR-041, FR-057, FR-058, FR-059, FR-060).
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
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { ROUND, scoreDoc, seedDoc, seedParticipant, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;
const presenter = () => asPresenter(env).firestore() as unknown as Firestore;

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
  for (const uid of ['p1', 'p2']) {
    await seedDoc(env, `rounds/${ROUND}/answers/${uid}_0`, {
      uid,
      questionIndex: 0,
      optionIndex: 1,
      submittedAt: Timestamp.now(),
    });
  }
});

describe('autorización 3 — lo propio', () => {
  it('lee su respuesta por ruta y por consulta filtrada por su uid', async () => {
    const db = anon('p1');
    await assertSucceeds(getDoc(doc(db, 'rounds', ROUND, 'answers', 'p1_0')));
    await assertSucceeds(
      getDocs(query(collection(db, 'rounds', ROUND, 'answers'), where('uid', '==', 'p1'))),
    );
  });

  it('lee su puntaje, incluso antes de que exista', async () => {
    await assertSucceeds(getDoc(doc(anon('p1'), 'rounds', ROUND, 'scores', 'p1')));
    await seedDoc(env, `rounds/${ROUND}/scores/p1`, scoreDoc('p1'));
    await assertSucceeds(getDoc(doc(anon('p1'), 'rounds', ROUND, 'scores', 'p1')));
  });
});

describe('autorización 4 — lo público', () => {
  it('lee la ronda, el puntero, el agregado revelado y el podio', async () => {
    await seedDoc(env, `rounds/${ROUND}/results/0`, {
      questionIndex: 0,
      distribution: [0, 2, 0, 0],
      answerCount: 2,
      correctIndex: 1,
      correctPct: 100,
      revealedAt: Timestamp.now(),
    });
    await seedDoc(env, `rounds/${ROUND}/podium/final`, {
      top: [],
      participantCount: 2,
      closedAt: Timestamp.now(),
    });
    const db = anon('p1');
    await assertSucceeds(getDoc(doc(db, 'rounds', ROUND)));
    await assertSucceeds(getDoc(doc(db, 'config', 'activeRound')));
    await assertSucceeds(getDoc(doc(db, 'rounds', ROUND, 'results', '0')));
    await assertSucceeds(getDoc(doc(db, 'rounds', ROUND, 'podium', 'final')));
  });

  it('pero no lista las rondas: eso es del presentador', async () => {
    await assertFails(getDocs(collection(anon('p1'), 'rounds')));
    await assertSucceeds(getDocs(collection(presenter(), 'rounds')));
  });
});

describe('autorización 6 — el presentador lee todas las respuestas de la pregunta', () => {
  it('por consulta sobre questionIndex', async () => {
    await assertSucceeds(
      getDocs(
        query(collection(presenter(), 'rounds', ROUND, 'answers'), where('questionIndex', '==', 0)),
      ),
    );
  });
});

describe('autorización 7 — el presentador califica', () => {
  it('agregado y puntajes en un mismo lote', async () => {
    const db = presenter();
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', ROUND, 'results', '0'), {
      questionIndex: 0,
      distribution: [0, 2, 0, 0],
      answerCount: 2,
      correctIndex: 1,
      correctPct: 100,
      revealedAt: serverTimestamp(),
    });
    b.set(doc(db, 'rounds', ROUND, 'scores', 'p1'), scoreDoc('p1'));
    b.set(doc(db, 'rounds', ROUND, 'scores', 'p2'), scoreDoc('p2'));
    await assertSucceeds(b.commit());
  });

  it('recalificar sobrescribe con valores absolutos', async () => {
    await assertSucceeds(
      setDoc(doc(presenter(), 'rounds', ROUND, 'scores', 'p1'), scoreDoc('p1', 100)),
    );
    await assertSucceeds(
      setDoc(doc(presenter(), 'rounds', ROUND, 'scores', 'p1'), scoreDoc('p1', 100)),
    );
  });

  it('un puntaje cuyo uid no coincide con la ruta, o con campos de más, se rechaza', async () => {
    await assertFails(setDoc(doc(presenter(), 'rounds', ROUND, 'scores', 'p1'), scoreDoc('p2')));
    await assertFails(
      setDoc(doc(presenter(), 'rounds', ROUND, 'scores', 'p1'), {
        ...scoreDoc('p1'),
        nombreReal: 'x',
      }),
    );
  });

  it('escribe el podio', async () => {
    await assertSucceeds(
      setDoc(doc(presenter(), 'rounds', ROUND, 'podium', 'final'), {
        top: [],
        participantCount: 2,
        closedAt: serverTimestamp(),
      }),
    );
  });
});
