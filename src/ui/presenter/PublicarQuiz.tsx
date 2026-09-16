/**
 * Publicar un cuestionario desde archivo. T080 (FR-064, FR-068, FR-069, SC-004).
 *
 * El archivo se lee en el navegador y se valida entero antes de escribir nada; si tiene
 * errores se muestran todos, con su ubicación. Nunca entra al bundle desplegado (VI).
 */
import { useState, type ChangeEvent } from 'react';
import type { Firestore } from '../../data/types';
import { publishQuiz } from '../../data/quizzes';
import { parseQuizFile, type ValidatedQuiz, type ValidationError } from '../../domain/quizFile';
import { describeError } from '../shared/Estados';

export function PublicarQuiz({ db, onPublished }: { db: Firestore; onPublished: () => void }) {
  const [quiz, setQuiz] = useState<ValidatedQuiz | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setQuiz(null);
    setErrors([]);
    setPublishError(null);
    if (file === undefined) return;
    setFileName(file.name);
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setErrors([{ path: '(archivo)', message: 'no es un JSON válido' }]);
      return;
    }
    const parsed = parseQuizFile(raw);
    if (parsed.ok) setQuiz(parsed.quiz);
    else setErrors(parsed.errors);
  }

  async function publicar() {
    if (quiz === null) return;
    setBusy(true);
    setPublishError(null);
    try {
      await publishQuiz(db, quiz);
      onPublished();
    } catch (e) {
      setPublishError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Publicar un cuestionario</h2>
      <p className="aviso">
        Sube un archivo JSON con el formato de <code>docs/cuestionario-ejemplo.json</code>. No hace
        falta recompilar ni desplegar nada: el cuestionario queda disponible para una ronda nueva.
        Las respuestas correctas se guardan aparte y ningún participante puede leerlas.
      </p>
      <label className="campo">
        <span className="eyebrow">Archivo</span>
        <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e)} />
      </label>

      {errors.length > 0 && (
        <div role="alert">
          <p className="error">
            {fileName} tiene {errors.length} {errors.length === 1 ? 'problema' : 'problemas'}; no se
            publicó nada:
          </p>
          <ul className="lista-errores">
            {errors.map((err, i) => (
              <li key={i}>
                <code>{err.path}</code>: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {quiz !== null && (
        <>
          <p>
            <strong>{quiz.title}</strong> · {quiz.questions.length} preguntas, sin errores.
          </p>
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th className="n">#</th>
                  <th>Pregunta</th>
                  <th className="n">Opciones</th>
                  <th className="n">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {quiz.questions.map((q, i) => (
                  <tr key={i}>
                    <td className="n">{i + 1}</td>
                    <td>{q.text}</td>
                    <td className="n">{q.options.length}</td>
                    <td className="n">{q.timeLimitSec} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {publishError !== null && (
            <p className="error" role="alert">
              {publishError}
            </p>
          )}
          <p style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn oro"
              disabled={busy}
              onClick={() => void publicar()}
            >
              {busy ? 'Publicando…' : 'Publicar cuestionario'}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
