# Implementation Plan: Partida de quiz en vivo, íntegra y anónima

**Branch**: `001-partida-integra` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-partida-integra/spec.md`

## Summary

Reescritura del prototipo de un solo archivo como aplicación web sin backend, donde
la integridad del juego no depende de la interfaz sino de `firestore.rules`.

El eje técnico es que **el cierre de una pregunta deja de ser una acción y pasa a ser
aritmética de timestamps evaluada en las reglas**: la ronda guarda el instante de
apertura escrito por el servidor y el tiempo límite de la pregunta, y la regla de
escritura de respuestas compara `request.time` contra esa suma. Ningún dispositivo
tiene que ejecutar el cierre, lo que resuelve FR-015, FR-029 y FR-034 de una vez y
hace que la desconexión del presentador no congele la partida.

El segundo eje es la **separación física de las soluciones**: cada pregunta se guarda
en dos documentos distintos, uno público sin la respuesta correcta y uno privado con
la respuesta y la nota pedagógica, legible solo por el presentador. Al ser documentos
separados y planos, las reglas pueden verificar con `hasOnly()` qué campos admite el
documento público, de modo que FR-045, FR-046 y FR-066 quedan garantizados por reglas
y no por disciplina del código.

Sin Cloud Functions, el navegador autenticado del presentador califica. Verificar el
puntaje en reglas sería expresable, pero no cabe en el presupuesto de accesos de una
escritura por lotes, así que las reglas acotan *quién* escribe y *qué forma* tiene lo
escrito, no su corrección. Esa es la única invariante del juego que no vive en las
reglas, y está registrada en Complexity Tracking.

## Technical Context

**Language/Version**: TypeScript 5.x, ES2022

**Primary Dependencies**: React 18, Vite 8, Firebase JS SDK 12 (Firestore, Auth), Vitest 5. App Check queda **diferido** a Polish: su amenaza —ocupar el cupo con identidades anónimas fabricadas— se **acepta por baja probabilidad** en una sesión presencial, no queda cerrada por el diseño. Ver D4 en research.md.

**Desviación de versiones respecto a la redacción original del plan**, decidida al instalar: este apartado decía Vite 5 y Firebase SDK 10. La instalación de Firebase 10 arrastraba **10 vulnerabilidades en dependencias de producción**, una de severidad alta, todas dentro de `@firebase/firestore` y `@firebase/auth` —precisamente los paquetes de los que depende la seguridad de esta feature— y todas resueltas en Firebase 12. Vite y Vitest subieron por la misma razón y porque sus versiones actuales ofrecen la configuración de proyectos separados que el Principio III necesita. Estado tras la actualización: **0 vulnerabilidades en producción**; quedan 2 moderadas transitivas de `firebase-admin`, que es dependencia de desarrollo usada a mano una sola vez por `scripts/grant-presenter.ts`.

**Storage**: Cloud Firestore, plan Spark gratuito. Sin Cloud Functions y sin backend propio.

**Testing**: Vitest para el dominio puro, sin emulador ni red. `@firebase/rules-unit-testing` contra Firebase Emulator Suite para `firestore.rules`.

**Target Platform**: Navegadores modernos de teléfono y laptop. Firebase Hosting.

**Project Type**: Aplicación web de una sola página, sin backend. Dos superficies de UI —participante y presentador— en un mismo despliegue.

**Performance Goals**: Revelación visible en todos los dispositivos en menos de 2 s con 50 participantes (SC-002). Reconstrucción de estado tras recarga en menos de 10 s (SC-005). Entrada a la sala en menos de 15 s (SC-001).

**Constraints**: Presupuesto operativo 0 USD dentro de la cuota gratuita (SC-006). Autoridad temporal exclusivamente del servidor: `request.time` en reglas y `serverTimestamp()` en escrituras; el reloj del cliente nunca decide (FR-034). Cero PII en cualquier documento (FR-054, FR-055).

**Scale/Scope**: ~50 participantes simultáneos, una ronda activa a la vez, número de preguntas variable. 78 requisitos funcionales, 10 criterios de éxito.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Frontera de confianza en las reglas (NO NEGOCIABLE)

**Estado: PASA, con una excepción registrada.**

- La respuesta correcta y la nota pedagógica viven en `quizzes/{quizId}/solutions/{n}`, cuya regla de lectura exige ser el presentador. Nunca se entregan al dispositivo de un participante.
- El documento público `quizzes/{quizId}/questions/{n}` está acotado por `hasOnly(['index','text','options','timeLimitSec'])`, así que una publicación que intentara colar la solución sería rechazada por reglas.
- El cierre, la unicidad de respuesta, la inmutabilidad y la ausencia de campos de puntaje en el payload se hacen cumplir en reglas, no en la UI.
- La unicidad del apodo y la fidelidad del contador de participantes también se hacen cumplir en reglas: la entrada es una transacción de tres escrituras atadas entre sí con `getAfter()` y `existsAfter()`. Sin ese vínculo, un solo participante podía llenar la sala incrementando el contador sin entrar, y dos podían compartir apodo.
- **Excepción**: las reglas no verifican que el puntaje escrito por el presentador sea el correcto. No es que no puedan expresarlo, es que no cabe en el presupuesto de accesos del lote de revelación. Ver Complexity Tracking.

### II. Anonimato irreversible (NO NEGOCIABLE)

**Estado: PASA.**

- Autenticación anónima de Firebase. Ningún documento admite campos de texto libre provenientes del participante: las reglas fijan el conjunto exacto de campos de cada documento con `hasOnly()`.
- El apodo se almacena partido en dos campos, `adjective` y `animal`, y las reglas exigen que cada uno pertenezca a su catálogo mediante un `in` sobre listas literales. No queda ningún documento donde un participante pueda escribir texto libre, así que el apodo no puede servir de canal para un nombre real. Las dos copias del catálogo —dominio y reglas— llevan un test que afirma que coinciden.
- No existe ruta de lectura que produzca el par (persona real, respuesta), porque ningún documento contiene un atributo que remita a una persona. El `uid` anónimo no es derivable a una identidad ni por quien administra el proyecto.
- FR-057 queda satisfecho: el presentador accede a respuestas individuales anónimas solo para calificar.

### III. Dominio puro, aislado de Firebase

**Estado: PASA.**

- `src/domain/` no importa `firebase/*`. Contiene puntuación, transiciones de fase, agregación, podio, generación de apodos y validación del archivo de cuestionario.
- `src/data/` es la única capa que conoce Firestore y solo traduce entre documentos y tipos del dominio.
- La suite de dominio corre con Vitest sin emulador, sin red y sin credenciales.

### IV. Las reglas de seguridad son código probado (NO NEGOCIABLE)

**Estado: PASA.**

- `contracts/firestore-rules.md` fija la matriz de permisos por ruta y descompone el catálogo de FR-053 en 19 denegaciones, cada una con su test de "esto DEBE fallar", más 10 autorizaciones que también deben pasar.
- Ningún cambio en `firestore.rules` se admite sin cambio en `tests/rules/`.

### V. Estado recuperable, acciones idempotentes

**Estado: PASA.**

- Firestore es la única fuente de verdad; ningún estado de partida vive solo en memoria del navegador (FR-062).
- Las transiciones de fase se validan en reglas como compare-and-swap sobre el par (fase origen, fase destino), así que un doble clic no encuentra el estado origen y se rechaza sin alterar nada.
- Los puntajes se escriben como valores absolutos recalculados, nunca con `increment()`, de modo que recalificar produce exactamente el mismo documento.

### VI. Contenido como dato, no como código

**Estado: PASA.**

- Las preguntas se cargan en tiempo de ejecución desde Firestore. Publicar un cuestionario es subir un archivo desde una pantalla autenticada.
- Ninguna respuesta correcta entra al bundle: el repositorio no contiene cuestionarios, y `quickstart.md` incluye la verificación de que `dist/` no contiene el texto de ninguna solución.

## Constitution Check — re-evaluación posterior al diseño

*Ejecutada después de producir research.md, data-model.md y contracts/.*

| Principio | Antes del diseño | Después | Qué cambió |
|---|---|---|---|
| I. Frontera de confianza | PASA con excepción | **PASA con una excepción** | Dos revisiones sucesivas movieron a las reglas cuatro invariantes que estaban en el cliente —unicidad del apodo, propiedad de la reserva, fidelidad del contador y unicidad de ronda activa— con `getAfter()`, `existsAfter()` y un documento puntero. Queda una sola excepción registrada en Complexity Tracking: la corrección del puntaje |
| II. Anonimato irreversible | PASA | **PASA, reforzado** | El apodo se guarda partido en `adjective` y `animal`, cada uno validado contra su catálogo con un `in` sobre listas literales de las reglas. Así no existe ningún documento donde un participante pueda escribir texto arbitrario, y el apodo deja de ser un canal posible para un nombre real |
| III. Dominio puro | PASA | **PASA** | Verificación mecánica fijada en quickstart: `grep -r "firebase" src/domain/` debe salir vacío |
| IV. Reglas probadas | PASA | **PASA, ampliado** | El catálogo de FR-053 enumera 7 intentos; al escribir el contrato se descompusieron en 14 denegaciones, y dos revisiones sucesivas añadieron 10 más, hasta **24** denegaciones con test propio y 11 autorizaciones que también deben pasar |
| V. Estado recuperable, idempotente | PASA | **PASA** | Concretado: compare-and-swap con `diff().affectedKeys().hasOnly()` y prohibición de `increment()` en puntajes |
| VI. Contenido como dato | PASA | **PASA** | Concretado: la verificación de que `dist/` no contiene soluciones quedó como paso de quickstart |

Tres hallazgos que merecen constar:

1. **La separación de la pregunta en dos documentos no era cosmética.** Con un único documento de cuestionario y un array de preguntas, las reglas no pueden inspeccionar el interior del array, así que la ausencia de la respuesta correcta dependería del código de publicación. Partirla en `questions/{n}` y `solutions/{n}` es lo que mueve FR-045 y FR-066 del código a las reglas, y por tanto lo que hace que el Principio I se cumpla de verdad y no de palabra.

2. **El Principio I se cumple en todo salvo en la corrección del puntaje.** Las reglas acotan quién escribe, dónde y con qué campos. Verificar además el valor sería expresable, pero exigiría un acceso por participante dentro de un lote cuyo presupuesto es de 20. Es la frontera real de lo alcanzable sin backend, y está declarada, no disimulada.

3. **Lo que queda en el cliente hay que buscarlo a propósito.** La primera versión de este diseño dejaba la unicidad del apodo y el conteo de participantes en manos del cliente sin declararlo, y de ahí salía que un solo participante pudiera llenar la sala incrementando el contador sin llegar a entrar. La tabla de validaciones del modelo de datos ya no tiene ninguna fila que diga "Cliente", y ese es el criterio con el que se revisa: una validación cuya columna *dónde vive* nombre al cliente es una violación del Principio I esperando a ser descubierta.

4. **Atar escrituras con `existsAfter()` a secas no las ata.** El primer arreglo del punto anterior usó `existsAfter()` por sí solo, y dos fugas sobrevivieron, porque la función es verdadera también para un documento que **ya existía**: quien había entrado podía seguir incrementando el contador, y quien eligiera un apodo ya reservado entraba con el apodo de otro. La segunda fuga no requería atacante: al mínimo de catálogo se habría manifestado por azar en cerca de una sesión de cada cinco. Los idiomas correctos son `!exists(X) && existsAfter(X)` para "nace aquí" y la verificación del contenido para "es mío". De ahí sale una regla de prueba concreta: **por cada condición cruzada con `existsAfter()`, dos tests de denegación**, uno con el documento ausente y otro con el documento ya presente.

5. **La corrección más valiosa de este plan salió de releerlo, no de escribirlo.** Las cuatro fugas de la entrada y la de ronda activa eran invisibles en la primera redacción y en la segunda; aparecieron al revisar el contrato contra sí mismo. Conviene no tratar la revisión del diseño como un trámite antes de `/speckit-tasks`.

## Project Structure

### Documentation (this feature)

```text
specs/001-partida-integra/
├── plan.md              # Este archivo
├── research.md           # Fase 0
├── data-model.md         # Fase 1
├── quickstart.md         # Fase 1
├── contracts/            # Fase 1
│   ├── firestore-rules.md
│   ├── quiz-file.md
│   └── domain-modules.md
├── checklists/
│   └── requirements.md
└── tasks.md              # Fase 2, la produce /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/                  # Puro. Sin imports de firebase.
│   ├── scoring.ts           # FR-037, FR-038, FR-039, FR-040
│   ├── phases.ts            # FR-013, FR-014, FR-023: máquina de fases
│   ├── aggregate.ts         # FR-041, FR-044, FR-078: distribución y % de acierto
│   ├── podium.ts            # FR-047, FR-048, FR-050: orden y desempate
│   ├── nickname.ts          # FR-002, FR-007, FR-008: catálogo y generación
│   ├── quizFile.ts          # FR-067, FR-069, FR-070: validación del archivo
│   └── types.ts
├── data/                    # Única capa que conoce Firestore
│   ├── firebase.ts          # inicialización, Auth anónima
│   ├── rounds.ts            # lectura y conducción de la ronda
│   ├── answers.ts           # envío y lectura de respuestas
│   ├── scores.ts            # escritura de calificación por el presentador
│   ├── quizzes.ts           # publicación de cuestionarios y rondas
│   └── mappers.ts
├── ui/
│   ├── player/              # entrada, espera, pregunta, cerrada, revelación, podio
│   ├── presenter/           # conducción, publicación, debrief, rondas pasadas
│   └── shared/
└── main.tsx

firestore.rules              # Toda invariante del juego
firestore.indexes.json
firebase.json                # Hosting + emuladores

tests/
├── domain/                  # Vitest, sin emulador
└── rules/                   # @firebase/rules-unit-testing, exige emulador

scripts/                     # Herramientas de desarrollo, fuera del bundle
├── seed-emulator.ts         # Siembra un cuestionario para poder demostrar US1 sin US3
├── measure-join-burst.ts    # Riesgo abierto 2 y SC-001
└── measure-reveal-fanout.ts # SC-002

docs/
└── cuestionario-ejemplo.json  # Plantilla para quien prepara contenido
```

**Structure Decision**: Proyecto único, sin división frontend/backend, porque no hay
backend: el plan Spark excluye Cloud Functions y la autoridad de calificación es el
cliente del presentador. La separación que importa no es por despliegue sino por
pureza, y es la que impone el Principio III: `src/domain/` no importa Firebase y se
prueba en milisegundos; `src/data/` es el único punto de contacto con Firestore.
Las dos superficies de UI, participante y presentador, comparten despliegue y se
distinguen por autenticación, no por artefacto.

## Trazabilidad de requisitos sin artefacto propio

Una pasada de cobertura sobre los 78 requisitos encontró 11 que ningún artefacto de
diseño mencionaba. Tres eran huecos reales y están resueltos aquí; los demás quedaban
cubiertos por una decisión existente sin cita explícita.

| Requisito | Dónde se resuelve |
|---|---|
| FR-004 identidad y apodo entre recargas | La persistencia de Firebase Auth conserva el `uid` anónimo en el dispositivo; el apodo se relee de `participants/{uid}`. No se guarda nada de la partida en el almacenamiento local (FR-062) |
| FR-005 sin recuperación entre dispositivos | **No se implementa ningún mecanismo.** Es un requisito negativo: la persistencia de Auth es local al dispositivo y no hay forma de exportarla. Descartado el código de recuperación en Clarifications |
| FR-025 ritmo único marcado por el presentador | El documento de la ronda es el único origen de fase y pregunta en curso. No existe ruta de escritura que permita a un participante avanzar su propia fase |
| FR-026 enunciado, opciones y tiempo visible | `remainingMs()` en `phases.ts`, que recibe `now` como argumento para que el reloj del cliente solo pinte |
| **FR-031 confirmación inequívoca** | **Hueco real, resuelto en research.md D9**: se espera la confirmación del servidor y se ignora el eco local de la persistencia offline, que de otro modo mostraría como registrada una respuesta que el servidor va a rechazar |
| FR-043 veredicto y puntos propios | `scores/{uid}`, legible solo por su dueño y el presentador |
| FR-056 ninguna vista individual al presentador | Restricción sobre la UI del presentador: consume `results/{n}` y `podium`, y solo lee `answers` dentro del paso de calificación, sin renderizarlas |
| FR-063 entrada tardía con cero en cerradas | `totalsFor()` imputa cero puntos y el tiempo límite completo a toda pregunta sin respuesta, sin distinguir si el participante estaba presente |
| FR-068 archivo subido desde pantalla autenticada | Contrato en `contracts/quiz-file.md`; la autenticación la hace cumplir la regla de `quizzes` |
| FR-076 sin comparación entre rondas | Restricción sobre la UI: la lista de rondas abre una ronda a la vez y no ofrece vista comparativa |
| FR-077 rondas pasadas con las mismas garantías | Sale gratis: una ronda archivada usa las mismas rutas y por tanto las mismas reglas. `archived` no relaja ningún permiso |

**FR-031 era el hueco que importaba.** Sin D9, la implementación natural con la
persistencia offline de Firestore habría mostrado "respondido" a un participante cuya
escritura el servidor iba a rechazar, y la divergencia habría sido silenciosa. Ese es
exactamente el caso borde que el spec enumera y que la interfaz por defecto habría
incumplido.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| La corrección del puntaje no se hace cumplir en reglas, contra el Principio I | **Es una restricción de presupuesto de accesos, no de expresividad.** Las reglas sí tienen aritmética suficiente, y `get()` sí alcanza el documento de soluciones aunque el solicitante no pueda leerlo. Lo que no cabe es el coste: verificar exigiría un `get()` a la respuesta de cada participante —documentos distintos, que no se cachean— y el lote de revelación tiene un presupuesto de 20 accesos para ~50 escrituras. Las reglas acotan entonces quién escribe (solo el presentador), sobre qué documento y con qué campos exactos; la corrección del valor descansa en el supuesto declarado de que el presentador es de confianza (FR-057) | Cloud Functions calificando del lado del servidor es la solución correcta y está excluida por el plan Spark, que la constitución fija como restricción con presupuesto 0 USD. Escribir los puntajes de uno en uno sí cabría en el presupuesto (10 accesos por operación), pero convierte una escritura en cincuenta viajes y pone en riesgo SC-002; además, verificar el total acumulado al avanzar la ronda superaría también ese límite. Hacer que cada participante calcule y firme su puntaje viola FR-035 y FR-036 de raíz |
