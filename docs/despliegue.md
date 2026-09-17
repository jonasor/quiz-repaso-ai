# Guía de despliegue a producción

Cómo publicar Quiz de Repaso AI en un proyecto real de Firebase, desde cero y en actualizaciones posteriores.

Todo cabe en el **plan Spark gratuito**: Firestore, Authentication y Hosting. No hace falta cuenta de facturación, y sin ella no hay forma de generar cargos.

## Resumen

| Paso | Dónde | Una sola vez |
|---|---|---|
| 1. Crear el proyecto y la app web | Consola de Firebase | sí |
| 2. Crear la base de Firestore | Consola | sí |
| 3. Activar los métodos de acceso | Consola | sí |
| 4. Vincular el repo al proyecto | Terminal | sí |
| 5. Configurar las variables del build | Terminal | sí |
| 6. Crear la cuenta del presentador y darle el permiso | Consola + terminal | sí, por presentador |
| 7. Pasar los controles de calidad | Terminal | en cada despliegue |
| 8. Desplegar las reglas | Terminal | en cada despliegue |
| 9. Construir y desplegar la app | Terminal | en cada despliegue |
| 10. Prueba de humo | Navegador | en cada despliegue |

## Requisitos

- Lo mismo que para correr en local (ver [README](../README.md)): Node 20+, Java 21 y Firebase CLI.
- Una cuenta de Google con rol **Propietario** o **Editor** en el proyecto de Firebase.
- Sesión iniciada en la CLI:

```bash
firebase login
```

---

## Preparación (una sola vez)

### 1. Crear el proyecto y registrar la app web

1. Entra a https://console.firebase.google.com y crea un proyecto. Google Analytics no hace falta.
2. Anota el **ID del proyecto** (por ejemplo `quiz-repaso-ai`). No es lo mismo que el nombre visible.
3. En *Configuración del proyecto → General → Tus apps*, agrega una **app web**. No marques la opción de Hosting ahí: se configura desde el repo.
4. Copia de la configuración que te muestra estos tres valores: `apiKey`, `authDomain` y `projectId`. Los usarás en el paso 5.

### 2. Crear la base de Firestore

En *Compilación → Firestore Database → Crear base de datos*:

- **Ubicación**: elige una región cercana a donde se juega. **No se puede cambiar después.**
- **Modo**: producción. Las reglas que pone la consola se reemplazan en el paso 8.

No hay índices compuestos que crear: [firestore.indexes.json](../firestore.indexes.json) está vacío a propósito y todas las consultas usan índices de un solo campo, que Firestore crea solo.

### 3. Activar los métodos de acceso

En *Compilación → Authentication → Comenzar → Método de acceso*, habilita los dos:

- **Anónimo**: es como entran los participantes. Si falta, nadie puede unirse a una partida.
- **Correo electrónico/contraseña**: es como entra el presentador.

### 4. Vincular el repo al proyecto

El proyecto por defecto de [.firebaserc](../.firebaserc) es `demo-quiz-repaso`, que usan el emulador y los tests. **No lo cambies**: agrega un alias para producción.

```bash
firebase use --add
# elige tu proyecto y ponle el alias: prod
```

Esto agrega el alias `prod` a `.firebaserc`, que sí conviene versionar. A partir de aquí, todos los comandos contra producción llevan `--project prod`, así un despliegue nunca va a parar al proyecto equivocado por descuido.

### 5. Configurar las variables del build

La app lee la configuración de Firebase en el momento de construirse. Crea `.env.production.local` en la raíz, que ya está ignorado por git:

```bash
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=quiz-repaso-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=quiz-repaso-ai
```

Hay una plantilla en [.env.example](../.env.example).

**No definas `VITE_USE_EMULATOR`** en este archivo: si vale `true`, el build de producción intentará conectarse a `127.0.0.1` y nadie podrá jugar.

La `apiKey` de una app web de Firebase no es un secreto: viaja en el bundle y la ve cualquiera. Lo que protege los datos son las reglas. Aun así, puedes limitar su uso a tus dominios, ver *Endurecimiento opcional*.

### 6. Crear el presentador y darle el permiso

Ser presentador no lo decide la cuenta, sino un **custom claim** `presenter: true` que leen las reglas. Sin él, la cuenta puede iniciar sesión pero las reglas no le dejan hacer nada.

**6.1. Crear la cuenta.** En *Authentication → Usuarios → Agregar usuario*, captura el correo y la contraseña del presentador. Copia el **UID** que aparece en la lista.

**6.2. Descargar una clave de cuenta de servicio.** En *Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada*. Guarda el JSON **fuera del repo**, por ejemplo en `~/claves/quiz-repaso-ai.json`.

**6.3. Otorgar el claim.**

```bash
unset FIREBASE_AUTH_EMULATOR_HOST
GOOGLE_APPLICATION_CREDENTIALS=~/claves/quiz-repaso-ai.json \
GCLOUD_PROJECT=quiz-repaso-ai \
npx tsx scripts/grant-presenter.ts <UID>
```

Debe responder `claim presenter=true otorgado a <UID>`. Dos detalles importan:

- **`GCLOUD_PROJECT` es obligatorio.** Si falta, el script usa `demo-quiz-repaso` y falla.
- **`FIREBASE_AUTH_EMULATOR_HOST` no debe estar definida**, o el claim se otorga en el emulador y no en producción.

**6.4. Borrar la clave.** Da acceso de administrador a todo el proyecto. Una vez otorgado el claim, elimina el archivo y revoca la clave en *Google Cloud → IAM → Cuentas de servicio*. Para otro presentador, genera una nueva.

Si el presentador ya tenía la sesión abierta cuando se le dio el permiso, debe cerrar sesión y volver a entrar.

---

## Desplegar (cada vez)

### 7. Controles de calidad

Los tres deben estar en verde. Es lo que exige la [constitución](../.specify/memory/constitution.md), y en producción no hay oportunidad de depurar frente a la sala.

```bash
npm run emulators      # en otra terminal
npm run typecheck
npm run lint
npm run test:domain
npm run test:rules
```

Despliega desde `main` actualizado y sin cambios locales (`git status` limpio), para saber exactamente qué versión está en producción.

### 8. Desplegar las reglas

```bash
firebase deploy --only firestore:rules,firestore:indexes --project prod
```

**Las reglas van antes que la app.** Toda la integridad del juego vive en [firestore.rules](../firestore.rules): una app nueva con reglas viejas puede quedar bloqueada, y con reglas faltantes el proyecto usa las de la consola, que lo niegan todo.

### 9. Construir y desplegar la app

```bash
npm run verify:dist
firebase deploy --only hosting --project prod
```

`verify:dist` construye `dist/` con las variables de `.env.production.local` y comprueba que ninguna solución de cuestionario haya quedado dentro del bundle. Si falla, **no despliegues**.

Al terminar, la CLI muestra la URL: `https://<id-del-proyecto>.web.app`.

- Participantes: `https://<id-del-proyecto>.web.app/`
- Presentador: `https://<id-del-proyecto>.web.app/presentador`

Para desplegar reglas y app de una vez, una vez que ya pasaste los pasos 7 y `verify:dist`:

```bash
firebase deploy --only firestore,hosting --project prod
```

### 10. Prueba de humo

Antes de una sesión real, cinco minutos con un teléfono:

1. Entra a `/presentador` con la cuenta del paso 6. Deben aparecer las pantallas de conducción, no un aviso de falta de permisos.
2. Publica [docs/cuestionario-ejemplo.json](cuestionario-ejemplo.json) y luego una ronda.
3. Desde el teléfono, abre la URL de participantes: debe entrar con un apodo sin pedir nada.
4. Abre una pregunta, respóndela, deja vencer el tiempo y revela. El teléfono debe mostrar la distribución y sus puntos.
5. En la consola del navegador del teléfono o de la laptop no debe haber errores `permission-denied` durante el flujo normal.

Si el paso 3 falla con "No se pudo conectar", revisa que el acceso **Anónimo** esté habilitado (paso 3) y que el build tenga el `projectId` correcto (paso 5).

---

## Operación

### Presupuesto del plan Spark

La cuota diaria de Firestore en Spark es de **50.000 lecturas y 20.000 escrituras**, y se reinicia a medianoche, hora del Pacífico.

Medido contra el emulador ([research.md, D8](../specs/001-partida-integra/research.md)): una ronda de **10 preguntas con 50 participantes** consume unas **10.200 lecturas y 1.200 escrituras**. Caben **unas 4 rondas de ese tamaño al día**, y las lecturas son el límite.

- Rondas más largas o con más gente cuestan más; la entrada a la sala crece con el cuadrado del aforo.
- Si se agota la cuota, Firestore rechaza operaciones hasta el reinicio: la partida en curso se congela. No programes más sesiones de las que caben en un día.
- Revisa el consumo real en *Firestore Database → Uso* después de la primera sesión.

Firebase Auth limita también las **altas de cuentas nuevas por dirección IP** por hora. Con toda una sala conectada a la misma red corporativa, todos salen por la misma IP. Quien ya jugó en ese dispositivo reutiliza su identidad y no cuenta como alta nueva, pero si vas a tener varias salas grandes seguidas desde la misma red, revisa los [límites vigentes de Authentication](https://firebase.google.com/docs/auth/limits).

### Publicar cuestionarios

Publicar un cuestionario **no requiere desplegar**: el presentador sube el JSON desde `/presentador`. Guarda los cuestionarios reales fuera de `src/` y nunca los agregues al build; contienen las respuestas correctas.

Un cuestionario publicado no se puede editar, por diseño: para corregirlo, sube uno nuevo.

### Revertir un despliegue

- **App**: en *Hosting → Historial de versiones*, elige la versión anterior y *Revertir*. Es instantáneo.
- **Reglas**: en *Firestore Database → Reglas* está el historial de versiones publicadas. Lo más seguro es volver al commit anterior y repetir el paso 8, porque así app y reglas quedan en versiones que se probaron juntas.

### Endurecimiento opcional

- **Restringir la API key**: en *Google Cloud → APIs y servicios → Credenciales*, limita la clave del navegador a los referentes HTTP `https://<id-del-proyecto>.web.app/*` y `https://<id-del-proyecto>.firebaseapp.com/*`, más tu dominio propio si lo usas.
- **Dominio propio**: en *Hosting → Agregar dominio personalizado*.
- **App Check** está diferido a propósito: el riesgo de que alguien fabrique identidades anónimas para llenar la sala se aceptó para sesiones presenciales. Si el enlace empieza a circular fuera de la sala, reconsidéralo (ver D4 en [research.md](../specs/001-partida-integra/research.md)).
