/**
 * Entrada. T056, T057 (FR-001, FR-003, FR-010).
 *
 * Sin escribir nada: el apodo lo genera el catálogo, y se puede pedir otro antes de
 * entrar. La entrada puede tardar si muchos entran a la vez (research.md, riesgo 2), así
 * que se muestra que está en curso en vez de parecer congelada.
 */
import { useState } from 'react';
import type { Firestore } from '../../data/types';
import { joinRound } from '../../data/rounds';
import { displayNickname, generateNickname } from '../../domain/nickname';
import type { Nickname, Round } from '../../domain/types';
import { Estado } from '../shared/Estados';

const pick = () => generateNickname(Math.random);

export function Entrada(props: { db: Firestore; roundId: string; uid: string; round: Round }) {
  const [nickname, setNickname] = useState<Nickname>(pick);
  const [status, setStatus] = useState<'idle' | 'joining' | 'full' | 'closed' | 'failed'>('idle');
  const [retries, setRetries] = useState(0);

  const full = props.round.participantCount >= props.round.maxParticipants;

  async function entrar() {
    setStatus('joining');
    setRetries(0);
    const outcome = await joinRound(props.db, props.roundId, props.uid, nickname, pick, {
      onRetry: (n) => setRetries(n),
    });
    switch (outcome.kind) {
      case 'joined':
      case 'already':
        // La suscripción al participante lleva a la fase vigente; aquí no hay nada más.
        setNickname(outcome.nickname);
        return;
      case 'full':
        setStatus('full');
        return;
      case 'closed':
        setStatus('closed');
        return;
      default:
        setStatus('failed');
    }
  }

  if (status === 'full' || (full && status === 'idle')) {
    return (
      <Estado
        titulo="La sala está llena"
        accion={
          <button type="button" className="btn sec" onClick={() => void entrar()}>
            Intentar de nuevo
          </button>
        }
      >
        Se alcanzó el cupo de esta ronda. Avísale al presentador: puede ampliarlo sin interrumpir la
        partida.
      </Estado>
    );
  }
  if (status === 'closed') {
    return (
      <Estado titulo="La ronda ya no admite entradas">Espera a que se abra la siguiente.</Estado>
    );
  }

  const joining = status === 'joining';
  return (
    <div className="panel">
      <p className="eyebrow">Tu apodo para jugar</p>
      <div className="apodo-caja">
        <span className="apodo" aria-live="polite">
          {displayNickname(nickname)}
        </span>
        <button
          type="button"
          className="btn sec"
          disabled={joining}
          onClick={() => setNickname(pick())}
        >
          Otro apodo
        </button>
      </div>
      <p className="aviso">
        El juego es anónimo: nadie sabrá quién es quién y los resultados se leen solo en conjunto,
        por tema. Nada de esto evalúa a nadie.
      </p>
      <p style={{ marginTop: 18 }} className="fila">
        <button type="button" className="btn" disabled={joining} onClick={() => void entrar()}>
          {joining ? 'Entrando…' : 'Entrar al juego'}
        </button>
        {joining && retries > 0 && (
          <span className="aviso" role="status">
            Hay muchas personas entrando a la vez; sigue intentándolo solo.
          </span>
        )}
      </p>
      {status === 'failed' && (
        <p className="error" role="alert">
          No se pudo entrar. Revisa tu conexión e inténtalo de nuevo.
        </p>
      )}
      {props.round.phase !== 'lobby' && (
        <p className="aviso">La partida ya empezó: entrarás en la pregunta que va en curso.</p>
      )}
    </div>
  );
}
