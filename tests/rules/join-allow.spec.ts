/**
 * T034 — Entrada: autorizaciones 1, 9 y 10 (FR-001, FR-007, FR-009, FR-012, SC-010).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { ROUND, joinBatch, seedParticipant, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;
const presenter = () => asPresenter(env).firestore() as unknown as Firestore;

/** La entrada como la hará la aplicación: transacción que lee el contador. */
function joinTx(db: Firestore, uid: string, adjective: string, animal: string) {
  return runTransaction(db, async (tx) => {
    const roundRef = doc(db, 'rounds', ROUND);
    const snap = await tx.get(roundRef);
    const count = snap.data()?.['participantCount'] as number;
    tx.set(doc(db, 'rounds', ROUND, 'participants', uid), {
      adjective,
      animal,
      joinedAt: serverTimestamp(),
    });
    tx.set(doc(db, 'rounds', ROUND, 'nicknames', `${adjective}_${animal}`), { uid });
    tx.update(roundRef, { participantCount: count + 1 });
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
  await seedQuiz(env);
  await seedRound(env);
});

describe('autorización 1 — una entrada completa', () => {
  it('como lote', async () => {
    await assertSucceeds(joinBatch(anon('p1'), 'p1', 0));
  });

  it('como transacción, igual que la aplicación', async () => {
    await assertSucceeds(joinTx(anon('p1'), 'p1', 'Sabio', 'Lince'));
  });

  it('el último lugar libre se puede ocupar', async () => {
    await env.clearFirestore();
    await seedQuiz(env);
    await seedRound(env, { maxParticipants: 3, participantCount: 2 });
    await assertSucceeds(joinBatch(anon('p3'), 'p3', 2));
  });
});

describe('autorización 10 — entradas concurrentes', () => {
  /**
   * Hallazgo de la implementación, fijado como test. Dos transacciones leen el mismo
   * contador; la primera confirma y la segunda escribe un contador que ya no es el
   * leído. Las reglas exigen exactamente +1 y la rechazan con PERMISSION_DENIED *antes*
   * de que Firestore detecte el conflicto, así que el SDK no la reintenta.
   *
   * La autorización se cumple —las reglas no impiden que ambos entren— pero solo si
   * quien entra relee y reintenta. Eso hace `joinRound` en src/data/rounds.ts, y
   * tests/rules/data-flow.spec.ts lo prueba con diez entradas simultáneas.
   */
  it('dos a la vez: sin reintento puede perder uno; releyendo y reintentando, entran ambos', async () => {
    const settled = await Promise.allSettled([
      joinTx(anon('p1'), 'p1', 'Astuto', 'Zorro'),
      joinTx(anon('p2'), 'p2', 'Sabio', 'Lince'),
    ]);
    expect(settled.some((s) => s.status === 'fulfilled')).toBe(true);

    const lost = settled
      .map((s, i) => ({
        s,
        uid: i === 0 ? 'p1' : 'p2',
        nick: i === 0 ? ['Astuto', 'Zorro'] : ['Sabio', 'Lince'],
      }))
      .filter((x) => x.s.status === 'rejected');
    for (const x of lost) {
      await assertSucceeds(joinTx(anon(x.uid), x.uid, x.nick[0]!, x.nick[1]!));
    }

    let count = -1;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), 'rounds', ROUND));
      count = snap.data()?.['participantCount'] as number;
    });
    expect(count).toBe(2);
  });
});

describe('autorización 9 — el presentador ajusta el tope en curso (FR-012)', () => {
  it('sube el tope de una ronda con partida en marcha', async () => {
    await env.clearFirestore();
    await seedQuiz(env);
    await seedRound(env, {
      phase: 'open',
      currentIndex: 0,
      openedAtMs: Date.now(),
      timeLimitSec: 30,
      maxParticipants: 2,
      participantCount: 2,
    });
    await assertSucceeds(updateDoc(doc(presenter(), 'rounds', ROUND), { maxParticipants: 10 }));
  });

  it('no por debajo de los que ya están dentro, ni en una ronda archivada', async () => {
    await seedParticipant(env, 'p1');
    await seedParticipant(env, 'p2', 'Sabio', 'Lince');
    await assertFails(updateDoc(doc(presenter(), 'rounds', ROUND), { maxParticipants: 1 }));

    await env.clearFirestore();
    await seedQuiz(env);
    await seedRound(env, { phase: 'archived', active: false });
    await assertFails(updateDoc(doc(presenter(), 'rounds', ROUND), { maxParticipants: 99 }));
  });

  it('un participante no puede subirlo', async () => {
    await assertFails(updateDoc(doc(anon('p1'), 'rounds', ROUND), { maxParticipants: 999 }));
  });
});
