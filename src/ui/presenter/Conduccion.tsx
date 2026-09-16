/**
 * Conducción de la partida. T063, T065, T067, T068, T088.
 *
 * - Los botones se habilitan según `canTransition()` **como conveniencia**, no como
 *   defensa: la autoridad son las reglas.
 * - El conteo de respuestas es una consulta de agregación: un número, nunca quién
 *   respondió qué (FR-058). Esta vista no importa ningún lector de respuestas (T074).
 * - Recuperable (T088): todo sale de Firestore. Si el presentador recarga con una
 *   pregunta revelada y sin calificar, la calificación se reanuda sola, y es idempotente.
 */
import { useEffect, useRef, useState } from 'react';
import { countAnswers } from '../../data/answers';
import { getQuestions, getSolution } from '../../data/quizzes';
import {
  adjustMaxParticipants,
  archiveRound,
  openQuestion,
  revealQuestion,
  type RoundWithId,
} from '../../data/rounds';
import { closeRound, gradeCurrentQuestion, watchPodium, watchResult } from '../../data/scores';
import type { Firestore } from '../../data/types';
import { canTransition, effectivePhase, remainingMs } from '../../domain/phases';
import type { Podium, QuestionResult } from '../../domain/types';
import { Cargando, Estado, SinConexion, describeError } from '../shared/Estados';
import { useActiveRound, useNow, usePolling, usePromise, useSubscription } from '../shared/hooks';
import { Distribution } from '../shared/Option';
import { PodiumView } from '../shared/PodiumView';
import { Debrief } from './Debrief';
import { ReproyectarEnVivo } from './Reproyeccion';

export function Conduccion({ db, onPublishRound }: { db: Firestore; onPublishRound: () => void }) {
  const active = useActiveRound();
  if (active.error !== null) return <SinConexion />;
  if (active.loading) return <Cargando />;
  const current = active.value;
  if (current === null || current.round.phase === 'archived') {
    return (
      <Estado
        titulo="No hay ninguna ronda activa"
        accion={
          <button type="button" className="btn oro" onClick={onPublishRound}>
            Publicar una ronda
          </button>
        }
      >
        Publica una ronda para abrir la sala de espera.
      </Estado>
    );
  }
  return <Partida db={db} current={current} />;
}

function Partida({ db, current }: { db: Firestore; current: RoundWithId }) {
  const { id: roundId, round } = current;
  const n = round.currentIndex;
  const now = useNow();
  const phase = effectivePhase(round.phase, round.openedAtMs, round.timeLimitSec, now);

  const questions = usePromise(() => getQuestions(db, round.quizId), [db, round.quizId]);
  const result = useSubscription<QuestionResult | null>(
    n < 0 ? null : (onValue, onError) => watchResult(db, roundId, n, onValue, onError),
    null,
    [db, roundId, n],
  );
  const solution = usePromise(
    round.phase === 'revealed' ? () => getSolution(db, round.quizId, n) : null,
    [db, round.quizId, n, round.phase],
  );
  const podium = useSubscription<Podium | null>(
    round.phase === 'podium'
      ? (onValue, onError) => watchPodium(db, roundId, onValue, onError)
      : null,
    null,
    [db, roundId, round.phase],
  );

  const [answered, setAnswered] = useState<number | null>(null);
  usePolling(
    () => {
      countAnswers(db, roundId, n).then(setAnswered, () => undefined);
    },
    2_000,
    round.phase === 'open' || (round.phase === 'revealed' && result.value === null),
    [db, roundId, n],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  // T088: reanudar la calificación si quedó pendiente (recarga, caída, otra pestaña).
  const grading = useRef(false);
  useEffect(() => {
    if (round.phase !== 'revealed' || result.loading || result.value !== null || grading.current)
      return;
    grading.current = true;
    gradeCurrentQuestion(db, roundId)
      .catch((e: unknown) => setError(`No se pudo calificar: ${describeError(e)}`))
      .finally(() => {
        grading.current = false;
      });
  }, [db, roundId, round.phase, result.loading, result.value]);

  if (questions.value === null) return questions.error !== null ? <SinConexion /> : <Cargando />;
  const qs = questions.value;
  const q = n >= 0 ? qs[n] : undefined;
  const next = n + 1;

  const puedeAbrir = canTransition(round.phase, 'open', n, next, round.questionCount);
  const puedeRevelar = canTransition(round.phase, 'revealed', n, n, round.questionCount);
  const calificada = result.value !== null;

  return (
    <div>
      <div className="panel">
        <div className="fila" style={{ justifyContent: 'space-between' }}>
          <p className="eyebrow">
            {phase === 'lobby' && 'Sala de espera'}
            {phase === 'open' && `Pregunta ${n + 1} de ${round.questionCount} · abierta`}
            {phase === 'closed' &&
              `Pregunta ${n + 1} de ${round.questionCount} · cerrada, sin revelar`}
            {phase === 'revealed' && `Pregunta ${n + 1} de ${round.questionCount} · revelada`}
            {phase === 'podium' && 'Podio'}
          </p>
          {phase === 'open' && round.openedAtMs !== null && round.timeLimitSec !== null && (
            <span className="reloj">
              {Math.ceil(remainingMs(round.openedAtMs, round.timeLimitSec, now) / 1000)}
            </span>
          )}
        </div>

        <Tope
          db={db}
          roundId={roundId}
          count={round.participantCount}
          max={round.maxParticipants}
        />

        {(phase === 'open' || phase === 'closed') && (
          <p className="cifra">
            <span className="valor">{answered ?? '—'}</span>{' '}
            <span className="etiqueta">de {round.participantCount} han respondido</span>
          </p>
        )}

        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="fila" style={{ marginTop: 12 }}>
          {round.phase === 'lobby' && (
            <button
              type="button"
              className="btn oro"
              disabled={busy || !puedeAbrir}
              onClick={() => void act(() => openQuestion(db, roundId, 0))}
            >
              Abrir pregunta 1
            </button>
          )}
          {round.phase === 'open' && (
            <button
              type="button"
              className="btn oro"
              disabled={busy || !puedeRevelar}
              onClick={() =>
                void act(async () => {
                  await revealQuestion(db, roundId);
                  await gradeCurrentQuestion(db, roundId);
                })
              }
            >
              Revelar{phase === 'open' ? ' (cierra la pregunta)' : ''}
            </button>
          )}
          {round.phase === 'revealed' && !calificada && <span className="aviso">Calificando…</span>}
          {round.phase === 'revealed' && calificada && next < round.questionCount && (
            <button
              type="button"
              className="btn oro"
              disabled={busy || !puedeAbrir}
              onClick={() => void act(() => openQuestion(db, roundId, next))}
            >
              Abrir pregunta {next + 1}
            </button>
          )}
          {round.phase === 'revealed' && calificada && next === round.questionCount && (
            <button
              type="button"
              className="btn oro"
              disabled={busy}
              onClick={() => void act(() => closeRound(db, roundId))}
            >
              Cerrar partida y mostrar podio
            </button>
          )}
          {round.phase === 'podium' && (
            <button
              type="button"
              className="btn peligro"
              disabled={busy}
              onClick={() => void act(() => archiveRound(db, roundId))}
            >
              Archivar ronda
            </button>
          )}
        </div>
      </div>

      {q !== undefined && round.phase !== 'podium' && (
        <div className="panel">
          <div className="qtexto">{q.text}</div>
          {round.phase === 'revealed' && result.value !== null ? (
            <>
              <Distribution
                options={q.options}
                distribution={result.value.distribution}
                correctIndex={result.value.correctIndex}
              />
              <p className="aviso">
                Acertó el {result.value.correctPct} % de {result.value.answerCount}{' '}
                {result.value.answerCount === 1 ? 'respuesta' : 'respuestas'}.
              </p>
              {solution.value !== null && (
                <div className="nota-debrief">
                  <strong>Para comentar:</strong> {solution.value.teachingNote}
                </div>
              )}
            </>
          ) : (
            <ol className="lista-errores">
              {q.options.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {(round.phase === 'open' || round.phase === 'revealed') && (
        <ReproyectarEnVivo
          db={db}
          roundId={roundId}
          quizId={round.quizId}
          revealedKey={`${n}-${calificada}`}
        />
      )}

      {round.phase === 'podium' && (
        <>
          {podium.value === null ? (
            <Cargando />
          ) : (
            <PodiumView podium={podium.value} questionCount={round.questionCount} />
          )}
          <Debrief db={db} roundId={roundId} quizId={round.quizId} />
        </>
      )}
    </div>
  );
}

/** T065: ampliar el tope con la partida en curso (FR-012). */
function Tope({
  db,
  roundId,
  count,
  max,
}: {
  db: Firestore;
  roundId: string;
  count: number;
  max: number;
}) {
  const [value, setValue] = useState(String(max));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(String(max)), [max]);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= count && n > 0 && n !== max;

  async function aplicar() {
    setBusy(true);
    setError(null);
    try {
      await adjustMaxParticipants(db, roundId, n);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cifras">
      <div className="cifra">
        <div className="valor">
          {count}/{max}
        </div>
        <div className="etiqueta">dentro / tope</div>
      </div>
      <label className="fila">
        <span className="aviso">Tope</span>
        <input
          type="number"
          min={Math.max(1, count)}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{
            width: 90,
            background: 'var(--bg)',
            color: 'var(--tinta)',
            border: '1px solid var(--linea)',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        />
        <button
          type="button"
          className="btn sec"
          disabled={busy || !valid}
          onClick={() => void aplicar()}
        >
          Ajustar tope
        </button>
      </label>
      {count >= max && <span className="error">La sala está llena.</span>}
      {error !== null && <span className="error">{error}</span>}
    </div>
  );
}
