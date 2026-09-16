/** Sala de espera. T058. */
import { displayNickname } from '../../domain/nickname';
import type { PhaseProps } from './props';

export function Espera({ round, nickname }: PhaseProps) {
  return (
    <div className="panel">
      <p className="eyebrow">Sala abierta</p>
      <h2 style={{ margin: '8px 0 2px' }}>Esperando a que arranque la primera pregunta…</h2>
      <p>
        <span className="num-grande">{round.participantCount}</span>{' '}
        <span className="aviso">dentro</span>
      </p>
      <p className="aviso">
        Juegas como{' '}
        <strong className="apodo" style={{ fontSize: 22 }}>
          {displayNickname(nickname)}
        </strong>
      </p>
    </div>
  );
}
