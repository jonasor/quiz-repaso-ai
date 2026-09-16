/**
 * T073 — Una ronda archivada respeta las mismas garantías que la ronda en vivo: `archived`
 * no relaja ningún permiso (FR-077).
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
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { QUIZ, ROUND, answer, joinBatch, scoreDoc, seedDoc, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;
const anon = (uid = 'p1') => asAnon(env, uid).firestore() as unknown as Firestore;
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
  await seedRound(env, { phase: 'archived', active: false, currentIndex: 1, participantCount: 2 });
  for (const uid of ['p1', 'p2']) {
    await seedDoc(env, `rounds/${ROUND}/participants/${uid}`, {
      adjective: uid === 'p1' ? 'Astuto' : 'Sabio',
      animal: uid === 'p1' ? 'Zorro' : 'Lince',
      joinedAt: Timestamp.now(),
    });
    await seedDoc(env, `rounds/${ROUND}/answers/${uid}_0`, {
      uid,
      questionIndex: 0,
      optionIndex: 1,
      submittedAt: Timestamp.now(),
    });
    await seedDoc(env, `rounds/${ROUND}/scores/${uid}`, scoreDoc(uid));
  }
  await seedDoc(env, `rounds/${ROUND}/results/0`, {
    questionIndex: 0,
    distribution: [0, 2, 0, 0],
    answerCount: 2,
    correctIndex: 1,
    correctPct: 100,
    revealedAt: Timestamp.now(),
  });
});

describe('ronda archivada (FR-077)', () => {
  it('sigue sin exponer respuestas ni puntajes ajenos', async () => {
    await assertFails(getDoc(doc(anon(), 'rounds', ROUND, 'answers', 'p2_0')));
    await assertFails(getDoc(doc(anon(), 'rounds', ROUND, 'scores', 'p2')));
    await assertFails(getDocs(collection(anon(), 'rounds', ROUND, 'scores')));
  });

  it('sigue sin exponer la solución', async () => {
    await assertFails(getDoc(doc(anon(), 'quizzes', QUIZ, 'solutions', '0')));
  });

  it('no admite entradas, respuestas, ni reabrirse', async () => {
    await assertFails(joinBatch(anon('p9'), 'p9', 2));
    await assertFails(setDoc(doc(anon(), 'rounds', ROUND, 'answers', 'p1_1'), answer('p1', 1)));
    await assertFails(
      updateDoc(doc(presenter(), 'rounds', ROUND), { phase: 'lobby', active: true }),
    );
  });

  it('no admite volver a calificar ni tocar el agregado', async () => {
    await assertFails(
      setDoc(doc(presenter(), 'rounds', ROUND, 'results', '0'), {
        questionIndex: 0,
        distribution: [2, 0, 0, 0],
        answerCount: 2,
        correctIndex: 0,
        correctPct: 100,
        revealedAt: Timestamp.now(),
      }),
    );
  });

  it('el presentador puede releer su debrief (FR-073 a FR-075)', async () => {
    await assertSucceeds(getDoc(doc(presenter(), 'rounds', ROUND)));
    await assertSucceeds(getDocs(collection(presenter(), 'rounds', ROUND, 'results')));
    await assertSucceeds(getDocs(collection(presenter(), 'rounds')));
  });
});
