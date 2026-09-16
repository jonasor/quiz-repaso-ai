/**
 * Calificación, puntajes y podio. T054, T055.
 *
 * **Única lectura de respuestas ajenas de toda la aplicación** (T074, FR-056): ocurre
 * dentro de `gradeCurrentQuestion` y no se exporta. Ninguna vista del presentador puede
 * pedir la lista de respuestas individuales, porque no existe función que la devuelva.
 *
 * Aquí no se calcula nada: se lee, se llama al dominio y se escribe (Principio III).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { finalizeRound, gradeQuestion } from '../domain/grading';
import type { Answer, ParticipantScore, Podium, QuestionResult, Round } from '../domain/types';
import {
  fromScore,
  toAnswer,
  toParticipant,
  toPodium,
  toQuestionResult,
  toRound,
  toScore,
} from './mappers';
import { getQuestions, getSolution } from './quizzes';

/** Holgura bajo el límite de 500 escrituras por lote. */
const BATCH_LIMIT = 450;

async function commitInChunks(
  db: Firestore,
  writes: ReadonlyArray<(b: ReturnType<typeof writeBatch>) => void>,
): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    writes.slice(i, i + BATCH_LIMIT).forEach((w) => w(batch));
    await batch.commit();
  }
}

async function readRound(db: Firestore, roundId: string): Promise<Round | null> {
  const snap = await getDoc(doc(db, 'rounds', roundId));
  return snap.exists() ? toRound(snap.data()) : null;
}

async function readParticipants(db: Firestore, roundId: string) {
  const snap = await getDocs(collection(db, 'rounds', roundId, 'participants'));
  return snap.docs.map((d) => toParticipant(d.id, d.data()));
}

async function readScores(db: Firestore, roundId: string): Promise<Map<string, ParticipantScore>> {
  const snap = await getDocs(collection(db, 'rounds', roundId, 'scores'));
  return new Map(snap.docs.map((d) => [d.id, toScore(d.data())]));
}

/** No exportada a propósito: ver la cabecera del módulo. */
async function readAnswersForQuestion(
  db: Firestore,
  roundId: string,
  questionIndex: number,
): Promise<Answer[]> {
  const snap = await getDocs(
    query(
      collection(db, 'rounds', roundId, 'answers'),
      where('questionIndex', '==', questionIndex),
    ),
  );
  return snap.docs.map((d) => toAnswer(d.data()));
}

export type GradeResult = 'graded' | 'already-graded' | 'not-revealed';

/**
 * Califica la pregunta revelada en curso (T055).
 *
 * Va **después** de `revealQuestion`, no junto: con la fase ya en `revealed` las reglas
 * no admiten ninguna respuesta más, así que las leídas son todas las que habrá. Si se
 * calificara antes de cerrar, una respuesta confirmada entre la lectura y la escritura
 * quedaría fuera sin que nadie lo notara.
 *
 * Idempotente y reanudable (FR-018): los puntajes van primero y el agregado al final,
 * como marca de "calificada". Si el presentador se cae a medias, repetir recalcula
 * exactamente los mismos documentos.
 */
export async function gradeCurrentQuestion(db: Firestore, roundId: string): Promise<GradeResult> {
  const round = await readRound(db, roundId);
  if (round === null || round.phase !== 'revealed' || round.openedAtMs === null) {
    return 'not-revealed';
  }
  const n = round.currentIndex;
  const resultRef = doc(db, 'rounds', roundId, 'results', String(n));
  if ((await getDoc(resultRef)).exists()) return 'already-graded';

  const [questions, solution, participants, answers, previousScores] = await Promise.all([
    getQuestions(db, round.quizId),
    getSolution(db, round.quizId, n),
    readParticipants(db, roundId),
    readAnswersForQuestion(db, roundId, n),
    readScores(db, roundId),
  ]);
  const question = questions[n];
  if (question === undefined || solution === null) throw new Error(`falta la pregunta ${n}`);

  const { result, scores } = gradeQuestion({
    questionIndex: n,
    optionCount: question.options.length,
    correctIndex: solution.correctIndex,
    openedAtMs: round.openedAtMs,
    timeLimits: questions.slice(0, n + 1).map((q) => q.timeLimitSec),
    participants,
    answers,
    previousScores,
  });

  await commitInChunks(
    db,
    scores.map((s) => (b) => b.set(doc(db, 'rounds', roundId, 'scores', s.uid), fromScore(s))),
  );
  try {
    const batch = writeBatch(db);
    batch.set(resultRef, {
      questionIndex: result.questionIndex,
      distribution: result.distribution,
      answerCount: result.answerCount,
      correctIndex: result.correctIndex,
      correctPct: result.correctPct,
      revealedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (e) {
    // Otra pestaña del presentador calificó a la vez: el agregado ya existe.
    if ((await getDoc(resultRef)).exists()) return 'already-graded';
    throw e;
  }
  return 'graded';
}

export type CloseResult = 'closed' | 'not-ready';

/**
 * Cierra la partida: posiciones finales, podio y paso a `podium` (FR-047 a FR-050).
 * Los puntajes con posición van primero; el podio y el cambio de fase, juntos al final.
 */
export async function closeRound(db: Firestore, roundId: string): Promise<CloseResult> {
  const round = await readRound(db, roundId);
  if (
    round === null ||
    round.phase !== 'revealed' ||
    round.currentIndex + 1 !== round.questionCount
  ) {
    return 'not-ready';
  }
  // Las reglas exigen el agregado de la última pregunta antes del podio.
  if (!(await getDoc(doc(db, 'rounds', roundId, 'results', String(round.currentIndex)))).exists()) {
    return 'not-ready';
  }
  const [questions, participants, scores] = await Promise.all([
    getQuestions(db, round.quizId),
    readParticipants(db, roundId),
    readScores(db, roundId),
  ]);
  const out = finalizeRound({
    participants,
    scores,
    timeLimits: questions.map((q) => q.timeLimitSec),
  });

  await commitInChunks(
    db,
    out.scores.map((s) => (b) => b.set(doc(db, 'rounds', roundId, 'scores', s.uid), fromScore(s))),
  );

  const roundRef = doc(db, 'rounds', roundId);
  const podiumRef = doc(db, 'rounds', roundId, 'podium', 'final');
  const done = await runTransaction(db, async (tx) => {
    const snap = await tx.get(roundRef);
    if (!snap.exists() || snap.data()['phase'] !== 'revealed') return false;
    tx.set(podiumRef, {
      top: out.podium.top.map((t) => ({ ...t })),
      participantCount: out.podium.participantCount,
      closedAt: serverTimestamp(),
    });
    tx.update(roundRef, { phase: 'podium', endedAt: serverTimestamp() });
    return true;
  });
  return done ? 'closed' : 'not-ready';
}

// ---------- Lecturas públicas y propias ----------

export function watchOwnScore(
  db: Firestore,
  roundId: string,
  uid: string,
  onChange: (s: ParticipantScore | null) => void,
  onError: (e: unknown) => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'rounds', roundId, 'scores', uid),
    (snap) => onChange(snap.exists() ? toScore(snap.data()) : null),
    onError,
  );
}

export function watchResult(
  db: Firestore,
  roundId: string,
  questionIndex: number,
  onChange: (r: QuestionResult | null) => void,
  onError: (e: unknown) => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'rounds', roundId, 'results', String(questionIndex)),
    // includeMetadataChanges es obligatorio si se descartan escrituras pendientes: la
    // confirmación del servidor solo cambia metadatos, y sin esta opción no dispara evento.
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) return onChange(null);
      if (snap.metadata.hasPendingWrites) return;
      onChange(toQuestionResult(snap.data()));
    },
    onError,
  );
}

export async function getResults(db: Firestore, roundId: string): Promise<QuestionResult[]> {
  const snap = await getDocs(
    query(collection(db, 'rounds', roundId, 'results'), orderBy('questionIndex')),
  );
  return snap.docs.map((d) => toQuestionResult(d.data()));
}

export function watchPodium(
  db: Firestore,
  roundId: string,
  onChange: (p: Podium | null) => void,
  onError: (e: unknown) => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'rounds', roundId, 'podium', 'final'),
    // includeMetadataChanges es obligatorio si se descartan escrituras pendientes: la
    // confirmación del servidor solo cambia metadatos, y sin esta opción no dispara evento.
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) return onChange(null);
      if (snap.metadata.hasPendingWrites) return;
      onChange(toPodium(snap.data()));
    },
    onError,
  );
}
