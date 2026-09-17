# Quiz de Repaso AI

Quiz en vivo y multijugador para las sesiones del programa de adopción de AI de Azzule. Un presentador conduce la partida desde su laptop y hasta ~50 participantes responden desde el teléfono, sin registrarse y sin escribir su nombre.

Empezó como un solo `index.html` y se reescribió como una aplicación web seria con dos garantías:

- **No se puede hacer trampa.** La respuesta correcta nunca llega al navegador de un participante antes de revelarse, y ninguna regla del juego depende de la interfaz: todas las hace cumplir `firestore.rules`.
- **No se puede evaluar a nadie.** Autenticación anónima, apodos generados por el sistema (`adjetivo + animal`) y cero datos personales. El presentador ve agregados por pregunta y un podio de apodos, nunca resultados individuales.

## Stack

- Vite + React 18 + TypeScript
- Firebase: Firestore, Auth (anónima para participantes, email/contraseña para el presentador) y Hosting
- Vitest para la lógica de juego; `@firebase/rules-unit-testing` + Emulator Suite para las reglas

No hay backend ni Cloud Functions: el proyecto está pensado para el plan gratuito Spark. Por eso el navegador del presentador es quien califica, acotado por las reglas.

## Cómo funciona una partida

1. El presentador sube un cuestionario en JSON y publica una ronda.
2. Los participantes abren el enlace y entran a la sala con un apodo generado.
3. Por cada pregunta: el presentador la abre, corre el contador, la pregunta se cierra sola al vencer el tiempo (lo decide el reloj del servidor, no el de nadie) y el presentador revela. Cada participante ve la distribución, la respuesta correcta y sus propios puntos; responder antes da más puntos.
4. Al final se muestra el podio y el presentador tiene un debrief con las preguntas ordenadas de menor a mayor acierto.

Si alguien recarga la página, incluido el presentador, vuelve exactamente a donde estaba.

## Echarlo a andar en local

### Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 20 o superior | la app y los scripts |
| Java | 21 | lo necesita el emulador de Firebase |
| Firebase CLI | reciente | `npm install -g firebase-tools` |

No necesitas cuenta de Firebase ni credenciales: en local todo corre contra el emulador con el proyecto de demostración `demo-quiz-repaso`.

### 1. Instalar dependencias

```bash
npm install
```

### 2. Levantar los emuladores (terminal 1, dejar corriendo)

```bash
npm run emulators
```

Levanta Firestore en `:8080`, Auth en `:9099` y la UI del emulador en http://localhost:4000, donde puedes ver los documentos y usuarios.

### 3. Crear el presentador y sembrar datos (terminal 2)

```bash
npm run presenter:emulator   # cuenta presentador@quiz.test / presentador123
npm run seed                 # cuestionario de ejemplo + una ronda en sala de espera
```

El emulador **no guarda nada** entre reinicios: cada vez que lo vuelvas a levantar, repite este paso.

### 4. Arrancar la app (terminal 2)

```bash
npm run dev
```

- **Participante:** http://localhost:5173/
- **Presentador:** http://localhost:5173/presentador (entra con la cuenta del paso 3)

En modo desarrollo la app se conecta sola a los emuladores.

### Jugar con varios participantes en una sola máquina

Las pestañas del mismo origen comparten la sesión de Firebase, así que serían el mismo participante. Para tener identidades distintas usa orígenes distintos o ventanas privadas:

- presentador en `http://127.0.0.1:5173/presentador`
- un participante en `http://localhost:5173/`
- otro en una ventana privada, o en un segundo servidor (`npx vite --port 5174`) abierto como `localhost:5174` y `127.0.0.1:5174`

Para probar con teléfonos reales en la misma red, arranca con `npm run dev -- --host`. Ten en cuenta que la app apunta al emulador en `127.0.0.1`, así que desde otro dispositivo no lo alcanzará sin ajustar esa dirección en [src/data/firebase.ts](src/data/firebase.ts).

## Tests y verificaciones

Estos tres deben estar en verde antes de fusionar:

```bash
npm run typecheck      # tipos
npm run test:domain    # lógica de juego; no necesita el emulador y corre en milisegundos
npm run test:rules     # reglas de seguridad; necesita `npm run emulators` corriendo
```

> **Ojo:** `test:rules` borra **toda** la base del emulador antes de cada test. Si después quieres jugar a mano, vuelve a correr `npm run seed`.

Correr un solo archivo o un solo test:

```bash
npx vitest run --project domain tests/domain/scoring.test.ts
npx vitest run --project rules tests/rules/deadline.spec.ts -t "nombre del test"
```

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run lint` | ESLint |
| `npm run format` | Prettier sobre todo el repo |
| `npm run build` | build de producción en `dist/` |
| `npm run verify:dist` | build + comprueba que ninguna solución quedó dentro de `dist/` |

## Preparar un cuestionario

Un cuestionario es un archivo JSON que el presentador sube desde su pantalla; no hace falta tocar código ni redesplegar. Parte de [docs/cuestionario-ejemplo.json](docs/cuestionario-ejemplo.json):

```json
{
  "title": "Repaso AI — sesión 3",
  "defaultTimeLimitSec": 30,
  "questions": [
    {
      "text": "¿Cuál es la práctica correcta con los permisos de Claude Code?",
      "options": ["Aceptar todo", "Revisar cada permiso y acotarlo al proyecto", "Desactivarlos", "Delegar a TI"],
      "correctIndex": 1,
      "teachingNote": "El permiso acotado por proyecto evita que una sesión toque lo que no debe.",
      "timeLimitSec": 45
    }
  ]
}
```

- `options`: de 2 a 6, sin repetidas. `correctIndex` empieza en 0.
- `teachingNote` es obligatoria: el presentador la ve al revelar (los participantes no).
- `timeLimitSec` y `defaultTimeLimitSec`: entre 5 y 300 segundos; por defecto 30.

Si el archivo tiene errores, se rechaza completo mostrando todos los errores con su ubicación. El contrato completo está en [specs/001-partida-integra/contracts/quiz-file.md](specs/001-partida-integra/contracts/quiz-file.md).

## Estructura

```text
src/
├── domain/      lógica de juego pura (puntaje, fases, podio, apodos, validación); no importa Firebase
├── data/        única capa que habla con Firestore
└── ui/
    ├── player/      pantallas del participante
    ├── presenter/   conducción, publicación, debrief, rondas pasadas
    └── shared/
firestore.rules  todas las reglas del juego
tests/
├── domain/      Vitest, sin emulador
└── rules/       reglas contra el emulador
scripts/         siembra, alta del presentador, mediciones de carga
specs/           especificación, plan y tareas de cada feature (Spec Kit)
```

## Producción

La guía paso a paso para desplegar en un proyecto real de Firebase (plan Spark gratuito), dar de alta al presentador y operar dentro de la cuota está en [docs/despliegue.md](docs/despliegue.md).

## Cómo se trabaja en este repo

- Las decisiones de fondo están en la constitución del proyecto, [.specify/memory/constitution.md](.specify/memory/constitution.md). Manda sobre cualquier otra convención.
- Cada feature se desarrolla con Spec Kit (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`) en su propia rama y carpeta dentro de `specs/`.
- Cualquier cambio a `firestore.rules` va acompañado de sus tests en `tests/rules/`.
- La guía de validación manual, con los escenarios de prueba y los intentos de trampa que deben fallar desde la consola del navegador, está en [specs/001-partida-integra/quickstart.md](specs/001-partida-integra/quickstart.md).
