import { defineConfig } from 'vitest/config';

// Dos proyectos, deliberadamente separados (Principio III).
//
//   domain -> lógica pura. Sin emulador, sin red, sin credenciales. Debe correr
//             en milisegundos; si empieza a tardar, algo importó Firebase.
//   rules  -> firestore.rules contra la Emulator Suite. Exige el emulador vivo.
//
// Están partidos para que `npm run test:domain` nunca dependa de un proceso
// externo, que es lo que hace baratos los cambios de reglas de juego.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'domain',
          include: ['tests/domain/**/*.test.ts'],
          environment: 'node',
          globals: true,
        },
      },
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.spec.ts'],
          environment: 'node',
          globals: true,
          testTimeout: 20000,
          hookTimeout: 20000,
          fileParallelism: false,
        },
      },
    ],
  },
});
