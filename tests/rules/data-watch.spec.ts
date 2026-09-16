/**
 * Las suscripciones entregan la escritura **propia** una vez confirmada.
 *
 * Regresión encontrada en T102, en el navegador. Las suscripciones descartan el snapshot
 * local mientras hay escrituras pendientes, porque el servidor todavía puede rechazarlas.
 * Sin `includeMetadataChanges`, la confirmación posterior solo cambia metadatos y no
 * dispara ningún evento: el valor confirmado nunca llegaba. El presentador ampliaba el
 * tope y seguía viendo el anterior, y tras calificar se habría quedado en "Calificando…".
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';
import type { QuestionResult, Round } from '../../src/domain/types';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { parseQuizFile } from '../../src/domain/quizFile';
import { publishQuiz } from '../../src/data/quizzes';
import {
  adjustMaxParticipants,
  joinRound,
  openQuestion,
  publishRound,
  revealQuestion,
  watchOwnParticipant,
  watchRound,
} from '../../src/data/rounds';
import { gradeCurrentQuestion, watchResult } from '../../src/data/scores';

let env: RulesTestEnvironment;

function waitFor<T>(
  subscribe: (cb: (v: T) => void) => () => void,
  ok: (v: T) => boolean,
  ms = 5_000,
) {
  return new Promise<T>((resolve, reject) => {
    let unsub: () => void = () => undefined;
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('la suscripción nunca entregó el valor confirmado'));
    }, ms);
    unsub = subscribe((v) => {
      if (ok(v)) {
        clearTimeout(timer);
        unsub();
        resolve(v);
      }
    });
  });
}

async function setup(presenter: Firestore) {
  const parsed = parseQuizFile({
    title: 'T',
    questions: [{ text: 'Q', options: ['A', 'B'], correctIndex: 0, teachingNote: 'N' }],
  });
  if (!parsed.ok) throw new Error('inválido');
  const quizId = await publishQuiz(presenter, parsed.quiz);
  return publishRound(presenter, quizId, 2);
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

describe('la escritura propia llega a la propia suscripción', () => {
  it('el presentador amplía el tope y lo ve', async () => {
    const db = asPresenter(env).firestore() as unknown as Firestore;
    const roundId = await setup(db);
    await waitFor<Round | null>(
      (cb) => watchRound(db, roundId, cb),
      (r) => r?.maxParticipants === 2,
    );
    const seen = waitFor<Round | null>(
      (cb) => watchRound(db, roundId, cb),
      (r) => r?.maxParticipants === 7,
    );
    await adjustMaxParticipants(db, roundId, 7);
    expect((await seen)?.maxParticipants).toBe(7);
  });

  it('el presentador califica y ve el agregado', async () => {
    const db = asPresenter(env).firestore() as unknown as Firestore;
    const roundId = await setup(db);
    await openQuestion(db, roundId, 0);
    await revealQuestion(db, roundId);
    const seen = waitFor<QuestionResult | null>(
      (cb) => watchResult(db, roundId, 0, cb),
      (r) => r !== null,
    );
    await gradeCurrentQuestion(db, roundId);
    expect((await seen)?.questionIndex).toBe(0);
  });

  it('el participante entra y ve su propio documento', async () => {
    const presenter = asPresenter(env).firestore() as unknown as Firestore;
    const roundId = await setup(presenter);
    const db = asAnon(env, 'p1').firestore() as unknown as Firestore;
    const seen = waitFor(
      (cb) => watchOwnParticipant(db, roundId, 'p1', cb),
      (n) => n !== null,
    );
    await joinRound(db, roundId, 'p1', { adjective: 'Astuto', animal: 'Zorro' }, () => ({
      adjective: 'Sabio',
      animal: 'Lince',
    }));
    expect(await seen).toEqual({ adjective: 'Astuto', animal: 'Zorro' });
  });
});
