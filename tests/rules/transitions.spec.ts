/**
 * T031 — Transiciones de fase: denegaciones 8 y 12, autorización 5, doble clic
 * (FR-016, FR-017, FR-018, FR-023).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { ROUND, TIME_LIMIT, seedDoc, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;

const presenter = () => asPresenter(env).firestore() as unknown as Firestore;
const roundRef = (db: Firestore) => doc(db, 'rounds', ROUND);

const openQ = (index: number) => ({
  phase: 'open',
  currentIndex: index,
  openedAt: serverTimestamp(),
  timeLimitSec: TIME_LIMIT,
});

async function seedResult(n: number) {
  await seedDoc(env, `rounds/${ROUND}/results/${n}`, {
    questionIndex: n,
    distribution: [0, 0, 0, 0],
    answerCount: 0,
    correctIndex: 1,
    correctPct: 0,
    revealedAt: Timestamp.now(),
  });
}

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedQuiz(env, 2);
});

describe('autorización 5 — el presentador sigue la tabla', () => {
  it('lobby → open(0)', async () => {
    await seedRound(env);
    await assertSucceeds(updateDoc(roundRef(presenter()), openQ(0)));
  });

  it('open → revealed, antes o después del plazo', async () => {
    await seedRound(env, {
      phase: 'open',
      currentIndex: 0,
      openedAtMs: Date.now(),
      timeLimitSec: 30,
    });
    await assertSucceeds(updateDoc(roundRef(presenter()), { phase: 'revealed' }));
  });

  it('revealed → open(n+1), con el resultado de n ya escrito', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
    await seedResult(0);
    await assertSucceeds(updateDoc(roundRef(presenter()), openQ(1)));
  });

  it('revealed → podium tras la última, con su resultado escrito', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 1 });
    await seedResult(1);
    await assertSucceeds(
      updateDoc(roundRef(presenter()), { phase: 'podium', endedAt: serverTimestamp() }),
    );
  });

  it('cualquier fase → archived', async () => {
    await seedRound(env, {
      phase: 'open',
      currentIndex: 0,
      openedAtMs: Date.now(),
      timeLimitSec: 30,
    });
    await assertSucceeds(updateDoc(roundRef(presenter()), { phase: 'archived', active: false }));
  });
});

describe('denegación 8 — conducir sin ser el presentador (FR-017)', () => {
  it('un participante no abre, no revela, no archiva', async () => {
    await seedRound(env);
    const db = asAnon(env, 'p1').firestore() as unknown as Firestore;
    await assertFails(updateDoc(roundRef(db), openQ(0)));
    await assertFails(updateDoc(roundRef(db), { phase: 'archived', active: false }));
  });
});

describe('denegación 12 — nunca hacia atrás ni saltando (FR-023)', () => {
  it('revealed → open con el mismo índice', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
    await seedResult(0);
    await assertFails(updateDoc(roundRef(presenter()), openQ(0)));
  });

  it('saltarse una pregunta', async () => {
    await seedQuiz(env, 3);
    await seedRound(env, { phase: 'revealed', currentIndex: 0, questionCount: 3 });
    await seedResult(0);
    await assertFails(updateDoc(roundRef(presenter()), openQ(2)));
  });

  it('abrir más allá de la última pregunta', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 1 });
    await seedResult(1);
    await assertFails(updateDoc(roundRef(presenter()), openQ(2)));
  });

  it('volver a lobby, o volver de revealed a open sin avanzar', async () => {
    await seedRound(env, {
      phase: 'open',
      currentIndex: 0,
      openedAtMs: Date.now(),
      timeLimitSec: 30,
    });
    await assertFails(updateDoc(roundRef(presenter()), { phase: 'lobby' }));
  });

  it('nada sale de archived', async () => {
    await seedRound(env, { phase: 'archived', active: false });
    await assertFails(updateDoc(roundRef(presenter()), openQ(0)));
    await assertFails(updateDoc(roundRef(presenter()), { phase: 'lobby' }));
  });

  it('podio antes de la última pregunta', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
    await seedResult(0);
    await assertFails(
      updateDoc(roundRef(presenter()), { phase: 'podium', endedAt: serverTimestamp() }),
    );
  });
});

describe('doble clic y avances sin calificar (FR-018)', () => {
  it('revelar dos veces: la segunda no casa con ninguna transición', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
    await assertFails(updateDoc(roundRef(presenter()), { phase: 'revealed' }));
  });

  it('una actualización sin ningún cambio no pasa por ninguna regla', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0, maxParticipants: 60 });
    await assertFails(updateDoc(roundRef(presenter()), { maxParticipants: 60 }));
  });

  it('abrir dos veces la misma pregunta', async () => {
    await seedRound(env, {
      phase: 'open',
      currentIndex: 0,
      openedAtMs: Date.now(),
      timeLimitSec: 30,
    });
    await assertFails(updateDoc(roundRef(presenter()), openQ(0)));
  });

  it('no se avanza a la siguiente sin haber escrito el resultado de la actual', async () => {
    await seedRound(env, { phase: 'revealed', currentIndex: 0 });
    await assertFails(updateDoc(roundRef(presenter()), openQ(1)));
  });
});

describe('la transición no es vehículo para otra cosa', () => {
  it('abrir con un openedAt fabricado por el cliente', async () => {
    await seedRound(env);
    await assertFails(
      updateDoc(roundRef(presenter()), {
        ...openQ(0),
        openedAt: Timestamp.fromMillis(Date.now() + 60_000),
      }),
    );
  });

  it('abrir con un tiempo límite distinto al de la pregunta publicada', async () => {
    await seedRound(env);
    await assertFails(updateDoc(roundRef(presenter()), { ...openQ(0), timeLimitSec: 300 }));
  });

  it('revelar y a la vez tocar el contador o el tope', async () => {
    await seedRound(env, {
      phase: 'open',
      currentIndex: 0,
      openedAtMs: Date.now(),
      timeLimitSec: 30,
    });
    await assertFails(updateDoc(roundRef(presenter()), { phase: 'revealed', participantCount: 5 }));
    await assertFails(
      updateDoc(roundRef(presenter()), { phase: 'revealed', maxParticipants: 999 }),
    );
  });

  it('archivar dejando la ronda activa', async () => {
    await seedRound(env);
    await assertFails(updateDoc(roundRef(presenter()), { phase: 'archived' }));
  });
});
