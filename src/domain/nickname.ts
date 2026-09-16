/**
 * Apodos. Catálogo cerrado, y el apodo vive **partido** en dos campos.
 *
 * Guardarlo partido no es capricho: permite que `firestore.rules` valide la
 * pertenencia con dos comparaciones `in` sobre listas literales, sin analizar
 * cadenas. Eso es lo que convierte FR-006 y FR-054 en garantías de reglas —no
 * existe ningún documento donde un participante pueda escribir texto arbitrario—
 * en lugar de disciplina del cliente.
 *
 * FR-008 exige que el espacio sea al menos dos órdenes de magnitud mayor que el
 * aforo objetivo. Con la unicidad ya garantizada por el servidor mediante la
 * reserva en `rounds/{r}/nicknames/{id}`, un catálogo holgado dejó de ser una
 * defensa y pasó a ser lo que evita que la entrada entre en reintentos por
 * colisión.
 *
 * Las dos listas están duplicadas en `firestore.rules`. `tests/rules/catalog-sync.spec.ts`
 * falla si divergen: una divergencia silenciosa rompería FR-054 o dejaría fuera
 * entradas legítimas, y no se notaría hasta estar frente a la sala.
 */
import type { Nickname } from './types';

export const ADJECTIVES: readonly string[] = [
  'Astuto', 'Valiente', 'Sereno', 'Curioso', 'Ágil', 'Sabio', 'Noble', 'Audaz', 'Tenaz',
  'Risueño', 'Brioso', 'Cordial', 'Diestro', 'Esbelto', 'Fiel', 'Gentil', 'Hábil', 'Intrépido',
  'Jovial', 'Leal', 'Lúcido', 'Magnánimo', 'Nítido', 'Óptimo', 'Paciente', 'Pícaro', 'Prudente',
  'Rápido', 'Recio', 'Robusto', 'Sagaz', 'Sincero', 'Sobrio', 'Solemne', 'Sutil', 'Templado',
  'Terco', 'Tierno', 'Tranquilo', 'Vivaz', 'Zumbón', 'Alegre', 'Amable', 'Animoso', 'Apacible',
  'Ardiente', 'Atento', 'Aviado', 'Bravo', 'Cálido', 'Campante', 'Cauto', 'Certero', 'Claro',
  'Colosal', 'Constante', 'Discreto', 'Dócil', 'Enérgico', 'Errante', 'Firme', 'Franco',
  'Fresco', 'Garboso', 'Grácil', 'Grato', 'Humilde', 'Ilustre', 'Impávido', 'Íntegro', 'Justo',
  'Ligero', 'Locuaz', 'Luminoso',
] as const;

export const ANIMALS: readonly string[] = [
  'Zorro', 'Lince', 'Búho', 'Tejón', 'Halcón', 'Nutria', 'Erizo', 'Ciervo', 'Jabalí', 'Lobo',
  'Garza', 'Mirlo', 'Tucán', 'Colibrí', 'Pelícano', 'Cormorán', 'Flamenco', 'Ibis', 'Quetzal',
  'Jilguero', 'Ruiseñor', 'Alondra', 'Cernícalo', 'Águila', 'Puma', 'Ocelote', 'Coatí', 'Tapir',
  'Capibara', 'Armadillo', 'Perezoso', 'Mono', 'Tucuxi', 'Delfín', 'Marsopa', 'Foca', 'Morsa',
  'Narval', 'Beluga', 'Orca', 'Manatí', 'Dugongo', 'Pingüino', 'Frailecillo', 'Cigüeña',
  'Grulla', 'Avestruz', 'Emú', 'Casuario', 'Kiwi', 'Loro', 'Guacamayo', 'Cacatúa', 'Periquito',
  'Canario', 'Gorrión', 'Golondrina', 'Vencejo', 'Abejaruco', 'Martín', 'Oropéndola',
  'Estornino', 'Urraca', 'Arrendajo', 'Cuervo', 'Grajo', 'Chova', 'Trepador', 'Agateador',
  'Herrerillo', 'Carbonero', 'Reyezuelo', 'Petirrojo', 'Zarcero',
] as const;

/** Apodo aleatorio. El rng entra como argumento para que la función sea pura. */
export function generateNickname(rng: () => number): Nickname {
  const adjective = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(rng() * ANIMALS.length)];
  if (adjective === undefined || animal === undefined) {
    throw new Error('catálogo de apodos vacío');
  }
  return { adjective, animal };
}

/** Espejo en dominio de `inCatalog()` de las reglas. La autoridad es la regla. */
export function isGeneratable(n: Nickname): boolean {
  return ADJECTIVES.includes(n.adjective) && ANIMALS.includes(n.animal);
}

/** Texto visible. Solo para pintar; nunca se almacena compuesto. */
export function displayNickname(n: Nickname): string {
  return `${n.adjective} ${n.animal}`;
}

/** Id del documento de reserva en `rounds/{r}/nicknames/{id}`, que sostiene FR-007. */
export function nicknameDocId(n: Nickname): string {
  return `${n.adjective}_${n.animal}`;
}
