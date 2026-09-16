# Constitución de Quiz de Repaso AI

Quiz en vivo y multijugador para las sesiones internas del programa de adopción
de AI de Azzule. Escala objetivo: ~50 jugadores simultáneos por partida.

## Core Principles

### I. Frontera de confianza en las reglas (NO NEGOCIABLE)

El navegador de un jugador NUNCA recibe la respuesta correcta antes de la
revelación, y NUNCA calcula su propio puntaje. Toda invariante del juego DEBE
hacerse cumplir en `firestore.rules`.

La interfaz PUEDE deshabilitar un botón por usabilidad, pero NUNCA es la única
defensa. Criterio de rechazo: si la única razón por la que una acción no se puede
ejecutar es que la UI no la ofrece, el diseño está mal y DEBE corregirse en las
reglas. La ofuscación —minificación, codificación, nombres confusos, respuestas
"escondidas" en el payload— NO cuenta como protección.

**Verificable como**: para cada invariante existe una petición construida a mano
contra el emulador que DEBE ser denegada por las reglas, sin intervención de la UI.

**Rationale**: el cliente es territorio del jugador. Cualquier dato que llegue al
navegador se considera público, y cualquier escritura que las reglas permitan se
considera posible. Un quiz cuya integridad depende de que nadie abra DevTools no
tiene integridad.

### II. Anonimato irreversible (NO NEGOCIABLE)

El sistema NO almacena la identidad real de un jugador y NO DEBE poder derivarla.
Autenticación anónima, apodos generados por el sistema, cero PII: sin nombres,
sin correos, sin identificadores corporativos, sin campos de texto libre que
puedan contenerlos.

Ningún resultado individual es legible por otro participante: las reglas DEBEN
denegar a todo participante la lectura de la respuesta y del puntaje de un `uid`
ajeno, en cualquier fase y también en rondas archivadas.

El presentador es la única excepción, y solo en lectura: su cliente autenticado
DEBE poder leer respuestas y puntajes individuales porque es la autoridad de
calificación (ver Restricciones Técnicas). Esa lectura está acotada de dos formas,
y ambas DEBEN sostenerse:

- **Por los datos**: ninguna respuesta ni puntaje contiene un atributo que remita
  a una persona real. Lo que el presentador lee es anónimo por construcción.
- **Por la interfaz**: ninguna vista del presentador DEBE mostrar resultados
  individuales. Ve agregados por pregunta y un podio de apodos. La lectura de
  respuestas ajenas DEBE existir en un único punto del código, el paso de
  calificación, y no exportarse.

La garantía frente al presentador es entonces la ausencia de PII y de vistas
individuales, no la confidencialidad de los datos: quien administra el sistema
puede leer respuestas anónimas, y NO DEBE poder vincularlas con una persona.

**Verificable como**: (1) tests de denegación explícitos para que un participante
lea la respuesta y el puntaje de otro `uid`, también en una ronda archivada;
(2) una comprobación mecánica que falle la build si alguna vista del presentador
importa Firebase directamente o si la lectura de respuestas ajenas aparece fuera
del paso de calificación; (3) ninguna ruta de lectura, consulta ni unión de
documentos produce el par (persona real, respuesta).

**Rationale**: el quiz refuerza aprendizaje, no evalúa personas. Sin backend,
alguien tiene que calificar, y el único principal autenticado disponible es el
presentador. Negar esa lectura en el papel no la elimina, solo la vuelve una
promesa falsa. Lo que hace imposible evaluar a una persona no es ocultarle al
presentador datos anónimos: es que esos datos no remitan a nadie y que ninguna
pantalla los muestre uno por uno.

### III. Dominio puro, aislado de Firebase

La lógica de juego —cálculo de puntaje, transiciones de fase, agregación de
resultados— DEBE vivir en módulos que no importan Firebase. Esos módulos se
prueban con Vitest sin emulador, sin red y sin credenciales.

La capa de datos SOLO traduce entre documentos de Firestore y los tipos del
dominio. No DEBE contener reglas de negocio.

**Verificable como**: los módulos de dominio no tienen ningún `import` de
`firebase/*`, y su suite de tests corre en milisegundos sin ningún proceso
externo levantado.

**Rationale**: una regla de puntaje que solo se puede probar arrancando el
emulador se prueba poco. El aislamiento convierte los cambios de reglas de juego
en ediciones baratas y reversibles.

### IV. Las reglas de seguridad son código probado (NO NEGOCIABLE)

`firestore.rules` NO se modifica sin tests en `@firebase/rules-unit-testing`
ejecutados contra el emulador. Cada denegación DEBE tener su test explícito de
"esto DEBE fallar". Como mínimo:

- Leer el documento de soluciones con credenciales de jugador.
- Escribir la respuesta de otro `uid`.
- Responder fuera de la fase válida.
- Responder después del cierre de la pregunta.
- Responder dos veces la misma pregunta.
- Incluir campos de puntaje en el payload de una respuesta.

Un PR que toca `firestore.rules` sin tocar sus tests DEBE ser rechazado en
revisión.

**Verificable como**: el diff de todo PR que modifica `firestore.rules` contiene
también cambios en el archivo de tests de reglas, y la suite pasa en verde contra
el emulador.

**Rationale**: las reglas son el único punto donde el Principio I se hace real.
Una regla sin test es una afirmación sin evidencia, y las reglas de Firestore
fallan de forma silenciosa: permiten de más sin avisar.

### V. Estado recuperable, acciones idempotentes

Firestore es la única fuente de verdad. Cualquier cliente —jugador o
presentador— DEBE poder recargar en cualquier momento y reconstruir su estado
completo a partir de lo que hay en Firestore. No DEBE existir estado de partida
que viva únicamente en memoria del navegador.

Toda acción del presentador DEBE ser idempotente: ejecutarla dos veces produce el
mismo resultado que ejecutarla una vez. Esto incluye abrir pregunta, cerrar
pregunta, revelar respuesta, calificar y avanzar de fase.

**Verificable como**: para cada acción del presentador existe un test que la
aplica dos veces y afirma que el estado resultante es idéntico. Recargar en
cualquier fase restituye la vista correcta.

**Rationale**: en vivo, frente a una sala, no hay oportunidad de depurar. Cerrar
el navegador a media partida DEBE ser una recarga, no una sesión perdida; un
doble clic nervioso DEBE ser inofensivo.

### VI. Contenido como dato, no como código

Las preguntas son un artefacto de datos versionado que se carga en tiempo de
ejecución. Las respuestas correctas NUNCA entran al bundle desplegado.

Crear o modificar un quiz NO DEBE requerir recompilar ni redesplegar la
aplicación.

**Verificable como**: una búsqueda del texto de cualquier respuesta correcta
sobre los archivos construidos en `dist/` no arroja coincidencias. Publicar un
quiz nuevo es una operación de datos, no un deploy.

**Rationale**: el ciclo de autoría de contenido debe pertenecer a quien facilita
la sesión, no al pipeline de build. Además, cualquier respuesta correcta incluida
en el bundle viola el Principio I en el momento en que el jugador carga la página.

## Restricciones Técnicas

**Stack fijo**: Vite + React + TypeScript. Firebase para Firestore, Auth y
Hosting. Vitest para dominio; Firebase Emulator Suite para reglas.

**Plan Spark gratuito**: sin Cloud Functions y sin backend propio. En
consecuencia, el navegador autenticado del presentador actúa como autoridad de
calificación. Esta es una concesión deliberada a la restricción de plataforma: el
presentador es el único principal con permiso de escritura sobre puntajes, y ese
permiso DEBE estar acotado por reglas, no por confianza en la aplicación.

**Autoridad temporal**: los cierres de pregunta y las ventanas de respuesta se
evalúan con `request.time` del servidor dentro de las reglas. El reloj del cliente
NUNCA es autoritativo para ninguna decisión del juego.

**Presupuesto operativo**: 0 USD. El diseño DEBE mantenerse dentro de la cuota
gratuita de Firebase para la escala objetivo de ~50 jugadores simultáneos. Los
patrones de lectura y escritura DEBEN evaluarse por su costo en operaciones antes
de adoptarse; los listeners por jugador son el riesgo principal.

## Flujo de Desarrollo

El trabajo sigue Spec Kit en orden: `/speckit-specify` → `/speckit-plan` →
`/speckit-tasks` → `/speckit-implement`. La especificación captura qué y por qué;
las decisiones técnicas pertenecen al plan.

**Quality gates antes de fusionar** — los tres DEBEN estar en verde:

1. Tipos sin errores.
2. Vitest en verde (suite de dominio).
3. Tests de reglas en verde contra el emulador.

El Firebase Emulator Suite es obligatorio en desarrollo local. Las reglas NUNCA
se prueban contra producción.

## Governance

Esta constitución tiene precedencia sobre cualquier otra práctica, convención o
preferencia del proyecto. Ante conflicto entre este documento y una decisión de
plan, spec o revisión, gana este documento.

**Cumplimiento**: toda revisión de PR DEBE verificar el cumplimiento de los
principios aplicables. Los principios marcados NO NEGOCIABLE (I, II y IV) no
admiten excepción, dispensa temporal ni deuda técnica planificada: un cambio que
los viole se rechaza, no se agenda. La complejidad añadida DEBE justificarse
contra el principio que la motiva.

**Enmiendas**: toda modificación a este documento requiere (a) la justificación
escrita del cambio, (b) el bump de versión correspondiente, y (c) la revisión de
los artefactos de Spec Kit vigentes que dependan del principio afectado.

**Versionado semántico** de esta constitución:

- **MAJOR**: eliminación o redefinición incompatible de un principio o de una
  regla de gobernanza.
- **MINOR**: adición de un principio o sección, o expansión material de una guía
  existente.
- **PATCH**: aclaraciones, redacción, correcciones no semánticas.

**Version**: 2.0.0 | **Ratified**: 2026-09-16 | **Last Amended**: 2026-09-16
