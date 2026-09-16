/**
 * T085 — El estado "respondida" sale del servidor, nunca de un estado local optimista
 * (D9, FR-031, FR-061).
 */
import { describe, expect, it } from 'vitest';
import { canAnswer, deriveAnswerState } from '../../src/domain/answerState';

const none = { serverAnswer: null, pending: null, failure: null };

describe('deriveAnswerState', () => {
  it('sin nada: sin responder', () => {
    expect(deriveAnswerState(none)).toEqual({ kind: 'unanswered' });
  });

  it('un envío pendiente es "enviando", nunca "respondida"', () => {
    const s = deriveAnswerState({ ...none, pending: { optionIndex: 2 } });
    expect(s).toEqual({ kind: 'sending', optionIndex: 2 });
    expect(s.kind).not.toBe('answered');
  });

  it('solo el documento confirmado por el servidor da "respondida"', () => {
    expect(deriveAnswerState({ ...none, serverAnswer: { optionIndex: 1 } })).toEqual({
      kind: 'answered',
      optionIndex: 1,
    });
  });

  it('el servidor manda sobre lo que recuerde el dispositivo', () => {
    expect(
      deriveAnswerState({
        serverAnswer: { optionIndex: 1 },
        pending: { optionIndex: 3 },
        failure: null,
      }),
    ).toEqual({ kind: 'answered', optionIndex: 1 });
  });

  it('tras recargar, sin estado local, se reconstruye desde el servidor (FR-061)', () => {
    expect(deriveAnswerState({ ...none, serverAnswer: { optionIndex: 0 } }).kind).toBe('answered');
  });

  it('un rechazo por plazo queda como fallo, no como respondida', () => {
    expect(deriveAnswerState({ ...none, failure: { optionIndex: 2, reason: 'late' } })).toEqual({
      kind: 'failed',
      optionIndex: 2,
      reason: 'late',
    });
  });
});

describe('canAnswer', () => {
  it('no con la pregunta cerrada', () => {
    expect(canAnswer({ kind: 'unanswered' }, false)).toBe(false);
  });

  it('no dos veces, ni mientras se envía', () => {
    expect(canAnswer({ kind: 'answered', optionIndex: 1 }, true)).toBe(false);
    expect(canAnswer({ kind: 'sending', optionIndex: 1 }, true)).toBe(false);
  });

  it('se puede reintentar tras un fallo de red, no tras un rechazo por plazo', () => {
    expect(canAnswer({ kind: 'failed', optionIndex: 1, reason: 'network' }, true)).toBe(true);
    expect(canAnswer({ kind: 'failed', optionIndex: 1, reason: 'late' }, true)).toBe(false);
  });
});
