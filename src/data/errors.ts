/**
 * Clasificación de errores de Firestore. Solo traduce códigos; no decide nada.
 */
export function errorCode(e: unknown): string | null {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

export function isPermissionDenied(e: unknown): boolean {
  return errorCode(e) === 'permission-denied';
}

/** Conflicto de concurrencia que merece reintento. */
export function isContention(e: unknown): boolean {
  const c = errorCode(e);
  return c === 'aborted' || c === 'failed-precondition';
}

export function isNetwork(e: unknown): boolean {
  const c = errorCode(e);
  return c === 'unavailable' || c === 'deadline-exceeded';
}
