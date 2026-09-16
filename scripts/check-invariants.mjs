/**
 * T100 — Falla si la columna "dónde vive" de la tabla de validaciones de data-model.md
 * contiene la palabra "Cliente".
 *
 * Una invariante que vive en el cliente es una violación del Principio I, y las que
 * encontró la revisión del diseño no se vieron hasta buscarlas a propósito.
 */
import { readFileSync } from 'node:fs';

const md = readFileSync('specs/001-partida-integra/data-model.md', 'utf8');
const start = md.indexOf('## Reglas de validación derivadas de los requisitos');
if (start < 0) {
  console.error('no se encontró la tabla de validaciones en data-model.md');
  process.exit(1);
}
const section = md.slice(start).split(/\n## /)[0];
const rows = section
  .split('\n')
  .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
  .slice(1)
  .map((l) => l.split('|').map((c) => c.trim()));

if (rows.length === 0) {
  console.error('la tabla de validaciones está vacía');
  process.exit(1);
}
const offenders = rows.filter((cells) => /cliente/i.test(cells[2] ?? ''));
if (offenders.length > 0) {
  console.error('Invariantes que viven en el cliente (Principio I):');
  for (const c of offenders) console.error(`  - ${c[1]}: ${c[2]}`);
  process.exit(1);
}
console.log(`Principio I: ${rows.length} validaciones, ninguna vive en el cliente.`);
