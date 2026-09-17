# Quickstart — Validación de la partida íntegra y anónima

**Feature**: `001-partida-integra` | **Plan**: [plan.md](./plan.md)

Guía para levantar el entorno y **demostrar** que la feature cumple. No contiene
implementación: eso es `tasks.md`.

Los escenarios están ordenados de modo que cada uno se pueda correr sin haber
completado el siguiente, siguiendo las prioridades P1 a P4 del spec.

## Requisitos previos

- Node.js 20 o superior
- Java 21 o superior, que la Firebase Emulator Suite necesita (firebase-tools rechaza versiones anteriores)
- Firebase CLI: `npm install -g firebase-tools`

El emulador es **obligatorio** en local. Las reglas nunca se prueban contra producción,
según el Flujo de Desarrollo de la constitución.

## Puesta en marcha

```bash
npm install
firebase emulators:start --only firestore,auth    # dejar corriendo
npm run dev                                        # en otra terminal
```

### Cuenta de presentador en local

```bash
npm run emulators            # en una terminal aparte
npm run presenter:emulator   # presentador@quiz.test / presentador123, con el claim
npm run seed                 # cuestionario de ejemplo y una ronda en lobby
npm run dev                  # participante: http://localhost:5173/  ·  presentador: /presentador
```

## Quality gates

Los tres deben estar en verde antes de fusionar. Es lo que fija la constitución.

```bash
npm run typecheck      # 1. tipos sin errores
npm run test:domain    # 2. Vitest, sin emulador: debe correr en milisegundos
npm run test:rules     # 3. reglas contra el emulador
```

Si `test:domain` tarda en arrancar o falla sin el emulador levantado, el Principio III
está roto: algo en `src/domain/` importó Firebase.

```bash
grep -r "firebase" src/domain/ && echo "VIOLA EL PRINCIPIO III" || echo "dominio puro"
```

## Spike previo: confirmar la aritmética de plazos

**Correr esto antes de escribir UI.** Todo el modelo de cierre depende de que la
expresión del plazo sea válida en reglas; ver *Estado de verificación* en
[research.md](./research.md).

```bash
npm run test:rules -- -t "deadline arithmetic"
```

Debe demostrar dos cosas contra el emulador: que una respuesta dentro del plazo se
acepta, y que la misma respuesta con el plazo vencido se rechaza, **sin que ningún
cliente haya escrito un cambio de fase entre ambas**. Si no se puede expresar,
`research.md` D1 cae y hay que replantear el cierre antes de seguir.

## Advertencia: los tests de reglas vacían el emulador

`tests/rules/` llama a `clearFirestore()` en cada `beforeEach`, que **borra toda la base
del emulador**, no solo lo que el test escribió. Es lo correcto para aislar tests, pero
tiene una consecuencia práctica:

```bash
npm run seed        # siembra el cuestionario de ejemplo
npm run test:rules  # ...y esto lo borra
npm run seed        # hay que volver a sembrar antes de jugar a mano
```

El orden que funciona es **primero los tests, después la siembra**. Si al abrir la
aplicación la sala aparece sin cuestionario, es casi siempre esto.

## Escenario 1 — Ronda completa sin poder hacer trampa (P1)

Necesita dos navegadores además del presentador: uno en modo normal y otro en ventana
privada, para obtener dos identidades anónimas distintas.

1. Como presentador, publica el cuestionario de ejemplo y luego publica una ronda.
2. En los otros dos navegadores, abre el enlace de participante. Cada uno recibe un apodo generado, **sin escribir nada** (SC-001).
3. Abre la primera pregunta. Ambos participantes la ven con su contador.
4. Uno responde pronto, el otro tarde. Revela.
5. Verifica: ambos ven la distribución, la opción correcta y su propio veredicto con sus puntos, y quien respondió antes obtuvo más.

**Verificación de integridad, que es el punto de la feature.** Con una pregunta abierta,
en la consola del navegador de un participante:

```js
// DEBE fallar: la solución no es legible por un participante
await getDoc(doc(db, 'quizzes', QUIZ_ID, 'solutions', '0'));

// DEBE fallar: no se puede escribir puntaje ni veredicto
await setDoc(doc(db, 'rounds', ROUND_ID, 'answers', `${uid}_0`),
  { uid, questionIndex: 0, optionIndex: 1, submittedAt: serverTimestamp(), points: 999 });

// DEBE fallar: no se puede leer la respuesta de otro participante
await getDoc(doc(db, 'rounds', ROUND_ID, 'answers', `${OTRO_UID}_0`));

// DEBE fallar: conducir la partida sin ser el presentador
await updateDoc(doc(db, 'rounds', ROUND_ID), { phase: 'revealed' });
```

Las cuatro deben devolver `permission-denied`. Es SC-003 y SC-007 hechos a mano; los
catorce casos completos viven en `tests/rules/`.

**Verificación de que la solución no viaja** (FR-051): con la pregunta abierta, inspecciona
la pestaña de red y el almacenamiento del participante. En nada de lo recibido debe
aparecer `correctIndex` ni el texto de la nota pedagógica.

## Escenario 2 — Conducir y cerrar con debrief (P2)

Sobre los datos de la ronda del escenario 1, sin volver a jugarla.

1. Con una pregunta abierta, el panel del presentador muestra **cuántos** respondieron, sin decir quién respondió qué (FR-058).
2. Al revelar, el presentador tiene a la vista la nota pedagógica (FR-072). En la pantalla del participante esa nota **no aparece en ningún momento** (FR-046).
3. Al cerrar la partida, el debrief lista las preguntas de menor a mayor porcentaje de acierto (FR-071).
4. Publica una segunda ronda y comprueba que la anterior quedó archivada y sigue consultable desde la lista de rondas (FR-022, FR-074, FR-075).

## Escenario 3 — Publicar un cuestionario distinto (P3)

1. Copia el archivo de ejemplo, cámbiale el título y el número de preguntas.
2. Introduce un error a propósito: pon `correctIndex: 9` en una pregunta de 4 opciones y borra una `teachingNote`.
3. Súbelo. Debe rechazarse mostrando **ambos** errores con su ubicación, y no debe quedar nada escrito (FR-069).
4. Corrígelo y súbelo. Debe publicarse y quedar listo para una ronda, en menos de 5 minutos y sin tocar código (SC-004).

**Verificación de que la solución no entra al bundle** (FR-066, Principio VI):

```bash
npm run build
grep -ri "$(alguna respuesta correcta del cuestionario)" dist/ && echo "FALLA SC-007" || echo "bundle limpio"
```

## Escenario 4 — Sobrevivir a una interrupción (P4)

Recarga en **cada** fase y verifica que el cliente vuelve al estado correcto en menos de
10 segundos (SC-005).

| Recarga en | Debe ocurrir |
|---|---|
| Sala de espera | Mismo apodo, sigue dentro (FR-060) |
| Pregunta abierta, sin responder | Puede responder, con el contador correcto |
| Pregunta abierta, ya respondida | Su opción a la vista, **no puede responder otra vez** (FR-061) |
| Pregunta cerrada | Espera con su elección, sin datos del grupo (FR-032, FR-033) |
| Revelación | Distribución, correcta y su propio resultado |
| Podio | Su posición y su puntaje |

**Desconexión del presentador**, que es la prueba de D1:

1. Abre una pregunta con 30 segundos.
2. Cierra el navegador del presentador.
3. Espera a que el plazo venza y haz que un participante intente responder: **debe fallar**, aunque nadie haya ejecutado el cierre (FR-015).
4. Vuelve a abrir el navegador del presentador: retoma en la fase vigente y puede revelar.

**Doble clic del presentador** (FR-018): haz doble clic en revelar. El segundo intento
debe fallar sin alterar nada, y los puntajes deben quedar idénticos.

## Medición del presupuesto (SC-006)

Las cifras de D8 en `research.md` son **estimación de diseño, no medición**. Para
convertir SC-006 en verificable:

1. Corre una ronda completa contra el emulador con el número de preguntas previsto.
2. Cuenta lecturas y escrituras reales desde la UI del emulador.
3. Extrapola a 50 participantes y compara contra los límites diarios del plan Spark.

Si la medición se aparta mucho de la estimación, revisa primero qué está suscrito a qué:
la decisión de D8 de que los participantes **no** observen el listado de participantes
es la que domina el costo, porque de lo contrario crece con el cuadrado del aforo.

## Resultado de T102 (2026-09-16)

Los cuatro escenarios se ejecutaron en Chrome contra el emulador, con un presentador y tres
participantes reales. Para tener identidades distintas en un mismo navegador, cada uno
usó un origen distinto (`127.0.0.1:5173/presentador`, `localhost:5173`, `localhost:5174`,
`127.0.0.1:5174`): las pestañas del mismo origen comparten la sesión de Firebase.

| Escenario | Verificado |
|---|---|
| 1 | Entrada sin escribir nada; "otro apodo"; pregunta con contador; "respuesta registrada" solo con confirmación; quien respondió antes obtuvo más (145 frente a 102 pts); revelación con distribución y veredicto propio; podio con posición propia |
| 1, integridad | Desde la consola de un participante, con la pregunta abierta: leer la solución, responder con `points`, leer la respuesta de otro y conducir la partida devuelven las cuatro `permission-denied` |
| 2 | Conteo de respondidos sin ver quién; nota pedagógica al revelar; debrief de menor a mayor acierto; reproyección de solo lectura sin cambiar la fase; rondas pasadas con debrief de una ronda archivada |
| 3 | Un archivo con cuatro errores los muestra todos con su ubicación y no publica nada; el archivo válido se publica y queda disponible para una ronda |
| 4 | Recarga en pregunta abierta ya respondida (sigue respondida, no deja responder otra vez), en fase cerrada (presentador), en revelada y en podio (participantes); cierre por tiempo sin ninguna escritura del presentador; sala llena, ampliación en curso y entrada del tercero |

**Tres bugs que solo aparecieron en el navegador**, corregidos:

1. Primera visita: "No se pudo conectar". La suscripción a la ronda arrancaba antes de terminar el alta anónima y las reglas la rechazaban. Solo pasaba la primera vez que alguien abría el enlace.
2. Las escrituras propias no llegaban a la propia pantalla: a las suscripciones que descartan escrituras pendientes les faltaba `includeMetadataChanges`. El presentador ampliaba el tope y seguía viendo el anterior. Regresión en `tests/rules/data-watch.spec.ts`.
3. En la distribución revelada, el texto de cada opción se montaba sobre su barra.

Además, `scripts/seed-emulator.ts` movía el puntero sin archivar la ronda activa anterior.
