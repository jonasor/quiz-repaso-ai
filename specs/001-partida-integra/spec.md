# Feature Specification: Partida de quiz en vivo, íntegra y anónima

**Feature Branch**: `001-partida-integra`

**Created**: 2026-09-16

**Status**: Implemented

**Input**: Reescritura del prototipo de un solo archivo ya usado en una sesión real. Se conserva el comportamiento observable salvo donde los requisitos de integridad lo cambien; lo que cambia son las garantías.

## Contexto

Sesiones internas de capacitación de Azzule, ~50 participantes simultáneos en una
sala, conducidas en vivo por un presentador que proyecta. El quiz refuerza
aprendizaje y **no evalúa personas**.

Existe un prototipo funcional con tres defectos de fondo que esta feature elimina:

1. La respuesta correcta viaja al dispositivo del participante antes de revelarse.
2. Cada dispositivo calcula su propio veredicto y su propio puntaje, y los reporta.
3. El control del presentador no está protegido: basta conocer el enlace.

## Clarifications

### Session 2026-09-16

- Q: ¿Quién hace efectivo el cierre de una pregunta cuando se agota su tiempo límite, si el dispositivo del presentador está desconectado justo en ese momento? → A: El plazo es dato, no acción. Al abrir la pregunta queda fijado su instante de cierre; toda respuesta posterior se rechaza sola contra la referencia temporal del servidor, sin que ningún dispositivo tenga que ejecutar el cierre.
- Q: ¿Qué debe hacer el sistema si alguien fabrica participantes en masa para inflar el podio o consumir la cuota gratuita? → A: Tope de participantes por ronda, definido al publicarla, con valor por defecto holgado sobre los ~50 esperados. Quien exceda el tope es rechazado al entrar.
- Q: ¿Puede el presentador volver a una pregunta ya revelada durante la sesión, y si lo hace, se admiten respuestas nuevas? → A: Puede reproyectar la revelación de cualquier pregunta ya revelada para comentarla, en solo lectura. Esa vista nunca admite respuestas ni altera puntajes; el avance de la partida sigue siendo estrictamente hacia adelante.
- Q: ¿Cómo consulta el presentador el debrief de una ronda anterior, una vez que la sesión terminó? → A: Desde una lista de rondas pasadas, reabriendo el debrief de cualquiera en solo lectura, una ronda a la vez. Comparar rondas entre sí sigue fuera de alcance.
- Q: ¿Qué ve el participante entre el cierre de la pregunta y su revelación? → A: Una pantalla de espera que le recuerda qué opción eligió, o que no alcanzó a responder, sin ningún dato del grupo. Nada nuevo cruza al dispositivo durante la fase cerrada.
- Q: ¿Cómo entrega el presentador un cuestionario nuevo, si la aplicación no tiene editor de preguntas? → A: Sube un archivo estructurado desde una pantalla autenticada, preparado fuera de la aplicación.
- Q: ¿Se conserva la fórmula de puntuación del prototipo? → A: Sí, confirmado tras considerar quitarla: 100 puntos base por acierto más hasta 100 de bonificación proporcional a la rapidez.
- Q: ¿Quién ve la nota pedagógica de una pregunta? → A: Solo el presentador. Nunca viaja al dispositivo de un participante, en ningún momento.
- Q: Si un participante borra su almacenamiento o cambia de dispositivo, ¿recupera su identidad y su puntaje? → A: No. Vuelve como participante nuevo; se acepta la pérdida como consecuencia del anonimato irreversible.
- Q: ¿Cómo se define el tiempo límite de cada pregunta? → A: Por pregunta en el cuestionario publicado, con 30 segundos por defecto si no se indica otro.
- Q: ¿Puede haber más de una ronda en curso al mismo tiempo? → A: No. Una ronda activa a la vez; iniciar una nueva archiva la anterior.
- Q: ¿Qué muestra el podio final? → A: Las tres primeras posiciones destacadas, y cada participante ve además su propia posición dentro del total.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jugar una ronda completa sin poder hacer trampa (Priority: P1)

Un participante abre un enlace, recibe un apodo generado y entra sin registrarse.
El presentador lanza cada pregunta; el participante la ve con sus opciones y un
tiempo límite visible, elige una opción y su respuesta queda registrada de forma
definitiva. Al cerrar, el presentador revela: todos ven la distribución de
respuestas del grupo, cuál era la correcta, y cada quien su propio resultado. Al
terminar todas las preguntas se muestra un podio de apodos.

**Why this priority**: Es el producto mínimo viable. Sin esta historia no hay nada
que demostrar, y es donde viven las tres garantías que motivan la reescritura.

**Independent Test**: Se juega una ronda de extremo a extremo con dos o más
dispositivos y se verifica, además del flujo, que un participante con acceso
completo a su propio dispositivo no puede anticipar la respuesta correcta ni
alterar su puntaje.

**Acceptance Scenarios**:

1. **Given** una partida en sala de espera, **When** un participante abre el enlace, **Then** recibe un apodo generado y queda dentro sin escribir ningún dato personal.
2. **Given** una pregunta abierta con tiempo límite visible, **When** el participante elige una opción, **Then** su respuesta queda registrada y la interfaz deja de aceptar cambios para esa pregunta.
3. **Given** una pregunta abierta, **When** el participante inspecciona todo lo que su dispositivo ha recibido, **Then** no encuentra la respuesta correcta ni ningún valor del que pueda derivarla.
4. **Given** una pregunta abierta, **When** el participante intenta registrar un puntaje o un veredicto de acierto propio, **Then** el sistema rechaza el intento y el resultado sigue siendo el que el sistema determina.
5. **Given** una pregunta revelada, **When** el participante mira su pantalla, **Then** ve la distribución de respuestas del grupo, cuál era la correcta y su propio veredicto con los puntos obtenidos.
6. **Given** una pregunta recién cerrada y aún no revelada, **When** el participante mira su pantalla, **Then** sabe que la pregunta cerró y que su respuesta quedó registrada, y no dispone de ningún indicio de cuál era la correcta.
7. **Given** la última pregunta revelada, **When** el presentador cierra la partida, **Then** todos ven el podio de apodos y cada participante ve su propia posición.

---

### User Story 2 - Conducir la sesión y cerrarla con un debrief útil (Priority: P2)

El presentador controla el avance de la partida y ve, en cada pregunta, cuántos
han respondido. Al revelar dispone de una nota pedagógica de esa pregunta para
comentarla en voz alta. Al final ve las preguntas ordenadas por menor porcentaje
de acierto, para saber qué temas reforzar.

**Why this priority**: Hace la sesión conducible y convierte la ronda en
aprendizaje. Depende de que exista una ronda, pero su valor es separable.

**Independent Test**: Se demuestra sobre los datos de una ronda ya jugada, sin
volver a jugarla: el panel de conducción y el debrief final se verifican contra
resultados existentes.

**Acceptance Scenarios**:

1. **Given** una pregunta abierta, **When** el presentador mira su panel, **Then** ve cuántos participantes han respondido, sin ver quién respondió qué.
2. **Given** una pregunta que el presentador acaba de revelar, **When** consulta su panel, **Then** dispone de la nota pedagógica de esa pregunta.
3. **Given** una ronda terminada, **When** el presentador abre el debrief, **Then** ve las preguntas ordenadas de menor a mayor porcentaje de acierto.
4. **Given** una ronda terminada, **When** el presentador revisa cualquier vista, **Then** en ningún lugar aparece un listado de resultados por persona.
5. **Given** varias rondas ya jugadas, **When** el presentador abre la lista de rondas y elige una anterior, **Then** ve su debrief tal como quedó, en solo lectura.

---

### User Story 3 - Publicar un quiz distinto sin intervención técnica (Priority: P3)

El presentador prepara un conjunto de preguntas y lo publica para una
nueva ronda por su cuenta, sin que nadie recompile ni despliegue la aplicación, y
sin que las respuestas correctas queden expuestas al hacerlo.

**Why this priority**: Libera el ciclo de autoría del ciclo de desarrollo. Valioso,
pero una primera sesión puede correr con el cuestionario ya cargado.

**Independent Test**: Se publica un cuestionario distinto al vigente y se publica
una ronda con él, sin que intervenga ningún desarrollador y sin desplegar nada.

**Acceptance Scenarios**:

1. **Given** un cuestionario preparado fuera de la aplicación, **When** el presentador autenticado lo publica, **Then** queda disponible para publicar una ronda sin recompilar ni desplegar.
2. **Given** un cuestionario recién publicado, **When** se inspecciona lo que la aplicación entrega a un participante, **Then** las respuestas correctas no aparecen por ningún medio.
3. **Given** una persona sin la cuenta del presentador, **When** intenta publicar un cuestionario, **Then** el sistema rechaza la operación.
4. **Given** un cuestionario con un número de preguntas distinto al anterior, **When** se juega una ronda con él, **Then** la partida recorre exactamente ese número de preguntas.

---

### User Story 4 - Sobrevivir a una interrupción en vivo (Priority: P4)

Si el dispositivo de un participante o del presentador se recarga, se queda sin
conexión momentáneamente o se cierra por accidente, al volver retoma la partida
exactamente en el punto en que va, sin perder respuestas ni puntajes ya
registrados, y sin poder responder de nuevo una pregunta ya contestada.

**Why this priority**: Protege la sesión en vivo, donde no hay oportunidad de
depurar. Se construye sobre el flujo ya existente.

**Independent Test**: Se recarga en cada fase de la partida (sala de espera,
pregunta abierta, pregunta cerrada, revelación, podio) y se verifica que el
cliente vuelve al estado correcto sin pérdida.

**Acceptance Scenarios**:

1. **Given** un participante que ya respondió la pregunta en curso, **When** recarga su dispositivo, **Then** vuelve a la misma pregunta con su respuesta registrada y no puede responder de nuevo.
2. **Given** un participante en cualquier fase, **When** recarga, **Then** ve la fase vigente de la partida, no una anterior ni una posterior.
3. **Given** el presentador a media partida, **When** recarga su dispositivo, **Then** recupera el control en la fase vigente sin alterar el estado de la partida.
4. **Given** un participante que pierde conexión al enviar su respuesta, **When** la conexión vuelve, **Then** puede determinar sin ambigüedad si su respuesta quedó registrada o no.
5. **Given** el presentador, **When** ejecuta dos veces la misma acción de avance por un doble clic, **Then** el estado resultante es idéntico al de ejecutarla una sola vez.

---

### Edge Cases

- **Un participante entra después de que la partida ya arrancó**: entra a la fase vigente, aparece en la sala y puede responder las preguntas que aún no se han cerrado. Las preguntas ya cerradas cuentan como no respondidas, con cero puntos, y el tiempo límite completo se le imputa para el desempate.
- **Un participante no responde una pregunta**: obtiene cero puntos en esa pregunta. No aparece en la distribución de respuestas del grupo. Su pantalla de revelación indica "sin respuesta".
- **Nadie responde una pregunta**: la revelación muestra la respuesta correcta con una distribución vacía y el porcentaje de acierto de esa pregunta se reporta como cero en el debrief, no como indefinido.
- **Una sola persona responde una pregunta**: la distribución muestra esa única respuesta como el 100% del total de respuestas, no del total de participantes.
- **Todos responden antes de que expire el tiempo**: el presentador puede revelar de inmediato sin esperar al tiempo límite, lo que cierra la pregunta. El cierre anticipado no altera los puntajes ya otorgados.
- **El presentador se desconecta justo cuando expira el tiempo límite**: la pregunta queda cerrada igualmente, porque su instante de cierre se fijó al abrirla. Ninguna respuesta tardía entra. Al volver, el presentador retoma en la fase vigente y revela.
- **Empate en el podio**: gana quien acumuló menos tiempo total de respuesta. Si persiste el empate exacto, los participantes empatados comparten la misma posición.
- **Menos de tres participantes en total**: el podio muestra únicamente las posiciones que existen, sin huecos ni posiciones vacías.
- **El mismo participante abre dos pestañas en el mismo dispositivo**: ambas pestañas comparten la misma identidad y reflejan el mismo estado; responder en una deja la pregunta como contestada en la otra.
- **El mismo participante abre la aplicación en dos dispositivos**: cada dispositivo obtiene una identidad y un apodo distintos, y cuentan como dos participantes. Esto es una consecuencia aceptada del anonimato irreversible: impedirlo exigiría identificar a las personas.
- **Un participante borra el almacenamiento de su dispositivo a media partida**: vuelve como participante nuevo con otro apodo. Su puntaje anterior permanece en la ronda pero ya no es recuperable por esa persona. Es la misma consecuencia aceptada del punto anterior.
- **Se alcanza el tope de participantes de la ronda**: quien intente entrar recibe un aviso de sala llena y no queda registrado. Los participantes ya dentro no se ven afectados. Si el cupo se ocupó de forma indebida y quedan personas fuera, el presentador lo amplía sobre la ronda en curso (FR-012) y quienes esperaban pueden entrar.
- **El presentador reproyecta una pregunta ya revelada**: se muestra su revelación tal como quedó, sin admitir respuestas. Los participantes que no la respondieron siguen con cero puntos en ella; reproyectar no les abre ninguna ventana para contestar.
- **El archivo de cuestionario llega mal formado**: la publicación se rechaza con un mensaje que identifica el problema y la ronda no queda a medio publicar.
- **Se publica una ronda nueva con otra en curso**: la anterior se archiva y queda consultable; nunca hay dos rondas admitiendo respuestas a la vez.
- **El presentador ejecuta dos veces la misma acción**: sin efecto adicional. Toda acción de conducción es idempotente.
- **Un participante pierde conexión justo al enviar su respuesta**: el sistema no deja el envío en estado ambiguo. Al recuperar conexión, el participante ve con certeza si su respuesta quedó registrada, y si quedó, cuál fue. En particular, el sistema MUST NOT dar por registrada una respuesta que solo quedó guardada en el dispositivo: la confirmación exige constancia del lado del sistema, porque un envío pendiente puede acabar rechazado por llegar tarde (FR-029).
- **Un participante que no respondió llega a la fase cerrada**: su pantalla de espera indica que no alcanzó a responder, sin datos del grupo, y en la revelación verá cero puntos.
- **Un participante intenta responder en el instante exacto del cierre**: la decisión la toma la referencia temporal que el participante no controla, no su dispositivo.
- **La revelación con el máximo de participantes**: el trabajo que exige revelar una pregunta crece con el número de participantes, porque FR-052 obliga a que el resultado de cada quien sea privado y por tanto individual. El diseño MUST sostener SC-002 a la escala objetivo.
- **El presentador publica un cuestionario con una ronda en curso**: la ronda en curso MUST terminar con el cuestionario con el que empezó. Un cuestionario recién publicado solo aplica a rondas publicadas después.

## Requirements *(mandatory)*

### Functional Requirements

#### Acceso e identidad

- **FR-001**: El sistema MUST permitir a un participante entrar a la partida abriendo un enlace, sin registro, sin contraseña y sin escribir dato personal alguno.
- **FR-002**: El sistema MUST asignar a cada participante un apodo generado automáticamente.
- **FR-003**: El sistema MUST permitir al participante solicitar otro apodo generado antes de entrar a la sala.
- **FR-004**: El sistema MUST conservar la identidad y el apodo del participante entre recargas del mismo dispositivo.
- **FR-005**: El sistema MUST NOT ofrecer mecanismo alguno de recuperación de identidad entre dispositivos ni tras borrar el almacenamiento local. Quien pierda su identidad local vuelve como participante nuevo.
- **FR-006**: El sistema MUST NOT solicitar ni aceptar nombre, correo, identificador corporativo, ni ningún campo de texto libre proveniente del participante.
- **FR-007**: El sistema MUST garantizar que dos participantes de una misma ronda no compartan el mismo apodo.
- **FR-008**: El espacio de apodos posibles MUST ser al menos dos órdenes de magnitud mayor que el número de participantes de la escala objetivo, de modo que asignar un apodo libre no exija reintentos frecuentes.
- **FR-009**: Cada ronda MUST tener un tope máximo de participantes, definido por el presentador al publicar la ronda (FR-021) y no en el cuestionario, con un valor por defecto holgado sobre los ~50 esperados.
- **FR-010**: El sistema MUST rechazar la entrada de un participante que exceda el tope de la ronda, e indicarle que la sala está llena.
- **FR-011**: El sistema MUST hacer cumplir el tope sin reconocer dispositivos ni personas, de modo que la barrera no comprometa el anonimato.
- **FR-012**: El presentador MUST poder ajustar el tope de una ronda en curso. Sin esa salida, un cupo ocupado de forma indebida dejaría la sesión bloqueada sin remedio.

#### Ciclo de la partida y conducción

- **FR-013**: El sistema MUST modelar la partida en fases observables: sala de espera, pregunta abierta, pregunta cerrada, pregunta revelada y podio final.
- **FR-014**: El sistema MUST distinguir el cierre de una pregunta de su revelación. El cierre detiene la admisión de respuestas; la revelación publica la respuesta correcta. Entre ambos momentos la respuesta correcta sigue sin ser conocible por los participantes.
- **FR-015**: El instante de cierre de una pregunta MUST quedar fijado en el momento de abrirla, como dato de la partida y no como acción pendiente. El sistema MUST rechazar toda respuesta posterior a ese instante sin que ningún dispositivo tenga que ejecutar el cierre.
- **FR-016**: Solo el presentador autenticado MUST poder hacer avanzar la partida entre fases, abrir una pregunta, cerrarla, revelarla y cerrar la partida.
- **FR-017**: El sistema MUST rechazar cualquier acción de conducción proveniente de quien no sea el presentador autenticado, aun si conoce el enlace, el código de la sala o cualquier otro valor público.
- **FR-018**: Toda acción de conducción MUST ser idempotente: ejecutarla dos veces produce el mismo estado que ejecutarla una vez.
- **FR-019**: El sistema MUST permitir al presentador revelar una pregunta antes de que expire su tiempo límite. La revelación anticipada MUST cerrar la pregunta de inmediato, de modo que el cierre efectivo es el primero entre el instante fijado y la revelación.
- **FR-020**: El sistema MUST recorrer el número de preguntas que tenga el cuestionario publicado, que es variable y no fijo.
- **FR-021**: Publicar una ronda es el acto por el que el presentador autenticado toma un cuestionario ya publicado, crea a partir de él una ronda y abre su sala de espera. Es un acto distinto de publicar un cuestionario: el cuestionario es contenido reutilizable, la ronda es una ejecución concreta de ese contenido ante un grupo.
- **FR-022**: El sistema MUST admitir a lo sumo una ronda activa a la vez. Publicar una ronda nueva MUST archivar la anterior, que queda consultable según FR-074 a FR-077.
- **FR-023**: El avance de la partida MUST ser estrictamente hacia adelante. El sistema MUST NOT reabrir para respuestas una pregunta ya cerrada, ni devolver la partida a una fase anterior.
- **FR-024**: El sistema MUST permitir al presentador reproyectar la revelación de cualquier pregunta ya revelada, para comentarla. Esa vista MUST ser de solo lectura: no admite respuestas ni modifica puntajes, agregados ni la pregunta en curso.
- **FR-025**: Todos los participantes MUST avanzar al ritmo que marca el presentador. El sistema MUST NOT ofrecer modo asincrónico ni de práctica individual.

#### Respuestas

- **FR-026**: El sistema MUST mostrar al participante, durante una pregunta abierta, el enunciado, sus opciones y el tiempo restante de forma visible.
- **FR-027**: El sistema MUST registrar como definitiva la primera respuesta de un participante a una pregunta.
- **FR-028**: El sistema MUST NOT aceptar una segunda respuesta a una pregunta ya contestada por ese participante, ni permitir corregir o retirar la primera.
- **FR-029**: El sistema MUST NOT aceptar una respuesta enviada después del cierre de la pregunta, aun si el dispositivo del participante afirma que llegó a tiempo.
- **FR-030**: El sistema MUST NOT aceptar una respuesta a una pregunta que aún no ha sido abierta.
- **FR-031**: El sistema MUST dar al participante una confirmación inequívoca de que su respuesta quedó registrada, o de que no quedó.
- **FR-032**: Durante la fase de pregunta cerrada, el sistema MUST mostrar al participante una espera con la opción que eligió, o el aviso de que no alcanzó a responder.
- **FR-033**: Durante la fase de pregunta cerrada, el sistema MUST NOT entregar al dispositivo del participante ningún dato del grupo, ni ningún dato que no tuviera ya durante la pregunta abierta.
- **FR-034**: El sistema MUST medir la antigüedad de una respuesta con una referencia temporal que el participante no controla.

#### Puntuación

- **FR-035**: El sistema MUST determinar el veredicto de acierto y el puntaje de cada respuesta. El dispositivo del participante MUST NOT participar en esa determinación.
- **FR-036**: El sistema MUST NOT aceptar un puntaje ni un veredicto de acierto reportado por el dispositivo de un participante.
- **FR-037**: Una respuesta correcta MUST otorgar puntos base más una bonificación proporcional a la rapidez dentro del tiempo límite.
- **FR-038**: Una respuesta incorrecta y la ausencia de respuesta MUST otorgar cero puntos.
- **FR-039**: El sistema MUST acumular el puntaje total de cada participante a lo largo de la ronda.
- **FR-040**: El sistema MUST imputar el tiempo límite completo, para efectos de desempate, a toda pregunta que un participante no respondió, de modo que abstenerse nunca favorezca en el desempate.

#### Revelación

- **FR-041**: Al revelar una pregunta, el sistema MUST mostrar a todos la distribución de respuestas del grupo por opción.
- **FR-042**: Al revelar una pregunta, el sistema MUST mostrar cuál era la opción correcta.
- **FR-043**: Al revelar una pregunta, el sistema MUST mostrar a cada participante su propio veredicto y los puntos que obtuvo.
- **FR-044**: El sistema MUST calcular la distribución sobre el total de respuestas recibidas, no sobre el total de participantes presentes.
- **FR-045**: El sistema MUST NOT entregar la respuesta correcta, ni ningún valor derivado de ella, al dispositivo de un participante antes de la revelación de esa pregunta.
- **FR-046**: El sistema MUST NOT entregar la nota pedagógica al dispositivo de un participante en ningún momento, ni antes ni después de la revelación. Es material exclusivo del presentador.

#### Podio

- **FR-047**: Al terminar la ronda, el sistema MUST mostrar un podio que destaque las tres primeras posiciones, ordenado por puntos totales descendentes.
- **FR-048**: Ante igualdad de puntos, el sistema MUST ordenar primero a quien acumuló menos tiempo total de respuesta.
- **FR-049**: El sistema MUST mostrar a cada participante su propia posición y su puntaje total.
- **FR-050**: El podio MUST degradarse correctamente cuando hay menos de tres participantes, mostrando solo las posiciones existentes.

#### Integridad, como comportamiento observable

- **FR-051**: Un participante MUST NOT poder determinar la respuesta correcta de una pregunta aún no revelada por ningún medio disponible en su dispositivo, incluida la inspección de todo lo que su dispositivo haya recibido.
- **FR-052**: Un participante MUST NOT poder leer la respuesta ni el puntaje individual de otro participante, en ningún momento de la partida ni después de ella.
- **FR-053**: El sistema MUST rechazar cada intento de manipulación catalogado en esta sección incluso cuando la interfaz no ofrezca la acción. La ausencia de un control en la interfaz MUST NOT ser la única barrera. El catálogo de intentos a rechazar es: leer la respuesta correcta antes de la revelación (FR-051), leer el resultado individual de otro participante (FR-052), reportar puntaje o veredicto propio (FR-036), responder después del cierre (FR-029), responder una pregunta no abierta (FR-030), responder dos veces (FR-028) y ejecutar una acción de conducción sin ser el presentador autenticado (FR-017).

#### Anonimato

- **FR-054**: El sistema MUST NOT almacenar información que permita vincular un apodo con una persona real.
- **FR-055**: Esa vinculación MUST ser imposible también para quien administra el sistema, no solamente improbable.
- **FR-056**: Ninguna vista del presentador MUST mostrar resultados individuales por participante. El presentador ve agregados por pregunta y un podio de apodos.
- **FR-057**: El acceso a respuestas individuales MUST limitarse al mínimo necesario para calificar, y los datos así accedidos MUST ser anónimos: ningún atributo de una respuesta remite a una persona real. El anonimato del Principio II se sostiene por ausencia de PII, no por confidencialidad frente al presentador.
- **FR-058**: Durante una pregunta abierta, el presentador MUST ver cuántos participantes han respondido, sin ver quién respondió qué.

#### Continuidad y recuperación

- **FR-059**: Cualquier cliente, participante o presentador, MUST poder recargar en cualquier fase y reconstruir su estado completo.
- **FR-060**: Tras una recarga, el participante MUST recuperar su identidad, su apodo, sus respuestas ya registradas y su puntaje acumulado.
- **FR-061**: Tras una recarga, ningún participante MUST poder responder de nuevo una pregunta ya contestada.
- **FR-062**: El sistema MUST NOT mantener estado de partida que exista únicamente en la memoria de un dispositivo.
- **FR-063**: Un participante que entra con la partida ya iniciada MUST incorporarse a la fase vigente, con cero puntos en las preguntas ya cerradas.

#### Publicación de cuestionarios

- **FR-064**: El presentador MUST poder publicar un cuestionario preparado fuera de la aplicación sin que nadie recompile ni despliegue la aplicación.
- **FR-065**: Solo el presentador autenticado MUST poder publicar un cuestionario.
- **FR-066**: El acto de publicar MUST NOT exponer las respuestas correctas a los participantes.
- **FR-067**: Cada pregunta publicada MUST admitir un enunciado, sus opciones, la opción correcta, su tiempo límite y una nota pedagógica.
- **FR-068**: El sistema MUST aceptar el cuestionario como un archivo estructurado que el presentador sube desde una pantalla autenticada.
- **FR-069**: El sistema MUST validar el archivo antes de publicarlo y MUST rechazarlo con un mensaje que identifique el problema, sin dejar la ronda en estado parcial.
- **FR-070**: Cada pregunta MUST declarar su tiempo límite, y el sistema MUST aplicar 30 segundos por defecto cuando no se indique.

#### Debrief

- **FR-071**: Al terminar la ronda, el sistema MUST mostrar al presentador las preguntas ordenadas de menor a mayor porcentaje de acierto.
- **FR-072**: El sistema MUST poner la nota pedagógica de la pregunta a disposición del presentador en el momento de la revelación.
- **FR-073**: El sistema MUST conservar los resultados de una ronda para consulta posterior del presentador.
- **FR-074**: El sistema MUST ofrecer al presentador autenticado una lista de las rondas ya jugadas.
- **FR-075**: El sistema MUST permitir reabrir el debrief de una ronda pasada tal como quedó, en solo lectura, una ronda a la vez.
- **FR-076**: El sistema MUST NOT ofrecer comparación de métricas entre rondas distintas, que permanece fuera de alcance.
- **FR-077**: La consulta de una ronda pasada MUST respetar las mismas garantías que la ronda en vivo: rigen FR-056 y FR-057 sin excepción, y ninguna vista de una ronda pasada muestra resultados individuales por participante.
- **FR-078**: El sistema MUST reportar como cero, no como indefinido, el porcentaje de acierto de una pregunta que nadie respondió.

### Key Entities

- **Cuestionario**: conjunto ordenado de preguntas publicado por el presentador. Tiene un número variable de preguntas.
- **Pregunta**: enunciado, conjunto de opciones, opción correcta, tiempo límite y nota pedagógica. La opción correcta y la nota son material reservado hasta la revelación.
- **Ronda (partida)**: una ejecución de un cuestionario ante un grupo, con su fase vigente, su pregunta en curso y su tope de participantes. El tope es atributo de la ronda, fijado al publicarla, no del cuestionario. Se conserva al terminar.
- **Participante**: identidad anónima dentro de una ronda, representada por un apodo generado. No tiene atributos que remitan a una persona real.
- **Respuesta**: la opción elegida por un participante en una pregunta, con la antigüedad medida por el sistema. Es única y definitiva por participante y pregunta.
- **Resultado de pregunta**: agregado por opción de las respuestas recibidas, más el porcentaje de acierto. Es lo único que el presentador ve de una pregunta.
- **Posición de podio**: apodo, puntaje total y tiempo total acumulado de un participante al cerrar la ronda.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un participante pasa de abrir el enlace a estar dentro de la sala en menos de 15 segundos, sin escribir ningún dato personal.
- **SC-002**: Con 50 participantes simultáneos, la revelación de una pregunta aparece en todos los dispositivos en menos de 2 segundos.
- **SC-003**: El 100% de los intentos de manipulación del catálogo de FR-053 es rechazado por el sistema, verificado uno por uno.
- **SC-004**: Publicar un cuestionario nuevo toma menos de 5 minutos y no requiere a ningún desarrollador.
- **SC-005**: Tras una recarga en cualquier fase, un cliente vuelve a estado correcto en menos de 10 segundos y sin pérdida de datos ya registrados.
- **SC-006**: El costo de operación se mantiene en 0 USD a la escala objetivo.
- **SC-007**: Una persona con acceso completo a su propio dispositivo y a todo lo que este ha recibido no consigue anticipar ninguna respuesta correcta antes de su revelación, en ninguna de las fases previas, incluida la de pregunta cerrada.
- **SC-008**: Ninguna vista del sistema, para ningún rol, permite obtener el resultado individual de otro participante.
- **SC-009**: Una ronda de extremo a extremo se conduce sin intervención técnica durante la sesión.
- **SC-010**: Ningún participante consigue registrar identidades por encima del tope de la ronda, de modo que el volumen de datos de una ronda queda acotado por diseño.

## Assumptions

Supuestos declarados por el solicitante:

- El presentador es una persona de confianza, es la única con cuenta autenticada, y no participa como jugador.
- La partida es sincrónica: todos avanzan al ritmo que marca el presentador. No hay modo asincrónico ni de práctica individual.
- El número de preguntas por cuestionario es variable, no fijo.
- Los participantes juegan desde teléfono o laptop, con conexión de oficina.
- Los resultados de una ronda se conservan para consulta posterior del presentador.
- **Modelo de amenaza**: sesiones internas y presenciales, en red corporativa, con participantes conocidos. El adversario previsto es un colega curioso que abre las herramientas de desarrollo, no un atacante determinado. En consecuencia, el tope de participantes (FR-009) existe para acotar el volumen de datos de una ronda, NO para impedir la fabricación masiva de identidades: quien la intente agota el cupo y bloquea a participantes legítimos, y la salida ante eso es operativa (FR-012), no técnica. Las garantías de integridad y anonimato, en cambio, NO admiten esta relajación: se sostienen frente a cualquier participante, según los Principios I y II.
- **Autoridad de calificación**: la calificación la realiza el cliente autenticado del presentador, que por ello accede a respuestas individuales anónimas. Es una concesión deliberada a la restricción de no disponer de backend. El anonimato no se degrada, porque ninguna respuesta contiene atributos que remitan a una persona real.

Supuestos confirmados en Clarifications:

- **Puntuación concreta**: confirmado. Se conserva la del prototipo — 100 puntos base por acierto más hasta 100 puntos de bonificación proporcional al tiempo restante dentro del límite, para un máximo de 200 por pregunta. Se evaluó eliminar la bonificación por rapidez y se decidió conservarla. Los valores son parámetros, no constantes del diseño.
- **Tiempo límite**: confirmado. Se define por pregunta en el cuestionario publicado, con 30 segundos por defecto cuando no se indique otro (FR-070).
- **Cierre de la pregunta**: resuelto en Clarifications. El instante de cierre se fija al abrir la pregunta y opera por sí solo; el presentador puede adelantarlo revelando antes.
- **Nota pedagógica**: confirmado. Es material exclusivo del presentador para comentar en voz alta, y no se entrega al dispositivo de un participante en ningún momento (FR-046).
- **Podio**: confirmado. Destaca las tres primeras posiciones, como en el prototipo, y cada participante ve además su propia posición dentro del total.
- **Una partida a la vez**: confirmado. A lo sumo una ronda activa; publicar una nueva archiva la anterior (FR-022).
- **Persistencia de identidad**: confirmado. La identidad vive en el almacenamiento del propio dispositivo. Borrarla o cambiar de dispositivo produce un participante nuevo, y no se ofrece mecanismo de recuperación (FR-005). Se evaluó un código de recuperación y se descartó por crear un secreto suplantable.
- **Publicación**: confirmado. El presentador prepara el cuestionario fuera de la aplicación y lo sube como archivo estructurado desde una pantalla autenticada (FR-068). No hay editor de preguntas en la aplicación.
- **Retención**: resuelto en Clarifications. Los resultados se conservan indefinidamente hasta que el presentador decida retirarlos, y son releíbles desde la aplicación.
- **Navegación de la partida**: resuelto en Clarifications. Reproyectar no es retroceder; la fase vigente de la partida no cambia al hacerlo.
- **Tope de participantes**: resuelto en Clarifications. Es un parámetro de la ronda, no una constante del diseño.
- **Idioma**: toda la interfaz es en español, según lo declarado en Out of Scope.

## Out of Scope

- Cuentas de participante persistentes.
- Estadísticas históricas entre sesiones, entendidas como comparación de métricas entre rondas distintas. Releer el debrief de una ronda pasada, una a la vez, sí está dentro de alcance (FR-074 a FR-077).
- Edición de preguntas dentro de la aplicación.
- Equipos.
- Cualquier idioma distinto del español.

## Cambios respecto al comportamiento observable del prototipo

Se conserva todo lo demás. Cambian estos puntos, y cambian por diseño:

1. La respuesta correcta deja de viajar al dispositivo antes de la revelación (FR-045, FR-051).
2. El veredicto y el puntaje dejan de calcularse y reportarse desde el dispositivo; los determina el sistema (FR-035, FR-036).
3. La antigüedad de la respuesta deja de medirse con el reloj del dispositivo (FR-034).
4. La conducción de la partida exige presentador autenticado; conocer el enlace deja de bastar (FR-016, FR-017).
5. Aparece una fase de pregunta cerrada, distinta de la revelación (FR-014).
6. El podio incorpora desempate por tiempo total acumulado, que el prototipo no tenía (FR-048).
