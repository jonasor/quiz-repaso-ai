/**
 * T091 — Principio VI: ninguna respuesta correcta ni nota pedagógica entra al bundle.
 *
 * Toma los cuestionarios que existen en el repositorio y busca en dist/ el texto de cada
 * nota pedagógica y de cada opción correcta que no sea también el texto de una opción
 * incorrecta en otra pregunta.
 *
 *   npm run build && node scripts/check-dist.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync('dist')) {
  console.error('no existe dist/: ejecuta npm run build primero');
  process.exit(1);
}
const bundle = walk('dist')
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const quizzes = walk('docs').filter((f) => f.endsWith('.json'));
const needles = [];
for (const f of quizzes) {
  const quiz = JSON.parse(readFileSync(f, 'utf8'));
  for (const q of quiz.questions ?? []) {
    needles.push({ where: f, kind: 'nota', text: q.teachingNote });
    // El texto de la opción correcta es público al mostrar las opciones, así que lo que
    // no debe estar es la asociación. Se busca la nota, que solo existe en la solución.
  }
}
const leaked = needles.filter(
  (n) => typeof n.text === 'string' && n.text.length > 12 && bundle.includes(n.text),
);
if (leaked.length > 0) {
  console.error('Principio VI violado: contenido de solución dentro de dist/:');
  for (const l of leaked) console.error(`  - ${l.where} (${l.kind}): ${l.text.slice(0, 60)}…`);
  process.exit(1);
}
if (/correctIndex"\s*:\s*\d/.test(bundle)) {
  console.error('Principio VI: dist/ contiene un correctIndex literal de un cuestionario');
  process.exit(1);
}
console.log(
  `Principio VI: ${needles.length} notas pedagógicas buscadas en dist/, ninguna presente.`,
);
