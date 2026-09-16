# Phase 1 — Data Model: Partida de quiz en vivo, íntegra y anónima

**Feature**: `001-partida-integra` | **Date**: 2026-09-16 | **Plan**: [plan.md](./plan.md)

Todas las colecciones viven en Cloud Firestore. Los nombres de campo son los
definitivos: las reglas los enumeran con `hasOnly()`, así que renombrar un campo es un
cambio de contrato que obliga a tocar reglas y tests.

Regla transversal: **ningún documento admite un campo de texto libre proveniente de un
participante** (FR-006, FR-054). El apodo es la única cadena que un participante
escribe, y está acotada al espacio generable por el catálogo.

## Cuestionario: contenido reutilizable

### `quizzes/{quizId}`

| Campo | Tipo | Notas |
|---|---|---|
| `title` | string | Título del cuestionario |
| `questionCount` | number | Número de preguntas; variable (FR-020) |
| `publishedAt` | timestamp | `serverTimestamp()` |

Lectura pública. Escritura solo del presentador (FR-065).

### `quizzes/{quizId}/questions/{n}`

`n` es el índice de la pregunta, base 0, como identificador del documento.

| Campo | Tipo | Notas |
|---|---|---|
| `index` | number | Redundante con el id, para ordenar sin parsear |
| `text` | string | Enunciado |
| `options` | array\<string\> | Opciones en orden de presentación |
| `timeLimitSec` | number | 30 por defecto si el archivo no lo indica (FR-070) |

Lectura pública. **Regla acotada a exactamente estos cuatro campos.** Es la garantía de
FR-045 y FR-066: un intento de publicar la respuesta correcta dentro de este documento
es rechazado por el servidor, no por el código de publicación.

### `quizzes/{quizId}/solutions/{n}`

| Campo | Tipo | Notas |
|---|---|---|
| `correctIndex` | number | Índice de la opción correcta en `options` |
| `teachingNote` | string | Nota pedagógica (FR-072) |

**Lectura exclusiva del presentador.** Nunca se entrega al dispositivo de un
participante: la nota, en ningún momento (FR-046); la respuesta correcta, solo a través
del agregado que se publica al revelar (FR-042).

## Ronda: una ejecución concreta

### `rounds/{roundId}`

El documento que todos los clientes observan. Es la fuente de verdad de la fase
(FR-062) y lo que permite reconstruir el estado tras una recarga (FR-059).

| Campo | Tipo | Notas |
|---|---|---|
| `quizId` | string | Cuestionario que ejecuta |
| `questionCount` | number | Copiado del cuestionario al publicar la ronda |
| `phase` | string | `lobby` \| `open` \| `revealed` \| `podium` \| `archived`. **`closed` no es un valor almacenado**: es derivado |
| `currentIndex` | number | Pregunta en curso; `-1` en `lobby` |
| `openedAt` | timestamp \| null | `serverTimestamp()` al abrir. Base del cierre (D1) |
| `timeLimitSec` | number \| null | Copiado de la pregunta al abrirla |
| `maxParticipants` | number | Tope de la ronda, fijado al publicarla (FR-009); ajustable en curso (FR-012) |
| `participantCount` | number | Contador exacto; atado a la entrada por `getAfter()` (D4) |
| `active` | boolean | Solo una ronda con `true` a la vez (FR-022) |
| `startedAt` | timestamp | `serverTimestamp()` al publicar la ronda |
| `endedAt` | timestamp \| null | Al cerrar la partida |

Lectura pública: los participantes necesitan la fase, la pregunta en curso y el plazo.
Escritura solo del presentador (FR-016, FR-017).

**`openedAt` y `timeLimitSec` son públicos a propósito.** Saber cuándo cierra la
pregunta no da ninguna ventaja: el plazo lo hace cumplir la regla contra `request.time`,
no el cliente. Publicarlos es lo que permite al participante pintar el contador sin que
su reloj decida nada.

**`closed` es una fase derivada, nunca almacenada.** No existe escritura que la
produzca: la UI la calcula comparando el reloj contra `openedAt + timeLimitSec`, y las
reglas rechazan respuestas tardías por su cuenta. `phase` puede seguir diciendo `open`
con el plazo ya vencido, y eso es correcto, porque el dato autoritativo es el plazo y
no la etiqueta.

Esto es lo que hace FR-033 verdadero por construcción: al entrar en `closed` **no se
escribe nada**, así que es imposible que cruce al dispositivo del participante un dato
que no tuviera ya durante `open`. La transición almacenada va de `open` a `revealed`.

### Transiciones de fase

Estrictamente hacia adelante (FR-023). Cada flecha es una transición autorizada; toda
otra combinación se rechaza en reglas.

Fases **almacenadas** en `rounds/{roundId}.phase`:

```text
lobby ──open(0)──> open ──reveal──> revealed ──open(n+1)──> open
                                        │   si n+1 < questionCount
                                        │
                                        └──podium──> podium ──> archived
                                            si n+1 == questionCount
```

Fase **derivada**, que nunca se escribe:

```text
phase == 'open'  y  ahora >= openedAt + timeLimitSec   ──>   closed (efectiva)
```

Tres notas sobre el diagrama:

- **`open → closed` no existe como escritura.** No hay transición almacenada hacia `closed` ni desde `closed`: el presentador pasa de `open` a `revealed`, revele antes o después de que venza el plazo. El reveal anticipado (FR-019) y el reveal tras el vencimiento son la misma transición; lo único que cambia es si el plazo ya había cerrado la admisión de respuestas.
- **Reproyectar no es una transición** (FR-024). Es una vista de solo lectura sobre `rounds/{roundId}/results/{n}` ya escrito, y no toca `phase` ni `currentIndex`.
- **El dominio distingue los dos tipos.** `StoredPhase` es lo que vive en Firestore; `EffectivePhase` añade `closed` y la calcula `effectivePhase()`. Las reglas solo conocen `StoredPhase`.

### `rounds/{roundId}/participants/{uid}`

`uid` es el identificador anónimo de Firebase Auth. No es derivable a una persona
(FR-055).

| Campo | Tipo | Notas |
|---|---|---|
| `adjective` | string | Debe pertenecer al catálogo `ADJECTIVES` (FR-002, FR-006) |
| `animal` | string | Debe pertenecer al catálogo `ANIMALS` (FR-002, FR-006) |
| `joinedAt` | timestamp | Obligado a ser `request.time` |

**El apodo se guarda en dos campos, no como una cadena.** El apodo visible es
`adjective + ' ' + animal`, compuesto en la UI. Guardarlo partido permite que la regla
valide pertenencia al catálogo con dos comparaciones `in` sobre listas literales, sin
analizar cadenas dentro de las reglas. Es lo que convierte FR-054 —el apodo no puede
ser un canal para escribir un nombre real— en una garantía de reglas: no existe forma
de que un participante escriba texto arbitrario en ningún documento.

Creación por el propio participante, con `uid` del documento igual a `request.auth.uid`.
Lectura pública: el presentador necesita el roster y el podio necesita los apodos, y no
hay nada sensible que proteger porque no hay PII. **Los participantes no se suscriben a
esta colección** (D8), por costo, no por permisos.

Sin `update` ni `delete`: el apodo se elige antes de entrar (FR-003) y después es fijo.

### `rounds/{roundId}/nicknames/{adjective}_{animal}`

**Reserva de apodo. Es lo que hace cumplir FR-007 en el servidor.**

| Campo | Tipo | Notas |
|---|---|---|
| `uid` | string | Igual a `request.auth.uid` |

El identificador del documento es el apodo mismo. Con `allow create` y sin `update` ni
`delete`, **el segundo participante que intente el mismo apodo choca contra un documento
que ya existe y su entrada completa se rechaza.** Es el mismo mecanismo con el que D5
garantiza FR-028, aplicado a la unicidad del apodo.

**El campo `uid` no es decorativo: es lo que hace que la reserva bita.** La regla de
entrada no comprueba que la reserva *exista*, sino que **sea suya**:
`getAfter(nicknames/{id}).data.uid == request.auth.uid`. Comprobar solo la existencia
dejaba pasar al segundo participante que eligiera un apodo ya reservado —no creaba la
reserva porque ya estaba, y su entrada se aceptaba igual—, de modo que FR-007 quedaba sin
efecto. Y no hacía falta mala intención: con el catálogo en su mínimo de 5.000
combinaciones y 50 participantes, la colisión por azar ronda el 22%.

Antes, la unicidad la comprobaba el cliente antes de escribir. Eso la dejaba como
defensa única en la interfaz, que es exactamente lo que el Principio I prohíbe: dos
participantes que entraran a la vez, o uno que se saltara la comprobación, quedaban con
el mismo apodo sin que nada en el servidor lo impidiera.

**La entrada es una transacción de tres escrituras**: crear el participante, reservar el
apodo e incrementar el contador de la ronda. Las tres o ninguna. Ver la regla de entrada
en el contrato de reglas.

### `rounds/{roundId}/answers/{uid}_{n}`

Identificador determinista. **Esta es la pieza que garantiza FR-028 sin lógica
adicional**: con `allow create` y sin `update` ni `delete`, el segundo intento de
responder falla porque el documento ya existe.

| Campo | Tipo | Notas |
|---|---|---|
| `uid` | string | Igual a `request.auth.uid`; base de la regla de lectura |
| `questionIndex` | number | Igual a `n` del id |
| `optionIndex` | number | Opción elegida |
| `submittedAt` | timestamp | Obligado a ser `request.time` (FR-034) |

Lectura: el dueño o el presentador (FR-052, FR-057). Creación solo del dueño, dentro
del plazo, sobre la pregunta en curso, y con exactamente estos cuatro campos.

**No hay campo de puntaje ni de veredicto.** Que estos campos no existan en el esquema
es la forma de FR-036: no es que se ignoren, es que la regla rechaza el documento si
aparecen.

**No hay campo de antigüedad calculada.** La antigüedad se deriva restando `openedAt`
de la ronda a `submittedAt`, ambos del servidor.

### `rounds/{roundId}/results/{n}`

Agregado público que el presentador escribe al revelar. Es lo que hace visible la
respuesta correcta sin que nadie haya podido leerla antes (FR-042).

| Campo | Tipo | Notas |
|---|---|---|
| `questionIndex` | number | |
| `distribution` | array\<number\> | Conteo por opción, mismo orden que `options` (FR-041) |
| `answerCount` | number | Total de respuestas recibidas; denominador de la distribución (FR-044) |
| `correctIndex` | number | Se publica aquí, y solo aquí, al revelar |
| `correctPct` | number | 0 cuando `answerCount` es 0, nunca indefinido (FR-078) |
| `revealedAt` | timestamp | `serverTimestamp()` |

Solo `create`, nunca `update`: revelar dos veces por un doble clic falla en el segundo
intento y deja el mismo estado (FR-018).

**`teachingNote` no está aquí.** La nota se queda en `solutions/{n}`, que el
participante no puede leer, porque FR-046 la excluye de su dispositivo en todo momento.

### `rounds/{roundId}/scores/{uid}`

| Campo | Tipo | Notas |
|---|---|---|
| `uid` | string | Base de la regla de lectura |
| `adjective` | string | Copiado del participante, para que el podio no tenga que unir colecciones |
| `animal` | string | Ídem |
| `perQuestion` | array\<{`correct`: boolean, `points`: number, `elapsedMs`: number}\> | Un elemento por pregunta calificada |
| `totalPoints` | number | Recalculado desde `perQuestion` completo en cada calificación, nunca sumado sobre el anterior (FR-039) |
| `totalElapsedMs` | number | Con el tiempo límite completo imputado a las no respondidas (FR-040) |
| `correctCount` | number | |
| `rank` | number \| null | Posición final; se escribe al cerrar la partida (FR-049) |

Escritura exclusiva del presentador (FR-035). Lectura del dueño o del presentador
(FR-052). **Valores absolutos, nunca `increment()`** (D6).

### `rounds/{roundId}/podium/final`

Documento único, público, escrito al cerrar la partida. Firestore no admite un documento
en `rounds/{roundId}/podium`, que es una ruta de colección: el id `final` es obligatorio.

| Campo | Tipo | Notas |
|---|---|---|
| `top` | array\<{`rank`: number, `adjective`: string, `animal`: string, `totalPoints`: number, `correctCount`: number}\> | Las tres primeras **posiciones**, o menos si hay menos participantes (FR-050). Un empate en la tercera puede publicar más de tres entradas |
| `participantCount` | number | Denominador de "lugar X de Y" (FR-049) |
| `closedAt` | timestamp | |

El podio publica solo el top 3. La posición propia de cada participante va en su propio
documento de puntaje, no aquí, para no exponer el orden completo.

## `config/activeRound`

Documento único. Es lo que hace cumplir FR-022 en el servidor.

| Campo | Tipo | Notas |
|---|---|---|
| `roundId` | string | Identificador de la única ronda activa |

Lectura pública: cualquier cliente necesita saber a qué ronda entrar. Escritura solo del
presentador, y **atada a la creación de la ronda**: crear una ronda activa exige que el
puntero quede apuntándola, y mover el puntero exige que la ronda señalada quede activa.

Las reglas no pueden consultar "¿hay otro documento con `active == true`?". El puntero
convierte esa pregunta en una lectura de documento, que sí es expresable. Antes, la
unicidad de ronda activa dependía de que el cliente se acordara de archivar la anterior.

## Reglas de validación derivadas de los requisitos

| Validación | Dónde vive | Requisito |
|---|---|---|
| Apodo perteneciente al catálogo | Regla, `adjective in ADJECTIVES` y `animal in ANIMALS` | FR-006, FR-054 |
| Apodo no repetido en la ronda | Regla, id determinista en `nicknames/` más `create`-only | FR-007 |
| Respuesta dentro del plazo | Regla, `request.time` vs `openedAt + timeLimitSec` | FR-015, FR-029 |
| Respuesta sobre la pregunta en curso | Regla, `questionIndex == currentIndex` | FR-030 |
| Una sola respuesta por pregunta | Id determinista más `create`-only | FR-028 |
| Sin campos de puntaje en la respuesta | Regla, `keys().hasOnly()` | FR-036 |
| `submittedAt` proveniente del servidor | Regla, `== request.time` | FR-034 |
| Conducción solo del presentador | Regla, `request.auth.uid == PRESENTER_UID` | FR-016, FR-017 |
| Transición de fase legal | Regla, compare-and-swap sobre `phase` | FR-023 |
| Tope de participantes | Regla con `get()` + `getAfter()`, dentro de una transacción | FR-009, FR-010, D4 |
| Cuestionario público sin solución | Regla, `keys().hasOnly()` en `questions/{n}` | FR-045, FR-066 |
| Archivo de cuestionario bien formado | Dominio, antes de escribir | FR-069 |
| Una sola ronda activa | Regla, puntero `config/activeRound` atado con `getAfter()` | FR-022 |
| Reserva de apodo propia, no ajena | Regla, `getAfter(nicknames/{id}).data.uid == uid` | FR-007 |
| Incremento del contador solo al entrar | Regla, `!exists(P) && existsAfter(P)` | FR-009 |

**Ninguna fila dice "Cliente".** Es el criterio con el que esta tabla se revisa: una
validación cuya columna *dónde vive* nombre al cliente es una violación del Principio I,
y las tres últimas filas existen porque en revisiones anteriores sí lo decían.

## Entidades del spec y su representación

| Entidad del spec | Representación |
|---|---|
| Cuestionario | `quizzes/{quizId}` más sus subcolecciones |
| Pregunta | El par `questions/{n}` y `solutions/{n}`, deliberadamente partido |
| Ronda | `rounds/{roundId}` |
| Participante | `rounds/{roundId}/participants/{uid}`, más su reserva en `nicknames/` |
| Respuesta | `rounds/{roundId}/answers/{uid}_{n}` |
| Resultado de pregunta | `rounds/{roundId}/results/{n}` |
| Posición de podio | Elemento de `podium.top`, más `rank` en el puntaje propio |
| — (invariante, no entidad) | `config/activeRound`, puntero que sostiene FR-022 |
