/**
 * Traducción entre documentos de Firestore y los tipos de `src/domain/`.
 *
 * Esta capa **solo traduce**. Ninguna regla de negocio vive aquí: el Principio III
 * las quiere en `src/domain/`, probables sin emulador.
 *
 * La conversión que importa es la del tiempo: en Firestore los instantes son
 * `Timestamp` del servidor, y en el dominio son milisegundos. El dominio nunca ve
 * un `Timestamp`, y por eso nunca puede confundir el reloj del cliente con el del
 * servidor.
 */
import { Timestamp } from 'firebase/firestore';
import type {
  Answer,
  Participant,
  PublicQuestion,
  QuestionResult,
  Round,
  Solution,
  StoredPhase,
} from '../domain/types';

function ms(v: unknown): number | null {
  return v instanceof Timestamp ? v.toMillis() : null;
}

function msRequerido(v: unknown, campo: string): number {
  const m = ms(v);
  if (m === null) throw new Error(`campo de tiempo ausente o inválido: ${campo}`);
  return m;
}

export function toRound(data: Record<string, unknown>): Round {
  return {
    quizId: data['quizId'] as string,
    questionCount: data['questionCount'] as number,
    phase: data['phase'] as StoredPhase,
    currentIndex: data['currentIndex'] as number,
    openedAtMs: ms(data['openedAt']),
    timeLimitSec: (data['timeLimitSec'] as number | undefined) ?? null,
    maxParticipants: data['maxParticipants'] as number,
    participantCount: data['participantCount'] as number,
    active: data['active'] as boolean,
    startedAtMs: msRequerido(data['startedAt'], 'startedAt'),
    endedAtMs: ms(data['endedAt']),
  };
}

export function toPublicQuestion(data: Record<string, unknown>): PublicQuestion {
  return {
    index: data['index'] as number,
    text: data['text'] as string,
    options: data['options'] as readonly string[],
    timeLimitSec: data['timeLimitSec'] as number,
  };
}

export function toSolution(data: Record<string, unknown>): Solution {
  return {
    correctIndex: data['correctIndex'] as number,
    teachingNote: data['teachingNote'] as string,
  };
}

export function toParticipant(uid: string, data: Record<string, unknown>): Participant {
  return {
    uid,
    adjective: data['adjective'] as string,
    animal: data['animal'] as string,
    joinedAtMs: msRequerido(data['joinedAt'], 'joinedAt'),
  };
}

export function toAnswer(data: Record<string, unknown>): Answer {
  return {
    uid: data['uid'] as string,
    questionIndex: data['questionIndex'] as number,
    optionIndex: data['optionIndex'] as number,
    submittedAtMs: msRequerido(data['submittedAt'], 'submittedAt'),
  };
}

export function toQuestionResult(data: Record<string, unknown>): QuestionResult {
  return {
    questionIndex: data['questionIndex'] as number,
    distribution: data['distribution'] as readonly number[],
    answerCount: data['answerCount'] as number,
    correctIndex: data['correctIndex'] as number,
    correctPct: data['correctPct'] as number,
    revealedAtMs: msRequerido(data['revealedAt'], 'revealedAt'),
  };
}
