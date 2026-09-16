# Contract — Módulos de dominio

**Feature**: `001-partida-integra` | **Principio III**: sin imports de `firebase/*`

Firmas de los módulos puros. Son el contrato que `src/data/` consume y que
`tests/domain/` prueba con Vitest, sin emulador, sin red y sin credenciales.

Verificación mecánica del Principio III: `grep -r "firebase" src/domain/` no devuelve
nada.

## `scoring.ts` — FR-037 a FR-040

```ts
export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 100;

/** Puntos de una respuesta. Cero si es incorrecta. FR-037, FR-038. */
export function pointsFor(
  correct: boolean,
  elapsedMs: number,
  timeLimitSec: number
): number;

/** Totales de un participante. FR-039, FR-040. */
export function totalsFor(
  perQuestion: ReadonlyArray<QuestionOutcome>,
  timeLimits: ReadonlyArray<number>
): { totalPoints: number; totalElapsedMs: number; correctCount: number };
```

`pointsFor` con `correct = true` devuelve `BASE_POINTS` más la fracción de
`MAX_SPEED_BONUS` proporcional al tiempo restante, redondeada. Conserva la fórmula del
prototipo, confirmada en Clarifications.

`totalsFor` imputa el **tiempo límite completo** a cada pregunta no respondida. Es
FR-040, y su razón es que sin ello abstenerse mejoraría el desempate.

Casos que los tests deben cubrir: respuesta instantánea da el bono completo; respuesta
en el último instante da bono cero pero no negativo; respuesta incorrecta da cero
aunque sea instantánea; pregunta no respondida aporta cero puntos y tiempo límite
completo.

## `phases.ts` — FR-013, FR-014, FR-019, FR-023

```ts
/** Lo que vive en Firestore. `closed` NO está aquí: nunca se almacena. */
export type StoredPhase = 'lobby' | 'open' | 'revealed' | 'podium' | 'archived';

/** Lo que la UI pinta. Añade `closed`, que se deriva del plazo. */
export type EffectivePhase = StoredPhase | 'closed';

/** ¿La transición está permitida? Espejo de la tabla del contrato de reglas. */
export function canTransition(
  from: StoredPhase, to: StoredPhase, currentIndex: number, nextIndex: number, questionCount: number
): boolean;

/** Fase efectiva según el plazo, que puede diferir de la almacenada. */
export function effectivePhase(
  stored: StoredPhase, openedAt: number | null, timeLimitSec: number | null, now: number
): EffectivePhase;

/** Milisegundos restantes, nunca negativos. Solo para pintar el contador. */
export function remainingMs(
  openedAt: number, timeLimitSec: number, now: number
): number;
```

`canTransition` es el espejo en dominio de la tabla de transiciones de las reglas.
Duplicar la lógica es deliberado: el dominio la usa para no ofrecer acciones
imposibles, y las reglas la hacen cumplir. **La del dominio es conveniencia; la de las
reglas es la autoridad.** Un test debe verificar que ambas coinciden, porque una
divergencia silenciosa daría una UI que ofrece lo que el servidor rechaza.

`effectivePhase` devuelve `closed` cuando el almacenado es `open` pero el plazo ya
venció. **`closed` solo existe en este tipo**: no hay transición almacenada que lo
produzca ni que salga de él, y las reglas no lo conocen. Que los dos tipos estén
separados es lo que impide escribir por descuido `phase: 'closed'` en Firestore, donde
sería rechazado.

`remainingMs` toma `now` como argumento en lugar de leer el reloj. Así es pura y
testeable, y deja claro en el llamador que el reloj del cliente solo sirve para pintar.

## `aggregate.ts` — FR-041, FR-044, FR-078

```ts
export function distributionOf(
  answers: ReadonlyArray<{ optionIndex: number }>, optionCount: number
): number[];

export function correctPctOf(
  answers: ReadonlyArray<{ optionIndex: number }>, correctIndex: number
): number;
```

`distributionOf` cuenta sobre las respuestas recibidas, no sobre los participantes
presentes (FR-044). `correctPctOf` devuelve **0** con cero respuestas, nunca `NaN` ni
indefinido (FR-078). Es el caso borde de "nadie respondió una pregunta" y merece test
propio.

## `podium.ts` — FR-047, FR-048, FR-050

```ts
export function rankParticipants(
  scores: ReadonlyArray<ParticipantScore>
): RankedParticipant[];

export function topThree(ranked: ReadonlyArray<RankedParticipant>): RankedParticipant[];
```

`rankParticipants` ordena por `totalPoints` descendente y, ante empate, por
`totalElapsedMs` ascendente (FR-048). Si persiste el empate exacto, los empatados
**comparten `rank`** y el siguiente salta posiciones.

`topThree` devuelve menos de tres elementos si hay menos participantes (FR-050).

Casos que los tests deben cubrir: empate resuelto por tiempo; empate exacto que
comparte posición; cero, uno y dos participantes; todos con cero puntos.

## `nickname.ts` — FR-002, FR-003, FR-007, FR-008

```ts
export const ADJECTIVES: readonly string[];
export const ANIMALS: readonly string[];

/** El apodo vive partido, igual que en Firestore. */
export type Nickname = { adjective: string; animal: string };

/** Apodo aleatorio del catálogo. */
export function generateNickname(rng: () => number): Nickname;

/** ¿Pertenece al catálogo? Espejo exacto de la validación de las reglas. */
export function isGeneratable(n: Nickname): boolean;

/** Texto visible. Solo para pintar; nunca se almacena compuesto. */
export function displayNickname(n: Nickname): string;

/** Id del documento de reserva en `rounds/{r}/nicknames/{id}`. */
export function nicknameDocId(n: Nickname): string;   // `${adjective}_${animal}`
```

El espacio debe ser al menos dos órdenes de magnitud mayor que el aforo (FR-008): con
~50 participantes, al menos 5.000 combinaciones. Un test debe afirmar
`ADJECTIVES.length * ANIMALS.length >= 5000` para que el catálogo no se degrade al
editarlo. Con la unicidad ahora garantizada por el servidor, un catálogo holgado deja de
ser una defensa y pasa a ser lo que evita que la entrada entre en un bucle de reintentos
por colisión.

`generateNickname` recibe el generador aleatorio como argumento para ser pura y
determinista en los tests.

**El apodo nunca se almacena como una cadena compuesta.** Va partido en `adjective` y
`animal`, y así viaja a Firestore. La razón es que las reglas pueden entonces validar la
pertenencia al catálogo con dos comparaciones `in` sobre listas literales, sin analizar
cadenas. Eso es lo que hace que FR-006 y FR-054 sean garantías de reglas: no existe
ningún documento donde un participante pueda escribir texto arbitrario.

`isGeneratable` es el espejo en dominio de esa validación, y evita que la UI intente
escribir algo que el servidor va a rechazar. **La autoridad es la regla.**

`nicknameDocId` produce el identificador de la reserva de apodo. Es lo que hace cumplir
FR-007: la reserva es `create`-only, así que el segundo participante que intente el mismo
apodo choca contra un documento existente y su entrada completa se rechaza.

**Test obligatorio de sincronización de catálogo**: `ADJECTIVES` y `ANIMALS` están
duplicados en `firestore.rules` como listas literales. Un test debe leer el archivo de
reglas y afirmar que ambas copias coinciden elemento a elemento. Una divergencia
silenciosa rompería FR-054 o dejaría fuera entradas legítimas, y ninguna de las dos
cosas se notaría hasta estar frente a la sala.

## `quizFile.ts` — FR-067, FR-069, FR-070

```ts
export type ValidationError = { path: string; message: string };

export function parseQuizFile(
  raw: unknown
): { ok: true; quiz: ValidatedQuiz } | { ok: false; errors: ValidationError[] };

/** Parte el cuestionario validado en documento público y solución. FR-066, D3. */
export function splitForPublication(quiz: ValidatedQuiz): {
  meta: QuizMeta;
  questions: PublicQuestion[];
  solutions: Solution[];
};
```

`parseQuizFile` acumula **todos** los errores. Ver [quiz-file.md](./quiz-file.md) para
el formato y los mensajes.

`splitForPublication` es puro, así que un test puede afirmar directamente que ningún
elemento de `questions` contiene `correctIndex` ni `teachingNote`. Ese test es la
primera línea de FR-045 y FR-066; la segunda son las reglas.
