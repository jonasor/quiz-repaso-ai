/**
 * Opción de respuesta. T098: se distingue por **forma además de color**, como el
 * prototipo, para que la proyección en sala no dependa de percibir el color.
 */
import type { ReactNode } from 'react';

export const SHAPES = ['▲', '◆', '●', '■', '★', '⬟'] as const;
export const SHAPE_NAMES = [
  'triángulo',
  'rombo',
  'círculo',
  'cuadrado',
  'estrella',
  'pentágono',
] as const;
export const OPTION_COLORS = [
  'var(--opA)',
  'var(--opB)',
  'var(--opC)',
  'var(--opD)',
  'var(--opE)',
  'var(--opF)',
] as const;

export function Shape({ index }: { index: number }) {
  return (
    <span className="forma" aria-hidden="true">
      {SHAPES[index] ?? '•'}
    </span>
  );
}

export function OptionButton(props: {
  index: number;
  text: ReactNode;
  disabled: boolean;
  chosen: boolean;
  dimmed: boolean;
  onChoose: () => void;
}) {
  const cls = ['op', props.chosen ? 'elegida' : '', props.dimmed ? 'apagada' : ''].join(' ').trim();
  return (
    <button
      type="button"
      className={cls}
      data-i={props.index}
      disabled={props.disabled}
      aria-pressed={props.chosen}
      aria-label={`Opción ${SHAPE_NAMES[props.index] ?? props.index + 1}: ${typeof props.text === 'string' ? props.text : ''}`}
      onClick={props.onChoose}
    >
      <Shape index={props.index} />
      <span>{props.text}</span>
    </button>
  );
}

/** Distribución revelada. La barra de la correcta a color pleno; las demás, atenuadas. */
export function Distribution(props: {
  options: readonly string[];
  distribution: readonly number[];
  correctIndex: number;
}) {
  const total = props.distribution.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="dist" role="list">
      {props.options.map((text, i) => {
        const n = props.distribution[i] ?? 0;
        const pct = Math.round((100 * n) / total);
        const correct = i === props.correctIndex;
        return (
          <div
            key={i}
            role="listitem"
            aria-label={`${text}: ${n} respuestas${correct ? ', correcta' : ''}`}
          >
            <div className="dist-fila">
              <Shape index={i} />
              <div className="dist-pista">
                <div
                  className="dist-barra"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    background: OPTION_COLORS[i] ?? 'var(--teal)',
                    opacity: correct ? 1 : 0.35,
                  }}
                />
              </div>
              <span className="dist-n">{n}</span>
            </div>
            <div className="dist-texto">
              {correct ? '✔ ' : ''}
              {text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
