/**
 * T069 — La nota pedagógica nunca llega a un participante, ni antes ni después de revelar,
 * y no forma parte del agregado público (FR-046, FR-071).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { QUIZ, ROUND, seedOpenRound, seedParticipant, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;
const anon = () => asAnon(env, 'p1').firestore() as unknown as Firestore;

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

describe('la nota pedagógica (FR-046)', () => {
  it('no es legible con la pregunta abierta', async () => {
    await seedOpenRound(env);
    await seedParticipant(env, 'p1');
    await assertFails(getDoc(doc(anon(), 'quizzes', QUIZ, 'solutions', '0')));
  });

  it('tampoco después de revelar, ni listando', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
    await seedParticipant(env, 'p1');
    await assertFails(getDoc(doc(anon(), 'quizzes', QUIZ, 'solutions', '0')));
    await assertFails(getDocs(collection(anon(), 'quizzes', QUIZ, 'solutions')));
  });

  it('ni con la partida terminada', async () => {
    await seedRound(env, { phase: 'podium', currentIndex: 1 });
    await assertFails(getDoc(doc(anon(), 'quizzes', QUIZ, 'solutions', '1')));
  });

  it('no cabe en el agregado público: el presentador no puede publicarla ahí', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
    const db = asPresenter(env).firestore() as unknown as Firestore;
    const base = {
      questionIndex: 0,
      distribution: [0, 1, 0, 0],
      answerCount: 1,
      correctIndex: 1,
      correctPct: 100,
      revealedAt: serverTimestamp(),
    };
    await assertFails(
      setDoc(doc(db, 'rounds', ROUND, 'results', '0'), { ...base, teachingNote: 'Nota 0' }),
    );
    await assertSucceeds(setDoc(doc(db, 'rounds', ROUND, 'results', '0'), base));
  });
});
