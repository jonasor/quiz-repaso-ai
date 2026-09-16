/**
 * Revelación. T061 (FR-041, FR-042, FR-043).
 *
 * La respuesta correcta llega aquí por primera vez, dentro del agregado público. El
 * veredicto y los puntos propios salen del puntaje propio, que calculó el presentador.
 */
import { watchOwnAnswer } from '../../data/answers';
import { getQuestion } from '../../data/quizzes';
import { watchOwnScore, watchResult } from '../../data/scores';
import type { ParticipantScore, QuestionResult } from '../../domain/types';
import { Cargando } from '../shared/Estados';
import { usePromise, useSubscription } from '../shared/hooks';
import { Distribution } from '../shared/Option';
import type { PhaseProps } from './props';

export function Revelacion({ db, roundId, uid, round }: PhaseProps) {
  const n = round.currentIndex;
  const question = usePromise(() => getQuestion(db, round.quizId, n), [db, round.quizId, n]);
  const result = useSubscription<QuestionResult | null>(
    (onValue, onError) => watchResult(db, roundId, n, onValue, onError),
    null,
    [db, roundId, n],
  );
  const own = useSubscription<{ optionIndex: number } | null>(
    (onValue, onError) => watchOwnAnswer(db, roundId, uid, n, onValue, onError),
    null,
    [db, roundId, uid, n],
  );
  const score = useSubscription<ParticipantScore | null>(
    (onValue, onError) => watchOwnScore(db, roundId, uid, onValue, onError),
    null,
    [db, roundId, uid],
  );

  if (question.value === null) return <Cargando />;
  if (result.value === null) return <Cargando texto="Revelando…" />;

  const q = question.value;
  const r = result.value;
  const outcome = score.value?.perQuestion[n];
  const respondio = own.value !== null;

  return (
    <div>
      <div className="qbarra">
        <span className="qnum">
          Pregunta {n + 1} de {round.questionCount}
        </span>
      </div>
      <div className="qtexto">{q.text}</div>
      <div aria-live="polite">
        {!respondio ? (
          <div className="veredicto mal">Sin respuesta</div>
        ) : outcome === undefined ? (
          <p className="aviso">Calculando tu resultado…</p>
        ) : outcome.correct ? (
          <>
            <div className="veredicto ok">¡Correcto!</div>
            <div className="puntos">+{outcome.points} pts</div>
          </>
        ) : (
          <>
            <div className="veredicto mal">Esta no era</div>
            <div className="puntos">+0 pts</div>
          </>
        )}
      </div>
      <Distribution
        options={q.options}
        distribution={r.distribution}
        correctIndex={r.correctIndex}
      />
      <p className="aviso">
        Correcta: <strong>{q.options[r.correctIndex]}</strong> — acertó el {r.correctPct} % de{' '}
        {r.answerCount} {r.answerCount === 1 ? 'respuesta' : 'respuestas'}.
      </p>
    </div>
  );
}
