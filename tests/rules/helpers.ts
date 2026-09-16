import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
  type RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

/**
 * Resolución de T010: la autoridad del presentador es un **custom claim**, no un
 * `uid` literal en las reglas.
 *
 * El contrato original fijaba `PRESENTER_UID` como constante literal, y ahí estaba
 * el problema que T010 señala: `firestore.rules` se despliega tal cual al emulador
 * y a producción, así que un `uid` literal obliga a plantillar el archivo por
 * entorno o a meter el `uid` de producción en los tests.
 *
 * `request.auth.token.presenter == true` evita las dos cosas:
 *
 *   - El archivo de reglas es **idéntico** en los dos entornos. No hay plantilla,
 *     así que T021 puede seguir leyéndolo como un archivo normal.
 *   - **No añade ningún `get()`**, que era la objeción del contrato al documento de
 *     autoridad. El presupuesto de accesos queda intacto.
 *   - El participante **no puede falsificarlo**: los custom claims los firma el
 *     Admin SDK dentro del token, no los escribe el cliente.
 *
 * El claim se otorga una sola vez con `scripts/grant-presenter.ts`, que es el mismo
 * tipo de paso manual que T010 ya aceptaba para crear la cuenta.
 */
export const PRESENTER_UID = 'presenter-test-uid';
export const PROJECT_ID = 'demo-quiz-repaso';

export async function setupTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

/** Presentador: cuenta real con el claim `presenter`. */
export function asPresenter(env: RulesTestEnvironment): RulesTestContext {
  return env.authenticatedContext(PRESENTER_UID, {
    presenter: true,
    firebase: { sign_in_provider: 'password' },
  });
}

/** Participante: anónimo y sin el claim. */
export function asAnon(env: RulesTestEnvironment, uid: string): RulesTestContext {
  return env.authenticatedContext(uid, {
    firebase: { sign_in_provider: 'anonymous' },
  });
}

/**
 * Un anónimo que *afirma* ser presentador en su propio payload. Debe ser tratado
 * como participante: el claim no se lo puede dar él.
 */
export function asAnonClaimingPresenter(env: RulesTestEnvironment, uid: string): RulesTestContext {
  return env.authenticatedContext(uid, {
    presenter: false,
    firebase: { sign_in_provider: 'anonymous' },
  });
}

export function asUnauthenticated(env: RulesTestEnvironment): RulesTestContext {
  return env.unauthenticatedContext();
}
