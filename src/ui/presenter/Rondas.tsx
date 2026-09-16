/**
 * Rondas pasadas. T072 (FR-073 a FR-077).
 *
 * Una ronda a la vez, sin vista comparativa (FR-076). Una ronda archivada usa las mismas
 * rutas y por tanto las mismas reglas: `archived` no relaja nada (FR-077).
 */
import { useState } from 'react';
import { listQuizzes } from '../../data/quizzes';
import { listRounds } from '../../data/rounds';
import type { Firestore } from '../../data/types';
import { Cargando, Estado, SinConexion } from '../shared/Estados';
import { usePromise } from '../shared/hooks';
import { Debrief } from './Debrief';

const FASE: Record<string, string> = {
  lobby: 'sala de espera',
  open: 'en curso',
  revealed: 'en curso',
  podium: 'terminada',
  archived: 'archivada',
};

export function Rondas({ db }: { db: Firestore }) {
  const data = usePromise(async () => {
    const [rounds, quizzes] = await Promise.all([listRounds(db), listQuizzes(db)]);
    return { rounds, titles: new Map(quizzes.map((q) => [q.id, q.title])) };
  }, [db]);
  const [abierta, setAbierta] = useState<{ id: string; quizId: string } | null>(null);

  if (data.error !== null) return <SinConexion />;
  if (data.value === null) return <Cargando />;

  if (abierta !== null) {
    return (
      <div>
        <p>
          <button type="button" className="btn sec" onClick={() => setAbierta(null)}>
            ← Volver a la lista
          </button>
        </p>
        <Debrief db={db} roundId={abierta.id} quizId={abierta.quizId} />
      </div>
    );
  }

  const { rounds, titles } = data.value;
  if (rounds.length === 0) return <Estado titulo="Todavía no hay rondas" />;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Rondas</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cuestionario</th>
              <th>Estado</th>
              <th className="n">Participantes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rounds.map(({ id, round }) => (
              <tr key={id}>
                <td className="mono">{new Date(round.startedAtMs).toLocaleString('es-MX')}</td>
                <td>{titles.get(round.quizId) ?? '—'}</td>
                <td>{FASE[round.phase] ?? round.phase}</td>
                <td className="n">{round.participantCount}</td>
                <td>
                  <button
                    type="button"
                    className="btn sec"
                    style={{ padding: '6px 12px' }}
                    onClick={() => setAbierta({ id, quizId: round.quizId })}
                  >
                    Ver debrief
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
