/**
 * Estados de error y vacío (T099): pérdida de conexión, sala llena, ronda archivada y
 * cuestionario sin publicar.
 */
import type { ReactNode } from 'react';

export function Marca({ right }: { right?: ReactNode }) {
  return (
    <div className="marca">
      <h1>Quiz de Repaso AI</h1>
      <span className="eyebrow">{right ?? 'Programa de adopción de AI · Azzule'}</span>
    </div>
  );
}

export function Estado(props: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="panel centrado" role="status">
      <h2>{props.titulo}</h2>
      {props.children !== undefined && <div className="aviso">{props.children}</div>}
      {props.accion !== undefined && <p style={{ marginTop: 18 }}>{props.accion}</p>}
    </div>
  );
}

export function SinConexion({ onRetry }: { onRetry?: () => void }) {
  return (
    <Estado
      titulo="No se pudo conectar"
      accion={
        onRetry === undefined ? undefined : (
          <button type="button" className="btn sec" onClick={onRetry}>
            Reintentar
          </button>
        )
      }
    >
      Revisa tu conexión. En cuanto vuelva, la partida sigue donde iba: nada de lo que ya
      respondiste se pierde.
    </Estado>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="panel centrado" role="status" aria-live="polite">
      <p className="aviso">{texto}</p>
    </div>
  );
}

export function describeError(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = String((e as { code: unknown }).code);
    if (code === 'permission-denied') return 'No tienes permiso para esta acción.';
    if (code === 'unavailable') return 'Sin conexión con el servidor.';
  }
  if (e instanceof Error) return e.message;
  return 'Ocurrió un error inesperado.';
}
