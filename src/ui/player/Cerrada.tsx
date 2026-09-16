/**
 * Pregunta cerrada, aún sin revelar. T060 (FR-032, FR-033).
 *
 * Solo muestra lo propio: qué opción eligió, o que no alcanzó a responder. Ningún dato del
 * grupo, y nada que no tuviera ya durante la pregunta abierta.
 */
import { watchOwnAnswer } from '../../data/answers';
import { getQuestion } from '../../data/quizzes';
import { Cargando } from '../shared/Estados';
import { usePromise, useSubscription } from '../shared/hooks';
import { Shape } from '../shared/Option';
import type { PhaseProps } from './props';

export function Cerrada({ db, roundId, uid, round }: PhaseProps) {
  const n = round.currentIndex;
  const question = usePromise(() => getQuestion(db, round.quizId, n), [db, round.quizId, n]);
  const own = useSubscription<{ optionIndex: number } | null>(
    (onValue, onError) => watchOwnAnswer(db, roundId, uid, n, onValue, onError),
    null,
    [db, roundId, uid, n],
  );
  if (question.value === null || own.loading) return <Cargando />;

  const elegida = own.value?.optionIndex;
  return (
    <div className="panel">
      <p className="eyebrow">
        Pregunta {n + 1} de {round.questionCount} · cerrada
      </p>
      <div className="qtexto">{question.value.text}</div>
      {elegida === undefined ? (
        <p className="veredicto mal" style={{ fontSize: 26 }}>
          No alcanzaste a responder
        </p>
      ) : (
        <p style={{ fontSize: 18 }}>
          Elegiste <Shape index={elegida} /> <strong>{question.value.options[elegida]}</strong>
        </p>
      )}
      <p className="aviso">Se acabó el tiempo. Espera la revelación…</p>
    </div>
  );
}
