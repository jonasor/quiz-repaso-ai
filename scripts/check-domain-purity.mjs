// Principio III, verificación mecánica: src/domain/ no conoce Firebase.
//
// No es cosmético. Si el dominio importa Firebase, su suite deja de correr sin
// emulador y un cambio en la fórmula de puntuación pasa de costar milisegundos
// a costar un proceso externo. Este chequeo corre dentro de `test:domain`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/domain';
const OFENSIVO = /from\s+['"](firebase|@firebase)(\/[^'"]*)?['"]|require\(['"](firebase|@firebase)/;

function archivos(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const culpables = archivos(ROOT).filter((f) => OFENSIVO.test(readFileSync(f, 'utf8')));

if (culpables.length > 0) {
  console.error('VIOLA EL PRINCIPIO III: src/domain/ importa Firebase en:');
  for (const f of culpables) console.error('  ' + f);
  process.exit(1);
}
console.log(`dominio puro: ${archivos(ROOT).length} archivos en ${ROOT}, ninguno importa Firebase`);
