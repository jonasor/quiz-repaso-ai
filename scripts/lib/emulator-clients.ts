/**
 * Clientes reales del SDK contra la Emulator Suite, para los scripts de medición.
 * Cada cliente es una app de Firebase independiente, con su propia identidad.
 */
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  terminate,
  type Firestore,
} from 'firebase/firestore';

export const PROJECT = process.env['GCLOUD_PROJECT'] ?? 'demo-quiz-repaso';

export interface Client {
  readonly app: FirebaseApp;
  readonly db: Firestore;
  readonly uid: string;
}

let counter = 0;

function newApp() {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT }, `cliente-${counter++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, auth, db };
}

export async function anonymousClient(): Promise<Client> {
  const { app, auth, db } = newApp();
  const { user } = await signInAnonymously(auth);
  return { app, db, uid: user.uid };
}

export function admin() {
  if (adminApps().length === 0) initAdmin({ projectId: PROJECT });
  return { db: adminFirestore(), auth: adminAuth() };
}

/** Cuenta de presentador con el claim, como scripts/grant-presenter.ts. */
export async function presenterClient(): Promise<Client> {
  const email = `presentador-${Date.now()}@ejemplo.test`;
  const password = 'contrasena-de-prueba';
  const { auth } = admin();
  const user = await auth.createUser({ email, password });
  await auth.setCustomUserClaims(user.uid, { presenter: true });
  const c = newApp();
  const cred = await signInWithEmailAndPassword(c.auth, email, password);
  await cred.user.getIdToken(true);
  return { app: c.app, db: c.db, uid: cred.user.uid };
}

export async function closeAll(clients: ReadonlyArray<Client>) {
  await Promise.all(
    clients.map(async (c) => {
      await terminate(c.db);
      await deleteApp(c.app);
    }),
  );
}

export function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] ?? 0;
}

/**
 * Siembra N participantes ya dentro, sin pasar por la entrada. La entrada tiene su
 * propia medición (measure-join-burst.ts); aquí se mide otra cosa.
 */
export async function seedParticipants(roundId: string, clients: ReadonlyArray<Client>) {
  const { db } = admin();
  const batch = db.batch();
  clients.forEach((c, i) => {
    const adjective = ['Astuto', 'Sabio', 'Noble', 'Audaz', 'Tenaz'][i % 5]!;
    const animal = `${['Zorro', 'Lince', 'Búho', 'Lobo', 'Garza'][Math.floor(i / 5) % 5]!}`;
    batch.set(db.doc(`rounds/${roundId}/participants/${c.uid}`), {
      adjective,
      animal,
      joinedAt: new Date(),
    });
  });
  batch.update(db.doc(`rounds/${roundId}`), { participantCount: clients.length });
  await batch.commit();
}
