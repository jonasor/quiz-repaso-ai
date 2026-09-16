/**
 * Otorga el custom claim `presenter` a una cuenta. Paso manual, una sola vez por
 * entorno, equivalente a crear la cuenta a mano (T010).
 *
 *   Emulador:   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/grant-presenter.ts <uid>
 *   Producción: GOOGLE_APPLICATION_CREDENTIALS=... npx tsx scripts/grant-presenter.ts <uid>
 *
 * El claim va firmado en el token por el Admin SDK, así que ningún cliente puede
 * concedérselo. Esa es la razón de que `isPresenter()` pueda confiar en él sin
 * leer ningún documento.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const uid = process.argv[2];
if (!uid) {
  console.error('uso: npx tsx scripts/grant-presenter.ts <uid>');
  process.exit(1);
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-quiz-repaso' });
await getAuth().setCustomUserClaims(uid, { presenter: true });
console.log(`claim presenter=true otorgado a ${uid}`);
