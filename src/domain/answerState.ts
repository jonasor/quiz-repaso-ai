/**
 * Estado de la respuesta propia, visto por el participante. D9, FR-031, FR-061.
 *
 * La regla que importa: **"respondida" solo sale de un documento confirmado por el
 * servidor**. Un envío pendiente es "enviando", nunca "respondida", porque el servidor
 * todavía puede rechazarlo —por plazo vencido, por ejemplo— y entonces la interfaz
 * habría mentido sin que nadie lo notara.
 */

export type AnswerState =
  | { readonly kind: 'unanswered' }
  | { readonly kind: 'sending'; readonly optionIndex: number }
  | { readonly kind: 'answered'; readonly optionIndex: number }
  | {
      readonly kind: 'failed';
      readonly optionIndex: number;
      readonly reason: 'late' | 'network' | 'rejected';
    };

export interface AnswerStateInput {
  /** Documento de respuesta tal como lo confirma el servidor, o `null` si no existe. */
  readonly serverAnswer: { readonly optionIndex: number } | null;
  /** Envío iniciado en este dispositivo y aún sin confirmar. */
  readonly pending: { readonly optionIndex: number } | null;
  /** Último envío fallido en este dispositivo. */
  readonly failure: {
    readonly optionIndex: number;
    readonly reason: 'late' | 'network' | 'rejected';
  } | null;
}

export function deriveAnswerState(input: AnswerStateInput): AnswerState {
  // El servidor manda: si confirma una respuesta, esa es la respuesta, aunque el
  // dispositivo recuerde otra cosa.
  if (input.serverAnswer !== null) {
    return { kind: 'answered', optionIndex: input.serverAnswer.optionIndex };
  }
  if (input.pending !== null) return { kind: 'sending', optionIndex: input.pending.optionIndex };
  if (input.failure !== null) {
    return { kind: 'failed', optionIndex: input.failure.optionIndex, reason: input.failure.reason };
  }
  return { kind: 'unanswered' };
}

/** ¿Puede el participante elegir una opción ahora? */
export function canAnswer(state: AnswerState, questionIsOpen: boolean): boolean {
  if (!questionIsOpen) return false;
  // Tras un fallo de red se puede reintentar; tras un rechazo por plazo, no.
  return state.kind === 'unanswered' || (state.kind === 'failed' && state.reason === 'network');
}
