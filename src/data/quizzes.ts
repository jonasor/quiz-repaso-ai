/**
 * Cuestionarios: publicación y lectura. FR-064 a FR-069.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { splitForPublication, type ValidatedQuiz } from '../domain/quizFile';
import type { PublicQuestion, Solution } from '../domain/types';
import { isPermissionDenied } from './errors';
import { toPublicQuestion, toQuizSummary, toSolution, type QuizSummary } from './mappers';

/** Un lote admite 500 escrituras: metadatos más pregunta y solución por pregunta. */
export const MAX_QUESTIONS_PER_QUIZ = 249;

/** Id para una publicación. Se genera **una vez por archivo cargado**, no por clic (T105). */
export function newQuizId(db: Firestore): string {
  return doc(collection(db, 'quizzes')).id;
}

/**
 * Publica un cuestionario ya validado, **todo o nada** (FR-069): metadatos, preguntas
 * públicas y soluciones van en un mismo lote atómico.
 *
 * **Idempotente** (T105, FR-018): el id lo fija quien llama, una vez por archivo. Publicar
 * dos veces el mismo id —un doble clic, o dos a la vez— deja un único cuestionario, y la
 * segunda llamada devuelve el mismo id sin escribir. El contenido publicado es inmutable
 * en las reglas (T103), así que el segundo lote no puede sobrescribir el primero: se
 * rechaza, y eso se interpreta como "ya estaba publicado".
 */
export async function publishQuiz(
  db: Firestore,
  quiz: ValidatedQuiz,
  quizId: string = newQuizId(db),
): Promise<string> {
  if (quiz.questions.length > MAX_QUESTIONS_PER_QUIZ) {
    throw new Error(`un cuestionario admite hasta ${MAX_QUESTIONS_PER_QUIZ} preguntas`);
  }
  const quizRef = doc(db, 'quizzes', quizId);
  if ((await getDoc(quizRef)).exists()) return quizId;

  const { meta, questions, solutions } = splitForPublication(quiz);
  const batch = writeBatch(db);
  batch.set(quizRef, { ...meta, publishedAt: serverTimestamp() });
  questions.forEach((q, i) => {
    batch.set(doc(quizRef, 'questions', String(i)), {
      index: q.index,
      text: q.text,
      options: [...q.options],
      timeLimitSec: q.timeLimitSec,
    });
    const s = solutions[i];
    if (s === undefined) throw new Error(`falta la solución de la pregunta ${i}`);
    batch.set(doc(quizRef, 'solutions', String(i)), {
      correctIndex: s.correctIndex,
      teachingNote: s.teachingNote,
    });
  });
  try {
    await batch.commit();
  } catch (e) {
    // Dos envíos a la vez: el otro ya lo publicó.
    if (isPermissionDenied(e) && (await getDoc(quizRef)).exists()) return quizId;
    throw e;
  }
  return quizId;
}

export async function listQuizzes(db: Firestore): Promise<QuizSummary[]> {
  const snap = await getDocs(query(collection(db, 'quizzes'), orderBy('publishedAt', 'desc')));
  return snap.docs.map((d) => toQuizSummary(d.id, d.data()));
}

export async function getQuestion(
  db: Firestore,
  quizId: string,
  index: number,
): Promise<PublicQuestion | null> {
  const snap = await getDoc(doc(db, 'quizzes', quizId, 'questions', String(index)));
  return snap.exists() ? toPublicQuestion(snap.data()) : null;
}

export async function getQuestions(db: Firestore, quizId: string): Promise<PublicQuestion[]> {
  const snap = await getDocs(
    query(collection(db, 'quizzes', quizId, 'questions'), orderBy('index')),
  );
  return snap.docs.map((d) => toPublicQuestion(d.data()));
}

/** Solo el presentador: las reglas rechazan a cualquier otro (FR-046, FR-051). */
export async function getSolution(
  db: Firestore,
  quizId: string,
  index: number,
): Promise<Solution | null> {
  const snap = await getDoc(doc(db, 'quizzes', quizId, 'solutions', String(index)));
  return snap.exists() ? toSolution(snap.data()) : null;
}
