/**
 * Superficie del presentador. Se distingue por **autenticación**, no por un artefacto de
 * despliegue ni por una clave en la URL (T066): quien no tiene el claim `presenter` ve el
 * acceso, y aunque forzara la vista, las reglas rechazarían cada acción.
 */
import { useState, type FormEvent } from 'react';
import { signInAsPresenter, signOutUser } from '../../data/firebase';
import { Cargando, Estado, Marca, describeError } from '../shared/Estados';
import { useFirebase, useIdentity } from '../shared/hooks';
import { Conduccion } from './Conduccion';
import { PublicarQuiz } from './PublicarQuiz';
import { PublicarRonda } from './PublicarRonda';
import { Rondas } from './Rondas';

type Tab = 'conduccion' | 'ronda' | 'cuestionario' | 'rondas';

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['conduccion', 'Conducción'],
  ['ronda', 'Publicar ronda'],
  ['cuestionario', 'Publicar cuestionario'],
  ['rondas', 'Rondas pasadas'],
];

export function PresenterApp() {
  const { auth, db } = useFirebase();
  const { ready, identity } = useIdentity();
  const [tab, setTab] = useState<Tab>('conduccion');

  let body;
  if (!ready) {
    body = <Cargando />;
  } else if (identity === null || identity.isAnonymous) {
    body = <Acceso />;
  } else if (!identity.isPresenter) {
    body = (
      <Estado
        titulo="Esta cuenta no es de presentador"
        accion={
          <button type="button" className="btn sec" onClick={() => void signOutUser(auth)}>
            Cerrar sesión
          </button>
        }
      >
        La cuenta existe, pero no tiene el permiso de presentador. Se otorga una sola vez con{' '}
        <code>scripts/grant-presenter.ts</code>; después hay que volver a iniciar sesión.
      </Estado>
    );
  } else {
    body = (
      <>
        <div className="pestanas" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            style={{ marginLeft: 'auto' }}
            onClick={() => void signOutUser(auth)}
          >
            Salir
          </button>
        </div>
        {tab === 'conduccion' && <Conduccion db={db} onPublishRound={() => setTab('ronda')} />}
        {tab === 'ronda' && <PublicarRonda db={db} onPublished={() => setTab('conduccion')} />}
        {tab === 'cuestionario' && <PublicarQuiz db={db} onPublished={() => setTab('ronda')} />}
        {tab === 'rondas' && <Rondas db={db} />}
      </>
    );
  }

  return (
    <div className="wrap">
      <Marca right="Presentador" />
      {body}
    </div>
  );
}

function Acceso() {
  const { auth } = useFirebase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInAsPresenter(auth, email, password);
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
      setError(code.startsWith('auth/') ? 'Correo o contraseña incorrectos.' : describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={(e) => void submit(e)}>
      <h2 style={{ marginTop: 0 }}>Acceso del presentador</h2>
      <label className="campo">
        <span className="eyebrow">Correo</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="campo">
        <span className="eyebrow">Contraseña</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
