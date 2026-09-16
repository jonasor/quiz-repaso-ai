/**
 * Ronda: suscripción, publicación, conducción y entrada. T047 a T050.
 *
 * Las acciones de conducción son **compare-and-swap** dentro de una transacción (D6):
 * se lee la fase, y solo se escribe si sigue siendo la de origen. Un doble clic encuentra
 * la fase ya cambiada y termina sin escribir nada, que es el mismo estado resultante
 * (FR-018). Las reglas hacen cumplir lo mismo de forma independiente; esto evita pedir
 * al servidor algo que va a rechazar.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Firestore,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { nicknameDocId } from '../domain/nickname';
import { canTransition } from '../domain/phases';
import type { Nickname, Round, StoredPhase } from '../domain/types';
import { isContention, isNetwork, isPermissionDenied } from './errors';
import { toParticipant, toRound } from './mappers';

/** Holgado sobre los ~50 esperados (FR-009). */
export const DEFAULT_MAX_PARTICIPANTS = 80;

export interface RoundWithId {
  readonly id: string;
  readonly round: Round;
}

// ---------- Suscripción ----------

/**
 * Sigue la ronda activa: primero el puntero, luego la ronda a la que apunta. Es la
 * única fuente de verdad de la fase para cualquier cliente (FR-062).
 */
export function watchActiveRound(
  db: Firestore,
  onChange: (r: RoundWithId | null) => void,
  onError: (e: unknown) => void = () => undefined,
): Unsubscribe {
  let unsubRound: Unsubscribe | null = null;
  let current: string | null = null;
  const unsubPointer = onSnapshot(
    doc(db, 'config', 'activeRound'),
    (snap) => {
      const id = snap.exists() ? (snap.data()['roundId'] as string) : null;
      if (id === current) return;
      current = id;
      unsubRound?.();
      unsubRound = null;
      if (id === null) {
        onChange(null);
        return;
      }
      unsubRound = watchRound(
        db,
        id,
        (round) => onChange(round === null ? null : { id, round }),
        onError,
      );
    },
    onError,
  );
  return () => {
    unsubPointer();
    unsubRound?.();
  };
}

export function watchRound(
  db: Firestore,
  roundId: string,
  onChange: (r: Round | null) => void,
  onError: (e: unknown) => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'rounds', roundId),
    // includeMetadataChanges es obligatorio si se descartan escrituras pendientes: la
    // confirmación del servidor solo cambia metadatos, y sin esta opción no dispara evento.
    { includeMetadataChanges: true },
    (snap) => {
      // Mientras el serverTimestamp de una escritura propia no vuelve, startedAt u
      // openedAt pueden venir vacíos. Se espera al valor del servidor.
      if (!snap.exists()) return onChange(null);
      if (snap.metadata.hasPendingWrites) return;
      onChange(toRound(snap.data()));
    },
    onError,
  );
}

/** Para la lista de rondas pasadas del presentador (FR-074). */
export async function listRounds(db: Firestore): Promise<RoundWithId[]> {
  const snap = await getDocs(query(collection(db, 'rounds'), orderBy('startedAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, round: toRound(d.data()) }));
}

// ---------- Publicación (T048) ----------

/** Id para una publicación. Se genera **una vez por formulario**, no por clic (T104). */
export function newRoundId(db: Firestore): string {
  return doc(collection(db, 'rounds')).id;
}

/**
 * Publica una ronda nueva en una transacción: la crea activa, mueve el puntero y
 * archiva la anterior si seguía activa (FR-021, FR-022). Las reglas atan las tres
 * escrituras; ninguna vale por separado.
 *
 * **Idempotente** (T104, FR-018): el id lo fija quien llama, una vez por formulario. Si la
 * ronda ya existe, la transacción termina sin escribir nada. Eso cubre el doble clic, y
 * también repetir una publicación vieja: no crea una ronda de más ni devuelve el puntero
 * a una ronda que ya fue reemplazada.
 */
export async function publishRound(
  db: Firestore,
  quizId: string,
  maxParticipants: number = DEFAULT_MAX_PARTICIPANTS,
  roundId: string = newRoundId(db),
): Promise<string> {
  if (!Number.isInteger(maxParticipants) || maxParticipants <= 0) {
    throw new Error('el tope de participantes debe ser un entero positivo');
  }
  const pointerRef = doc(db, 'config', 'activeRound');
  const newRef = doc(db, 'rounds', roundId);
  const attempt = () =>
    runTransaction(db, async (tx) => {
      if ((await tx.get(newRef)).exists()) return;
      const quizSnap = await tx.get(doc(db, 'quizzes', quizId));
      if (!quizSnap.exists()) throw new Error('el cuestionario no existe');
      const pointer = await tx.get(pointerRef);
      const prevId = pointer.exists() ? (pointer.data()['roundId'] as string) : null;
      const prevRef = prevId === null ? null : doc(db, 'rounds', prevId);
      const prev = prevRef === null ? null : await tx.get(prevRef);

      tx.set(newRef, {
        quizId,
        questionCount: quizSnap.data()['questionCount'] as number,
        phase: 'lobby',
        currentIndex: -1,
        openedAt: null,
        timeLimitSec: null,
        maxParticipants,
        participantCount: 0,
        active: true,
        startedAt: serverTimestamp(),
        endedAt: null,
      });
      tx.set(pointerRef, { roundId });
      if (prevRef !== null && prev?.exists() === true && prev.data()['active'] === true) {
        tx.update(prevRef, { phase: 'archived', active: false });
      }
    });
  try {
    await attempt();
  } catch (e) {
    // Dos envíos a la vez: el perdedor escribe sobre un puntero que ya cambió y las reglas
    // lo rechazan antes de detectar el conflicto (el mismo efecto que en la entrada). Si
    // la ronda ya existe, el otro envío la publicó.
    if (isPermissionDenied(e) && (await getDoc(newRef)).exists()) return roundId;
    throw e;
  }
  return roundId;
}

// ---------- Conducción (T047) ----------

export type TransitionResult = 'done' | 'stale';

async function transition(
  db: Firestore,
  roundId: string,
  from: StoredPhase,
  build: (
    round: Round,
    tx: Transaction,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>,
): Promise<TransitionResult> {
  const ref = doc(db, 'rounds', roundId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return 'stale';
    const round = toRound(snap.data());
    if (round.phase !== from) return 'stale';
    tx.update(ref, await build(round, tx));
    return 'done';
  });
}

/** Abre la pregunta `index`: desde lobby la 0, desde revealed la siguiente. */
export async function openQuestion(
  db: Firestore,
  roundId: string,
  index: number,
): Promise<TransitionResult> {
  const from: StoredPhase = index === 0 ? 'lobby' : 'revealed';
  return transition(db, roundId, from, async (round, tx) => {
    if (!canTransition(round.phase, 'open', round.currentIndex, index, round.questionCount)) {
      throw new Error(`no se puede abrir la pregunta ${index} desde ${round.phase}`);
    }
    // El tiempo límite se toma de la pregunta publicada; las reglas lo verifican.
    const q = await tx.get(doc(db, 'quizzes', round.quizId, 'questions', String(index)));
    if (!q.exists()) throw new Error(`la pregunta ${index} no existe`);
    return {
      phase: 'open',
      currentIndex: index,
      openedAt: serverTimestamp(),
      timeLimitSec: q.data()['timeLimitSec'] as number,
    };
  });
}

/**
 * Cierra la admisión de respuestas y pasa a revelada (FR-014, FR-019). La calificación
 * va después, en `gradeCurrentQuestion`, cuando ya no puede entrar ninguna respuesta.
 */
export function revealQuestion(db: Firestore, roundId: string): Promise<TransitionResult> {
  return transition(db, roundId, 'open', () => ({ phase: 'revealed' }));
}

export async function archiveRound(db: Firestore, roundId: string): Promise<TransitionResult> {
  const ref = doc(db, 'rounds', roundId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data()['phase'] === 'archived') return 'stale';
    tx.update(ref, { phase: 'archived', active: false });
    return 'done';
  });
}

/**
 * FR-012: la salida operativa cuando el cupo se llena de forma indebida.
 *
 * **Idempotente** (T106): fijar el tope que ya tiene termina sin escribir y sin error. Las
 * reglas rechazan una actualización sin cambios, así que sin esta comprobación un doble
 * clic mostraba "no tienes permiso".
 */
export async function adjustMaxParticipants(
  db: Firestore,
  roundId: string,
  maxParticipants: number,
): Promise<void> {
  if (!Number.isInteger(maxParticipants) || maxParticipants <= 0) {
    throw new Error('el tope de participantes debe ser un entero positivo');
  }
  const ref = doc(db, 'rounds', roundId);
  const current = async () => (await getDoc(ref)).data()?.['maxParticipants'] as number | undefined;
  if ((await current()) === maxParticipants) return;
  try {
    await updateDoc(ref, { maxParticipants });
  } catch (e) {
    // Dos envíos a la vez: el otro ya lo fijó.
    if (isPermissionDenied(e) && (await current()) === maxParticipants) return;
    throw e;
  }
}

// ---------- Entrada (T050) ----------

export type JoinOutcome =
  | { readonly kind: 'joined'; readonly nickname: Nickname }
  | { readonly kind: 'already'; readonly nickname: Nickname }
  | { readonly kind: 'full' }
  | { readonly kind: 'closed' }
  | { readonly kind: 'failed'; readonly reason: 'network' | 'contention' | 'rejected' };

export interface JoinOptions {
  /** Intentos ante conflicto con otras entradas simultáneas. */
  readonly maxAttempts?: number;
  /** Base del retroceso exponencial, en milisegundos. Calibrado con T051. */
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  /** Se llama con cada intento perdido, para medir (T051). */
  readonly onRetry?: (attempt: number) => void;
}

/**
 * Calibrado con T051 (scripts/measure-join-burst.ts) contra el emulador. Con los valores
 * iniciales (12 intentos, 60 ms, 1,5 s) solo 23 de 50 entradas simultáneas lograban
 * entrar. Con estos entran las 50, el contador queda exacto y ninguna falla. El p95
 * sigue siendo de ~50 s porque las entradas se serializan sobre un único documento: ver
 * el riesgo abierto 2 de research.md, pendiente de decisión.
 */
export const JOIN_DEFAULTS = {
  maxAttempts: 60,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
} as const;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Attempt = JoinOutcome | { readonly kind: 'taken' };

/**
 * Entra a la ronda: crea el participante, reserva el apodo e incrementa el contador,
 * en **una transacción** (D4). No un lote: un lote no serializa contra otras entradas.
 *
 * **Por qué además hay que reintentar.** Con dos entradas simultáneas, las dos leen el
 * mismo contador. La primera confirma; la segunda intenta escribir un contador que ya
 * no es el leído, y las reglas —que exigen exactamente `+1`— la rechazan con
 * `permission-denied` *antes* de que Firestore detecte el conflicto. El SDK solo
 * reintenta conflictos, no permisos denegados. Por eso la entrada relee y reintenta, y
 * dentro de la transacción distingue lo definitivo —sala llena, ronda cerrada, apodo
 * tomado— de haber perdido la carrera.
 */
export async function joinRound(
  db: Firestore,
  roundId: string,
  uid: string,
  firstNickname: Nickname,
  pickNickname: () => Nickname,
  options: JoinOptions = {},
): Promise<JoinOutcome> {
  const maxAttempts = options.maxAttempts ?? JOIN_DEFAULTS.maxAttempts;
  const base = options.baseDelayMs ?? JOIN_DEFAULTS.baseDelayMs;
  const cap = options.maxDelayMs ?? JOIN_DEFAULTS.maxDelayMs;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  const roundRef = doc(db, 'rounds', roundId);
  const participantRef = doc(db, 'rounds', roundId, 'participants', uid);
  let nickname = firstNickname;
  let lastFailure: 'network' | 'contention' | 'rejected' = 'contention';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const outcome: Attempt = await runTransaction(db, async (tx): Promise<Attempt> => {
        const mine = await tx.get(participantRef);
        if (mine.exists()) {
          const p = toParticipant(uid, mine.data());
          return { kind: 'already', nickname: { adjective: p.adjective, animal: p.animal } };
        }
        const roundSnap = await tx.get(roundRef);
        if (!roundSnap.exists()) return { kind: 'closed' };
        const round = toRound(roundSnap.data());
        if (round.phase === 'archived') return { kind: 'closed' };
        if (round.participantCount >= round.maxParticipants) return { kind: 'full' };

        const nickRef = doc(db, 'rounds', roundId, 'nicknames', nicknameDocId(nickname));
        if ((await tx.get(nickRef)).exists()) return { kind: 'taken' };

        tx.set(participantRef, {
          adjective: nickname.adjective,
          animal: nickname.animal,
          joinedAt: serverTimestamp(),
        });
        tx.set(nickRef, { uid });
        tx.update(roundRef, { participantCount: round.participantCount + 1 });
        return { kind: 'joined', nickname };
      });

      if (outcome.kind !== 'taken') return outcome;
      // Apodo tomado: no es un conflicto, es una colisión. Otro apodo, sin esperar.
      nickname = pickNickname();
    } catch (e) {
      if (isPermissionDenied(e) || isContention(e)) {
        lastFailure = 'contention';
      } else if (isNetwork(e)) {
        lastFailure = 'network';
      } else {
        return { kind: 'failed', reason: 'rejected' };
      }
      options.onRetry?.(attempt + 1);
      // Retroceso exponencial con jitter completo: separa a los que chocaron.
      const ceiling = Math.min(cap, base * 2 ** attempt);
      await sleep(Math.floor(random() * ceiling));
    }
  }
  return { kind: 'failed', reason: lastFailure };
}

export function watchParticipantCount(
  db: Firestore,
  roundId: string,
  onChange: (count: number, max: number) => void,
): Unsubscribe {
  return watchRound(db, roundId, (r) => {
    if (r !== null) onChange(r.participantCount, r.maxParticipants);
  });
}

export function watchOwnParticipant(
  db: Firestore,
  roundId: string,
  uid: string,
  onChange: (nickname: Nickname | null) => void,
  onError: (e: unknown) => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'rounds', roundId, 'participants', uid),
    // includeMetadataChanges es obligatorio si se descartan escrituras pendientes: la
    // confirmación del servidor solo cambia metadatos, y sin esta opción no dispara evento.
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.exists()) return onChange(null);
      if (snap.metadata.hasPendingWrites) return;
      const p = toParticipant(uid, snap.data());
      onChange({ adjective: p.adjective, animal: p.animal });
    },
    onError,
  );
}
