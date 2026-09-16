/**
 * T078 — Archivo de cuestionario (FR-064 a FR-070, SC-004).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuizFile, splitForPublication } from '../../src/domain/quizFile';

function q(overrides: Record<string, unknown> = {}) {
  return {
    text: '¿Pregunta?',
    options: ['A', 'B', 'C'],
    correctIndex: 1,
    teachingNote: 'Porque B.',
    ...overrides,
  };
}

function errorsOf(raw: unknown) {
  const r = parseQuizFile(raw);
  if (r.ok) throw new Error('se esperaba un archivo inválido');
  return r.errors;
}

describe('parseQuizFile — archivo válido', () => {
  it('acepta el cuestionario de ejemplo del repositorio (T081)', () => {
    const raw: unknown = JSON.parse(readFileSync('docs/cuestionario-ejemplo.json', 'utf8'));
    expect(parseQuizFile(raw).ok).toBe(true);
  });

  it('resuelve el tiempo límite: propio, del archivo, o 30 por defecto (FR-070)', () => {
    const r = parseQuizFile({
      title: 'T',
      defaultTimeLimitSec: 20,
      questions: [q(), q({ timeLimitSec: 45 })],
    });
    expect(r.ok && r.quiz.questions.map((x) => x.timeLimitSec)).toEqual([20, 45]);

    const sinDefecto = parseQuizFile({ title: 'T', questions: [q()] });
    expect(sinDefecto.ok && sinDefecto.quiz.questions[0]!.timeLimitSec).toBe(30);
  });
});

describe('parseQuizFile — cada validación con su ubicación', () => {
  it('no es un objeto', () => {
    expect(errorsOf([])[0]!.path).toBe('(raíz)');
  });

  it('title vacío', () => {
    expect(errorsOf({ title: '  ', questions: [q()] })).toEqual([
      { path: 'title', message: 'requerido y no puede estar vacío' },
    ]);
  });

  it('questions vacío o ausente', () => {
    expect(errorsOf({ title: 'T', questions: [] })[0]!.path).toBe('questions');
    expect(errorsOf({ title: 'T' })[0]!.path).toBe('questions');
  });

  it('options fuera de 2..6', () => {
    expect(
      errorsOf({ title: 'T', questions: [q({ options: ['solo'], correctIndex: 0 })] })[0]!.path,
    ).toBe('questions[0].options');
    const siete = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(errorsOf({ title: 'T', questions: [q({ options: siete })] })[0]!.path).toBe(
      'questions[0].options',
    );
  });

  it('opciones repetidas o vacías', () => {
    const e = errorsOf({ title: 'T', questions: [q({ options: ['Verdadero', 'Verdadero', ''] })] });
    expect(e.map((x) => x.message)).toEqual(
      expect.arrayContaining([
        '"Verdadero" aparece dos veces',
        'cada opción debe ser un texto no vacío',
      ]),
    );
  });

  it('correctIndex fuera de rango, con mensaje que explica el rango', () => {
    expect(
      errorsOf({
        title: 'T',
        questions: [q(), q(), q(), q({ correctIndex: 4, options: ['a', 'b', 'c', 'd'] })],
      }),
    ).toEqual([
      {
        path: 'questions[3].correctIndex',
        message: '4 está fuera de rango; options tiene 4 elementos (índices 0..3)',
      },
    ]);
  });

  it('correctIndex no entero', () => {
    expect(errorsOf({ title: 'T', questions: [q({ correctIndex: '1' })] })[0]!.path).toBe(
      'questions[0].correctIndex',
    );
  });

  it('teachingNote requerida', () => {
    expect(errorsOf({ title: 'T', questions: [q({ teachingNote: '' })] })).toEqual([
      { path: 'questions[0].teachingNote', message: 'requerida y no puede estar vacía' },
    ]);
  });

  it('timeLimitSec fuera de 5..300 o no entero', () => {
    for (const bad of [4, 301, 12.5]) {
      expect(errorsOf({ title: 'T', questions: [q({ timeLimitSec: bad })] })[0]!.path).toBe(
        'questions[0].timeLimitSec',
      );
    }
    expect(errorsOf({ title: 'T', defaultTimeLimitSec: 0, questions: [q()] })[0]!.path).toBe(
      'defaultTimeLimitSec',
    );
  });

  it('un archivo con dos errores distintos reporta ambos', () => {
    const e = errorsOf({
      title: '',
      questions: [q(), q({ teachingNote: '' })],
    });
    expect(e.map((x) => x.path)).toEqual(['title', 'questions[1].teachingNote']);
  });
});

describe('splitForPublication (FR-066)', () => {
  it('ningún documento público contiene correctIndex ni teachingNote', () => {
    const r = parseQuizFile({ title: 'T', questions: [q(), q({ timeLimitSec: 60 })] });
    if (!r.ok) throw new Error('inválido');
    const { meta, questions, solutions } = splitForPublication(r.quiz);
    for (const pub of questions) {
      expect(pub).not.toHaveProperty('correctIndex');
      expect(pub).not.toHaveProperty('teachingNote');
      expect(Object.keys(pub).sort()).toEqual(['index', 'options', 'text', 'timeLimitSec']);
    }
    expect(JSON.stringify(questions)).not.toContain('Porque B.');
    expect(solutions).toEqual([
      { correctIndex: 1, teachingNote: 'Porque B.' },
      { correctIndex: 1, teachingNote: 'Porque B.' },
    ]);
    expect(meta).toEqual({ title: 'T', questionCount: 2 });
    expect(questions.map((x) => x.timeLimitSec)).toEqual([30, 60]);
  });
});
