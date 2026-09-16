/**
 * T090 — Con el plazo vencido y sin ninguna escritura de cambio de fase, una respuesta se
 * rechaza. La desconexión del presentador no congela la partida ni la deja abierta
 * (D1, FR-015).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { parseQuizFile } from '../../src/domain/quizFile';
import { publishQuiz } from '../../src/data/quizzes';
import { joinRound, openQuestion, revealQuestion } from '../../src/data/rounds';
import { submitAnswer } from '../../src/data/answers';
import { gradeCurrentQuestion } from '../../src/data/scores';

let env: RulesTestEnvironment;
const presenter = () => asPresenter(env).firestore() as unknown as Firestore;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe('el presentador se desconecta al expirar el plazo (FR-015)', () => {
  it('nadie cierra la pregunta, y aun así la respuesta tardía se rechaza; al volver, revela y califica', async () => {
    const parsed = parseQuizFile({
      title: 'T',
      questions: [
        { text: 'Q', options: ['A', 'B'], correctIndex: 1, teachingNote: 'N', timeLimitSec: 5 },
      ],
    });
    if (!parsed.ok) throw new Error('inválido');
    const quizId = await publishQuiz(presenter(), parsed.quiz);
    const { publishRound } = await import('../../src/data/rounds');
    const roundId = await publishRound(presenter(), quizId);
    await joinRound(anon('p1'), roundId, 'p1', { adjective: 'Astuto', animal: 'Zorro' }, () => ({
      adjective: 'Sabio',
      animal: 'Lince',
    }));
    await openQuestion(presenter(), roundId, 0);

    // El presentador desaparece. Pasa el tiempo: se simula moviendo openedAt 10 s atrás,
    // con un límite de 5 s. Nadie escribe ningún cambio de fase.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = doc(ctx.firestore(), 'rounds', roundId);
      const opened = ((await getDoc(ref)).data()?.['openedAt'] as Timestamp).toMillis();
      await updateDoc(ref, { openedAt: Timestamp.fromMillis(opened - 10_000) });
    });

    expect(await submitAnswer(anon('p1'), roundId, 'p1', 0, 1)).toEqual({
      kind: 'rejected',
      reason: 'late',
    });
    let phase: unknown;
    await env.withSecurityRulesDisabled(async (ctx) => {
      phase = (await getDoc(doc(ctx.firestore(), 'rounds', roundId))).data()?.['phase'];
    });
    expect(phase).toBe('open');

    // El presentador vuelve y retoma en la fase vigente.
    expect(await revealQuestion(presenter(), roundId)).toBe('done');
    expect(await gradeCurrentQuestion(presenter(), roundId)).toBe('graded');
  });
});
