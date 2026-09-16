/**
 * Archivo de cuestionario. Contrato: specs/001-partida-integra/contracts/quiz-file.md.
 * FR-064 a FR-070.
 *
 * El formato es un contrato con una persona, no con un programa: quien corrige un
 * archivo de veinte preguntas necesita ver **todos** los problemas de una pasada, con
 * su ubicación. Por eso la validación acumula errores en vez de detenerse en el primero.
 */
import type { PublicQuestion, Solution } from './types';

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

export interface ValidatedQuestion {
  readonly text: string;
  readonly options: readonly string[];
  readonly correctIndex: number;
  readonly teachingNote: string;
  /** Ya resuelto: el propio o el `defaultTimeLimitSec` del archivo. */
  readonly timeLimitSec: number;
}

export interface ValidatedQuiz {
  readonly title: string;
  readonly questions: readonly ValidatedQuestion[];
}

export const DEFAULT_TIME_LIMIT_SEC = 30;
export const MIN_TIME_LIMIT_SEC = 5;
export const MAX_TIME_LIMIT_SEC = 300;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function parseQuizFile(
  raw: unknown,
): { ok: true; quiz: ValidatedQuiz } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });

  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: [{ path: '(raíz)', message: 'el archivo debe ser un objeto JSON' }],
    };
  }

  if (!nonEmptyString(raw['title'])) err('title', 'requerido y no puede estar vacío');

  let defaultLimit = DEFAULT_TIME_LIMIT_SEC;
  const d = raw['defaultTimeLimitSec'];
  if (d !== undefined) {
    if (
      !Number.isInteger(d) ||
      (d as number) < MIN_TIME_LIMIT_SEC ||
      (d as number) > MAX_TIME_LIMIT_SEC
    ) {
      err(
        'defaultTimeLimitSec',
        `debe ser un entero entre ${MIN_TIME_LIMIT_SEC} y ${MAX_TIME_LIMIT_SEC}; se recibió ${JSON.stringify(d)}`,
      );
    } else {
      defaultLimit = d as number;
    }
  }

  const questions: ValidatedQuestion[] = [];
  const qs = raw['questions'];
  if (!Array.isArray(qs) || qs.length === 0) {
    err('questions', 'requerido: una lista con al menos una pregunta');
  } else {
    qs.forEach((q: unknown, i) => {
      const at = `questions[${i}]`;
      if (!isRecord(q)) {
        err(at, 'cada pregunta debe ser un objeto');
        return;
      }
      const before = errors.length;

      if (!nonEmptyString(q['text'])) err(`${at}.text`, 'requerido y no puede estar vacío');

      const options = q['options'];
      let optionCount = 0;
      if (!Array.isArray(options)) {
        err(`${at}.options`, `requerido: una lista de ${MIN_OPTIONS} a ${MAX_OPTIONS} opciones`);
      } else {
        optionCount = options.length;
        if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
          err(
            `${at}.options`,
            `debe tener de ${MIN_OPTIONS} a ${MAX_OPTIONS} opciones; tiene ${options.length}`,
          );
        }
        const seen = new Set<string>();
        options.forEach((o: unknown, j) => {
          if (!nonEmptyString(o)) {
            err(`${at}.options[${j}]`, 'cada opción debe ser un texto no vacío');
          } else if (seen.has(o.trim())) {
            err(`${at}.options`, `"${o}" aparece dos veces`);
          } else {
            seen.add(o.trim());
          }
        });
      }

      const ci = q['correctIndex'];
      if (!Number.isInteger(ci)) {
        err(`${at}.correctIndex`, 'requerido: el índice entero de la opción correcta');
      } else if (optionCount > 0 && ((ci as number) < 0 || (ci as number) >= optionCount)) {
        err(
          `${at}.correctIndex`,
          `${ci as number} está fuera de rango; options tiene ${optionCount} elementos (índices 0..${optionCount - 1})`,
        );
      }

      if (!nonEmptyString(q['teachingNote'])) {
        err(`${at}.teachingNote`, 'requerida y no puede estar vacía');
      }

      const tl = q['timeLimitSec'];
      if (
        tl !== undefined &&
        (!Number.isInteger(tl) ||
          (tl as number) < MIN_TIME_LIMIT_SEC ||
          (tl as number) > MAX_TIME_LIMIT_SEC)
      ) {
        err(
          `${at}.timeLimitSec`,
          `debe ser un entero entre ${MIN_TIME_LIMIT_SEC} y ${MAX_TIME_LIMIT_SEC}; se recibió ${JSON.stringify(tl)}`,
        );
      }

      if (errors.length === before) {
        questions.push({
          text: (q['text'] as string).trim(),
          options: (options as string[]).map((o) => o.trim()),
          correctIndex: ci as number,
          teachingNote: (q['teachingNote'] as string).trim(),
          timeLimitSec: (tl as number | undefined) ?? defaultLimit,
        });
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, quiz: { title: (raw['title'] as string).trim(), questions } };
}

export interface QuizDraft {
  readonly title: string;
  readonly questionCount: number;
}

/**
 * Parte el cuestionario en lo público y lo reservado (D3, FR-066). Es la primera línea
 * de FR-045; la segunda, y la autoritativa, es `hasOnly()` en las reglas.
 *
 * `timeLimitSec` sale siempre explícito en el documento público, para que la regla del
 * plazo no tenga que interpretar una ausencia.
 */
export function splitForPublication(quiz: ValidatedQuiz): {
  meta: QuizDraft;
  questions: PublicQuestion[];
  solutions: Solution[];
} {
  return {
    meta: { title: quiz.title, questionCount: quiz.questions.length },
    questions: quiz.questions.map((q, index) => ({
      index,
      text: q.text,
      options: [...q.options],
      timeLimitSec: q.timeLimitSec,
    })),
    solutions: quiz.questions.map((q) => ({
      correctIndex: q.correctIndex,
      teachingNote: q.teachingNote,
    })),
  };
}
