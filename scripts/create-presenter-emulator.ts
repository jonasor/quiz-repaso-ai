/**
 * Crea en el emulador una cuenta de presentador con el claim ya otorgado, para probar la
 * aplicación en local (quickstart.md). Solo emulador: se niega a correr sin él.
 *
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/create-presenter-emulator.ts
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (process.env['FIREBASE_AUTH_EMULATOR_HOST'] === undefined) {
  console.error(
    'FIREBASE_AUTH_EMULATOR_HOST no está definido. Este script solo actúa sobre el emulador.',
  );
  process.exit(1);
}

const EMAIL = process.argv[2] ?? 'presentador@quiz.test';
const PASSWORD = process.argv[3] ?? 'presentador123';

initializeApp({ projectId: process.env['GCLOUD_PROJECT'] ?? 'demo-quiz-repaso' });
const auth = getAuth();
const user = await auth
  .getUserByEmail(EMAIL)
  .catch(() => auth.createUser({ email: EMAIL, password: PASSWORD }));
await auth.setCustomUserClaims(user.uid, { presenter: true });
console.log(`presentador listo en el emulador: ${EMAIL} / ${PASSWORD}`);
