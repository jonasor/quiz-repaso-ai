/**
 * T089 — Ejecutar dos veces cada acción de conducción deja el mismo estado (FR-018).
 *
 * Se prueba con el código de la aplicación, que es lo que recibe el doble clic.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { parseQuizFile } from '../../src/domain/quizFile';
import { newQuizId, publishQuiz } from '../../src/data/quizzes';
import {
  adjustMaxParticipants,
  archiveRound,
  joinRound,
  newRoundId,
  openQuestion,
  publishRound,
  revealQuestion,
} from '../../src/data/rounds';
import { submitAnswer } from '../../src/data/answers';
import { closeRound, gradeCurrentQuestion } from '../../src/data/scores';

let env: RulesTestEnvironment;
const presenter = () => asPresenter(env).firestore() as unknown as Firestore;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;
const fast = { sleep: () => Promise.resolve() };

async function snapshot(path: string, subcollections: string[] = []) {
  let out: Record<string, unknown> = {};
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    out = { doc: (await getDoc(doc(db, path))).data() };
    for (const sub of subcollections) {
      const snap = await getDocs(collection(db, path, sub));
      out[sub] = snap.docs.map((d) => [d.id, d.data()]).sort();
    }
  });
  return out;
}

async function setup() {
  const parsed = parseQuizFile({
    title: 'T',
    questions: [{ text: 'Q', options: ['A', 'B'], correctIndex: 0, teachingNote: 'N' }],
  });
  if (!parsed.ok) throw new Error('inválido');
  const quizId = await publishQuiz(presenter(), parsed.quiz);
  const roundId = await publishRound(presenter(), quizId);
  for (const [uid, adjective] of [
    ['p1', 'Astuto'],
    ['p2', 'Sabio'],
  ] as const) {
    await joinRound(
      anon(uid),
      roundId,
      uid,
      { adjective, animal: 'Zorro' },
      () => ({ adjective: 'Noble', animal: 'Lince' }),
      fast,
    );
  }
  return { quizId, roundId };
}

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe('cada acción, dos veces (FR-018)', () => {
  it('abrir: la segunda no cambia nada', async () => {
    const { roundId } = await setup();
    await openQuestion(presenter(), roundId, 0);
    const before = await snapshot(`rounds/${roundId}`);
    expect(await openQuestion(presenter(), roundId, 0)).toBe('stale');
    expect(await snapshot(`rounds/${roundId}`)).toEqual(before);
  });

  it('revelar: la segunda no cambia nada', async () => {
    const { roundId } = await setup();
    await openQuestion(presenter(), roundId, 0);
    await revealQuestion(presenter(), roundId);
    const before = await snapshot(`rounds/${roundId}`);
    expect(await revealQuestion(presenter(), roundId)).toBe('stale');
    expect(await snapshot(`rounds/${roundId}`)).toEqual(before);
  });

  it('calificar dos veces, y a la vez desde dos pestañas: mismos documentos', async () => {
    const { roundId } = await setup();
    await openQuestion(presenter(), roundId, 0);
    await submitAnswer(anon('p1'), roundId, 'p1', 0, 0);
    await revealQuestion(presenter(), roundId);
    const both = await Promise.all([
      gradeCurrentQuestion(presenter(), roundId),
      gradeCurrentQuestion(presenter(), roundId),
    ]);
    expect(both).toContain('graded');
    const graded = await snapshot(`rounds/${roundId}`, ['results', 'scores']);
    expect(await gradeCurrentQuestion(presenter(), roundId)).toBe('already-graded');
    expect(await snapshot(`rounds/${roundId}`, ['results', 'scores'])).toEqual(graded);
  });

  it('el segundo create de results/{n} falla en las reglas', async () => {
    const { roundId } = await setup();
    await openQuestion(presenter(), roundId, 0);
    await revealQuestion(presenter(), roundId);
    await gradeCurrentQuestion(presenter(), roundId);
    await assertFails(
      setDoc(doc(presenter(), 'rounds', roundId, 'results', '0'), {
        questionIndex: 0,
        distribution: [0, 0],
        answerCount: 0,
        correctIndex: 0,
        correctPct: 0,
        revealedAt: serverTimestamp(),
      }),
    );
  });

  it('una recalificación con los mismos datos produce puntajes idénticos', async () => {
    const { roundId } = await setup();
    await openQuestion(presenter(), roundId, 0);
    await submitAnswer(anon('p2'), roundId, 'p2', 0, 0);
    await revealQuestion(presenter(), roundId);
    await gradeCurrentQuestion(presenter(), roundId);
    const first = await snapshot(`rounds/${roundId}`, ['scores']);
    // Simula una caída entre puntajes y agregado: se borra el agregado y se reanuda.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(ctx.firestore(), 'rounds', roundId, 'results', '0'));
    });
    expect(await gradeCurrentQuestion(presenter(), roundId)).toBe('graded');
    expect(await snapshot(`rounds/${roundId}`, ['scores'])).toEqual(first);
  });

  it('cerrar y archivar: la segunda no cambia nada', async () => {
    const { roundId } = await setup();
    await openQuestion(presenter(), roundId, 0);
    await revealQuestion(presenter(), roundId);
    await gradeCurrentQuestion(presenter(), roundId);
    expect(await closeRound(presenter(), roundId)).toBe('closed');
    const closed = await snapshot(`rounds/${roundId}`, ['scores', 'podium']);
    expect(await closeRound(presenter(), roundId)).toBe('not-ready');
    expect(await snapshot(`rounds/${roundId}`, ['scores', 'podium'])).toEqual(closed);

    expect(await archiveRound(presenter(), roundId)).toBe('done');
    const archived = await snapshot(`rounds/${roundId}`);
    expect(await archiveRound(presenter(), roundId)).toBe('stale');
    expect(await snapshot(`rounds/${roundId}`)).toEqual(archived);
  });
});

describe('T106 — publicar y ajustar el tope, dos veces (Constitución V, FR-018)', () => {
  const quizFile = {
    title: 'T',
    questions: [{ text: 'Q', options: ['A', 'B'], correctIndex: 0, teachingNote: 'N' }],
  };

  async function count(collectionPath: string) {
    let n = -1;
    await env.withSecurityRulesDisabled(async (ctx) => {
      n = (await getDocs(collection(ctx.firestore(), collectionPath))).size;
    });
    return n;
  }

  it('publicar el mismo cuestionario dos veces deja uno, idéntico (T105)', async () => {
    const parsed = parseQuizFile(quizFile);
    if (!parsed.ok) throw new Error('inválido');
    const id = newQuizId(presenter());
    expect(await publishQuiz(presenter(), parsed.quiz, id)).toBe(id);
    const first = await snapshot(`quizzes/${id}`, ['questions', 'solutions']);
    expect(await publishQuiz(presenter(), parsed.quiz, id)).toBe(id);
    expect(await count('quizzes')).toBe(1);
    expect(await snapshot(`quizzes/${id}`, ['questions', 'solutions'])).toEqual(first);
  });

  it('un doble clic simultáneo al publicar el cuestionario deja uno (T105)', async () => {
    const parsed = parseQuizFile(quizFile);
    if (!parsed.ok) throw new Error('inválido');
    const id = newQuizId(presenter());
    const ids = await Promise.all([
      publishQuiz(presenter(), parsed.quiz, id),
      publishQuiz(presenter(), parsed.quiz, id),
    ]);
    expect(ids).toEqual([id, id]);
    expect(await count('quizzes')).toBe(1);
  });

  it('publicar la misma ronda dos veces deja una, sin archivar nada de más (T104)', async () => {
    const { quizId } = await setup();
    const before = await count('rounds');
    const id = newRoundId(presenter());
    expect(await publishRound(presenter(), quizId, 40, id)).toBe(id);
    const first = await snapshot(`rounds/${id}`);
    expect(await publishRound(presenter(), quizId, 40, id)).toBe(id);
    expect(await count('rounds')).toBe(before + 1);
    expect(await snapshot(`rounds/${id}`)).toEqual(first);
  });

  it('repetir una publicación vieja no devuelve el puntero a esa ronda (T104)', async () => {
    const { quizId } = await setup();
    const old = newRoundId(presenter());
    await publishRound(presenter(), quizId, 40, old);
    const newer = await publishRound(presenter(), quizId, 40);
    await publishRound(presenter(), quizId, 40, old);
    const pointer = await snapshot('config/activeRound');
    expect(pointer['doc']).toEqual({ roundId: newer });
  });

  it('un doble clic simultáneo al publicar la ronda deja una (T104)', async () => {
    const { quizId } = await setup();
    const before = await count('rounds');
    const id = newRoundId(presenter());
    const ids = await Promise.all([
      publishRound(presenter(), quizId, 40, id),
      publishRound(presenter(), quizId, 40, id),
    ]);
    expect(ids).toEqual([id, id]);
    expect(await count('rounds')).toBe(before + 1);
  });

  it('ajustar el tope al mismo valor dos veces, y a la vez, termina sin error ni cambios (T106)', async () => {
    const { roundId } = await setup();
    await adjustMaxParticipants(presenter(), roundId, 12);
    const first = await snapshot(`rounds/${roundId}`);
    await expect(adjustMaxParticipants(presenter(), roundId, 12)).resolves.toBeUndefined();
    await expect(
      Promise.all([
        adjustMaxParticipants(presenter(), roundId, 12),
        adjustMaxParticipants(presenter(), roundId, 12),
      ]),
    ).resolves.toBeDefined();
    expect(await snapshot(`rounds/${roundId}`)).toEqual(first);
  });
});
