# Contract — `firestore.rules`

**Feature**: `001-partida-integra` | **Plan**: [../plan.md](../plan.md) | **Modelo**: [../data-model.md](../data-model.md)

Este es el contrato de seguridad de la feature. El Principio IV lo vincula a
`tests/rules/`: **un PR que modifique `firestore.rules` sin modificar sus tests se
rechaza.**

Dos principales: el **presentador**, autenticado con cuenta real y reconocido por su
`uid` en una constante de las reglas; y el **participante**, autenticado de forma
anónima. Un tercero sin autenticar no puede nada.

## Predicados auxiliares

| Predicado | Significado |
|---|---|
| `isPresenter()` | `request.auth != null && request.auth.uid == PRESENTER_UID` |
| `isAnon()` | `request.auth != null && request.auth.token.firebase.sign_in_provider == 'anonymous'` |
| `isOwner(uid)` | `request.auth != null && request.auth.uid == uid` |
| `round()` | `get(/databases/$(db)/documents/rounds/$(roundId)).data` |
| `withinDeadline()` | `request.time.toMillis() < round().openedAt.toMillis() + round().timeLimitSec * 1000` |
| `inCatalog(d)` | `d.adjective in ADJECTIVES && d.animal in ANIMALS` |

`PRESENTER_UID` se inyecta como constante literal en las reglas. Reconocer al
presentador por un documento de Firestore añadiría un `get()` a cada evaluación y un
documento que él mismo podría escribir.

`withinDeadline()` se expresa con **aritmética entera en milisegundos** y no con el
espacio de nombres `duration`. Es deliberado: `toMillis()` y la multiplicación son
operaciones elementales, mientras que la suma de un `timestamp` y un `duration` es la
expresión que sigue pendiente de confirmar contra el emulador. Si el spike demuestra que
la forma con `duration` también funciona, es indiferente cuál se use; mientras no lo
demuestre, ésta es la que no depende de lo no confirmado. Ver *Estado de verificación*
en [../research.md](../research.md).

`ADJECTIVES` y `ANIMALS` son **listas literales dentro de las reglas**, copia del
catálogo de `src/domain/nickname.ts`. Validar el apodo como dos campos, y no como una
cadena a analizar, es lo que permite expresar la pertenencia con dos `in` y sin
manipulación de cadenas dentro de las reglas. **Las dos copias del catálogo deben tener
un test que afirme que coinciden**: una divergencia silenciosa rompería FR-054 o
bloquearía entradas legítimas.

## Matriz de permisos

| Ruta | read | create | update | delete |
|---|---|---|---|---|
| `quizzes/{q}` | cualquiera autenticado | `isPresenter()` | `isPresenter()` | nunca |
| `quizzes/{q}/questions/{n}` | cualquiera autenticado | `isPresenter()` y campos exactos | `isPresenter()` y campos exactos | nunca |
| `quizzes/{q}/solutions/{n}` | **`isPresenter()`** | `isPresenter()` | `isPresenter()` | nunca |
| `config/activeRound` | cualquiera autenticado | `isPresenter()` atado a la creación de la ronda | `isPresenter()` atado a la creación de la ronda | nunca |
| `rounds/{r}` | cualquiera autenticado | `isPresenter()` y el puntero apunta aquí | `isPresenter()` con transición legal, **o** `isAnon()` solo para incrementar `participantCount` atado a su propia entrada | nunca |
| `rounds/{r}/participants/{uid}` | cualquiera autenticado | `isOwner(uid)` con validaciones de entrada | nunca | nunca |
| `rounds/{r}/nicknames/{nick}` | cualquiera autenticado | `isAnon()` atado a su propia entrada | **nunca** | **nunca** |
| `rounds/{r}/answers/{uid}_{n}` | `resource.data.uid == request.auth.uid` o `isPresenter()` | `isOwner()` con validaciones de respuesta | **nunca** | **nunca** |
| `rounds/{r}/results/{n}` | cualquiera autenticado | `isPresenter()` | **nunca** | nunca |
| `rounds/{r}/scores/{uid}` | `resource.data.uid == request.auth.uid` o `isPresenter()` | `isPresenter()` | `isPresenter()` | nunca |
| `rounds/{r}/podium` | cualquiera autenticado | `isPresenter()` | `isPresenter()` | nunca |
| cualquier otra ruta | nunca | nunca | nunca | nunca |

Cierre explícito al final: `match /{document=**} { allow read, write: if false; }`.

**`delete` nunca está permitido en ninguna ruta.** Retirar una ronda es una operación
de consola, no de la aplicación. Esto sostiene FR-073 y hace que ningún cliente pueda
destruir evidencia de una ronda jugada.

## Condiciones de creación de una respuesta

Las siete deben cumplirse. Cada una corresponde a un requisito y tiene su test.

```text
allow create on rounds/{r}/answers/{answerId} if
     isAnon()                                                    // participante anónimo
  && answerId == request.auth.uid + '_' + string(round().currentIndex)   // id determinista
  && request.resource.data.uid == request.auth.uid               // no escribe por otro    FR-052
  && request.resource.data.questionIndex == round().currentIndex  // pregunta en curso      FR-030
  && round().phase == 'open'                                     // fase válida            FR-030
  && withinDeadline()                                            // dentro del plazo       FR-029
  && request.resource.data.submittedAt == request.time           // tiempo del servidor    FR-034
  && request.resource.data.optionIndex is int
  && request.resource.data.optionIndex >= 0
  && request.resource.data.keys().hasOnly(
       ['uid','questionIndex','optionIndex','submittedAt'])       // sin puntaje ni veredicto  FR-036
```

La ausencia de `update` y `delete` cubre FR-028 y FR-027 sin condición adicional.

## Condiciones de transición de fase

Una transición es legal si el par (origen, destino) está en la tabla y los campos
afectados son exactamente los que esa transición toca. `diff().affectedKeys().hasOnly()`
es lo que impide que una transición legítima sirva de vehículo para cambiar otra cosa.

No existe `closed` entre los valores almacenados de `phase`: es una fase derivada del
plazo y nunca se escribe (ver el modelo de datos). Revelar antes o después del
vencimiento es la misma transición `open → revealed`.

| Origen | Destino | Campos que puede tocar | Requisito |
|---|---|---|---|
| `lobby` | `open` | `phase`, `currentIndex`, `openedAt`, `timeLimitSec` | FR-013 |
| `open` | `revealed` | `phase` | FR-014, FR-019 |
| `revealed` | `open` | `phase`, `currentIndex`, `openedAt`, `timeLimitSec` | FR-023 |
| `revealed` | `podium` | `phase`, `endedAt` | FR-047 |
| `podium` | `archived` | `phase`, `active` | FR-047 |
| cualquier fase | `archived` | `phase`, `active` | FR-022: publicar una ronda nueva archiva la anterior, esté donde esté |
| cualquiera | mismo valor | — | rechazada; es el doble clic (FR-018) |

Archivar desde cualquier fase no rompe FR-023: `archived` es terminal, así que sigue
siendo avance. Lo que no existe es ninguna transición **desde** `archived`.

Condiciones extra sobre `revealed → open`: `currentIndex` entrante debe ser
`resource.data.currentIndex + 1` y menor que `questionCount`. Eso hace imposible
retroceder o saltar preguntas (FR-023).

## La entrada es una transacción de tres escrituras

Entrar a una ronda escribe tres documentos **en una sola transacción**: el participante,
la reserva de su apodo y el incremento del contador. Las reglas atan las tres entre sí
con `getAfter()` y `existsAfter()`, que es lo que permite a una regla verificar el estado
de otro documento **después** de que la operación atómica se aplique, antes de
confirmarla.

```text
// Abreviaturas de este bloque, para que quepa a lo ancho:
//   P  = /databases/$(db)/documents/rounds/$(r)/participants/$(request.auth.uid)
//   NK = /databases/$(db)/documents/rounds/$(r)/nicknames/$(
//          request.resource.data.adjective + '_' + request.resource.data.animal)

allow create on rounds/{r}/participants/{uid} if
     isAnon() && isOwner(uid)
  && request.resource.data.keys().hasOnly(['adjective','animal','joinedAt'])
  && inCatalog(request.resource.data)                          // sin texto libre     FR-006, FR-054
  && request.resource.data.joinedAt == request.time
  && round().phase != 'archived'
  && round().participantCount < round().maxParticipants        // hay cupo            FR-010
  && getAfter(/databases/$(db)/documents/rounds/$(r)).data.participantCount
       == round().participantCount + 1                         // obliga a contarse   FR-009
  && getAfter(NK).data.uid == request.auth.uid                 // la reserva es MÍA   FR-007

allow create on rounds/{r}/nicknames/{nick} if
     isAnon()
  && request.resource.data.keys().hasOnly(['uid'])
  && request.resource.data.uid == request.auth.uid
  && !exists(P) && existsAfter(P)                              // solo al entrar      FR-007

allow update on rounds/{r} if                                  // el incremento
     isAnon()
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['participantCount'])
  && request.resource.data.participantCount == resource.data.participantCount + 1
  && resource.data.phase != 'archived'
  && !exists(P) && existsAfter(P)                              // solo al entrar      FR-009
```

**`existsAfter()` por sí solo no ata nada.** Es la trampa de este mecanismo y las tres
condiciones de arriba la esquivan de dos formas distintas:

- `existsAfter(X)` es verdadero también cuando `X` **ya existía** antes de la operación. Para expresar "este documento nace en esta transacción" hace falta la pareja `!exists(X) && existsAfter(X)`, porque `exists()` ve el estado previo y `existsAfter()` el posterior. Es lo que ata la reserva de apodo y el incremento del contador al acto de entrar, y no a cualquier momento posterior.
- Cuando lo que importa no es quién creó el documento sino **de quién es**, verificar el contenido es más corto y más barato que verificar la existencia: `getAfter(NK).data.uid == request.auth.uid` subsume `existsAfter(NK)` y además excluye la reserva de otro.

**Las cuatro fugas que cierran estas condiciones.** Las dos primeras venían de dejar la
unicidad y el conteo en el cliente; las dos últimas sobrevivieron a un primer arreglo que
usaba `existsAfter()` a secas, y se detectaron revisando el contrato:

- Entrar **sin contarse** dejaba el tope sin efecto. Lo cierra `getAfter(round).participantCount == round().participantCount + 1`.
- Tomar un apodo **ya tomado** era posible, porque la unicidad la comprobaba el cliente. Lo cierra la reserva `create`-only.
- Incrementar el contador **ya estando dentro**. Con `existsAfter(P)` a secas, quien ya había entrado cumplía la condición de forma trivial y podía repetir incrementos sueltos hasta llenar el cupo y dejar fuera a todos los demás, sin fabricar una sola identidad. App Check no lo habría impedido, porque es una instancia legítima de la aplicación. Lo cierra `!exists(P) && existsAfter(P)`.
- Entrar con **la reserva de otro**. Con `existsAfter(NK)` a secas bastaba con que el apodo estuviera reservado, sin importar por quién: el segundo participante que eligiera el mismo apodo no creaba la reserva —ya existía— y su entrada se aceptaba igual, así que compartían apodo y FR-007 quedaba sin efecto. **No requería mala intención**: al mínimo de catálogo que este contrato exige, 5.000 combinaciones, la probabilidad de colisión por azar con 50 participantes es de alrededor del 22%, y como la regla no rechazaba nada el cliente no recibía error ni reintentaba. Lo cierra `getAfter(NK).data.uid == request.auth.uid`.

**Presupuesto de accesos**: la transacción usa `get(round)`, `getAfter(round)`,
`getAfter(NK)`, y `exists(P)` más `existsAfter(P)` en dos de las tres operaciones. Son
del orden de siete llamadas sobre tres documentos distintos. El límite es de 20 por
transacción y 10 por operación individual, y las llamadas repetidas al mismo documento se
cachean sin contar. La entrada queda dentro, aunque con menos holgura que antes del
arreglo: conviene no añadir más condiciones cruzadas sin recontar.

**Debe ser una transacción, no un `writeBatch`.** Un batch es atómico pero no serializa
contra otros escritores: dos entradas simultáneas leerían el mismo `participantCount` y
escribirían el mismo valor, perdiendo una cuenta. Una transacción de Firestore reintenta
ante conflicto, y es lo que hace exacto el contador.

**Riesgo residual honesto**: el contador concentra escrituras en un solo documento, y
Firestore sostiene del orden de una escritura por segundo sobre un documento. Cincuenta
entradas en ráfaga van a producir reintentos. Se mitiga abriendo la sala con antelación y
reintentando con retroceso exponencial; queda como riesgo abierto en `research.md`.

## Publicar una ronda también es una transacción atada

FR-022 admite a lo sumo una ronda activa. Esa invariante era la última que quedaba en el
cliente, y se hace cumplir con el mismo patrón: un documento puntero único,
`config/activeRound`, cuya actualización va atada a la creación de la ronda.

```text
// A = /databases/$(db)/documents/config/activeRound

allow create on rounds/{r} if
     isPresenter()
  && request.resource.data.active == true
  && getAfter(A).data.roundId == r                       // el puntero apunta aquí     FR-022
  && ( !exists(A)                                        // no había ronda previa
       || getAfter(/databases/$(db)/documents/rounds/$(
            get(A).data.roundId)).data.active == false )  // la previa queda archivada  FR-022

allow create, update on config/activeRound if
     isPresenter()
  && request.resource.data.keys().hasOnly(['roundId'])
  && getAfter(/databases/$(db)/documents/rounds/$(
       request.resource.data.roundId)).data.active == true
```

Las dos reglas se apuntan mutuamente, así que ninguna de las dos escrituras vale por
separado: no se puede crear una ronda activa sin mover el puntero, ni mover el puntero a
una ronda que no queda activa. Y si ya había una ronda, la transacción está obligada a
archivarla en el mismo acto.

**Por qué un puntero y no una consulta.** Las reglas no pueden consultar "¿existe otro
documento con `active == true`?". Un puntero único convierte esa pregunta en una lectura
de documento, que sí es expresable. El coste es un documento más; el beneficio es que
FR-022 deja de depender de que el cliente se acuerde de archivar.

**Presupuesto de accesos**: `getAfter(A)`, `exists(A)`, `get(A)` y `getAfter(round previa)`
en la creación de la ronda, más `getAfter(round nueva)` en el puntero. `A` se repite y se
cachea. Queda dentro del límite de 20 por transacción.

## Catálogo de denegaciones de FR-053

Los siete intentos que el spec obliga a rechazar, cada uno con su test de "esto DEBE
fallar". Esta tabla es la especificación de `tests/rules/`.

| # | Intento | Requisito | Test |
|---|---|---|---|
| 1 | Leer `solutions/{n}` como participante | FR-051 | `deny: anon read solutions` |
| 2 | Leer `answers` de otro `uid` | FR-052 | `deny: anon read foreign answer` |
| 3 | Leer `scores` de otro `uid` | FR-052 | `deny: anon read foreign score` |
| 4 | Escribir `points` o `correct` en la propia respuesta | FR-036 | `deny: answer payload with score fields` |
| 5 | Responder con el plazo vencido | FR-029 | `deny: answer after deadline` |
| 6 | Responder una pregunta no abierta | FR-030 | `deny: answer when phase is lobby/revealed/podium` |
| 7 | Responder dos veces | FR-028 | `deny: second answer to same question` |
| 8 | Conducir la partida sin ser el presentador | FR-017 | `deny: anon phase transition` |
| 9 | Escribir en `scores` como participante | FR-035 | `deny: anon write own score` |
| 10 | Publicar un cuestionario como participante | FR-065 | `deny: anon create quiz` |
| 11 | Publicar `correctIndex` dentro de `questions/{n}` | FR-045, FR-066 | `deny: question doc with correctIndex` |
| 12 | Retroceder de fase o repetir índice | FR-023 | `deny: backward transition` |
| 13 | Revelar dos veces la misma pregunta | FR-018 | `deny: second create of results/{n}` |
| 14 | Leer cualquier cosa sin autenticar | — | `deny: unauthenticated read` |
| 15 | Tomar un apodo ya tomado en la ronda | FR-007 | `deny: duplicate nickname claim` |
| 16 | Entrar con un apodo fuera del catálogo | FR-006, FR-054 | `deny: nickname outside catalog` |
| 17 | Incrementar `participantCount` sin crear el propio participante | FR-009, FR-010 | `deny: counter increment without join` |
| 18 | Crear el propio participante sin incrementar `participantCount` | FR-009 | `deny: join without counter increment` |
| 19 | Entrar con el cupo lleno | FR-010 | `deny: join when round is full` |
| 20 | Entrar con un apodo reservado por otro participante | FR-007 | `deny: join with foreign nickname reservation` |
| 21 | Incrementar `participantCount` ya estando dentro de la ronda | FR-009, FR-010 | `deny: counter increment when already joined` |
| 22 | Reservar un apodo adicional ya estando dentro | FR-007 | `deny: extra nickname claim when already joined` |
| 23 | Crear una ronda activa sin mover el puntero de ronda activa | FR-022 | `deny: round create without activeRound pointer` |
| 24 | Crear una ronda nueva sin archivar la anterior | FR-022 | `deny: round create without archiving previous` |

El spec enumera siete; la tabla tiene veinticuatro porque varios de los siete se
descomponen en denegaciones independientes que merecen test propio.

Las diez últimas nacieron de dos revisiones sucesivas del diseño, y su procedencia
importa porque describe dos errores distintos:

- **15 a 19** cubren fugas que existían mientras la unicidad del apodo y el conteo dependían del cliente. Eran defensas únicamente en la interfaz, que es lo que el Principio I prohíbe.
- **20 a 22** cubren fugas que **sobrevivieron al primer arreglo**. Atar las escrituras con `existsAfter()` a secas no basta, porque también es verdadero para lo que ya existía; hacen falta `!exists() && existsAfter()` para "nace aquí", o verificar el contenido cuando lo que importa es de quién es. La 20 es la más importante de todas las de la tabla: no requería atacante, y con el catálogo en su mínimo se habría manifestado por azar en cerca de una sesión de cada cinco.
- **23 y 24** mueven a las reglas la última invariante que quedaba en el cliente, la de una sola ronda activa.

La lección operativa para `tests/rules/`: por cada condición cruzada que use
`existsAfter()`, escribir **dos** tests de denegación, no uno. El obvio, con el documento
ausente; y el que se olvida, con el documento ya presente de antes.

## Pruebas de autorización que DEBEN pasar

Un contrato de seguridad que solo deniega es inútil. Estas son las contrapartes:

| # | Acción permitida | Requisito |
|---|---|---|
| 1 | Participante entra: su documento, su reserva de apodo y el incremento del contador, en una transacción | FR-001, FR-007, FR-009 |
| 2 | Participante responde una vez, en fase `open`, dentro del plazo | FR-027 |
| 3 | Participante lee su propia respuesta y su propio puntaje | FR-060 |
| 4 | Participante lee el documento de la ronda y el agregado revelado | FR-041, FR-059 |
| 5 | Presentador abre, revela y avanza siguiendo la tabla de transiciones | FR-016 |
| 6 | Presentador lee todas las respuestas de la pregunta en curso | FR-057, FR-058 |
| 7 | Presentador escribe agregados y puntajes | FR-035 |
| 8 | Presentador lee `solutions` | FR-072 |
| 9 | Presentador ajusta `maxParticipants` en una ronda en curso | FR-012 |
| 10 | Dos participantes con apodos distintos entran de forma concurrente y ambos quedan contados | FR-007, FR-009 |
| 11 | El presentador publica una ronda nueva: se crea activa, el puntero la señala y la anterior queda archivada, todo en una transacción | FR-021, FR-022 |
