import { displayNickname } from '../../domain/nickname';
import type { Podium } from '../../domain/types';

const LUGAR = ['1.er', '2.º', '3.er'];

/** El podio a la vista, con el 1.º al centro. Degrada si hay menos de tres (FR-050). */
export function PodiumView({ podium, questionCount }: { podium: Podium; questionCount: number }) {
  if (podium.top.length === 0) {
    return <p className="aviso centrado">Nadie participó en esta ronda.</p>;
  }
  const byRank = [...podium.top].sort((a, b) => a.rank - b.rank);
  // Orden visual 2 · 1 · 3 cuando hay al menos dos.
  const visual = byRank.length >= 2 ? [byRank[1]!, byRank[0]!, ...byRank.slice(2)] : byRank;
  return (
    <>
      <h2 className="centrado" style={{ fontSize: 34, margin: '10px 0 0' }}>
        Podio
      </h2>
      <div className="podio">
        {visual.map((e, i) => (
          <div key={`${e.adjective}_${e.animal}_${i}`} className={`pod p${e.rank}`}>
            <div className="lugar">{LUGAR[e.rank - 1] ?? `${e.rank}.º`} lugar</div>
            <div className="nombre">{displayNickname(e)}</div>
            <div className="pts">
              {e.totalPoints} pts · {e.correctCount}/{questionCount}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
