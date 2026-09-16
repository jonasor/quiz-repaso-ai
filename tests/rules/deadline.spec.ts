/**
 * SPIKE T011 — compuerta del diseño.
 *
 * Demuestra contra el emulador que el cierre de una pregunta puede expresarse
 * como aritmética de timestamps dentro de las reglas:
 *
 *     request.time.toMillis() < openedAt.toMillis() + timeLimitSec * 1000
 *
 * Si esto no se sostiene, la decisión D1 de research.md cae y el modelo de datos
 * entero cambia. De ahí que este test vaya antes de cualquier UI.
 *
 * El punto crítico del segundo caso: la respuesta se rechaza **sin que ningún
 * cliente haya escrito un cambio de fase**. La ronda sigue diciendo phase:'open'.
 * Lo que cierra es el paso del tiempo del servidor, no una acción.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { asAnon, setupTestEnv } from './helpers';

let env: RulesTestEnvironment;

const ROUND = 'r1';
const PLAYER = 'player-1';

/** Siembra la ronda con un openedAt dado, sin pasar por las reglas. */
async function seedRound(openedAtMs: number, timeLimitSec: number) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'rounds', ROUND), {
      quizId: 'quiz1',
      phase: 'open',
      currentIndex: 0,
      openedAt: Timestamp.fromMillis(openedAtMs),
      timeLimitSec,
    });
    await setDoc(doc(ctx.firestore(), 'quizzes/quiz1/questions', '0'), {
      index: 0,
      text: 'Pregunta',
      options: ['A', 'B', 'C', 'D'],
      timeLimitSec: 30,
    });
    // Solo responde quien entró a la ronda (T035). El spike mide el plazo, no la
    // entrada, así que el participante se siembra ya dentro.
    await setDoc(doc(ctx.firestore(), `rounds/${ROUND}/participants`, PLAYER), {
      adjective: 'Astuto',
      animal: 'Zorro',
      joinedAt: Timestamp.now(),
    });
  });
}

function answerRef(uid: string) {
  const db = asAnon(env, uid).firestore();
  return doc(db, `rounds/${ROUND}/answers`, `${uid}_0`);
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

describe('deadline arithmetic', () => {
  it('acepta una respuesta dentro del plazo', async () => {
    // Abierta hace 5 s, con 30 s de límite: quedan 25 s.
    await seedRound(Date.now() - 5_000, 30);
    await assertSucceeds(
      setDoc(answerRef(PLAYER), {
        uid: PLAYER,
        questionIndex: 0,
        optionIndex: 2,
        submittedAt: serverTimestamp(),
      }),
    );
  });

  it('rechaza la misma respuesta con el plazo vencido, sin que nadie cerrase la pregunta', async () => {
    // Abierta hace 40 s con 30 s de límite: venció hace 10 s.
    // La ronda sigue en phase:'open'. Nadie escribió nada para cerrarla.
    await seedRound(Date.now() - 40_000, 30);
    await assertFails(
      setDoc(answerRef(PLAYER), {
        uid: PLAYER,
        questionIndex: 0,
        optionIndex: 2,
        submittedAt: serverTimestamp(),
      }),
    );
  });

  it('rechaza en el instante exacto del vencimiento', async () => {
    await seedRound(Date.now() - 30_000, 30);
    await assertFails(
      setDoc(answerRef(PLAYER), {
        uid: PLAYER,
        questionIndex: 0,
        optionIndex: 1,
        submittedAt: serverTimestamp(),
      }),
    );
  });
});
