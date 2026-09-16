/**
 * Siembra de estado para los tests de reglas. Todo se escribe con las reglas
 * desactivadas: el estado de partida es el *punto de partida* de cada test, no lo
 * que se está probando.
 */
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

export const QUIZ = 'quiz1';
export const ROUND = 'r1';
export const TIME_LIMIT = 30;

export interface RoundSeed {
  phase?: 'lobby' | 'open' | 'revealed' | 'podium' | 'archived';
  currentIndex?: number;
  openedAtMs?: number | null;
  timeLimitSec?: number | null;
  questionCount?: number;
  maxParticipants?: number;
  participantCount?: number;
  active?: boolean;
}

async function disabled(env: RulesTestEnvironment, fn: (db: Firestore) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

export async function seedQuiz(env: RulesTestEnvironment, questionCount = 2, quizId = QUIZ) {
  await disabled(env, async (db) => {
    await setDoc(doc(db, 'quizzes', quizId), {
      title: 'Repaso',
      questionCount,
      publishedAt: Timestamp.now(),
    });
    for (let i = 0; i < questionCount; i++) {
      await setDoc(doc(db, 'quizzes', quizId, 'questions', String(i)), {
        index: i,
        text: `Pregunta ${i}`,
        options: ['A', 'B', 'C', 'D'],
        timeLimitSec: TIME_LIMIT,
      });
      await setDoc(doc(db, 'quizzes', quizId, 'solutions', String(i)), {
        correctIndex: 1,
        teachingNote: `Nota ${i}`,
      });
    }
  });
}

export function roundDoc(seed: RoundSeed = {}, quizId = QUIZ) {
  const openedAtMs = seed.openedAtMs === undefined ? null : seed.openedAtMs;
  return {
    quizId,
    questionCount: seed.questionCount ?? 2,
    phase: seed.phase ?? 'lobby',
    currentIndex: seed.currentIndex ?? -1,
    openedAt: openedAtMs === null ? null : Timestamp.fromMillis(openedAtMs),
    timeLimitSec: seed.timeLimitSec === undefined ? null : seed.timeLimitSec,
    maxParticipants: seed.maxParticipants ?? 60,
    participantCount: seed.participantCount ?? 0,
    active: seed.active ?? true,
    startedAt: Timestamp.now(),
    endedAt: null,
  };
}

/** Ronda activa, con el puntero apuntándola. */
export async function seedRound(env: RulesTestEnvironment, seed: RoundSeed = {}, roundId = ROUND) {
  await disabled(env, async (db) => {
    await setDoc(doc(db, 'rounds', roundId), roundDoc(seed));
    if (seed.active !== false) {
      await setDoc(doc(db, 'config', 'activeRound'), { roundId });
    }
  });
}

/** Una ronda con la pregunta 0 abierta hace `agoMs`. */
export async function seedOpenRound(
  env: RulesTestEnvironment,
  agoMs = 2_000,
  seed: RoundSeed = {},
) {
  await seedRound(env, {
    phase: 'open',
    currentIndex: 0,
    openedAtMs: Date.now() - agoMs,
    timeLimitSec: TIME_LIMIT,
    ...seed,
  });
}

/** Un participante ya dentro: documento, reserva y contador, sin pasar por reglas. */
export async function seedParticipant(
  env: RulesTestEnvironment,
  uid: string,
  adjective = 'Astuto',
  animal = 'Zorro',
  roundId = ROUND,
) {
  await disabled(env, async (db) => {
    await setDoc(doc(db, 'rounds', roundId, 'participants', uid), {
      adjective,
      animal,
      joinedAt: Timestamp.now(),
    });
    await setDoc(doc(db, 'rounds', roundId, 'nicknames', `${adjective}_${animal}`), { uid });
    await setDoc(doc(db, 'rounds', roundId), { participantCount: increment(1) }, { merge: true });
  });
}

export async function seedDoc(
  env: RulesTestEnvironment,
  path: string,
  data: Record<string, unknown>,
) {
  await disabled(env, async (db) => {
    await setDoc(doc(db, path), data);
  });
}

export interface JoinParts {
  participant?: boolean;
  nickname?: boolean | string;
  nicknameUid?: string;
  counter?: boolean;
  counterTo?: number;
  adjective?: string;
  animal?: string;
}

/**
 * Entrada como lote atómico, con piezas que se pueden quitar o falsear. Un lote
 * permite construir con precisión cada variante inválida; la autorización real usa
 * runTransaction (ver join-allow.spec.ts).
 */
export function joinBatch(db: Firestore, uid: string, currentCount: number, parts: JoinParts = {}) {
  const adjective = parts.adjective ?? 'Astuto';
  const animal = parts.animal ?? 'Zorro';
  const batch = writeBatch(db);
  if (parts.participant !== false) {
    batch.set(doc(db, 'rounds', ROUND, 'participants', uid), {
      adjective,
      animal,
      joinedAt: serverTimestamp(),
    });
  }
  if (parts.nickname !== false) {
    const id = typeof parts.nickname === 'string' ? parts.nickname : `${adjective}_${animal}`;
    batch.set(doc(db, 'rounds', ROUND, 'nicknames', id), { uid: parts.nicknameUid ?? uid });
  }
  if (parts.counter !== false) {
    batch.update(doc(db, 'rounds', ROUND), {
      participantCount: parts.counterTo ?? currentCount + 1,
    });
  }
  return batch.commit();
}

export function answer(uid: string, questionIndex = 0, optionIndex = 1) {
  return { uid, questionIndex, optionIndex, submittedAt: serverTimestamp() };
}

export function scoreDoc(uid: string, totalPoints = 150) {
  return {
    uid,
    adjective: 'Sabio',
    animal: 'Lince',
    perQuestion: [{ correct: true, points: totalPoints, elapsedMs: 4000 }],
    totalPoints,
    totalElapsedMs: 4000,
    correctCount: 1,
    rank: null,
  };
}
