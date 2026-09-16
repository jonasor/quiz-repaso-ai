# Phase 0 — Research: Partida de quiz en vivo, íntegra y anónima

**Feature**: `001-partida-integra` | **Date**: 2026-09-16 | **Plan**: [plan.md](./plan.md)

El Technical Context del plan no tiene marcadores NEEDS CLARIFICATION: el stack está
fijado por la constitución. La investigación de esta fase se dirige a los cuatro
problemas donde la restricción de no tener backend choca con los requisitos de
integridad, y a confirmar que el presupuesto de 0 USD es alcanzable.

## Estado de verificación

Lo que sigue está **confirmado** contra la documentación de Firebase:

- `request.resource.data.keys().hasOnly([...])` acota el conjunto de campos admisibles en un `create`.
- `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])` acota qué campos puede modificar un `update`. Este patrón es la base de las transiciones de fase.
- `resource.data` es el documento almacenado y `request.resource.data` el estado futuro pendiente, lo que permite comparar entrante contra existente dentro de la regla.
- `getAfter()` y `existsAfter()` verifican el estado de otro documento **después** de que la operación atómica se aplique y antes de confirmarla, siempre que ambas escrituras vayan en la misma transacción o lote. Es lo que permite atar entre sí las tres escrituras de la entrada (D4).
- **`existsAfter(X)` es verdadero también cuando `X` ya existía.** No significa "creado en esta operación". Para eso hace falta la pareja `!exists(X) && existsAfter(X)`, porque `exists()` observa el estado previo. Ignorar esto produjo dos fugas que sobrevivieron al primer diseño de D4; ver el contrato de reglas.
- **Límites de acceso**: 10 llamadas `get()`/`exists()`/`getAfter()`/`existsAfter()` por petición de documento único o de consulta, y 20 por transacción o escritura por lotes, con el límite de 10 aplicando además a cada operación individual. Las llamadas repetidas al mismo documento se cachean y no consumen presupuesto.

Lo que sigue está **pendiente de confirmar contra el emulador**, y es la primera tarea
de implementación porque el modelo de cierre entero depende de ello:

- La aritmética de timestamps en reglas. El contrato la expresa con enteros en milisegundos, `request.time.toMillis() < openedAt.toMillis() + timeLimitSec * 1000`, precisamente para no depender de la suma `timestamp + duration`, que es lo que sigue sin confirmarse. El spike debe validar la forma en milisegundos; la de `duration` es opcional.
- Que `request.resource.data.submittedAt == request.time` sea la forma correcta de obligar a que un campo de tiempo provenga del servidor y no del cliente.

Si alguna de las dos no se sostiene, D1 cae y hay que replantear el cierre. Por eso
`tasks.md` debe empezar por un spike de reglas contra el emulador, antes de escribir
UI. No se asume nada de esto como cierto en el código hasta que un test en verde lo
demuestre, que es lo que exige el Principio IV.

## D1 — El cierre de una pregunta es aritmética de timestamps, no una acción

**Decision**: La ronda guarda `openedAt`, escrito con `serverTimestamp()` al abrir la
pregunta, y `timeLimitSec`, copiado de la pregunta. La regla que autoriza el `create`
de una respuesta compara `request.time` contra `openedAt + timeLimitSec`. Nadie
ejecuta el cierre: la pregunta deja de admitir respuestas por el paso del tiempo del
servidor.

**Rationale**: Resuelve tres requisitos con un solo mecanismo. FR-015 pide que el
instante de cierre sea dato fijado al abrir y no acción pendiente. FR-029 pide
rechazar respuestas tardías aunque el dispositivo afirme lo contrario. FR-034 pide que
la referencia temporal no la controle el participante. Además hace que la desconexión
del presentador no congele la partida, que fue la decisión registrada en Clarifications.

**Alternatives considered**:

- *Guardar `closesAt` calculado por el presentador*: viola FR-034, porque el instante lo fija el reloj de un dispositivo.
- *Cloud Functions con temporizador*: es la solución canónica y está excluida por el plan Spark, que la constitución fija como restricción.
- *Que el presentador cierre explícitamente*: descartado en Clarifications por dejar la partida a merced de su conexión.

## D2 — La calificación la escribe el presentador; las reglas acotan forma, no corrección

**Decision**: Al revelar, el cliente del presentador lee las respuestas de la pregunta,
lee el documento de soluciones, calcula veredicto y puntos con el módulo de dominio, y
escribe dos cosas: el agregado público de la pregunta y el documento de puntaje de cada
participante. Las reglas garantizan que solo el presentador escriba puntajes, que el
documento tenga exactamente los campos esperados y que ningún participante pueda
escribir en esas rutas.

**Rationale**: FR-035 y FR-036 exigen que el dispositivo del participante no participe
en la determinación del resultado. Sin backend, el único principal autenticado
disponible es el presentador, y FR-057 lo autoriza explícitamente a acceder a
respuestas individuales anónimas con ese fin.

**Alternatives considered**:

- *Que cada participante calcule y escriba su puntaje*: viola FR-035 y FR-036 de raíz, y es exactamente el defecto del prototipo que motiva la reescritura.
- *Que las reglas verifiquen el puntaje*: **descartado por presupuesto de accesos, no por incapacidad aritmética.** Las reglas sí tienen aritmética suficiente y `get()` sí alcanza documentos que el solicitante no puede leer, así que verificar un puntaje es expresable en principio. Lo que no cabe es el coste: la verificación necesita leer la respuesta *de cada participante*, que son documentos distintos y por tanto no se cachean. En el lote de revelación serían ~50 accesos contra un límite de 20. Escribir los puntajes de uno en uno sí cabría —10 accesos por operación—, pero convierte una escritura en cincuenta viajes de ida y vuelta y pone en riesgo los 2 s de SC-002. Y al avanzar la ronda, verificar el total acumulado exigiría leer todas las respuestas anteriores del participante, superando también el límite de 10 por operación. Queda registrado como la excepción al Principio I en Complexity Tracking, ahora con la razón correcta.

**Corolario que la implementación debe respetar**: el lote de revelación tiene que
mantenerse libre de `get()` sobre documentos distintos por operación. `get(round)` y
`get(solutions/{n})` son el mismo documento para las 50 escrituras y se cachean; una
regla que mirase un documento distinto por participante agotaría el presupuesto de 20 y
haría fallar el lote entero.

## D3 — Una pregunta, dos documentos: público y solución

**Decision**: Cada pregunta se guarda como dos documentos separados y planos:
`quizzes/{quizId}/questions/{n}` con enunciado, opciones y tiempo límite, de lectura
pública; y `quizzes/{quizId}/solutions/{n}` con la opción correcta y la nota
pedagógica, de lectura exclusiva del presentador.

**Rationale**: Es lo que convierte FR-045, FR-046 y FR-066 en garantías de reglas en
lugar de disciplina de código. Con documentos planos, la regla del documento público
puede exigir `keys().hasOnly(['index','text','options','timeLimitSec'])`, de modo que
una publicación que intentara colar `correctIndex` sería rechazada por el servidor.

**Alternatives considered**:

- *Un solo documento de cuestionario con un array de preguntas*: descartado. Las reglas no pueden inspeccionar el interior de un array de mapas, así que la ausencia de la respuesta correcta dentro de cada elemento no sería verificable. La garantía dependería del código de publicación, que es precisamente lo que el Principio I prohíbe.
- *Ofuscar la respuesta correcta en el documento público*: prohibido explícitamente por el Principio I. La ofuscación no cuenta como protección.

## D4 — La entrada es una transacción atada por `getAfter()`

**Decision**: La ronda guarda `maxParticipants` y `participantCount`. Entrar escribe
tres documentos en **una sola transacción**: el participante, la reserva de su apodo y
el incremento del contador. Las reglas atan las tres entre sí con `getAfter()` y
`existsAfter()`, de modo que ninguna puede ocurrir sin las otras dos. FR-012 da al
presentador la salida de ajustar el tope de una ronda en curso.

**App Check queda diferido, y su amenaza queda aceptada, no cerrada.** La distinción
importa, porque decir que el rediseño la absorbió invitaría al siguiente lector a no
mirar.

Lo que el contador exacto cerró es que **un** participante infle `participantCount` sin
entrar, o entre sin contarse. Lo que **no** cierra es que una sola persona cree muchas
identidades anónimas y cada una entre legítimamente: cada entrada crea su participante,
reserva su apodo y se cuenta, así que las reglas no tienen nada que objetar. El tope
pasa entonces de ser la protección a ser el techo del daño: con el cupo lleno de
identidades fabricadas, los participantes reales ven "sala llena". Y FR-012 no lo
remedia, porque ampliar el tope solo añade plazas que el mismo script puede ocupar.

Se acepta por **baja probabilidad en este contexto**, no por estar resuelto: sesión
interna de capacitación, presencial, en una sala donde el presentador ve a los
participantes. Un abuso así se detecta y se resuelve socialmente en el momento, que es
el mismo razonamiento con el que Clarifications descartó tratar el abuso en general.

El costo de App Check, en cambio, sí era concreto: tokens de depuración en el emulador y
un proveedor sin decidir, ambos dentro de la fase que bloquea todas las historias. Por
eso se mueve a Polish, con el proveedor gratuito del plan Spark. **Si el contexto de uso
cambia** —sesiones remotas, enlace distribuido fuera de la sala, o participantes que no
se ven entre sí— esta aceptación deja de sostenerse y App Check vuelve a ser necesario.

**Rationale**: FR-011 prohíbe reconocer dispositivos o personas, así que la única
barrera admisible es de cupo agregado. Pero un cupo solo sirve si el contador es fiel, y
`getAfter()` es precisamente el mecanismo que permite a una regla verificar el estado de
otro documento después de aplicarse la operación atómica.

**Este diseño se corrigió dos veces, y la segunda corrección es la que importa.** El
primer intento ató las escrituras con `existsAfter()` a secas, y eso no ata: la función
es verdadera también para un documento que ya existía. Quedaban dos fugas:

- Quien **ya había entrado** satisfacía `existsAfter(participante)` de forma trivial y podía repetir incrementos sueltos del contador hasta llenar el cupo. Es la misma fuga que esta decisión decía haber cerrado, con un requisito de entrada distinto.
- Quien eligiera un apodo **ya reservado por otro** pasaba `existsAfter(reserva)` sin crear nada, y entraba con el apodo de otro. FR-007 quedaba sin efecto **sin necesidad de atacante**: al mínimo de catálogo, 5.000 combinaciones, la colisión por azar con 50 participantes ronda el 22%, y como la regla no rechazaba nada el cliente no reintentaba.

Las cuatro fugas quedan cerradas con dos idiomas distintos:

- **"Nace en esta operación"** se expresa `!exists(X) && existsAfter(X)`. Ata el incremento del contador y la reserva del apodo al acto de entrar.
- **"Es mío"** se expresa verificando el contenido, `getAfter(reserva).data.uid == request.auth.uid`, que además subsume la existencia y ahorra una llamada.
- **"Me conté"** se expresa `getAfter(round).participantCount == get(round).participantCount + 1`.
- **"El apodo es único"** lo sostiene la reserva `create`-only, cuyo id es el apodo mismo.

**Transacción, no lote.** Un `writeBatch` es atómico pero no serializa contra otros
escritores: dos entradas simultáneas leerían el mismo contador y escribirían el mismo
valor, perdiendo una cuenta. `runTransaction` reintenta ante conflicto, y es lo que hace
exacto el contador. El tope deja de ser blando.

**Riesgo residual que no se disimula**: el contador concentra escrituras en un único
documento, y Firestore sostiene del orden de una escritura por segundo sobre un
documento. Cincuenta entradas en ráfaga producirán reintentos y pueden estirar SC-001.
Se mitiga abriendo la sala con antelación —los participantes entran a lo largo del
lobby, no en el mismo segundo— y reintentando con retroceso exponencial. Si aun así se
queda corto, la salida es hacer el contador aproximado a propósito y apoyarse solo en
FR-012, pero eso es una decisión que debe tomarse con una medición delante, no ahora.

**FR-022 también salió del cliente.** Una sola ronda activa era la última invariante que
dependía de que el cliente se acordara de archivar la anterior. Se resuelve con el mismo
patrón: un documento puntero `config/activeRound` cuya actualización va atada a la
creación de la ronda, y que obliga a archivar la previa en el mismo acto. Las reglas no
pueden consultar "¿hay otra ronda con `active == true`?", pero sí leer un documento.

**Alternatives considered**:

- *`existsAfter()` sin `!exists()`*: fue el primer arreglo, y dejaba abiertas dos de las cuatro fugas. Es la razón de que el contrato de reglas exija ahora **dos** tests de denegación por cada condición cruzada: uno con el documento ausente y otro con el documento ya presente.
- *Contador con `get()` sin `getAfter()`*: es el diseño original, y dejaba las cuatro fugas. Se descartó al revisar el plan.
- *Contador distribuido en shards*: reparte la contención pero impide comparar el total contra el tope dentro de una regla, que es justo lo que hace cumplir FR-010.
- *Admisión por el cliente del presentador*: exigiría que esté en línea para cada entrada y añade latencia contra SC-001.
- *Límite por dispositivo*: descartado en Clarifications por acercarse al reconocimiento de dispositivos que el Principio II prohíbe.

## D5 — Rutas de lectura que hacen FR-052 verificable por construcción

**Decision**: Las respuestas viven en documentos planos con identificador determinista
`rounds/{roundId}/answers/{uid}_{n}` y un campo `uid`. La regla de lectura exige
`resource.data.uid == request.auth.uid` o ser el presentador. Los puntajes viven en
`rounds/{roundId}/scores/{uid}` con la misma regla. El agregado por pregunta y el podio
son documentos aparte, de lectura pública, escritos por el presentador.

**Rationale**: El identificador determinista hace que FR-028, la imposibilidad de
responder dos veces, la garantice el propio almacenamiento: con `allow create` y sin
`update` ni `delete`, el segundo intento falla porque el documento ya existe. No hace
falta lógica adicional. Y como la regla de lectura se expresa sobre un campo del
documento, una consulta del participante filtrada por su propio `uid` es autorizable,
mientras que una consulta sin ese filtro es rechazada por el servidor.

**Alternatives considered**:

- *Respuestas anidadas bajo el participante*: la lectura del dueño sale gratis por ruta, pero el presentador necesitaría consultas de grupo de colección, cuyas reglas son más difíciles de acotar y de probar.
- *Un documento de respuestas por pregunta con un mapa de participantes*: haría imposible que un participante escriba su respuesta sin permiso de escritura sobre las de los demás.

## D6 — Idempotencia por compare-and-swap y por valores absolutos

**Decision**: Ninguna acción de conducción usa `increment()` sobre puntajes. Las
transiciones de fase se autorizan comparando el estado origen almacenado con el destino
entrante, usando `diff().affectedKeys().hasOnly()` para acotar qué campos cambia cada
transición. La calificación escribe totales recalculados desde cero.

**Rationale**: FR-018 pide que ejecutar dos veces una acción produzca el mismo estado.
Con compare-and-swap, el segundo clic de un doble clic ya no encuentra el estado origen
y se rechaza sin alterar nada, que es el mismo estado resultante. Con totales absolutos,
recalificar una pregunta produce un documento idéntico. `increment()` rompería ambas
cosas.

**Alternatives considered**:

- *Token de idempotencia por acción*: añade estado y complejidad para un problema que el compare-and-swap ya resuelve.
- *Deshabilitar el botón en la UI tras el clic*: es exactamente la defensa única en interfaz que el Principio I prohíbe.

## D7 — Frontera del dominio puro

**Decision**: `src/domain/` no importa `firebase/*`. Contiene puntuación, máquina de
fases, agregación, podio, apodos y validación del archivo. `src/data/` traduce entre
documentos y tipos del dominio y no contiene reglas de negocio.

**Rationale**: Principio III. Un cambio en la fórmula de puntuación o en el desempate
se prueba en milisegundos sin levantar el emulador. La verificación es mecánica: los
módulos de dominio no tienen ningún `import` de Firebase.

## D8 — El presupuesto de 0 USD es alcanzable, con una decisión de suscripción

**Decision**: Los participantes **no** se suscriben al listado de participantes. Solo
el presentador lo observa. Cada participante observa el documento de la ronda, el
agregado de la pregunta revelada y su propio documento de puntaje.

**Rationale**: Es la decisión que determina si el diseño entra en la cuota gratuita.
Con 50 participantes suscritos al roster de 50 documentos, el costo de lecturas se
multiplica por el cuadrado del aforo. Sin esa suscripción, una ronda de 10 preguntas
con 50 participantes se estima en el orden de 6.000 lecturas y 1.600 escrituras,
holgadamente dentro de los límites diarios del plan Spark, lo que deja margen para
varias rondas por día.

**Las lecturas de calificación crecen con el cuadrado del número de preguntas.**
Recalcular los totales desde cero en cada revelación (D6) obliga a leer todas las
respuestas de todas las preguntas anteriores: en la pregunta *n* son *n* × aforo
lecturas, y a lo largo de la ronda suman aproximadamente `preguntas² × aforo / 2`. Con
10 preguntas y 50 participantes son ~2.750; con las 20 preguntas del cuestionario del
prototipo, ~10.500. Sigue holgado frente al límite diario de Spark, pero el número
crece rápido y conviene medirlo antes de defender SC-006 con un cuestionario largo.

**Estas cifras son una estimación de diseño, no una medición.** El desglose asume 3
actualizaciones del documento de ronda por pregunta y una escritura de puntaje por
participante y pregunta, para una ronda de 10 preguntas. `quickstart.md` incluye el procedimiento para medirlo de
verdad en una ronda de prueba contra el emulador y contra la consola de uso, que es lo
que convierte SC-006 en verificable.

**Alternatives considered**:

- *Que cada participante observe el roster para ver la sala llenarse*: descartado por el costo cuadrático.
- *Consolidar los puntajes en un único documento público*: violaría FR-052, porque cada participante podría leer el puntaje de los demás.

## D9 — La confirmación de respuesta espera al servidor, no al eco local

**Decision**: El envío de una respuesta espera la confirmación del servidor antes de
declararla registrada. La persistencia offline de Firestore se **desactiva** para las
escrituras de respuesta, o se ignora su eco local: la UI no muestra "respondido" hasta
que la escritura está confirmada, y muestra un estado de "enviando" mientras no lo esté.

**Rationale**: Este es el requisito que casi se cuela. FR-031 exige una confirmación
*inequívoca* de que la respuesta quedó registrada o de que no quedó, y el caso borde
del spec es explícito: un participante pierde conexión justo al enviar y no sabe si
quedó. Con la persistencia offline por defecto, Firestore aplica la escritura
localmente y la UI la vería como exitosa aunque el servidor la vaya a rechazar —por
plazo vencido, por segunda respuesta o por payload inválido—. Eso es precisamente el
estado ambiguo que FR-031 prohíbe.

Peor aún: una escritura encolada offline se reintentaría al reconectar y llegaría con
`request.time` ya fuera de plazo, así que el participante vería "respondido" y el
servidor tendría cero respuestas suyas. La divergencia sería silenciosa.

**Consecuencia sobre la recuperación**: tras una recarga, el estado de "respondida" no
se lee de la memoria ni del almacenamiento local, sino del documento de respuesta en
Firestore (FR-060, FR-061). La fuente de verdad es el servidor, incluso para saber qué
respondí yo.

**Alternatives considered**:

- *Dejar la persistencia offline por defecto*: viola FR-031 por el estado ambiguo descrito, y contradice FR-062, porque el estado "respondido" viviría en el dispositivo.
- *Reintentar en segundo plano y avisar después*: convierte una ambigüedad momentánea en una contradicción diferida, que es peor en una sesión en vivo.

## Riesgos abiertos que pasan a tasks.md

1. **La aritmética de timestamps en reglas no está confirmada.** Es el primer spike, y de él depende D1.
2. **Contención de escritura sobre el contador de la ronda.** El tope dejó de ser blando al atar la entrada con `getAfter()` (D4), pero el contador concentra escrituras en un documento. Hay que medir la entrada en ráfaga contra el emulador y ajustar el retroceso exponencial.
3. **La corrección del puntaje no la verifica nadie más que el presentador.** Registrado en Complexity Tracking; es concesión sancionada por la constitución.
4. **Ocupación del cupo con identidades anónimas fabricadas.** Aceptada por baja probabilidad en una sesión presencial, no cerrada por el diseño (D4). Revisar si el uso deja de ser presencial.
5. **El alta del presentador y la inyección de `PRESENTER_UID`** no estaban resueltas. `firestore.rules` es un único artefacto que va al emulador y a producción, así que un literal obliga a que los tests usen el mismo `uid` que la cuenta real, o a plantillar las reglas por entorno. Es prerrequisito de toda la suite de reglas del presentador.
