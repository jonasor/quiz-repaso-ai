/**
 * Debrief y reproyección. T070, T071 (FR-024, FR-053, FR-054, FR-056, FR-078).
 *
 * Solo agregados por pregunta: ningún resultado individual (FR-056). Reproyectar es una
 * vista de solo lectura sobre lo ya escrito: no toca la fase, ni el índice, ni puntajes.
 */
import { useState } from 'react';
import { getQuestions, getSolution } from '../../data/quizzes';
import { getResults } from '../../data/scores';
import type { Firestore } from '../../data/types';
import { Cargando, SinConexion } from '../shared/Estados';
import { usePromise } from '../shared/hooks';
import { Distribution } from '../shared/Option';

export function Debrief({
  db,
  roundId,
  quizId,
}: {
  db: Firestore;
  roundId: string;
  quizId: string;
}) {
  const data = usePromise(async () => {
    const [questions, results] = await Promise.all([
      getQuestions(db, quizId),
      getResults(db, roundId),
    ]);
    return { questions, results };
  }, [db, roundId, quizId]);
  const [proyectada, setProyectada] = useState<number | null>(null);
  const nota = usePromise(proyectada === null ? null : () => getSolution(db, quizId, proyectada), [
    db,
    quizId,
    proyectada,
  ]);

  if (data.error !== null) return <SinConexion />;
  if (data.value === null) return <Cargando />;
  const { questions, results } = data.value;
  const byIndex = new Map(results.map((r) => [r.questionIndex, r]));

  // Menor acierto primero. Una pregunta sin respuestas cuenta como 0 %, nunca indefinido.
  const filas = questions
    .map((q) => ({ q, r: byIndex.get(q.index) }))
    .filter((x) => x.r !== undefined)
    .sort((a, b) => (a.r?.correctPct ?? 0) - (b.r?.correctPct ?? 0) || a.q.index - b.q.index);

  const actual = proyectada === null ? undefined : questions[proyectada];
  const actualR = proyectada === null ? undefined : byIndex.get(proyectada);

  return (
    <div className="panel">
      <p className="eyebrow">Para el repaso: de menor a mayor acierto</p>
      {filas.length === 0 ? (
        <p className="aviso">Esta ronda no llegó a revelar ninguna pregunta.</p>
      ) : (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Pregunta</th>
                <th className="n">Respuestas</th>
                <th className="n">Acierto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map(({ q, r }) => (
                <tr key={q.index}>
                  <td className="n">{q.index + 1}</td>
                  <td>{q.text}</td>
                  <td className="n">{r?.answerCount ?? 0}</td>
                  <td className="n">{r?.correctPct ?? 0} %</td>
                  <td>
                    <button
                      type="button"
                      className="btn sec"
                      style={{ padding: '6px 12px' }}
                      onClick={() => setProyectada(q.index)}
                    >
                      Reproyectar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {actual !== undefined && actualR !== undefined && (
        <div className="panel" style={{ marginTop: 18 }} aria-live="polite">
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <p className="eyebrow">Reproyección · solo lectura · pregunta {actual.index + 1}</p>
            <button
              type="button"
              className="btn sec"
              style={{ padding: '6px 12px' }}
              onClick={() => setProyectada(null)}
            >
              Cerrar
            </button>
          </div>
          <div className="qtexto">{actual.text}</div>
          <Distribution
            options={actual.options}
            distribution={actualR.distribution}
            correctIndex={actualR.correctIndex}
          />
          <p className="aviso">
            Acertó el {actualR.correctPct} % de {actualR.answerCount} respuestas.
          </p>
          {nota.value !== null && <div className="nota-debrief">{nota.value.teachingNote}</div>}
        </div>
      )}
    </div>
  );
}
