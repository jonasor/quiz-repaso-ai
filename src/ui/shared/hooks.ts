/**
 * Hooks de suscripción. La interfaz no importa Firebase: todo pasa por `src/data/`.
 */
import { useEffect, useRef, useState } from 'react';
import {
  initFirebase,
  watchIdentity,
  type FirebaseHandles,
  type Identity,
} from '../../data/firebase';
import { watchActiveRound, type RoundWithId } from '../../data/rounds';

export function useFirebase(): FirebaseHandles {
  const ref = useRef<FirebaseHandles | null>(null);
  if (ref.current === null) ref.current = initFirebase();
  return ref.current;
}

export interface Loadable<T> {
  readonly loading: boolean;
  readonly value: T;
  readonly error: unknown;
}

/**
 * Suscribe mientras las dependencias no cambien. `subscribe` recibe los callbacks y
 * devuelve la función de baja; `initial` es el valor mientras no llega el primero.
 */
export function useSubscription<T>(
  subscribe: ((onValue: (v: T) => void, onError: (e: unknown) => void) => () => void) | null,
  initial: T,
  deps: ReadonlyArray<unknown>,
): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({
    loading: subscribe !== null,
    value: initial,
    error: null,
  });
  useEffect(() => {
    if (subscribe === null) {
      setState({ loading: false, value: initial, error: null });
      return undefined;
    }
    setState({ loading: true, value: initial, error: null });
    return subscribe(
      (value) => setState({ loading: false, value, error: null }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
  }, deps);
  return state;
}

export function useIdentity(): { readonly ready: boolean; readonly identity: Identity | null } {
  const { auth } = useFirebase();
  const [state, setState] = useState<{ ready: boolean; identity: Identity | null }>({
    ready: false,
    identity: null,
  });
  useEffect(() => watchIdentity(auth, (identity) => setState({ ready: true, identity })), [auth]);
  return state;
}

/** Ronda activa: la única fuente de verdad de la fase para cualquier cliente (FR-062). */
export function useActiveRound(): Loadable<RoundWithId | null> {
  const { db } = useFirebase();
  return useSubscription<RoundWithId | null>(
    (onValue, onError) => watchActiveRound(db, onValue, onError),
    null,
    [db],
  );
}

/**
 * Reloj del cliente **solo para pintar** el contador (FR-034). Ninguna decisión de juego
 * sale de aquí: el plazo lo hacen cumplir las reglas contra la hora del servidor.
 */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Ejecuta `fn` repetidamente mientras `active`. */
export function usePolling(
  fn: () => void,
  intervalMs: number,
  active: boolean,
  deps: ReadonlyArray<unknown>,
) {
  useEffect(() => {
    if (!active) return undefined;
    fn();
    const id = setInterval(fn, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, ...deps]);
}

/** Resultado de una promesa que se relanza cuando cambian las dependencias. */
export function usePromise<T>(
  fn: (() => Promise<T>) | null,
  deps: ReadonlyArray<unknown>,
): Loadable<T | null> {
  const [state, setState] = useState<Loadable<T | null>>({
    loading: fn !== null,
    value: null,
    error: null,
  });
  useEffect(() => {
    if (fn === null) {
      setState({ loading: false, value: null, error: null });
      return undefined;
    }
    let alive = true;
    setState({ loading: true, value: null, error: null });
    fn().then(
      (value) => alive && setState({ loading: false, value, error: null }),
      (error: unknown) => alive && setState({ loading: false, value: null, error }),
    );
    return () => {
      alive = false;
    };
  }, deps);
  return state;
}
