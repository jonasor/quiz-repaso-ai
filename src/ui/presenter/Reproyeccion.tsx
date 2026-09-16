/**
 * Reproyección de una pregunta ya revelada. FR-024, T071, T107.
 *
 * Solo lectura sobre lo ya escrito: no toca la fase, ni el índice, ni puntajes, ni
 * agregados, y no abre ninguna ventana para responder. Se usa desde el debrief y, con la
 * partida en vivo, desde la conducción.
 */
import { useState } from 'react';
import { getQuestions, getSolution } from '../../data/quizzes';
import { getResults } from '../../data/scores';
import type { Firestore } from '../../data/types';
import type { PublicQuestion, QuestionResult } from '../../domain/types';
import { usePromise } from '../shared/hooks';
import { Distribution } from '../shared/Option';

export function ReproyeccionPanel(props: {
  db: Firestore;
  quizId: string;
  question: PublicQuestion;
  result: QuestionResult;
  onClose: () => void;
}) {
  const { db, quizId, question, result } = props;
  const nota = usePromise(
    () => getSolution(db, quizId, question.index),
    [db, quizId, question.index],
  );
  return (
    <div className="panel" style={{ marginTop: 18 }} aria-live="polite">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <p className="eyebrow">Reproyección · solo lectura · pregunta {question.index + 1}</p>
        <button
          type="button"
          className="btn sec"
          style={{ padding: '6px 12px' }}
          onClick={props.onClose}
        >
          Cerrar
        </button>
      </div>
      <div className="qtexto">{question.text}</div>
      <Distribution
        options={question.options}
        distribution={result.distribution}
        correctIndex={result.correctIndex}
      />
      <p className="aviso">
        Acertó el {result.correctPct} % de {result.answerCount}{' '}
        {result.answerCount === 1 ? 'respuesta' : 'respuestas'}.
      </p>
      {nota.value !== null && <div className="nota-debrief">{nota.value.teachingNote}</div>}
    </div>
  );
}

/**
 * Con la partida en vivo: volver a mostrar cualquier pregunta ya revelada para comentarla
 * (T107). No cambia la pregunta en curso: los participantes siguen viendo la fase vigente.
 * `revealedKey` cambia cada vez que se revela y califica una pregunta, para releer la lista.
 */
export function ReproyectarEnVivo(props: {
  db: Firestore;
  roundId: string;
  quizId: string;
  revealedKey: string;
}) {
  const { db, roundId, quizId, revealedKey } = props;
  const data = usePromise(async () => {
    const [questions, results] = await Promise.all([
      getQuestions(db, quizId),
      getResults(db, roundId),
    ]);
    return { questions, results };
  }, [db, roundId, quizId, revealedKey]);
  const [proyectada, setProyectada] = useState<number | null>(null);

  if (data.value === null || data.value.results.length === 0) return null;
  const { questions, results } = data.value;
  const byIndex = new Map(results.map((r) => [r.questionIndex, r]));
  const actual = proyectada === null ? undefined : questions[proyectada];
  const actualR = proyectada === null ? undefined : byIndex.get(proyectada);

  return (
    <div className="panel">
      <p className="eyebrow">
        Reproyectar una pregunta ya revelada · no cambia la pregunta en curso
      </p>
      <div className="fila" style={{ marginTop: 10 }}>
        {results.map((r) => (
          <button
            key={r.questionIndex}
            type="button"
            className="btn sec"
            style={{ padding: '6px 12px' }}
            aria-pressed={proyectada === r.questionIndex}
            onClick={() => setProyectada(r.questionIndex)}
          >
            Pregunta {r.questionIndex + 1}
          </button>
        ))}
      </div>
      {actual !== undefined && actualR !== undefined && (
        <ReproyeccionPanel
          db={db}
          quizId={quizId}
          question={actual}
          result={actualR}
          onClose={() => setProyectada(null)}
        />
      )}
    </div>
  );
}
