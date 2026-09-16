/**
 * T051 — Mide la entrada en ráfaga contra el emulador.
 *
 * N clientes reales del SDK, cada uno con su propia identidad anónima, entran a la vez
 * a la misma ronda por `joinRound`, que es el código de la aplicación, con las reglas
 * reales cargadas. Cierra el riesgo abierto 2 de research.md y da el dato de SC-001:
 * menos de 15 s desde abrir el enlace hasta estar dentro.
 *
 *   npx firebase emulators:exec --only firestore,auth \
 *     "npx tsx scripts/measure-join-burst.ts 50"
 *
 * Lo que NO mide: la latencia de red real a los servidores de Firebase, que el emulador
 * local no tiene. La contención sí es real, porque es del propio mecanismo.
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminDb } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, terminate } from 'firebase/firestore';
import { JOIN_DEFAULTS, joinRound } from '../src/data/rounds';
import { generateNickname } from '../src/domain/nickname';

const PROJECT = process.env['GCLOUD_PROJECT'] ?? 'demo-quiz-repaso';
const N = Number(process.argv[2] ?? 50);
const ROUND = `burst-${Date.now()}`;

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0;
}

async function seed() {
  initAdmin({ projectId: PROJECT });
  const db = adminDb();
  await db
    .doc('quizzes/burst-quiz')
    .set({ title: 'Ráfaga', questionCount: 1, publishedAt: new Date() });
  await db.doc('quizzes/burst-quiz/questions/0').set({
    index: 0,
    text: 'x',
    options: ['a', 'b'],
    timeLimitSec: 30,
  });
  await db.doc(`rounds/${ROUND}`).set({
    quizId: 'burst-quiz',
    questionCount: 1,
    phase: 'lobby',
    currentIndex: -1,
    openedAt: null,
    timeLimitSec: null,
    maxParticipants: N + 10,
    participantCount: 0,
    active: true,
    startedAt: new Date(),
    endedAt: null,
  });
  return db;
}

async function main() {
  const admin = await seed();

  // Clientes y autenticación primero: se mide la entrada, no el alta anónima.
  const clients = await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const app = initializeApp({ apiKey: 'demo', projectId: PROJECT }, `c${i}`);
      const auth = getAuth(app);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      const db = getFirestore(app);
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      const t0 = performance.now();
      const { user } = await signInAnonymously(auth);
      return { app, db, uid: user.uid, authMs: performance.now() - t0 };
    }),
  );

  let retries = 0;
  const start = performance.now();
  const results = await Promise.all(
    clients.map(async (c) => {
      const t0 = performance.now();
      const outcome = await joinRound(
        c.db,
        ROUND,
        c.uid,
        generateNickname(Math.random),
        () => generateNickname(Math.random),
        {
          onRetry: () => retries++,
          maxAttempts: Number(process.env['JOIN_ATTEMPTS'] ?? JOIN_DEFAULTS.maxAttempts),
          baseDelayMs: Number(process.env['JOIN_BASE_MS'] ?? JOIN_DEFAULTS.baseDelayMs),
          maxDelayMs: Number(process.env['JOIN_MAX_MS'] ?? JOIN_DEFAULTS.maxDelayMs),
        },
      );
      return { kind: outcome.kind, ms: performance.now() - t0 };
    }),
  );
  const wall = performance.now() - start;

  const joined = results.filter((r) => r.kind === 'joined');
  const times = joined.map((r) => r.ms);
  const count = (await admin.doc(`rounds/${ROUND}`).get()).data()?.['participantCount'] as number;
  const nicknames = (await admin.collection(`rounds/${ROUND}/nicknames`).get()).size;

  const report = {
    participantes: N,
    dentro: joined.length,
    fallidos: results.filter((r) => r.kind !== 'joined').length,
    contadorFinal: count,
    reservasDeApodo: nicknames,
    reintentosTotales: retries,
    msEntrada: {
      p50: Math.round(pct(times, 50)),
      p95: Math.round(pct(times, 95)),
      max: Math.round(Math.max(...times)),
    },
    msAltaAnonimaP95: Math.round(
      pct(
        clients.map((c) => c.authMs),
        95,
      ),
    ),
    msRafagaCompleta: Math.round(wall),
    retroceso: {
      maxAttempts: process.env['JOIN_ATTEMPTS'] ?? JOIN_DEFAULTS.maxAttempts,
      baseDelayMs: process.env['JOIN_BASE_MS'] ?? JOIN_DEFAULTS.baseDelayMs,
      maxDelayMs: process.env['JOIN_MAX_MS'] ?? JOIN_DEFAULTS.maxDelayMs,
    },
    sc001: pct(times, 95) < 15_000 ? 'CUMPLE (p95 < 15 s)' : 'NO CUMPLE',
  };
  console.log(JSON.stringify(report, null, 2));

  await Promise.all(
    clients.map(async (c) => {
      await terminate(c.db);
      await deleteApp(c.app);
    }),
  );
  process.exit(count === joined.length && joined.length === N ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});
