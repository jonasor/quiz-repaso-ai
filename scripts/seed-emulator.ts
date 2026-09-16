/**
 * Siembra el emulador con un cuestionario de ejemplo, ya **partido** en documento
 * público y documento de solución.
 *
 * Existe para que US1 sea demostrable sin depender de US3: se puede jugar una ronda
 * completa antes de que exista la publicación desde archivo.
 *
 * El corte que hace aquí es el mismo que hará `splitForPublication()` en T075, y por
 * la misma razón: la respuesta correcta y la nota pedagógica **nunca** entran al
 * documento que un participante puede leer (FR-045, FR-046, FR-066).
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/seed-emulator.ts
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface ArchivoPregunta {
  text: string;
  options: string[];
  correctIndex: number;
  teachingNote: string;
  timeLimitSec?: number;
}
interface ArchivoQuiz {
  title: string;
  defaultTimeLimitSec?: number;
  questions: ArchivoPregunta[];
}

if (process.env['FIRESTORE_EMULATOR_HOST'] === undefined) {
  console.error('FIRESTORE_EMULATOR_HOST no está definido. Este script solo siembra el emulador.');
  process.exit(1);
}

const QUIZ_ID = 'quiz-ejemplo';
const ROUND_ID = 'ronda-ejemplo';
const MAX_PARTICIPANTS = 60;

const quiz = JSON.parse(readFileSync('docs/cuestionario-ejemplo.json', 'utf8')) as ArchivoQuiz;
const porDefecto = quiz.defaultTimeLimitSec ?? 30;

initializeApp({ projectId: process.env['GCLOUD_PROJECT'] ?? 'demo-quiz-repaso' });
const db = getFirestore();

const batch = db.batch();

batch.set(db.doc(`quizzes/${QUIZ_ID}`), {
  title: quiz.title,
  questionCount: quiz.questions.length,
  publishedAt: new Date(),
});

quiz.questions.forEach((q, i) => {
  // Documento público: sin correctIndex ni teachingNote. Las reglas lo exigen con
  // keys().hasOnly(), así que un descuido aquí sería rechazado por el servidor.
  batch.set(db.doc(`quizzes/${QUIZ_ID}/questions/${i}`), {
    index: i,
    text: q.text,
    options: q.options,
    timeLimitSec: q.timeLimitSec ?? porDefecto,
  });
  // Documento reservado: solo lo lee el presentador.
  batch.set(db.doc(`quizzes/${QUIZ_ID}/solutions/${i}`), {
    correctIndex: q.correctIndex,
    teachingNote: q.teachingNote,
  });
});

batch.set(db.doc(`rounds/${ROUND_ID}`), {
  quizId: QUIZ_ID,
  questionCount: quiz.questions.length,
  phase: 'lobby',
  currentIndex: -1,
  openedAt: null,
  timeLimitSec: null,
  maxParticipants: MAX_PARTICIPANTS,
  participantCount: 0,
  active: true,
  startedAt: new Date(),
  endedAt: null,
});
batch.set(db.doc('config/activeRound'), { roundId: ROUND_ID });

await batch.commit();
console.log(
  `sembrado: ${quiz.questions.length} preguntas en quizzes/${QUIZ_ID}, ronda ${ROUND_ID} en lobby (tope ${MAX_PARTICIPANTS})`,
);
