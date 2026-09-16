/**
 * Publicar una ronda. T064 (FR-009, FR-021, FR-022).
 */
import { useState } from 'react';
import type { Firestore } from '../../data/types';
import { listQuizzes } from '../../data/quizzes';
import { DEFAULT_MAX_PARTICIPANTS, newRoundId, publishRound } from '../../data/rounds';
import { Cargando, Estado, describeError } from '../shared/Estados';
import { usePromise } from '../shared/hooks';

export function PublicarRonda({ db, onPublished }: { db: Firestore; onPublished: () => void }) {
  const quizzes = usePromise(() => listQuizzes(db), [db]);
  // Un id por formulario, no por clic: un doble clic publica la misma ronda (T104).
  const [roundId] = useState(() => newRoundId(db));
  const [quizId, setQuizId] = useState('');
  const [max, setMax] = useState(String(DEFAULT_MAX_PARTICIPANTS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (quizzes.loading) return <Cargando />;
  if (quizzes.error !== null)
    return (
      <Estado titulo="No se pudieron leer los cuestionarios">{describeError(quizzes.error)}</Estado>
    );
  const list = quizzes.value ?? [];
  if (list.length === 0) {
    return (
      <Estado titulo="Todavía no hay cuestionarios publicados">
        Publica uno desde la pestaña «Publicar cuestionario».
      </Estado>
    );
  }
  const selected = quizId === '' ? list[0]!.id : quizId;
  const maxN = Number(max);
  const valid = Number.isInteger(maxN) && maxN > 0;

  async function publicar() {
    setBusy(true);
    setError(null);
    try {
      await publishRound(db, selected, maxN, roundId);
      onPublished();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Publicar una ronda</h2>
      <p className="aviso">
        Abre la sala de espera con un cuestionario ya publicado. Si había una ronda activa, se
        archiva en el mismo acto y queda consultable en «Rondas pasadas».
      </p>
      <label className="campo">
        <span className="eyebrow">Cuestionario</span>
        <select value={selected} onChange={(e) => setQuizId(e.target.value)}>
          {list.map((q) => (
            <option key={q.id} value={q.id}>
              {q.title} · {q.questionCount} preguntas
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        <span className="eyebrow">Tope de participantes</span>
        <input
          type="number"
          min={1}
          step={1}
          value={max}
          onChange={(e) => setMax(e.target.value)}
        />
        <span className="aviso">Se puede ampliar después, con la partida en curso.</span>
      </label>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn oro"
        disabled={busy || !valid}
        onClick={() => void publicar()}
      >
        {busy ? 'Publicando…' : 'Publicar ronda y abrir sala'}
      </button>
    </div>
  );
}
