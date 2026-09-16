/**
 * Respuesta propia y conteo agregado. T053, T084.
 *
 * Este módulo **no lee respuestas ajenas**. La única lectura de respuestas de otros
 * participantes vive dentro del paso de calificación de `scores.ts`, y un test lo
 * verifica (T074, FR-056).
 */
import {
  collection,
  doc,
  getCountFromServer,
  getDocFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { isNetwork, isPermissionDenied } from './errors';

export type SubmitOutcome =
  | { readonly kind: 'confirmed'; readonly optionIndex: number }
  | { readonly kind: 'rejected'; readonly reason: 'late' | 'rejected' }
  | { readonly kind: 'network' };

function answerRef(db: Firestore, roundId: string, uid: string, questionIndex: number) {
  return doc(db, 'rounds', roundId, 'answers', `${uid}_${questionIndex}`);
}

/**
 * Envía la respuesta y **espera la confirmación del servidor** (D9, FR-031). La promesa
 * de `setDoc` solo se resuelve cuando el servidor acepta la escritura; mientras tanto la
 * interfaz muestra "enviando", nunca "respondida".
 *
 * Si el servidor la rechaza, se consulta **al servidor** si ya existía una respuesta:
 * es el caso de quien perdió la conexión justo al enviar y reintenta sin saber si la
 * primera llegó. Así la confirmación es inequívoca en los dos sentidos.
 */
export async function submitAnswer(
  db: Firestore,
  roundId: string,
  uid: string,
  questionIndex: number,
  optionIndex: number,
): Promise<SubmitOutcome> {
  const ref = answerRef(db, roundId, uid, questionIndex);
  try {
    await setDoc(ref, { uid, questionIndex, optionIndex, submittedAt: serverTimestamp() });
    return { kind: 'confirmed', optionIndex };
  } catch (e) {
    if (isNetwork(e)) return { kind: 'network' };
    if (!isPermissionDenied(e)) return { kind: 'rejected', reason: 'rejected' };
    try {
      const existing = await getDocFromServer(ref);
      if (existing.exists()) {
        return { kind: 'confirmed', optionIndex: existing.data()['optionIndex'] as number };
      }
    } catch (inner) {
      if (isNetwork(inner)) return { kind: 'network' };
    }
    return { kind: 'rejected', reason: 'late' };
  }
}

/**
 * Sigue la respuesta propia **tal como la conoce el servidor**. El eco local de una
 * escritura pendiente se ignora: esa escritura todavía puede ser rechazada (D9). Tras
 * una recarga, esto es lo que reconstruye si ya se respondió (FR-060, FR-061).
 */
export function watchOwnAnswer(
  db: Firestore,
  roundId: string,
  uid: string,
  questionIndex: number,
  onChange: (serverAnswer: { optionIndex: number } | null) => void,
  onError: (e: unknown) => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    answerRef(db, roundId, uid, questionIndex),
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;
      onChange(snap.exists() ? { optionIndex: snap.data()['optionIndex'] as number } : null);
    },
    onError,
  );
}

/**
 * Cuántos han respondido la pregunta. Una consulta de agregación: devuelve un número,
 * nunca documentos, así que el presentador ve el conteo sin ver quién respondió qué
 * (FR-058).
 */
export async function countAnswers(
  db: Firestore,
  roundId: string,
  questionIndex: number,
): Promise<number> {
  const snap = await getCountFromServer(
    query(
      collection(db, 'rounds', roundId, 'answers'),
      where('questionIndex', '==', questionIndex),
    ),
  );
  return snap.data().count;
}
