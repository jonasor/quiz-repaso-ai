/**
 * Superficie del participante. T082, T083, T087.
 *
 * Todo el estado de partida se reconstruye desde Firestore al cargar (FR-059, FR-062):
 * la ronda activa, si ya entré, qué respondí y mi puntaje. Nada de la partida se lee del
 * almacenamiento local; lo único que persiste el dispositivo es la identidad anónima.
 */
import { useEffect, useState } from 'react';
import { ensureParticipantIdentity, type Identity } from '../../data/firebase';
import { watchOwnParticipant } from '../../data/rounds';
import { effectivePhase } from '../../domain/phases';
import type { Nickname } from '../../domain/types';
import { Cargando, Estado, Marca, SinConexion } from '../shared/Estados';
import { useActiveRound, useFirebase, useNow, useSubscription } from '../shared/hooks';
import { Cerrada } from './Cerrada';
import { Entrada } from './Entrada';
import { Espera } from './Espera';
import { Podio } from './Podio';
import { Pregunta } from './Pregunta';
import { Revelacion } from './Revelacion';

export function PlayerApp() {
  const { auth, db } = useFirebase();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [authError, setAuthError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setAuthError(null);
    ensureParticipantIdentity(auth).then(setIdentity, setAuthError);
  }, [auth, attempt]);

  const active = useActiveRound();
  const roundId = active.value?.id ?? null;
  const uid = identity?.uid ?? null;

  const participant = useSubscription<Nickname | null>(
    roundId === null || uid === null
      ? null
      : (onValue, onError) => watchOwnParticipant(db, roundId, uid, onValue, onError),
    null,
    [db, roundId, uid],
  );
  const now = useNow();

  let body;
  if (authError !== null || active.error !== null) {
    body = <SinConexion onRetry={() => setAttempt((a) => a + 1)} />;
  } else if (identity === null || active.loading) {
    body = <Cargando />;
  } else if (!identity.isAnonymous) {
    body = (
      <Estado titulo="Este navegador tiene la sesión del presentador">
        Para jugar, abre el enlace en una ventana privada o en otro dispositivo. Así tu
        participación es anónima.
      </Estado>
    );
  } else if (active.value === null) {
    body = (
      <Estado titulo="Aún no abre la sala">
        Quédate en esta página: en cuanto el presentador abra la partida, aparecerá aquí.
      </Estado>
    );
  } else if (active.value.round.phase === 'archived') {
    body = (
      <Estado titulo="La partida terminó">
        Gracias por jugar. Si hay otra ronda, aparecerá aquí en cuanto se abra.
      </Estado>
    );
  } else if (participant.loading) {
    body = <Cargando />;
  } else if (participant.value === null) {
    // FR-063: quien llega tarde entra igual y se incorpora a la fase vigente.
    body = (
      <Entrada db={db} roundId={active.value.id} uid={identity.uid} round={active.value.round} />
    );
  } else {
    const { id, round } = active.value;
    const nickname = participant.value;
    const phase = effectivePhase(round.phase, round.openedAtMs, round.timeLimitSec, now);
    const common = { db, roundId: id, uid: identity.uid, round, nickname };
    switch (phase) {
      case 'lobby':
        body = <Espera {...common} />;
        break;
      case 'open':
        body = <Pregunta {...common} now={now} />;
        break;
      case 'closed':
        body = <Cerrada {...common} />;
        break;
      case 'revealed':
        body = <Revelacion {...common} />;
        break;
      case 'podium':
        body = <Podio {...common} />;
        break;
      default:
        body = <Cargando />;
    }
  }

  return (
    <div className="wrap">
      <Marca />
      {body}
    </div>
  );
}
