/**
 * Pregunta abierta. T059, T084, T086 (FR-026, FR-031, FR-034, FR-061).
 *
 * - El contador se pinta con el reloj del cliente, pero **no decide nada**: el plazo lo
 *   hacen cumplir las reglas contra la hora del servidor.
 * - "Respondida" solo aparece cuando el servidor confirma (D9). Mientras tanto,
 *   "enviando".
 * - Tras recargar, si ya había respondido, lo sabe por el documento del servidor y no
 *   puede volver a responder.
 */
import { useState } from 'react';
import { submitAnswer, watchOwnAnswer } from '../../data/answers';
import { getQuestion } from '../../data/quizzes';
import { canAnswer, deriveAnswerState, type AnswerStateInput } from '../../domain/answerState';
import { remainingMs } from '../../domain/phases';
import { Cargando, SinConexion } from '../shared/Estados';
import { usePromise, useSubscription } from '../shared/hooks';
import { OptionButton } from '../shared/Option';
import type { PhaseProps } from './props';

type Local = Pick<AnswerStateInput, 'pending' | 'failure'> & {
  readonly acked: { readonly optionIndex: number } | null;
};
const EMPTY: Local = { pending: null, failure: null, acked: null };

export function Pregunta(props: PhaseProps & { now: number }) {
  const { db, roundId, uid, round, now } = props;
  const n = round.currentIndex;

  const question = usePromise(() => getQuestion(db, round.quizId, n), [db, round.quizId, n]);
  const server = useSubscription<{ optionIndex: number } | null>(
    (onValue, onError) => watchOwnAnswer(db, roundId, uid, n, onValue, onError),
    null,
    [db, roundId, uid, n],
  );
  // Estado local por pregunta: al cambiar de índice, se descarta.
  const [local, setLocal] = useState<{ index: number; value: Local }>({ index: n, value: EMPTY });
  const mine = local.index === n ? local.value : EMPTY;

  if (question.error !== null) return <SinConexion />;
  if (question.value === null || round.openedAtMs === null || round.timeLimitSec === null) {
    return <Cargando />;
  }

  const state = deriveAnswerState({
    // El ack de setDoc también es confirmación del servidor.
    serverAnswer: server.value ?? mine.acked,
    pending: mine.pending,
    failure: mine.failure,
  });
  const restante = remainingMs(round.openedAtMs, round.timeLimitSec, now);
  const abierta = restante > 0;
  const elegible = canAnswer(state, abierta) && !server.loading;
  const elegida = state.kind === 'unanswered' ? null : state.optionIndex;

  async function responder(optionIndex: number) {
    setLocal({ index: n, value: { ...EMPTY, pending: { optionIndex } } });
    const out = await submitAnswer(db, roundId, uid, n, optionIndex);
    if (out.kind === 'confirmed') {
      setLocal({ index: n, value: { ...EMPTY, acked: { optionIndex: out.optionIndex } } });
    } else if (out.kind === 'network') {
      setLocal({ index: n, value: { ...EMPTY, failure: { optionIndex, reason: 'network' } } });
    } else {
      setLocal({ index: n, value: { ...EMPTY, failure: { optionIndex, reason: out.reason } } });
    }
  }

  const q = question.value;
  const segundos = Math.ceil(restante / 1000);
  return (
    <div>
      <div className="qbarra">
        <span className="qnum">
          Pregunta {n + 1} de {round.questionCount}
        </span>
        <span className="reloj" aria-label={`${segundos} segundos restantes`}>
          {segundos}
        </span>
      </div>
      <div className="tiempo-pista" aria-hidden="true">
        <div
          className="tiempo-barra"
          style={{ width: `${(100 * restante) / (round.timeLimitSec * 1000)}%` }}
        />
      </div>
      <div className="qtexto">{q.text}</div>
      <div className="ops">
        {q.options.map((text, i) => (
          <OptionButton
            key={i}
            index={i}
            text={text}
            disabled={!elegible}
            chosen={elegida === i}
            dimmed={elegida !== null && elegida !== i}
            onChoose={() => void responder(i)}
          />
        ))}
      </div>
      <div className="estado-resp" role="status" aria-live="polite">
        {state.kind === 'sending' && 'Enviando tu respuesta…'}
        {state.kind === 'answered' && 'Respuesta registrada. Espera la revelación…'}
        {state.kind === 'failed' &&
          state.reason === 'network' &&
          'No se pudo enviar por la conexión. Puedes intentarlo de nuevo.'}
        {state.kind === 'failed' &&
          state.reason !== 'network' &&
          'Tu respuesta no quedó registrada: llegó después del cierre.'}
      </div>
    </div>
  );
}
