/**
 * La capa de datos contra las reglas reales: una ronda completa de principio a fin.
 *
 * Los demás tests de `tests/rules/` prueban cada regla aislada. Este prueba que el
 * código que va a usar la aplicación —`src/data/`— encaja con ellas: que cada escritura
 * que hace es exactamente la que las reglas autorizan, en el orden en que la hace.
 * Cubre además las autorizaciones 1, 10 y 11 con el código real, no con lotes armados
 * a mano (T034, T048, T050, T055).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { parseQuizFile } from '../../src/domain/quizFile';
import { publishQuiz } from '../../src/data/quizzes';
import {
  adjustMaxParticipants,
  joinRound,
  openQuestion,
  publishRound,
  revealQuestion,
} from '../../src/data/rounds';
import { countAnswers, submitAnswer } from '../../src/data/answers';
import { closeRound, getResults, gradeCurrentQuestion } from '../../src/data/scores';
import { generateNickname } from '../../src/domain/nickname';
import type { Nickname } from '../../src/domain/types';

let env: RulesTestEnvironment;
const presenter = () => asPresenter(env).firestore() as unknown as Firestore;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;

const quizFile = {
  title: 'Ronda de prueba',
  questions: [
    {
      text: 'Uno',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 1,
      teachingNote: 'B.',
      timeLimitSec: 30,
    },
    { text: 'Dos', options: ['A', 'B'], correctIndex: 0, teachingNote: 'A.', timeLimitSec: 20 },
  ],
};

let seq = 0;
const nick = (): Nickname => generateNickname(() => (seq++ * 0.6180339887) % 1);
const fast = { sleep: () => Promise.resolve() };

async function readAsAdmin(path: string): Promise<Record<string, unknown> | undefined> {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data();
  });
  return data;
}

async function publishQuizAndRound(max?: number) {
  const parsed = parseQuizFile(quizFile);
  if (!parsed.ok) throw new Error('cuestionario inválido');
  const quizId = await publishQuiz(presenter(), parsed.quiz);
  const roundId = await publishRound(presenter(), quizId, max);
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

describe('publicación', () => {
  it('publicar una segunda ronda archiva la primera (autorización 11)', async () => {
    const { quizId, roundId } = await publishQuizAndRound();
    const second = await publishRound(presenter(), quizId);
    expect((await readAsAdmin(`rounds/${roundId}`))?.['active']).toBe(false);
    expect((await readAsAdmin(`rounds/${roundId}`))?.['phase']).toBe('archived');
    expect((await readAsAdmin('config/activeRound'))?.['roundId']).toBe(second);
  });

  it('un participante no puede publicar un cuestionario con el código de la aplicación', async () => {
    const parsed = parseQuizFile(quizFile);
    if (!parsed.ok) throw new Error('inválido');
    await expect(publishQuiz(anon('p1'), parsed.quiz)).rejects.toThrow();
  });
});

describe('entrada', () => {
  it('diez entradas simultáneas: todas dentro, contador exacto, apodos distintos (autorización 10)', async () => {
    const { roundId } = await publishQuizAndRound();
    const uids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const outcomes = await Promise.all(
      uids.map((uid) => joinRound(anon(uid), roundId, uid, nick(), nick, fast)),
    );
    expect(outcomes.every((o) => o.kind === 'joined')).toBe(true);
    const names = outcomes.map((o) =>
      o.kind === 'joined' ? `${o.nickname.adjective}_${o.nickname.animal}` : '',
    );
    expect(new Set(names).size).toBe(10);
    expect((await readAsAdmin(`rounds/${roundId}`))?.['participantCount']).toBe(10);
  });

  it('con el mismo apodo a la vez, uno se queda con él y el otro recibe otro', async () => {
    const { roundId } = await publishQuizAndRound();
    const same: Nickname = { adjective: 'Astuto', animal: 'Zorro' };
    const [a, b] = await Promise.all([
      joinRound(anon('p1'), roundId, 'p1', same, nick, fast),
      joinRound(anon('p2'), roundId, 'p2', same, nick, fast),
    ]);
    expect([a.kind, b.kind]).toEqual(['joined', 'joined']);
    const ids = [a, b].map((o) =>
      o.kind === 'joined' ? `${o.nickname.adjective}_${o.nickname.animal}` : '',
    );
    expect(ids).toContain('Astuto_Zorro');
    expect(new Set(ids).size).toBe(2);
  });

  it('sala llena, y el presentador la amplía en curso (FR-010, FR-012)', async () => {
    const { roundId } = await publishQuizAndRound(1);
    expect((await joinRound(anon('p1'), roundId, 'p1', nick(), nick, fast)).kind).toBe('joined');
    expect((await joinRound(anon('p2'), roundId, 'p2', nick(), nick, fast)).kind).toBe('full');
    await adjustMaxParticipants(presenter(), roundId, 5);
    expect((await joinRound(anon('p2'), roundId, 'p2', nick(), nick, fast)).kind).toBe('joined');
  });

  it('volver a entrar tras recargar devuelve el mismo apodo, sin contarse dos veces', async () => {
    const { roundId } = await publishQuizAndRound();
    const first = await joinRound(anon('p1'), roundId, 'p1', nick(), nick, fast);
    const again = await joinRound(anon('p1'), roundId, 'p1', nick(), nick, fast);
    expect(again.kind).toBe('already');
    if (first.kind === 'joined' && again.kind === 'already')
      expect(again.nickname).toEqual(first.nickname);
    expect((await readAsAdmin(`rounds/${roundId}`))?.['participantCount']).toBe(1);
  });
});

describe('una ronda completa', () => {
  it('abrir, responder, revelar, calificar, avanzar y cerrar con podio', async () => {
    const { roundId } = await publishQuizAndRound();
    for (const uid of ['rapido', 'lento', 'ausente']) {
      expect((await joinRound(anon(uid), roundId, uid, nick(), nick, fast)).kind).toBe('joined');
    }

    // Pregunta 0
    expect(await openQuestion(presenter(), roundId, 0)).toBe('done');
    expect(await openQuestion(presenter(), roundId, 0)).toBe('stale'); // doble clic
    expect(await submitAnswer(anon('rapido'), roundId, 'rapido', 0, 1)).toEqual({
      kind: 'confirmed',
      optionIndex: 1,
    });
    // Un segundo envío, como tras perder la conexión: se confirma la primera, no la nueva.
    expect(await submitAnswer(anon('rapido'), roundId, 'rapido', 0, 3)).toEqual({
      kind: 'confirmed',
      optionIndex: 1,
    });
    expect((await submitAnswer(anon('lento'), roundId, 'lento', 0, 1)).kind).toBe('confirmed');
    // "lento" tardó 20 s más: se retrasa su submittedAt, que es lo único que mide la
    // antigüedad. Mover openedAt desplazaría a los dos por igual.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const ref = doc(ctx.firestore(), 'rounds', roundId, 'answers', 'lento_0');
      const snap = await getDoc(ref);
      const at = (snap.data()?.['submittedAt'] as Timestamp).toMillis();
      await updateDoc(ref, { submittedAt: Timestamp.fromMillis(at + 20_000) });
    });
    expect(await countAnswers(presenter(), roundId, 0)).toBe(2);

    expect(await revealQuestion(presenter(), roundId)).toBe('done');
    // Ya revelada: responder tarde se rechaza, y se informa como tarde.
    expect(await submitAnswer(anon('ausente'), roundId, 'ausente', 0, 1)).toEqual({
      kind: 'rejected',
      reason: 'late',
    });
    expect(await gradeCurrentQuestion(presenter(), roundId)).toBe('graded');
    expect(await gradeCurrentQuestion(presenter(), roundId)).toBe('already-graded');

    const results = await getResults(anon('ausente'), roundId);
    expect(results[0]).toMatchObject({ answerCount: 2, correctIndex: 1, correctPct: 100 });

    const rapido0 = await readAsAdmin(`rounds/${roundId}/scores/rapido`);
    const lento0 = await readAsAdmin(`rounds/${roundId}/scores/lento`);
    expect(rapido0?.['totalPoints'] as number).toBeGreaterThan(lento0?.['totalPoints'] as number);

    // No se puede cerrar antes de la última
    expect(await closeRound(presenter(), roundId)).toBe('not-ready');

    // Pregunta 1
    expect(await openQuestion(presenter(), roundId, 1)).toBe('done');
    expect((await submitAnswer(anon('ausente'), roundId, 'ausente', 1, 0)).kind).toBe('confirmed');
    expect(await revealQuestion(presenter(), roundId)).toBe('done');
    expect(await gradeCurrentQuestion(presenter(), roundId)).toBe('graded');

    expect(await closeRound(presenter(), roundId)).toBe('closed');
    expect(await closeRound(presenter(), roundId)).toBe('not-ready');

    const podium = await readAsAdmin(`rounds/${roundId}/podium/final`);
    expect(podium?.['participantCount']).toBe(3);
    const top = podium?.['top'] as Array<{ rank: number }>;
    expect(top.map((t) => t.rank)).toEqual([1, 2, 3]);
    expect(JSON.stringify(top)).not.toContain('rapido');
    expect((await readAsAdmin(`rounds/${roundId}`))?.['phase']).toBe('podium');
    expect((await readAsAdmin(`rounds/${roundId}/scores/rapido`))?.['rank']).toBe(1);
  });
});
