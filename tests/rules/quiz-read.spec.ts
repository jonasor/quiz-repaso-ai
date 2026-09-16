/**
 * T027 — Cuestionario: denegaciones 1, 10 y 11, y autorización 8.
 *
 * Es la garantía física de D3. La pregunta vive partida en un documento público y
 * uno de solución, y estas pruebas verifican que la partición la hace cumplir el
 * servidor: ni un participante alcanza la solución, ni el presentador puede colar
 * la solución dentro del documento público por un descuido de publicación.
 *
 * Cada permiso que abre T026 tiene aquí su autorización, y cada cierre su denegación
 * (Principio IV).
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  asAnon,
  asAnonClaimingPresenter,
  asPresenter,
  asUnauthenticated,
  setupTestEnv,
} from './helpers';

let env: RulesTestEnvironment;

const QUIZ = 'q1';

const quizMeta = () => ({ title: 'Repaso', questionCount: 1, publishedAt: serverTimestamp() });
const publicQuestion = {
  index: 0,
  text: '¿Qué comando conviene?',
  options: ['/compact', '/clear'],
  timeLimitSec: 30,
};
const solution = { correctIndex: 0, teachingNote: '/compact conserva el hilo.' };

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'quizzes', QUIZ), {
      title: 'Repaso',
      questionCount: 1,
      publishedAt: new Date(),
    });
    await setDoc(doc(db, 'quizzes', QUIZ, 'questions', '0'), publicQuestion);
    await setDoc(doc(db, 'quizzes', QUIZ, 'solutions', '0'), solution);
  });
});

describe('denegación 1 — un participante no alcanza la solución (FR-051)', () => {
  it('no puede leer solutions/{n} por ruta directa', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertFails(getDoc(doc(db, 'quizzes', QUIZ, 'solutions', '0')));
  });

  it('no puede listar la colección de soluciones', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertFails(getDocs(collection(db, 'quizzes', QUIZ, 'solutions')));
  });

  it('afirmar presenter:false en su propio token no le da nada', async () => {
    const db = asAnonClaimingPresenter(env, 'p1').firestore();
    await assertFails(getDoc(doc(db, 'quizzes', QUIZ, 'solutions', '0')));
  });
});

describe('denegación 10 — un participante no publica contenido (FR-065)', () => {
  it('no puede crear un cuestionario', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertFails(setDoc(doc(db, 'quizzes', 'q2'), quizMeta()));
  });

  it('no puede escribir una pregunta pública', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertFails(
      setDoc(doc(db, 'quizzes', QUIZ, 'questions', '1'), { ...publicQuestion, index: 1 }),
    );
  });

  it('no puede escribir ni sobrescribir una solución', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertFails(
      setDoc(doc(db, 'quizzes', QUIZ, 'solutions', '0'), { ...solution, correctIndex: 1 }),
    );
  });
});

describe('denegación 11 — la solución no cabe en el documento público (FR-045, FR-066)', () => {
  it('rechaza correctIndex dentro de questions/{n}, aunque lo escriba el presentador', async () => {
    const db = asPresenter(env).firestore();
    await assertFails(
      setDoc(doc(db, 'quizzes', QUIZ, 'questions', '1'), {
        ...publicQuestion,
        index: 1,
        correctIndex: 0,
      }),
    );
  });

  it('rechaza teachingNote dentro de questions/{n}, aunque lo escriba el presentador', async () => {
    const db = asPresenter(env).firestore();
    await assertFails(
      setDoc(doc(db, 'quizzes', QUIZ, 'questions', '1'), {
        ...publicQuestion,
        index: 1,
        teachingNote: 'se filtra',
      }),
    );
  });

  it('rechaza una pregunta pública a la que le falta un campo', async () => {
    const db = asPresenter(env).firestore();
    const sinTiempo = { index: 1, text: publicQuestion.text, options: publicQuestion.options };
    await assertFails(setDoc(doc(db, 'quizzes', QUIZ, 'questions', '1'), sinTiempo));
  });
});

describe('autorización 8 y permisos que T026 abre', () => {
  it('el presentador lee solutions/{n} (autorización 8)', async () => {
    const db = asPresenter(env).firestore();
    await assertSucceeds(getDoc(doc(db, 'quizzes', QUIZ, 'solutions', '0')));
  });

  it('un participante lee el cuestionario y la pregunta pública', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertSucceeds(getDoc(doc(db, 'quizzes', QUIZ)));
    await assertSucceeds(getDoc(doc(db, 'quizzes', QUIZ, 'questions', '0')));
  });

  it('sin autenticar no se lee la pregunta pública', async () => {
    const db = asUnauthenticated(env).firestore();
    await assertFails(getDoc(doc(db, 'quizzes', QUIZ, 'questions', '0')));
  });

  it('el presentador publica metadatos, pregunta y solución con los campos exactos', async () => {
    const db = asPresenter(env).firestore();
    await assertSucceeds(setDoc(doc(db, 'quizzes', 'q2'), quizMeta()));
    await assertSucceeds(setDoc(doc(db, 'quizzes', 'q2', 'questions', '0'), publicQuestion));
    await assertSucceeds(setDoc(doc(db, 'quizzes', 'q2', 'solutions', '0'), solution));
  });

  it('una solución con campos de más se rechaza', async () => {
    const db = asPresenter(env).firestore();
    await assertFails(
      setDoc(doc(db, 'quizzes', 'q2', 'solutions', '0'), { ...solution, extra: true }),
    );
  });

  it('nadie borra contenido publicado, ni el presentador', async () => {
    const db = asPresenter(env).firestore();
    await assertFails(deleteDoc(doc(db, 'quizzes', QUIZ)));
    await assertFails(deleteDoc(doc(db, 'quizzes', QUIZ, 'questions', '0')));
    await assertFails(deleteDoc(doc(db, 'quizzes', QUIZ, 'solutions', '0')));
  });
});
