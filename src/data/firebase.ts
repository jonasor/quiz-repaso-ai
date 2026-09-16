/**
 * Inicialización de Firebase y autenticación anónima.
 *
 * Única capa que conoce Firebase junto al resto de `src/data/` (Principio III).
 *
 * **Sin App Check.** Su amenaza —una persona fabrica identidades anónimas que
 * entran legítimamente y ocupan el cupo— se acepta por baja probabilidad en una
 * sesión presencial, y **no la cierra el contador exacto de D4**: ese cerró que se
 * rebasara el tope, no que se ocupara con identidades fabricadas. Ver D4 y el
 * riesgo abierto 4 de research.md. Se evalúa en T093.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  signInAnonymously,
  type Auth,
  type User,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const AUTH_PORT = 9099;

export interface FirebaseHandles {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;
}

let handles: FirebaseHandles | null = null;

function useEmulator(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_USE_EMULATOR === 'true';
}

export function initFirebase(): FirebaseHandles {
  if (handles !== null) return handles;

  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-api-key',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'demo-quiz-repaso.firebaseapp.com',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'demo-quiz-repaso',
  });

  const auth = getAuth(app);
  const db = getFirestore(app);

  if (useEmulator()) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_PORT);
  }

  handles = { app, auth, db };
  return handles;
}

/**
 * Identidad del participante: anónima y persistida en el dispositivo.
 *
 * La persistencia local es lo que sostiene FR-004, recuperar identidad y apodo tras
 * una recarga. Y es también el límite que FR-005 declara: **no hay mecanismo de
 * recuperación entre dispositivos**, ni debe haberlo. Quien borre el almacenamiento
 * vuelve como participante nuevo, y eso es una consecuencia aceptada del anonimato
 * irreversible, no un defecto por corregir.
 */
export async function signInAsParticipant(auth: Auth): Promise<User> {
  await setPersistence(auth, browserLocalPersistence);
  if (auth.currentUser !== null) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}
