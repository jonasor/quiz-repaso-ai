/**
 * Calificación de una pregunta y cierre de la partida. FR-035 a FR-044, FR-047 a FR-050.
 *
 * Vive en el dominio y no en `src/data/scores.ts` porque es regla de negocio
 * (Principio III): la capa de datos lee, llama aquí y escribe.
 *
 * **Idempotente por construcción** (D6, FR-018). Calificar la pregunta `n` reemplaza el
 * elemento `n` de `perQuestion` y recalcula los totales desde el arreglo completo; nunca
 * suma sobre lo anterior. Calificar dos veces produce documentos idénticos.
 *
 * Tampoco relee las respuestas de las preguntas anteriores: toma los resultados ya
 * guardados en cada puntaje. Así el costo de revelar crece con el aforo, no con el
 * cuadrado del número de preguntas (research.md D8).
 */
import { correctPctOf, distributionOf } from './aggregate';
import { rankParticipants, topThree } from './podium';
import { pointsFor, totalsFor, unansweredOutcome } from './scoring';
import type {
  Answer,
  Nickname,
  ParticipantScore,
  PodiumEntry,
  QuestionOutcome,
  QuestionResult,
} from './types';

export interface GradeInput {
  readonly questionIndex: number;
  readonly optionCount: number;
  readonly correctIndex: number;
  readonly openedAtMs: number;
  /** Tiempo límite de cada pregunta de 0 a `questionIndex`, ambos incluidos. */
  readonly timeLimits: ReadonlyArray<number>;
  readonly participants: ReadonlyArray<Nickname & { readonly uid: string }>;
  /** Respuestas de esta pregunta. */
  readonly answers: ReadonlyArray<Answer>;
  readonly previousScores: ReadonlyMap<string, ParticipantScore>;
}

export interface GradeOutput {
  readonly result: Omit<QuestionResult, 'revealedAtMs'>;
  readonly scores: ParticipantScore[];
}

function carriedOutcomes(
  prev: ParticipantScore | undefined,
  upTo: number,
  timeLimits: ReadonlyArray<number>,
): QuestionOutcome[] {
  const out: QuestionOutcome[] = [];
  for (let i = 0; i < upTo; i++) {
    out.push(prev?.perQuestion[i] ?? unansweredOutcome(timeLimits[i] ?? 0));
  }
  return out;
}

export function gradeQuestion(input: GradeInput): GradeOutput {
  const n = input.questionIndex;
  const limit = input.timeLimits[n];
  if (limit === undefined) throw new Error(`falta el tiempo límite de la pregunta ${n}`);

  const members = new Set(input.participants.map((p) => p.uid));
  // Una respuesta por participante, y solo de quien entró. Las reglas ya lo garantizan;
  // el dominio no lo da por hecho.
  const byUid = new Map<string, Answer>();
  for (const a of input.answers) {
    if (a.questionIndex === n && members.has(a.uid) && !byUid.has(a.uid)) byUid.set(a.uid, a);
  }
  const valid = [...byUid.values()];

  const result = {
    questionIndex: n,
    distribution: distributionOf(valid, input.optionCount),
    answerCount: valid.length,
    correctIndex: input.correctIndex,
    correctPct: correctPctOf(valid, input.correctIndex),
  };

  const scores = input.participants.map((p): ParticipantScore => {
    const perQuestion = carriedOutcomes(input.previousScores.get(p.uid), n, input.timeLimits);
    const a = byUid.get(p.uid);
    if (a === undefined) {
      perQuestion.push(unansweredOutcome(limit));
    } else {
      const correct = a.optionIndex === input.correctIndex;
      const elapsedMs = Math.max(0, a.submittedAtMs - input.openedAtMs);
      perQuestion.push({ correct, points: pointsFor(correct, elapsedMs, limit), elapsedMs });
    }
    return {
      uid: p.uid,
      adjective: p.adjective,
      animal: p.animal,
      perQuestion,
      ...totalsFor(perQuestion, input.timeLimits.slice(0, n + 1)),
      rank: null,
    };
  });

  return { result, scores };
}

export interface FinalizeInput {
  readonly participants: ReadonlyArray<Nickname & { readonly uid: string }>;
  readonly scores: ReadonlyMap<string, ParticipantScore>;
  /** Tiempo límite de todas las preguntas de la ronda. */
  readonly timeLimits: ReadonlyArray<number>;
}

export interface FinalizeOutput {
  readonly scores: ParticipantScore[];
  readonly podium: { readonly top: PodiumEntry[]; readonly participantCount: number };
}

/**
 * Posiciones finales y podio. Quien entró después de la última revelación no tiene
 * puntaje todavía: recibe uno con todas las preguntas como no respondidas.
 */
export function finalizeRound(input: FinalizeInput): FinalizeOutput {
  const all = input.participants.map((p): ParticipantScore => {
    const prev = input.scores.get(p.uid);
    const perQuestion = carriedOutcomes(prev, input.timeLimits.length, input.timeLimits);
    return {
      uid: p.uid,
      adjective: p.adjective,
      animal: p.animal,
      perQuestion,
      ...totalsFor(perQuestion, input.timeLimits),
      rank: null,
    };
  });
  const ranked = rankParticipants(all);
  return {
    scores: ranked,
    podium: {
      top: topThree(ranked).map((r) => ({
        rank: r.rank,
        adjective: r.adjective,
        animal: r.animal,
        totalPoints: r.totalPoints,
        correctCount: r.correctCount,
      })),
      participantCount: ranked.length,
    },
  };
}
