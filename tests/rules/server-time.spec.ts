/**
 * SPIKE T012 — compuerta del diseño.
 *
 * Demuestra que `request.resource.data.submittedAt == request.time` obliga a que
 * la marca de tiempo la ponga el servidor, y que un timestamp fabricado por el
 * cliente se rechaza. Es lo que sostiene FR-034: la antigüedad de una respuesta
 * se mide con una referencia que el participante no controla.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { asAnon, setupTestEnv } from './helpers';

let env: RulesTestEnvironment;
const ROUND = 'r1';
const PLAYER = 'player-1';

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'rounds', ROUND), {
      phase: 'open',
      currentIndex: 0,
      openedAt: Timestamp.fromMillis(Date.now() - 2_000),
      timeLimitSec: 30,
    });
  });
});

describe('server time enforcement', () => {
  it('acepta serverTimestamp()', async () => {
    const db = asAnon(env, PLAYER).firestore();
    await assertSucceeds(
      setDoc(doc(db, `rounds/${ROUND}/answers`, `${PLAYER}_0`), {
        uid: PLAYER,
        questionIndex: 0,
        optionIndex: 0,
        submittedAt: serverTimestamp(),
      }),
    );
  });

  it('rechaza un timestamp fabricado por el cliente, aunque sea la hora actual', async () => {
    const db = asAnon(env, PLAYER).firestore();
    await assertFails(
      setDoc(doc(db, `rounds/${ROUND}/answers`, `${PLAYER}_0`), {
        uid: PLAYER,
        questionIndex: 0,
        optionIndex: 0,
        submittedAt: Timestamp.now(),
      }),
    );
  });

  it('rechaza un timestamp antedatado para simular haber respondido más rápido', async () => {
    const db = asAnon(env, PLAYER).firestore();
    await assertFails(
      setDoc(doc(db, `rounds/${ROUND}/answers`, `${PLAYER}_0`), {
        uid: PLAYER,
        questionIndex: 0,
        optionIndex: 0,
        submittedAt: Timestamp.fromMillis(Date.now() - 29_000),
      }),
    );
  });
});
