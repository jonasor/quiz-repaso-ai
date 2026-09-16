/**
 * Calificación de una pregunta y cierre de la ronda.
 */
import { describe, expect, it } from 'vitest';
import { finalizeRound, gradeQuestion, type GradeInput } from '../../src/domain/grading';
import type { ParticipantScore } from '../../src/domain/types';

const P = [
  { uid: 'rapido', adjective: 'Astuto', animal: 'Zorro' },
  { uid: 'lento', adjective: 'Sabio', animal: 'Lince' },
  { uid: 'ausente', adjective: 'Noble', animal: 'Búho' },
];
const OPENED = 1_000_000;

function input(overrides: Partial<GradeInput> = {}): GradeInput {
  return {
    questionIndex: 0,
    optionCount: 4,
    correctIndex: 1,
    openedAtMs: OPENED,
    timeLimits: [30],
    participants: P,
    answers: [
      { uid: 'rapido', questionIndex: 0, optionIndex: 1, submittedAtMs: OPENED + 3_000 },
      { uid: 'lento', questionIndex: 0, optionIndex: 1, submittedAtMs: OPENED + 27_000 },
    ],
    previousScores: new Map(),
    ...overrides,
  };
}

describe('gradeQuestion', () => {
  it('el agregado cuenta respuestas recibidas', () => {
    const { result } = gradeQuestion(input());
    expect(result).toEqual({
      questionIndex: 0,
      distribution: [0, 2, 0, 0],
      answerCount: 2,
      correctIndex: 1,
      correctPct: 100,
    });
  });

  it('quien respondió antes obtiene más; el ausente, cero y el límite completo', () => {
    const { scores } = gradeQuestion(input());
    const by = new Map(scores.map((s) => [s.uid, s]));
    expect(by.get('rapido')!.totalPoints).toBeGreaterThan(by.get('lento')!.totalPoints);
    expect(by.get('ausente')!.totalPoints).toBe(0);
    expect(by.get('ausente')!.totalElapsedMs).toBe(30_000);
  });

  it('la antigüedad se mide con los dos tiempos del servidor', () => {
    const { scores } = gradeQuestion(input());
    expect(scores.find((s) => s.uid === 'rapido')!.perQuestion[0]!.elapsedMs).toBe(3_000);
  });

  it('calificar dos veces produce exactamente lo mismo (FR-018)', () => {
    const first = gradeQuestion(input());
    const prev = new Map(first.scores.map((s) => [s.uid, s]));
    const second = gradeQuestion(input({ previousScores: prev }));
    expect(second).toEqual(first);
  });

  it('acumula sobre los resultados guardados sin releer respuestas anteriores', () => {
    const q0 = gradeQuestion(input());
    const prev = new Map(q0.scores.map((s) => [s.uid, s]));
    const q1 = gradeQuestion(
      input({
        questionIndex: 1,
        timeLimits: [30, 20],
        answers: [{ uid: 'ausente', questionIndex: 1, optionIndex: 1, submittedAtMs: OPENED }],
        previousScores: prev,
      }),
    );
    const rapido = q1.scores.find((s) => s.uid === 'rapido')!;
    expect(rapido.perQuestion).toHaveLength(2);
    expect(rapido.totalPoints).toBe(prev.get('rapido')!.totalPoints);
    expect(q1.scores.find((s) => s.uid === 'ausente')!.correctCount).toBe(1);
  });

  it('quien entra tarde recibe cero en las preguntas ya cerradas (FR-063)', () => {
    const tarde = { uid: 'tarde', adjective: 'Leal', animal: 'Lobo' };
    const q1 = gradeQuestion(
      input({
        questionIndex: 1,
        timeLimits: [30, 20],
        participants: [...P, tarde],
        answers: [{ uid: 'tarde', questionIndex: 1, optionIndex: 1, submittedAtMs: OPENED }],
      }),
    );
    const s = q1.scores.find((x) => x.uid === 'tarde')!;
    expect(s.perQuestion[0]).toEqual({ correct: false, points: 0, elapsedMs: 30_000 });
    expect(s.correctCount).toBe(1);
  });

  it('ignora respuestas de quien no entró y respuestas duplicadas', () => {
    const { result } = gradeQuestion(
      input({
        answers: [
          { uid: 'rapido', questionIndex: 0, optionIndex: 1, submittedAtMs: OPENED + 1 },
          { uid: 'rapido', questionIndex: 0, optionIndex: 0, submittedAtMs: OPENED + 2 },
          { uid: 'intruso', questionIndex: 0, optionIndex: 1, submittedAtMs: OPENED + 1 },
        ],
      }),
    );
    expect(result.answerCount).toBe(1);
  });

  it('nadie responde: agregado vacío y porcentaje cero', () => {
    const { result } = gradeQuestion(input({ answers: [] }));
    expect(result).toMatchObject({ answerCount: 0, correctPct: 0, distribution: [0, 0, 0, 0] });
  });
});

describe('finalizeRound', () => {
  it('asigna posiciones y publica solo el top 3', () => {
    const scores = new Map<string, ParticipantScore>(
      gradeQuestion(input()).scores.map((s) => [s.uid, s]),
    );
    const out = finalizeRound({ participants: P, scores, timeLimits: [30] });
    expect(out.podium.participantCount).toBe(3);
    expect(out.podium.top.map((t) => t.rank)).toEqual([1, 2, 3]);
    expect(out.podium.top[0]).not.toHaveProperty('uid');
    expect(out.scores.every((s) => s.rank !== null)).toBe(true);
  });

  it('quien entró tras la última revelación también queda en la clasificación', () => {
    const tarde = { uid: 'tarde', adjective: 'Leal', animal: 'Lobo' };
    const out = finalizeRound({
      participants: [...P, tarde],
      scores: new Map(),
      timeLimits: [30, 30],
    });
    expect(out.scores.find((s) => s.uid === 'tarde')!.totalElapsedMs).toBe(60_000);
  });
});
