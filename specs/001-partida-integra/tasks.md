---

description: "Task list for feature 001: partida de quiz en vivo, íntegra y anónima"
---

# Tasks: Partida de quiz en vivo, íntegra y anónima

**Input**: Design documents from `specs/001-partida-integra/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: **OBLIGATORIOS, no opcionales.** El Principio IV de la constitución prohíbe modificar `firestore.rules` sin modificar sus tests, y el Flujo de Desarrollo fija tres quality gates: tipos sin errores, Vitest en verde y tests de reglas en verde contra el emulador. Los tests de reglas no son cobertura: son la única forma en que las garantías del spec existen.

**Organization**: Tareas agrupadas por historia de usuario, en el orden de prioridad del spec (P1 a P4).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1 a US4, según la historia del spec
- Rutas exactas en cada descripción

## Path Conventions

Proyecto único sin backend, según la decisión de estructura de plan.md: `src/domain/`,
`src/data/`, `src/ui/`, `tests/domain/`, `tests/rules/`, y `firestore.rules` en la raíz.

## Orden que no es negociable

Dentro de cada historia, **las reglas y sus tests van antes que la UI**. No es preferencia
de estilo: si una invariante acaba en el cliente porque la UI se escribió primero, el
Principio I queda violado y la revisión del diseño ya mostró que esas violaciones no se
ven hasta que alguien las busca a propósito.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialización del proyecto y del entorno de pruebas

- [ ] T001 Crear la estructura de directorios de plan.md: `src/domain/`, `src/data/`, `src/ui/player/`, `src/ui/presenter/`, `src/ui/shared/`, `tests/domain/`, `tests/rules/`
- [ ] T002 Inicializar proyecto Vite 5 + React 18 + TypeScript 5 con `package.json` y `vite.config.ts`
- [ ] T003 [P] Añadir Firebase JS SDK 10 y crear `src/data/firebase.ts` vacío con la firma de inicialización
- [ ] T004 [P] Crear `firebase.json` con Hosting y los emuladores de Firestore y Auth, y `firestore.indexes.json` vacío
- [ ] T005 [P] Configurar Vitest en `vitest.config.ts` con dos proyectos separados: `domain` (sin emulador, sin red) y `rules` (exige emulador)
- [ ] T006 [P] Configurar TypeScript en modo `strict` en `tsconfig.json`
- [ ] T007 [P] Configurar linting y formato en `eslint.config.js` y `.prettierrc`
- [ ] T008 Añadir en `package.json` los scripts que quickstart.md exige: `typecheck`, `test:domain`, `test:rules`, `dev`, `build`
- [ ] T009 Crear el arnés de `tests/rules/helpers.ts` con `@firebase/rules-unit-testing`: contextos para presentador autenticado, participante anónimo y sin autenticar
- [ ] T010 Dar de alta la cuenta del presentador en Firebase Auth (email/contraseña, creada a mano en la consola), obtener su `uid` y **resolver cómo se inyecta `PRESENTER_UID` en `firestore.rules`**: el mismo archivo se despliega al emulador y a producción, así que hay que decidir entre plantillar las reglas por entorno o fijar por convención el `uid` que usan los tests. Documentar la decisión en `quickstart.md`. **Bloquea T019 y toda la suite de reglas del presentador**: sin esto, `isPresenter()` no se puede probar contra nada

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura que TODA historia necesita, y el spike del que depende el modelo de datos

**⚠️ CRITICAL**: Ninguna historia puede empezar hasta que esta fase termine

### El spike va primero y es una compuerta

`research.md` declara la aritmética de plazos como **no confirmada**, y D1 depende de
ella. Si no se sostiene, el modelo de cierre cambia y cualquier UI escrita antes se tira.

- [ ] T011 SPIKE en `tests/rules/deadline.spec.ts`: demostrar contra el emulador que `request.time.toMillis() < resource.data.openedAt.toMillis() + resource.data.timeLimitSec * 1000` es expresión válida en reglas, que una respuesta dentro del plazo se acepta y que la misma con el plazo vencido se rechaza, **sin que ningún cliente escriba un cambio de fase entre ambas**
- [ ] T012 SPIKE en `tests/rules/server-time.spec.ts`: demostrar que `request.resource.data.submittedAt == request.time` acepta una escritura hecha con `serverTimestamp()` y rechaza un timestamp fabricado por el cliente
- [ ] T013 Registrar el resultado de T011 y T012 en la sección *Estado de verificación* de `specs/001-partida-integra/research.md`, moviendo lo confirmado al bloque de arriba. **Si alguno falla, detener e informar antes de seguir**: D1 cae y hay que replantear el cierre

### Dominio compartido

- [ ] T014 [P] Crear `src/domain/types.ts` con los tipos del modelo de datos: `Quiz`, `PublicQuestion`, `Solution`, `Round`, `Participant`, `Answer`, `QuestionResult`, `ParticipantScore`, `Podium`
- [ ] T015 [P] Implementar `src/domain/phases.ts`: `StoredPhase` (`lobby` \| `open` \| `revealed` \| `podium` \| `archived`, **sin `closed`**), `EffectivePhase` (añade `closed`), `canTransition()`, `effectivePhase()`, `remainingMs()` (FR-013, FR-014, FR-019, FR-023, FR-025)
- [ ] T016 [P] Implementar `src/domain/nickname.ts`: `ADJECTIVES`, `ANIMALS`, `generateNickname(rng)`, `isGeneratable()`, `displayNickname()`, `nicknameDocId()`. El apodo es `{adjective, animal}`, **nunca una cadena compuesta** (FR-002, FR-003, FR-007, FR-008)
- [ ] T017 [P] Test en `tests/domain/phases.test.ts`: cada transición de la tabla del contrato de reglas se acepta y toda otra combinación se rechaza; `effectivePhase()` devuelve `closed` cuando el almacenado es `open` y el plazo venció; `remainingMs()` nunca es negativo
- [ ] T018 [P] Test en `tests/domain/nickname.test.ts`: afirmar `ADJECTIVES.length * ANIMALS.length >= 5000` (FR-008 exige dos órdenes de magnitud sobre ~50 participantes), `generateNickname()` determinista con rng inyectado, `isGeneratable()` rechaza texto fuera del catálogo

### Reglas: esqueleto y cierre por defecto

- [ ] T019 Crear `firestore.rules` con los predicados del contrato —`isPresenter()`, `isAnon()`, `isOwner()`, `round()`, `withinDeadline()`, `inCatalog()`—, la constante literal `PRESENTER_UID`, las listas literales `ADJECTIVES` y `ANIMALS`, y el cierre `match /{document=**} { allow read, write: if false; }`
- [ ] T020 Test en `tests/rules/closed-by-default.spec.ts`: denegación 14, ninguna lectura ni escritura es posible sin autenticar, y ninguna ruta no declarada admite nada
- [ ] T021 Test en `tests/rules/catalog-sync.spec.ts`: leer `firestore.rules` y afirmar que sus listas `ADJECTIVES` y `ANIMALS` coinciden elemento a elemento con las de `src/domain/nickname.ts`. Una divergencia silenciosa rompería FR-054 o bloquearía entradas legítimas

### Infraestructura de datos

- [ ] T022 Implementar `src/data/firebase.ts`: inicialización y autenticación anónima con persistencia. **Sin App Check**: su amenaza —una persona fabrica identidades anónimas que entran legítimamente y ocupan el cupo— se acepta por baja probabilidad en una sesión presencial, **no la cierra el contador exacto de D4**. Lo que se difiere es su costo —tokens de depuración en el emulador y un proveedor sin decidir— fuera de la fase que bloquea todas las historias
- [ ] T023 [P] Implementar `src/data/mappers.ts`: traducción entre documentos de Firestore y los tipos de `src/domain/types.ts`, en ambos sentidos
- [ ] T024 Crear `scripts/seed-emulator.ts` que siembre un cuestionario de ejemplo partido en `questions/` y `solutions/`, para que US1 sea demostrable sin depender de US3 (FR-020)
- [ ] T025 Verificación mecánica del Principio III: añadir al script `test:domain` una comprobación de que `grep -r "firebase" src/domain/` no devuelve nada

**Checkpoint**: Spike resuelto, dominio compartido probado, reglas cerradas por defecto. Las historias pueden empezar.

---

## Phase 3: User Story 1 — Jugar una ronda completa sin poder hacer trampa (Priority: P1) 🎯 MVP

**Goal**: Una ronda funciona de extremo a extremo y un participante con acceso completo a su dispositivo no puede anticipar respuestas, alterar su puntaje, responder fuera de plazo, responder dos veces, ni conducir la partida.

**Independent Test**: Jugar una ronda con dos navegadores distintos sobre el cuestionario sembrado por T024, y ejecutar las cuatro escrituras de la consola del Escenario 1 de quickstart.md: las cuatro deben devolver `permission-denied`.

### Reglas y tests de reglas — antes de cualquier UI

- [ ] T026 [US1] Reglas de `quizzes/{q}`, `quizzes/{q}/questions/{n}` y `quizzes/{q}/solutions/{n}` en `firestore.rules`: lectura pública de las dos primeras, lectura **solo del presentador** de las soluciones, escritura solo del presentador, `delete` nunca, y `keys().hasOnly(['index','text','options','timeLimitSec'])` en el documento público
- [ ] T027 [P] [US1] Test en `tests/rules/quiz-read.spec.ts`: denegaciones 1, 10 y 11 —un participante no puede leer `solutions/{n}`, no puede crear un cuestionario, y no se puede escribir `correctIndex` ni `teachingNote` dentro de `questions/{n}`— más la autorización 8, el presentador sí lee `solutions`
- [ ] T028 [US1] Reglas de creación de ronda y del puntero `config/activeRound` en `firestore.rules`, atadas entre sí con `getAfter()`: crear una ronda activa exige que el puntero la señale, mover el puntero exige que la ronda quede activa, y si había ronda previa la transacción debe archivarla
- [ ] T029 [P] [US1] Test en `tests/rules/active-round.spec.ts`: denegaciones 23 y 24 —crear ronda sin mover el puntero, y crear ronda nueva sin archivar la anterior— más la autorización 11
- [ ] T030 [US1] Reglas de transición de fase sobre `rounds/{r}` en `firestore.rules` usando `diff().affectedKeys().hasOnly()`, con la tabla completa del contrato, la condición `currentIndex == resource.data.currentIndex + 1` en `revealed → open`, y `cualquier fase → archived`
- [ ] T031 [P] [US1] Test en `tests/rules/transitions.spec.ts`: denegaciones 8 y 12 —conducir sin ser el presentador, retroceder de fase o repetir índice— más la autorización 5, y el rechazo de la transición a la misma fase que es el doble clic
- [ ] T032 [US1] Reglas de la transacción de entrada en `firestore.rules`: `participants/{uid}`, `nicknames/{nick}` y el incremento de `participantCount`, con `getAfter(NK).data.uid == request.auth.uid` para la reserva propia y `!exists(P) && existsAfter(P)` en las otras dos
- [ ] T033 [P] [US1] Test en `tests/rules/join-deny.spec.ts`: denegaciones 15 a 22. **Por cada condición cruzada, dos tests**: el documento ausente y el documento ya presente de antes. La 20 —entrar con la reserva de otro— y la 21 —incrementar el contador ya estando dentro— son las que sobrevivieron al primer diseño
- [ ] T034 [P] [US1] Test en `tests/rules/join-allow.spec.ts`: autorizaciones 1 y 10 —una entrada completa se acepta, y dos participantes con apodos distintos entran de forma concurrente y ambos quedan contados—, más la 9, el presentador ajusta `maxParticipants` en curso (FR-012, SC-010)
- [ ] T035 [US1] Reglas de `rounds/{r}/answers/{uid}_{n}` en `firestore.rules` con las diez condiciones del contrato, y **sin `update` ni `delete`**, que es lo que hace cumplir FR-028 sin lógica adicional
- [ ] T036 [P] [US1] Test en `tests/rules/answer-deny.spec.ts`: denegaciones 4 a 7 —payload con campos de puntaje, respuesta tras el plazo, respuesta con la pregunta no abierta, segunda respuesta a la misma pregunta
- [ ] T037 [P] [US1] Test en `tests/rules/answer-allow.spec.ts`: autorización 2, y que `optionIndex` fuera de rango o de tipo no entero se rechaza
- [ ] T038 [US1] Reglas de `rounds/{r}/results/{n}`, `rounds/{r}/scores/{uid}` y `rounds/{r}/podium` en `firestore.rules`: agregados y podio de lectura pública, puntajes legibles solo por su dueño o el presentador, escritura de puntajes solo del presentador, `results` solo `create`
- [ ] T039 [P] [US1] Test en `tests/rules/score-deny.spec.ts`: denegaciones 2, 3, 9 y 13 —leer la respuesta y el puntaje de otro, escribir el propio puntaje, revelar dos veces la misma pregunta
- [ ] T040 [P] [US1] Test en `tests/rules/score-allow.spec.ts`: autorizaciones 3, 4, 6 y 7 —el participante lee lo suyo y los agregados, el presentador lee todas las respuestas de la pregunta y escribe agregados y puntajes

### Dominio de la historia

- [ ] T041 [P] [US1] Implementar `src/domain/scoring.ts`: `BASE_POINTS = 100`, `MAX_SPEED_BONUS = 100`, `pointsFor(correct, elapsedMs, timeLimitSec)` y `totalsFor(perQuestion, timeLimits)`
- [ ] T042 [P] [US1] Test en `tests/domain/scoring.test.ts`: respuesta instantánea da el bono completo; en el último instante da bono cero y **nunca negativo**; incorrecta da cero aunque sea instantánea; no respondida aporta cero puntos y **el tiempo límite completo** al desempate, porque FR-040 exige que abstenerse no favorezca (FR-037, FR-038, FR-039)
- [ ] T043 [P] [US1] Implementar `src/domain/aggregate.ts`: `distributionOf(answers, optionCount)` contando sobre respuestas recibidas y no sobre participantes presentes, y `correctPctOf(answers, correctIndex)`
- [ ] T044 [P] [US1] Test en `tests/domain/aggregate.test.ts`: con cero respuestas `correctPctOf` devuelve **0 y nunca `NaN`** (FR-078); con una sola respuesta la distribución la cuenta como 100% del total de respuestas (FR-044)
- [ ] T045 [P] [US1] Implementar `src/domain/podium.ts`: `rankParticipants()` ordenando por `totalPoints` descendente y, ante empate, por `totalElapsedMs` ascendente, con posición compartida si el empate persiste; y `topThree()`
- [ ] T046 [P] [US1] Test en `tests/domain/podium.test.ts`: empate resuelto por tiempo; empate exacto que comparte `rank` y hace saltar la siguiente posición; cero, uno y dos participantes; todos con cero puntos (FR-048)

### Capa de datos

- [ ] T047 [US1] Implementar `src/data/rounds.ts`: suscripción al documento de ronda, y las acciones de conducción como transacciones de compare-and-swap sobre `(fase origen, fase destino)`
- [ ] T048 [US1] Implementar en `src/data/rounds.ts` la publicación de ronda como **una transacción** que crea la ronda activa, mueve `config/activeRound` y archiva la anterior, con `maxParticipants` como parámetro de la ronda y valor por defecto holgado sobre los ~50 esperados (FR-009)
- [ ] T049 [US1] Implementar en `src/data/rounds.ts` el ajuste de `maxParticipants` sobre una **ronda en curso** (FR-012). Es la salida operativa del modelo de amenaza: el tope acota el volumen de datos, no impide que alguien ocupe el cupo indebidamente, y sin esta acción una sala mal llenada deja la sesión bloqueada sin remedio
- [ ] T050 [US1] Implementar en `src/data/rounds.ts` la entrada como **`runTransaction`, no `writeBatch`**: crea el participante, reserva el apodo e incrementa el contador, con reintento y retroceso exponencial ante colisión de apodo o conflicto de contador
- [ ] T051 [US1] **Medir la entrada en ráfaga** contra el emulador con un script en `scripts/measure-join-burst.ts`: 50 entradas simultáneas sobre la misma ronda, contando reintentos de transacción y tiempo del percentil 95 hasta quedar dentro. Cierra el riesgo abierto 2 de `research.md` y da el dato de SC-001, que exige menos de 15 segundos de abrir el enlace a estar dentro
- [ ] T052 [US1] Calibrar el retroceso exponencial de la entrada en `src/data/rounds.ts` con el resultado de T051, y registrar la medición en el riesgo abierto 2 de `research.md`. **Si el percentil 95 supera los 15 segundos**, detener e informar: la alternativa es hacer el contador aproximado y apoyarse solo en FR-012, y esa decisión se toma con la medición delante, como dice D4
- [ ] T053 [US1] Implementar `src/data/answers.ts`: envío de respuesta con `serverTimestamp()` en `submittedAt`, y lectura de las respuestas propias por consulta filtrada por `uid`
- [ ] T054 [US1] Implementar `src/data/scores.ts`: lectura del puntaje propio, y la escritura de calificación del presentador con **valores absolutos recalculados y nunca `increment()`**, para que recalificar produzca un documento idéntico (FR-018)
- [ ] T055 [US1] Implementar el flujo de calificación en `src/data/scores.ts`: al revelar, leer las respuestas de la pregunta y el documento de solución, calcular con `scoring.ts` y `aggregate.ts`, y escribir el agregado público más el puntaje de cada participante

### UI del participante

- [ ] T056 [P] [US1] Pantalla de entrada en `src/ui/player/Entrada.tsx`: apodo generado visible, botón para pedir otro apodo antes de entrar (FR-003), y entrada sin escribir dato alguno (FR-001)
- [ ] T057 [P] [US1] Manejo de sala llena en `src/ui/player/Entrada.tsx`: si el tope está alcanzado, avisar que la sala está llena y no dejar estado a medias (FR-010)
- [ ] T058 [P] [US1] Sala de espera en `src/ui/player/Espera.tsx` con el apodo propio a la vista
- [ ] T059 [US1] Pantalla de pregunta en `src/ui/player/Pregunta.tsx`: enunciado, opciones y tiempo restante visible calculado con `remainingMs()`, **sin que el reloj del cliente decida nada** (FR-026, FR-034)
- [ ] T060 [US1] Pantalla de fase cerrada en `src/ui/player/Cerrada.tsx`: espera con la opción elegida, o el aviso de que no alcanzó a responder, y **ningún dato del grupo** (FR-032, FR-033)
- [ ] T061 [US1] Pantalla de revelación en `src/ui/player/Revelacion.tsx`: distribución del grupo, opción correcta, y el veredicto y puntos propios (FR-041, FR-042, FR-043)
- [ ] T062 [US1] Pantalla de podio en `src/ui/player/Podio.tsx`: tres primeras posiciones, y la posición y puntaje propios como "lugar X de Y", degradando cuando hay menos de tres participantes (FR-047, FR-049, FR-050)

### UI del presentador, mínima para conducir

- [ ] T063 [US1] Panel de conducción en `src/ui/presenter/Conduccion.tsx`: abrir pregunta, revelar, avanzar y cerrar la partida, con los controles deshabilitados según `canTransition()` **como conveniencia, no como defensa**
- [ ] T064 [US1] Pantalla de publicación de ronda en `src/ui/presenter/PublicarRonda.tsx`: elegir un cuestionario ya publicado y fijar el tope de participantes (FR-021)
- [ ] T065 [US1] Control de ajuste del tope en `src/ui/presenter/Conduccion.tsx`: subir `maxParticipants` de la ronda en curso sin interrumpir la partida, mostrando cuántos hay dentro frente al tope vigente (FR-012)
- [ ] T066 [US1] Ruteo y distinción de superficies en `src/ui/shared/App.tsx`: participante o presentador según autenticación, no según artefacto de despliegue

**Checkpoint**: US1 completa. Una ronda se juega de extremo a extremo y las cuatro escrituras del Escenario 1 de quickstart.md devuelven `permission-denied`.

---

## Phase 4: User Story 2 — Conducir la sesión y cerrarla con un debrief útil (Priority: P2)

**Goal**: El presentador conduce con información suficiente y cierra con un debrief que dice qué reforzar.

**Independent Test**: Sobre los datos de la ronda ya jugada en US1, sin volver a jugarla: el panel muestra el conteo de respuestas, la nota pedagógica aparece al revelar y el debrief ordena las preguntas por menor acierto.

- [ ] T067 [US2] Conteo de respuestas en `src/ui/presenter/Conduccion.tsx`: cuántos han respondido la pregunta en curso, **sin mostrar quién respondió qué** (FR-058)
- [ ] T068 [US2] Nota pedagógica en `src/ui/presenter/Conduccion.tsx`: leída de `solutions/{n}` y visible para el presentador al revelar (FR-072)
- [ ] T069 [P] [US2] Test en `tests/rules/teaching-note.spec.ts`: la nota **nunca** es legible por un participante, ni antes ni después de la revelación, y no aparece en `results/{n}` (FR-046)
- [ ] T070 [US2] Debrief en `src/ui/presenter/Debrief.tsx`: preguntas ordenadas de menor a mayor porcentaje de acierto, reportando **cero y no indefinido** cuando nadie respondió (FR-071, FR-078, FR-073, FR-074, FR-075, FR-076)
- [ ] T071 [US2] Reproyección en `src/ui/presenter/Debrief.tsx`: volver a mostrar la revelación de cualquier pregunta ya revelada, en **solo lectura**, sin tocar `phase` ni `currentIndex` ni los puntajes (FR-024)
- [ ] T072 [US2] Lista de rondas pasadas en `src/ui/presenter/Rondas.tsx`: rondas ya jugadas, abriendo el debrief de **una a la vez** y sin ofrecer comparación entre rondas (FR-074, FR-075, FR-076)
- [ ] T073 [P] [US2] Test en `tests/rules/archived-round.spec.ts`: una ronda archivada respeta las mismas garantías que la ronda en vivo; `archived` no relaja ningún permiso (FR-077, FR-064, FR-065, FR-067)
- [ ] T074 [US2] Comprobación mecánica de FR-056 en `tests/domain/presenter-surface.test.ts`: afirmar que ningún módulo bajo `src/ui/presenter/` importa el lector de respuestas, que debe existir **solo** dentro del paso de calificación de `src/data/scores.ts`. FR-056 es el único requisito que ninguna regla puede proteger —el presentador sí está autorizado a leer las respuestas—, así que su garantía es estructural y debe fallar la build, no depender de que alguien mire (FR-067, FR-069, FR-070)

**Checkpoint**: US1 y US2 funcionan de forma independiente.

---

## Phase 5: User Story 3 — Publicar un quiz distinto sin intervención técnica (Priority: P3)

**Goal**: El presentador publica un cuestionario preparado fuera de la aplicación, sin recompilar ni desplegar, y sin exponer las respuestas correctas.

**Independent Test**: Publicar un cuestionario distinto al vigente y comprobar que queda disponible para publicar una ronda, en menos de 5 minutos y sin que intervenga ningún desarrollador; más verificar que las respuestas correctas no aparecen en nada de lo que la aplicación entrega a un participante. **No incluye jugar la ronda**, que es US1: si lo incluyera, US3 dejaría de ser independiente y no podría desarrollarse en paralelo.

- [ ] T075 [P] [US3] Implementar `src/domain/quizFile.ts`: `parseQuizFile(raw)` que **acumula todos los errores** en vez de detenerse en el primero, y devuelve `{path, message}` con ubicación
- [ ] T076 [P] [US3] Implementar las validaciones de `contracts/quiz-file.md` en `src/domain/quizFile.ts`: `title` string no vacío; `questions` array de al menos 1; `options` array de 2 a 6 strings no vacíos y sin repetidos; `correctIndex` entero con `0 <= correctIndex < options.length`; `teachingNote` requerida y no vacía; `timeLimitSec` entero entre 5 y 300 con 30 por defecto
- [ ] T077 [P] [US3] Implementar `splitForPublication()` en `src/domain/quizFile.ts`: parte el cuestionario validado en metadatos, preguntas públicas y soluciones, resolviendo `timeLimitSec` en el cliente para que el documento público lleve siempre valor explícito (FR-064, FR-066)
- [ ] T078 [P] [US3] Test en `tests/domain/quizFile.test.ts`: cada validación de T076 con su mensaje y ubicación; un archivo con dos errores distintos reporta **ambos**; y afirmar directamente que ningún elemento de `questions` devuelto por `splitForPublication()` contiene `correctIndex` ni `teachingNote` (FR-068, SC-004)
- [ ] T079 [US3] Implementar la publicación de cuestionario en `src/data/quizzes.ts`: escribir metadatos, preguntas y soluciones, **todo o nada**, sin dejar un cuestionario a medio publicar (FR-069)
- [ ] T080 [US3] Pantalla de publicación en `src/ui/presenter/PublicarQuiz.tsx`: subir el archivo, mostrar la lista completa de errores con su ubicación si falla, y publicar si es válido (FR-068)
- [ ] T081 [US3] Crear `docs/cuestionario-ejemplo.json` como plantilla para quien prepara contenido, con el formato de `contracts/quiz-file.md`

**Checkpoint**: Las tres historias funcionan de forma independiente.

---

## Phase 6: User Story 4 — Sobrevivir a una interrupción en vivo (Priority: P4)

**Goal**: Recargar, perder conexión o cerrar el navegador no pierde nada y no permite responder dos veces.

**Independent Test**: Recargar en cada una de las fases de la partida y verificar la tabla del Escenario 4 de quickstart.md; más desconectar al presentador al expirar el plazo.

- [ ] T082 [US4] Reconstrucción de estado en `src/ui/shared/App.tsx`: al cargar, cualquier cliente reconstruye su estado completo desde Firestore, sin leer nada de partida del almacenamiento local (FR-059, FR-062, SC-005)
- [ ] T083 [US4] Recuperación del participante en `src/ui/player/`: identidad y apodo desde la persistencia de Auth más `participants/{uid}`, y respuestas y puntaje **desde Firestore y no desde memoria** (FR-060, FR-004)
- [ ] T084 [US4] Implementar D9 en `src/data/answers.ts`: la confirmación de respuesta **espera al servidor** y se ignora el eco local de la persistencia offline. Mostrar "enviando" hasta la confirmación, y nunca "respondido" por una escritura que el servidor puede rechazar (FR-031)
- [ ] T085 [P] [US4] Test en `tests/domain/answer-state.test.ts`: el estado "respondida" se deriva de la existencia del documento en el servidor, nunca de un estado local optimista
- [ ] T086 [US4] Impedir responder de nuevo tras recarga en `src/ui/player/Pregunta.tsx`, derivándolo del documento de respuesta leído del servidor (FR-061)
- [ ] T087 [US4] Incorporación tardía en `src/ui/player/`: quien entra con la partida iniciada va a la fase vigente, con cero puntos en las preguntas ya cerradas (FR-063)
- [ ] T088 [US4] Recuperación del presentador en `src/ui/presenter/Conduccion.tsx`: retoma en la fase vigente sin alterar el estado de la partida
- [ ] T089 [P] [US4] Test en `tests/rules/idempotency.spec.ts`: ejecutar dos veces cada acción de conducción deja el mismo estado; el segundo `create` de `results/{n}` falla; y una recalificación produce un documento de puntaje idéntico (FR-018)
- [ ] T090 [P] [US4] Test en `tests/rules/presenter-offline.spec.ts`: con el plazo vencido y sin ninguna escritura de cambio de fase, una respuesta se rechaza. Es la prueba de D1 y de que la desconexión del presentador no congela la partida (FR-015)

**Checkpoint**: Las cuatro historias funcionan. La feature está completa.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T091 Verificar el Principio VI: `npm run build` y comprobar que `dist/` no contiene el texto de ninguna respuesta correcta ni nota pedagógica
- [ ] T092 Verificar FR-055 —que la vinculación apodo↔persona sea imposible incluso para quien administra el sistema— recorriendo el esquema de `data-model.md` y confirmando que **ningún documento admite un campo de texto libre** proveniente de un participante: el apodo va partido en `adjective` y `animal`, ambos acotados al catálogo por reglas (SC-008)
- [ ] T093 [P] Evaluar App Check con el proveedor reCAPTCHA v3, que es el gratuito en el plan Spark. Activarlo si la medición de T094 o una prueba en sala lo aconsejan, y **obligatoriamente si el uso deja de ser presencial** —sesiones remotas, enlace distribuido fuera de la sala, o participantes que no se ven entre sí—, porque ahí decae la baja probabilidad con la que D4 acepta la amenaza. Resolver los tokens de depuración para que no bloquee la suite de reglas en local
- [ ] T094 Medir el presupuesto real de SC-006 según el procedimiento de `specs/001-partida-integra/quickstart.md`: correr una ronda completa contra el emulador, contar lecturas y escrituras en su UI, extrapolar a 50 participantes y comparar con los límites diarios del plan Spark
- [ ] T095 Actualizar la estimación de D8 en `research.md` con la medición de T094, sustituyendo las cifras estimadas por las reales
- [ ] T096 **Medir la latencia de revelación** con un script en `scripts/measure-reveal-fanout.ts`: abrir 50 suscripciones simultáneas al documento de ronda contra el emulador, revelar una pregunta y medir el retardo hasta que la última recibe el agregado. SC-002 exige menos de 2 segundos y ninguna tarea lo verificaba
- [ ] T097 [P] Accesibilidad en `src/ui/shared/`: distinguir las opciones por **forma además de color**, como ya hacía el prototipo, para que la proyección en sala no dependa de la percepción del color
- [ ] T098 [P] Estados de error y vacío en `src/ui/`: pérdida de conexión, sala llena, ronda archivada y cuestionario sin publicar
- [ ] T099 Añadir al script `test:domain` una comprobación que falle si la columna *dónde vive* de la tabla de validaciones de `data-model.md` contiene la palabra "Cliente": una invariante que vive en el cliente es una violación del Principio I, y las tres que encontró la revisión del diseño no se vieron hasta buscarlas a propósito
- [ ] T100 Ejecutar los tres quality gates de la constitución en verde: `npm run typecheck`, `npm run test:domain`, `npm run test:rules`
- [ ] T101 Ejecutar los cuatro escenarios de `quickstart.md` de principio a fin, incluidas las verificaciones manuales de integridad de la consola (FR-053, SC-003, SC-007, SC-009)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. **T010 es compuerta dentro de la fase**: sin la cuenta del presentador y sin resolver la inyección de `PRESENTER_UID`, `firestore.rules` no se puede escribir ni probar
- **Foundational (Phase 2)**: depende de Setup. **BLOQUEA todas las historias.** Y dentro de ella, T011 a T013 bloquean el resto: el spike es una compuerta, no un trámite
- **US1 (Phase 3)**: depende de Foundational. Es el MVP
- **US2 (Phase 4)**: depende de US1, porque el debrief necesita una ronda jugada
- **US3 (Phase 5)**: depende de Foundational. **Independiente de US1** en ambos sentidos: T024 siembra un cuestionario para que US1 no necesite la publicación, y el Independent Test de US3 llega hasta dejar el cuestionario publicado, sin jugar la ronda
- **US4 (Phase 6)**: depende de US1, porque recupera el flujo que US1 construye
- **Polish (Phase 7)**: depende de las historias que se quieran entregar

### Dentro de cada historia

- **Reglas y sus tests antes que la UI.** No es estilo: es lo que impide que una invariante acabe en el cliente
- **T051 y T052 son la segunda compuerta.** Si la entrada en ráfaga no cabe en los 15 segundos de SC-001, la decisión de D4 sobre el contador exacto se revisa con la medición delante, y eso es más barato antes de construir la UI que después
- Dominio antes que capa de datos; capa de datos antes que UI
- Los tests de reglas de una ruta pueden escribirse en paralelo con los de otra ruta, pero después de la regla que prueban

### Parallel Opportunities

- Setup: T003 a T007 en paralelo
- Foundational: T014 a T018 en paralelo entre sí, pero todos después de T013
- US1: los tests de reglas de rutas distintas —T027, T029, T031, T033, T034, T036, T037, T039, T040— en paralelo una vez escrita su regla. Los módulos de dominio T041 a T046 en paralelo entre sí. Las pantallas independientes T056 a T058 en paralelo
- US3 puede desarrollarse **en paralelo con US1** por otra persona, porque no comparte archivos con ella salvo `src/data/`
- Las dos mediciones, T051 y T096, no son paralelizables entre sí con el resto: necesitan el emulador sin otra carga encima para que el dato valga

---

## Parallel Example: User Story 1

```bash
# Los módulos de dominio no comparten archivo ni dependencias entre sí:
Task: "Implementar src/domain/scoring.ts"
Task: "Implementar src/domain/aggregate.ts"
Task: "Implementar src/domain/podium.ts"
Task: "Test en tests/domain/scoring.test.ts"
Task: "Test en tests/domain/aggregate.test.ts"
Task: "Test en tests/domain/podium.test.ts"

# Los tests de reglas, una vez escritas las reglas de cada ruta:
Task: "Test en tests/rules/quiz-read.spec.ts"
Task: "Test en tests/rules/join-deny.spec.ts"
Task: "Test en tests/rules/answer-deny.spec.ts"
Task: "Test en tests/rules/score-deny.spec.ts"
```

---

## Implementation Strategy

### Dos compuertas, no una

Además del spike, **T051 mide la entrada en ráfaga** y T052 calibra con ese dato. Es la
compuerta de US1: el contador exacto de D4 concentra 50 escrituras en un documento que
Firestore sostiene a razón de una por segundo, y si el percentil 95 no cabe en los 15
segundos de SC-001 hay que decidir entre el contador aproximado y el tope exacto. Esa
decisión se toma con la medición delante, como dice D4, y no después de tener la UI
escrita.

### El spike antes que nada

T011 a T013 no son la primera tarea por orden, son una **compuerta**. Si la aritmética de
plazos no se puede expresar en reglas, D1 cae, el modelo de datos cambia y cualquier UI
escrita antes se tira. Detener e informar si falla, en lugar de improvisar un sustituto.

### MVP: solo US1

1. Phase 1: Setup
2. Phase 2: Foundational, empezando por el spike
3. Phase 3: US1
4. **PARAR Y VALIDAR**: jugar una ronda con dos navegadores y ejecutar las cuatro escrituras de la consola del Escenario 1 de quickstart.md
5. Demostrable en sesión real con el cuestionario sembrado por T024

### Entrega incremental

1. Setup + Foundational → base lista
2. US1 → validar → **MVP, ya se puede usar en una sesión**
3. US2 → el debrief hace la sesión útil para reforzar temas
4. US3 → el contenido se libera del ciclo de desarrollo
5. US4 → la sesión en vivo deja de ser frágil
6. Polish → medir el presupuesto y cerrar los gates

### Lo que no se puede aplazar a Polish

Las mediciones de SC-001 y SC-002 tampoco son polish del todo: T051 vive en US1 porque
su resultado puede cambiar el diseño, mientras que T096 sí puede esperar, porque medir la
latencia de revelación no cambia ninguna decisión, solo confirma o desmiente un número.

Las garantías de integridad y anonimato **no son polish**. Viven en las reglas de US1 y
sus tests son parte de esa historia. Una US1 sin sus 24 denegaciones en verde no es una
US1 incompleta: es el prototipo que esta feature existe para reemplazar.
