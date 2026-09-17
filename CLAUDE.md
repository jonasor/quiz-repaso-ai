# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Quiz en vivo y multijugador (~50 participantes) para las sesiones del programa de adopción de AI de Azzule. Es la reescritura seria de un prototipo de un solo `index.html` (visible en la historia de git antes de `97ae318`) sobre Vite + React + TypeScript + Firebase (Firestore, Auth anónima, Hosting), **sin backend**: plan Spark, sin Cloud Functions, presupuesto 0 USD.

Código, comentarios, specs y mensajes de UI están en español; conserva ese idioma.

## La constitución manda

`.specify/memory/constitution.md` tiene precedencia sobre cualquier otra convención. Los principios I, II y IV son NO NEGOCIABLES: un cambio que los viole se rechaza, no se agenda como deuda. En resumen:

- **I. Frontera de confianza en las reglas**: toda invariante del juego vive en `firestore.rules`. Deshabilitar un botón nunca es la defensa. El navegador del participante jamás recibe la respuesta correcta antes de revelar ni calcula su puntaje.
- **II. Anonimato irreversible**: auth anónima, apodos generados, cero PII, ningún campo de texto libre del participante. El presentador puede leer respuestas anónimas solo en el paso de calificación, y ninguna vista suya muestra resultados individuales.
- **III. Dominio puro**: `src/domain/` no importa Firebase.
- **IV. Reglas probadas**: no se toca `firestore.rules` sin tocar `tests/rules/`; cada denegación tiene su test de "esto DEBE fallar".
- **V. Estado recuperable e idempotente**: Firestore es la única fuente de verdad; recargar en cualquier fase reconstruye el estado; cada acción del presentador aplicada dos veces da el mismo resultado.
- **VI. Contenido como dato**: los cuestionarios se suben en tiempo de ejecución; ninguna solución entra a `dist/`.
- El reloj del cliente nunca decide: solo `request.time` en reglas y `serverTimestamp()` en escrituras.

## Comandos

Requiere Node 20+, Java 11+ y `firebase-tools` global. El emulador es obligatorio en local; las reglas nunca se prueban contra producción.

```bash
npm run emulators            # Firestore :8080, Auth :9099, UI :4000 (dejar corriendo)
npm run presenter:emulator   # crea presentador@quiz.test / presentador123 con el claim
npm run seed                 # cuestionario de ejemplo + ronda en lobby
npm run dev                  # participante: http://localhost:5173/  · presentador: /presentador
```

Quality gates antes de fusionar (los tres en verde):

```bash
npm run typecheck
npm run test:domain   # chequeo de pureza + check-invariants + vitest domain, sin emulador
npm run test:rules    # exige el emulador levantado
```

Otros: `npm run lint`, `npm run format`, `npm run verify:dist` (build + busca soluciones filtradas en `dist/`).

Un solo test: `npx vitest run --project domain tests/domain/scoring.test.ts` o `npx vitest run --project rules tests/rules/deadline.spec.ts -t "<nombre>"`.

**Trampa**: los tests de reglas llaman a `clearFirestore()` en cada `beforeEach` y vacían **todo** el emulador. Corre los tests primero y `npm run seed` después si vas a jugar a mano.

## Arquitectura

Tres capas con fronteras verificadas mecánicamente:

- `src/domain/` — puntaje, máquina de fases, agregación, podio, apodos, validación del archivo de cuestionario. Puro, probado en `tests/domain/`. ESLint y `scripts/check-domain-purity.mjs` fallan si importa Firebase.
- `src/data/` — única capa que conoce Firestore; solo traduce documentos ↔ tipos del dominio (`mappers.ts`) sin lógica de negocio.
- `src/ui/{player,presenter,shared}/` — React. **No importa `firebase/*`**: recibe `Identity` y funciones de `src/data/`. Un solo despliegue: `App.tsx` pinta la superficie del presentador en `/presentador` y la del participante en cualquier otra ruta; lo que cada quien puede hacer lo deciden auth y reglas, no la URL.

`tests/domain/presenter-surface.test.ts` hace cumplir el Principio II estructuralmente: la única consulta sobre `answers` vive en `src/data/scores.ts`, `readAnswersForQuestion` no se exporta, y `src/data/answers.ts` solo usa la respuesta propia y `getCountFromServer`. No rompas esas condiciones.

Decisiones de diseño que atraviesan varios archivos (detalle en `specs/001-partida-integra/`):

- **Cierre por aritmética, no por acción**: la ronda guarda la apertura (timestamp del servidor) y el límite de la pregunta; la regla de respuestas compara `request.time` contra esa suma. La fase "cerrada" es *efectiva* (derivada), no almacenada, así que la partida no se congela si el presentador se desconecta.
- **Pregunta partida en dos documentos**: `quizzes/{q}/questions/{n}` (público, campos fijados con `hasOnly`) y `quizzes/{q}/solutions/{n}` (respuesta + nota pedagógica, legible solo por el presentador).
- **Presentador = custom claim** `presenter: true` firmado por el Admin SDK (`scripts/grant-presenter.ts`), leído en reglas sin `get()`. Las reglas son idénticas en emulador y producción.
- **El presentador califica** (no hay backend): en la revelación lee respuestas, llama a `domain/grading` y escribe puntajes en lotes. Las reglas acotan quién y con qué forma escribe, pero no verifican el valor del puntaje; es la única excepción declarada al Principio I.
- **Transiciones como compare-and-swap**: `domain/phases.ts` refleja la tabla de transiciones de las reglas por conveniencia; las reglas son la autoridad. Puntajes como valores absolutos, nunca `increment()`.
- **Entrada atada con `existsAfter()`**: participante, reserva de apodo y contador se escriben en una transacción validada en reglas. `existsAfter()` solo no basta: usa `!exists(X) && existsAfter(X)` para "nace aquí", y escribe dos tests de denegación por cada condición cruzada (documento ausente y ya presente).
- Ronda activa única vía el puntero `config/activeRound`; publicar una ronda archiva la anterior.
- El catálogo de apodos existe duplicado en `src/domain/nickname.ts` y como listas literales en `firestore.rules`; `tests/rules/catalog-sync.spec.ts` verifica que coincidan. Cambia ambos.
- Suscripciones que deben mostrar escrituras propias necesitan `includeMetadataChanges`.
- Costo: los listeners por participante son el riesgo principal de cuota; los participantes deliberadamente no observan la lista de participantes. `scripts/measure-*.ts` miden ráfagas y fan-out.

`scripts/check-invariants.mjs` falla si la tabla de validaciones de `specs/001-partida-integra/data-model.md` tiene alguna fila cuya columna "dónde vive" diga "Cliente"; mantén esa tabla al día cuando agregues invariantes.

El formato del archivo de cuestionario está en `specs/001-partida-integra/contracts/quiz-file.md`, con ejemplo en `docs/cuestionario-ejemplo.json`.

Configuración de producción por variables `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`; en `DEV` (o con `VITE_USE_EMULATOR=true`) la app se conecta a los emuladores con el proyecto `demo-quiz-repaso`.

## Flujo de trabajo

Spec Kit en orden: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. Cada feature vive en `specs/NNN-nombre/` y en su propia rama del mismo nombre. Enmendar la constitución exige justificación escrita y bump de versión semántica.
