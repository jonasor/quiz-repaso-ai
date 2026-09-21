# Auditoría de seguridad: quiz-repaso-ai

## 1. Alcance y método

| | |
|---|---|
| Fecha | 2026-09-17 |
| Commit revisado | `8ede4ec` (árbol limpio) |
| Perfil | Estándar, repositorio completo. Es la primera auditoría: no hay corridas previas |
| Agentes | 15 invocaciones: 4 de reconocimiento, 5 de búsqueda, 2 críticos de cobertura, 2 verificadores de candidatos y 2 verificadores finales de registros |

**Ejecución.** Todo se hizo con lectura de código y pruebas locales acotadas. Las reglas se probaron contra el emulador de Firestore (proyecto `demo-quiz-repaso`) dentro de un sandbox de bubblewrap:

- sin red (solo loopback aislado);
- entorno vacío con variables en lista blanca;
- toolchain de solo lectura;
- escrituras solo en una copia desechable del repo;
- límites de memoria, procesos, CPU y tiempo.

No se contactó ningún proyecto desplegado, la consola de Firebase ni GitHub. No se modificó ningún archivo del repositorio salvo este documento.

## 2. Postura de seguridad

El diseño central es sólido. `firestore.rules` hace cumplir todas las invariantes de la partida que se probaron:

- la autoridad del presentador sale solo del custom claim;
- hay una respuesta por pregunta, inmutable y con plazo según el reloj del servidor;
- las transiciones de fase son compare-and-swap;
- la entrada queda atada con `!exists() && existsAfter()`;
- las respuestas y los puntajes están aislados por uid.

Ningún participante puede publicar resultados, calificar, mover la máquina de fases ni leer la respuesta o el puntaje de otro. Esto se demostró en el emulador.

La única debilidad confirmada está en el ciclo de vida: una copia de la respuesta correcta sobrevive a su ronda y cualquier identidad autenticada puede leerla. Aparte, el historial de git deja una pista operativa sobre el proyecto de Firebase del prototipo.

## 3. Hallazgos confirmados

| Severidad | Título | Frontera | Resultado observado |
|---|---|---|---|
| Baja | Los resultados de una ronda anterior de un cuestionario reutilizado revelan las respuestas correctas a cualquier usuario autenticado | Secreto de la solución antes de revelar (FR-045/FR-051), entre rondas | En el emulador, una identidad anónima leyó `rounds/rA/results/0.correctIndex = 1` mientras la pregunta 0 del mismo cuestionario estaba abierta en la ronda nueva `rB`. A esa misma identidad se le negó `solutions/0` |

### Detalle

**Huella:** `firestore.rules:rounds-results-read-auth-only:cross-round-correctIndex`

**Origen.** La regla de `rounds/{r}/results/{n}` es `allow read: if request.auth != null` ([firestore.rules:332](../firestore.rules#L332)). Dos reglas más lo vuelven alcanzable:

- `rounds/{r}` tiene `get` abierto, así que expone el `quizId` ([firestore.rules:225](../firestore.rules#L225));
- `config/activeRound` es legible, así que cualquiera puede anotar el id de la ronda activa ([firestore.rules:127](../firestore.rules#L127)).

Al revelar, el presentador escribe `results/{n}` con `correctIndex` copiado de `solutions/{n}`, que solo él puede leer ([src/data/scores.ts:136](../src/data/scores.ts#L136)). Las reglas nunca permiten borrar ese documento ([firestore.rules:342](../firestore.rules#L342)), así que la copia sobrevive a la ronda.

**Principal de menor confianza.** Cualquier identidad de Firebase Auth, incluida la anónima que se crea con solo abrir la URL del participante. No hace falta haber entrado a ninguna de las dos rondas.

**Reproducción** (prueba de reglas en el emulador local):

1. Sembrar `quiz1`.
2. Jugar la ronda `rA` pasando por las reglas reales como presentador: revelar la pregunta 0 y escribir `results/0`.
3. Publicar la ronda `rB` sobre el mismo cuestionario, lo que archiva `rA`.
4. Abrir la pregunta 0 en `rB`.
5. Como identidad anónima que leyó `config/activeRound` mientras `rA` estaba activa, hacer `get` de `rounds/rA` y de `rounds/rA/results/0`.

**Condiciones.**

- El mismo cuestionario se jugó en una ronda anterior que llegó a revelar.
- El atacante anotó el id de esa ronda mientras era la activa. Listar rondas es exclusivo del presentador, así que después ya no puede encontrarlo.

**Resultado observado.** Se leyó `correctIndex = 1` de `rA/results/0`, también desde una identidad anónima que nunca entró a `rB`. Se negaron la lectura de `solutions/0` y el listado de rondas.

**Impacto.** El atacante conoce las respuestas correctas de las preguntas repetidas antes de que se revelen. Como el puntaje premia acierto y rapidez, distorsiona el podio. No se expone PII ni respuestas o puntajes de otros participantes.

**Prioridad.** Probabilidad baja, porque requiere reutilizar el cuestionario y guardar el id con anticipación. Impacto bajo, porque afecta la integridad de un repaso interno sin nada en juego. Severidad **baja**, aunque contradice FR-051 y el Principio I, que la constitución trata como no negociable.

**Corrección mínima.** Limitar la lectura al presentador, o a usuarios autenticados mientras la ronda siga activa:

```
match /results/{n} {
  allow read: if isPresenter()
    || (request.auth != null && round(r).active == true);
  // opcional: && exists(participantPath())
```

- Si además se exige ser participante, hay que ajustar [tests/rules/data-flow.spec.ts:180](../tests/rules/data-flow.spec.ts#L180), que hoy permite que un no participante lea resultados.
- Por el Principio IV hacen falta dos tests de denegación: que un anónimo lea resultados de una ronda archivada, y el escenario del cuestionario reutilizado.
- Hay que actualizar también [contracts/firestore-rules.md:55](../specs/001-partida-integra/contracts/firestore-rules.md#L55).

## 4. Pendiente de validar (sin severidad, no es una vulnerabilidad confirmada)

### El historial de git expone el proyecto de Firebase del prototipo, cuya única autorización era una clave del presentador en el cliente

**Huella:** `git-history/index.html/legacy-prototype-firebase-project-unauthenticated-writes`

**Qué hay en el historial.** El prototipo de un solo archivo sigue en git: se agregó en `15c0890`, se modificó en `91e81ec` y se reemplazó en `20a28c0`. En `git show 91e81ec:index.html`:

- la configuración web completa del proyecto `azzulq-quiz-claude-1` (línea 193);
- solo se cargan `firebase-app-compat` y `firebase-firestore-compat`, sin Auth (185-186), así que toda lectura y escritura es no autenticada;
- la autoridad del presentador es una clave en texto plano (201) que se compara contra el hash de la URL en el navegador (313);
- `estadoRef.set(...)` escribe el estado global del quiz sin autenticación (534);
- los jugadores se escriben con un id generado en el cliente (499) y las respuestas llevan `ok` y `pts` calculados en el cliente (423-424);
- el banco de preguntas trae la clave de respuestas codificada (287).

**Qué dice la documentación.** [spec.md:9](../specs/001-partida-integra/spec.md#L9) dice que el prototipo ya se usó en una sesión real, y [spec.md:21](../specs/001-partida-integra/spec.md#L21) reconoce que el control del presentador no estaba protegido. [docs/despliegue.md:38](despliegue.md#L38) crea un proyecto nuevo para la reescritura. Ningún paso despliega las reglas nuevas al proyecto viejo ni lo da de baja.

**Posible impacto.** Si el proyecto sigue existiendo con reglas abiertas, quien lea el historial podría:

- sobrescribir el estado del quiz;
- inyectar jugadores o respuestas con puntajes arbitrarios;
- leer los datos de sesiones guardados;
- consumir la cuota del proyecto.

No afecta al proyecto ni a las reglas de la reescritura. La `apiKey` web es pública por diseño y no es la vulnerabilidad.

**Qué impide confirmarlo** (hechos de despliegue que el código no muestra):

- si `azzulq-quiz-claude-1` sigue existiendo con Firestore activo;
- qué reglas tiene desplegadas, que nunca estuvieron en el repo, y si permiten leer y escribir sin autenticación o ya expiraron;
- si el repositorio de GitHub, y con él su historial, es público.

**Verificación local (solo lectura).** `git log --all -- index.html` y `git grep -n azzulq $(git rev-list --all)` confirman que en el historial no hay reglas del proyecto viejo ni una nota de baja.

**Verificación del dueño** (en la consola, sin sondear desde afuera):

1. En Firebase, confirmar si el proyecto existe. Si existe, anotar el texto de sus reglas de Firestore y su fecha de expiración.
2. En GitHub, confirmar si el repositorio es público.
3. Sea cual sea el resultado:
   - borrar el proyecto o desplegarle reglas que lo nieguen todo (`allow read, write: if false`);
   - dar por quemadas la clave del presentador y la clave de respuestas del prototipo;
   - agregar a `docs/despliegue.md` un paso para dar de baja el proyecto viejo.

   Reescribir el historial de git no sirve si alguna vez fue público.

## 5. Endurecimiento sugerido (no son hallazgos)

Ninguno de estos puntos demuestra una violación de frontera, o cae dentro de la confianza declarada o de un riesgo aceptado.

- **Preguntas futuras legibles antes de abrirse.** [firestore.rules:91,97](../firestore.rules#L91) dejan que cualquier usuario autenticado lea todos los cuestionarios y todas sus preguntas (texto, opciones, tiempo límite), incluidas las de la ronda en curso que aún no se abren. El contrato lo declara intencional ([contracts/firestore-rules.md:48](../specs/001-partida-integra/contracts/firestore-rules.md#L48)) y no expone respuestas, pero permite investigar las preguntas con anticipación y responder a máxima velocidad. Se podría limitar `questions/{n}` al presentador o a `int(n) <= currentIndex` de la ronda activa.
- **Participantes y apodos legibles.** [firestore.rules:261,280](../firestore.rules#L261) exponen la relación uid↔apodo de cualquier ronda a cualquier usuario autenticado. Por ahí no se llega a respuestas ni puntajes. Restringirlo al presentador y a los miembros de la ronda reduciría lo que se puede enumerar.
- **Sin cabeceras de seguridad en Hosting.** [firebase.json](../firebase.json) no tiene bloque `headers`. Conviene agregar `Content-Security-Policy` (al menos `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff` y `Referrer-Policy`. Hoy las acciones de un clic en `/presentador` dependen del particionado de almacenamiento del navegador para resistir el framing.
- **Revocar al presentador no es inmediato.** Quitar el claim tarda hasta que expira el ID token (hasta 1 h) y no hay script de revocación. Conviene acompañarlo de `revokeRefreshTokens` y documentarlo.
- **Scripts de Admin SDK sin guarda de emulador.** `scripts/lib/emulator-clients.ts` y `scripts/measure-*.ts` no tienen la negativa que sí tienen `seed-emulator.ts` y `create-presenter-emulator.ts`. Una terminal que aún tenga exportados `GCLOUD_PROJECT` y las credenciales de producción ([despliegue.md](despliegue.md), paso 6.3) podría escribir datos de prueba en producción. `grant-presenter.ts` apunta a producción a propósito; se podría pedir confirmación explícita del proyecto.
- **Documentos del presentador validados solo por claves.** En los documentos del cuestionario las reglas no revisan tipos, `index == n`, cantidad de opciones ni rango del tiempo límite. La escritura de `scores` no está atada a la fase. Cae dentro de la confianza declarada en el presentador; agregarlo movería a las reglas garantías que hoy solo da el cliente.
- **Chequeo de `dist/` limitado.** [scripts/check-dist.mjs](../scripts/check-dist.mjs) solo conoce los cuestionarios de `docs/`, y ningún chequeo falla si el build de producción lleva `VITE_USE_EMULATOR=true`.
- **`.gitignore` no cubre llaves de cuenta de servicio.** Falta un patrón como `*-firebase-adminsdk-*.json`.
- **Carrera entre respuesta y revelación.** Una respuesta cuya evaluación de reglas se cruce con el commit de revelación podría quedar sin calificar. Solo perjudica a quien la envió. Se podría recontar contra `answerCount` antes de escribir `results`.
- **Huecos en los tests de reglas (Principio IV).**
  - [closed-by-default.spec.ts:52](../tests/rules/closed-by-default.spec.ts#L52) dice "cannot delete a round" pero llama a `setDoc`, así que el borrado de rondas no está probado.
  - Faltan tests de denegación para:
    - borrados en `config/activeRound`, `participants`, `nicknames`, `scores`, `results` y `podium`;
    - `podium` con otro docId, `closedAt` del cliente o campos extra;
    - creación de `rounds` con `startedAt` del cliente o con `openedAt`, `timeLimitSec` o `endedAt` no nulos;
    - `adjustsCap` con un valor no entero;
    - un participante con `joinedAt` del cliente.
  - `asAnonClaimingPresenter` usa `presenter:false`, así que nunca prueba un claim falsificado. Esta auditoría lo cubrió con un test propio y todas las formas falsificadas fueron denegadas.

## 6. Patrones positivos

- La separación pregunta/solución se hace cumplir con `hasExactly`, y las soluciones son exclusivas del presentador. En el emulador se negaron 12 operaciones de presentador a 6 formas distintas de token no presentador.
- El plazo se calcula con aritmética del servidor (`request.time` < `openedAt + timeLimitSec`): ningún reloj del cliente decide.
- La entrada combina `!exists() && existsAfter()`, el tope contra el estado previo y la reserva de apodo propia. Cada condición cruzada tiene tests de denegación para documento ausente y ya presente.
- Todo texto se renderiza con el escapado de React. No hay sumideros de HTML crudo, `eval` ni URLs construidas con datos, y no hay secretos en el árbol ni en el historial, salvo la configuración del prototipo descrita arriba.

## 7. Cobertura

- **Unidades:** 9, todas revisadas. 7 cubiertas sin hallazgos y 2 con candidatos decididos de forma independiente; ninguna bloqueada ni diferida.
  - lecturas del contenido del cuestionario
  - lecturas de participantes, respuestas y puntajes
  - envío de respuestas y máquina de fases
  - transacción de entrada y tope
  - claim del presentador
  - carga del cuestionario y cadena de calificación
  - renderizado de la SPA y framing
  - scripts, configuración y `dist/`
  - comodín (lo que no cubren las demás)
- **Críticos:** el crítico posterior a la búsqueda y un segundo crítico final independiente no encontraron unidades faltantes ni reasignaciones.
- **Riesgos ya aceptados en la spec, no reportados de nuevo:**
  - el presentador es de confianza para los valores de puntaje;
  - llenar el tope con identidades anónimas fabricadas, con App Check diferido;
  - abuso de cuota;
  - duplicados por varios dispositivos.
- **Límites:**
  - no se revisaron CVE de dependencias (sin red);
  - hay hechos de despliegue que el código no muestra: si las reglas desplegadas coinciden con el repo, qué proveedores de Auth están activos, las restricciones de la API key y App Check;
  - una sola corrida no agota el objetivo.
