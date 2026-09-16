# Contract — Archivo de cuestionario

**Feature**: `001-partida-integra` | **Requisitos**: FR-064 a FR-070

Es la única interfaz externa de la aplicación: lo que el presentador prepara **fuera**
de ella y sube desde una pantalla autenticada. Su formato es un contrato con una
persona, no con un programa, así que se optimiza para ser escrito a mano sin
equivocarse y para que los errores se detecten antes de publicar.

## Formato

JSON. Un archivo, un cuestionario.

```json
{
  "title": "Repaso AI — sesión 3",
  "defaultTimeLimitSec": 30,
  "questions": [
    {
      "text": "¿Cuál es la práctica correcta con los permisos de Claude Code?",
      "options": [
        "Aceptar todo para no perder tiempo",
        "Revisar cada permiso y acotarlo al proyecto",
        "Desactivar los permisos globalmente",
        "Delegar la decisión al equipo de TI"
      ],
      "correctIndex": 1,
      "teachingNote": "El punto es que el permiso acotado por proyecto es lo que evita que una sesión toque lo que no debe.",
      "timeLimitSec": 45
    }
  ]
}
```

## Campos

### Raíz

| Campo | Requerido | Tipo | Notas |
|---|---|---|---|
| `title` | sí | string no vacío | |
| `defaultTimeLimitSec` | no | entero 5..300 | Por defecto 30 (FR-070) |
| `questions` | sí | array, al menos 1 | Longitud variable (FR-020) |

### Por pregunta

| Campo | Requerido | Tipo | Notas |
|---|---|---|---|
| `text` | sí | string no vacío | |
| `options` | sí | array de 2 a 6 strings no vacíos, sin repetidos | |
| `correctIndex` | sí | entero, `0 <= correctIndex < options.length` | |
| `teachingNote` | sí | string no vacío | Obligatoria: FR-072 la exige en cada revelación |
| `timeLimitSec` | no | entero 5..300 | Hereda `defaultTimeLimitSec` |

`teachingNote` es obligatoria a propósito. El spec la pide en el momento de revelar
cualquier pregunta, así que un cuestionario sin ella publicaría una ronda que no puede
cumplir FR-072. Es más barato rechazar el archivo que descubrirlo en vivo.

## Validación

La ejecuta `src/domain/quizFile.ts`, **antes** de cualquier escritura (FR-069). Es
dominio puro: se prueba con Vitest sin emulador.

Devuelve o un cuestionario válido, o la lista completa de errores con su ubicación. No
se detiene en el primero: quien corrige un archivo de 20 preguntas necesita ver todos
los problemas de una pasada.

Mensajes con ubicación, no genéricos:

```text
questions[3].correctIndex: 4 está fuera de rango; options tiene 4 elementos (índices 0..3)
questions[7].teachingNote: requerida y no puede estar vacía
questions[11].options: "Verdadero" aparece dos veces
title: requerido y no puede estar vacío
```

**La publicación es todo o nada** (FR-069). Si la validación falla no se escribe nada,
así que no queda un cuestionario a medio publicar.

## Cómo se parte al publicar

El paso que materializa la garantía de D3: el archivo trae la solución junto a la
pregunta, y la publicación las separa en documentos distintos.

| Del archivo | Va a | Visibilidad |
|---|---|---|
| `title`, longitud de `questions` | `quizzes/{quizId}` | pública |
| `text`, `options`, `timeLimitSec` resuelto | `quizzes/{quizId}/questions/{n}` | pública |
| `correctIndex`, `teachingNote` | `quizzes/{quizId}/solutions/{n}` | solo presentador |

El `timeLimitSec` se resuelve en el cliente al publicar, no al abrir la pregunta: el
documento público siempre lleva un valor explícito, para que la regla del plazo no
tenga que interpretar una ausencia.

Si el código de publicación se equivocara y metiera `correctIndex` en el documento
público, **las reglas rechazarían la escritura** (denegación 11 del contrato de reglas).
La garantía no depende de que este paso esté bien escrito.

## Publicar una ronda es otro acto

Publicar un cuestionario deja contenido reutilizable. Publicar una **ronda** (FR-021)
toma un cuestionario ya publicado y crea una ejecución con su propio tope de
participantes (FR-009), archivando la ronda activa anterior (FR-022). El tope es
atributo de la ronda y no viaja en el archivo, porque el mismo cuestionario puede
jugarse ante grupos de tamaños distintos.
