/**
 * Podio. T062 (FR-047, FR-049, FR-050).
 *
 * Solo el top 3 es público. La posición propia sale del puntaje propio: nadie ve el orden
 * completo.
 */
import { watchOwnScore, watchPodium } from '../../data/scores';
import type { ParticipantScore, Podium } from '../../domain/types';
import { Cargando } from '../shared/Estados';
import { useSubscription } from '../shared/hooks';
import type { PhaseProps } from './props';
import { PodiumView } from '../shared/PodiumView';

export function Podio({ db, roundId, uid, round }: PhaseProps) {
  const podium = useSubscription<Podium | null>(
    (onValue, onError) => watchPodium(db, roundId, onValue, onError),
    null,
    [db, roundId],
  );
  const score = useSubscription<ParticipantScore | null>(
    (onValue, onError) => watchOwnScore(db, roundId, uid, onValue, onError),
    null,
    [db, roundId, uid],
  );
  if (podium.value === null) return <Cargando texto="Preparando el podio…" />;

  const s = score.value;
  return (
    <div>
      <PodiumView podium={podium.value} questionCount={round.questionCount} />
      {s !== null && s.rank !== null && (
        <p className="centrado" style={{ fontSize: 18 }}>
          Tú: lugar <strong>{s.rank}</strong> de {podium.value.participantCount} ·{' '}
          <span className="mono">{s.totalPoints} pts</span> · {s.correctCount}/{round.questionCount}{' '}
          aciertos
        </p>
      )}
    </div>
  );
}
