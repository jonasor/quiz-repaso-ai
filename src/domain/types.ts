/**
 * Tipos del modelo de datos. Espejo de specs/001-partida-integra/data-model.md.
 *
 * Principio III: este archivo no conoce Firebase. Los timestamps viven aquí como
 * milisegundos desde época, y `src/data/mappers.ts` traduce desde y hacia los
 * `Timestamp` de Firestore.
 */

// ---------- Cuestionario ----------

export interface QuizMeta {
  readonly title: string;
  readonly questionCount: number;
  readonly publishedAtMs: number;
}

/** Lo que el participante puede recibir. Sin la respuesta correcta (FR-045). */
export interface PublicQuestion {
  readonly index: number;
  readonly text: string;
  readonly options: readonly string[];
  readonly timeLimitSec: number;
}

/** Material reservado al presentador (FR-046). Nunca viaja a un participante. */
export interface Solution {
  readonly correctIndex: number;
  readonly teachingNote: string;
}

// ---------- Ronda ----------

export type StoredPhase = 'lobby' | 'open' | 'revealed' | 'podium' | 'archived';

/** Añade `closed`, que se deriva del plazo y nunca se almacena. */
export type EffectivePhase = StoredPhase | 'closed';

export interface Round {
  readonly quizId: string;
  readonly questionCount: number;
  readonly phase: StoredPhase;
  /** `-1` en `lobby`. */
  readonly currentIndex: number;
  readonly openedAtMs: number | null;
  readonly timeLimitSec: number | null;
  readonly maxParticipants: number;
  readonly participantCount: number;
  readonly active: boolean;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
}

// ---------- Participante y respuesta ----------

/** El apodo vive partido, igual que en Firestore, para que las reglas lo validen. */
export interface Nickname {
  readonly adjective: string;
  readonly animal: string;
}

export interface Participant extends Nickname {
  readonly uid: string;
  readonly joinedAtMs: number;
}

export interface Answer {
  readonly uid: string;
  readonly questionIndex: number;
  readonly optionIndex: number;
  readonly submittedAtMs: number;
}

// ---------- Resultados ----------

export interface QuestionResult {
  readonly questionIndex: number;
  readonly distribution: readonly number[];
  readonly answerCount: number;
  readonly correctIndex: number;
  readonly correctPct: number;
  readonly revealedAtMs: number;
}

export interface QuestionOutcome {
  readonly correct: boolean;
  readonly points: number;
  readonly elapsedMs: number;
}

export interface ParticipantScore extends Nickname {
  readonly uid: string;
  readonly perQuestion: readonly QuestionOutcome[];
  readonly totalPoints: number;
  readonly totalElapsedMs: number;
  readonly correctCount: number;
  readonly rank: number | null;
}

export interface PodiumEntry extends Nickname {
  readonly rank: number;
  readonly totalPoints: number;
  readonly correctCount: number;
}

export interface Podium {
  readonly top: readonly PodiumEntry[];
  readonly participantCount: number;
  readonly closedAtMs: number;
}
