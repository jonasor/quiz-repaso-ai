/**
 * T020 — Denegación 14 y cierre por defecto.
 *
 * Un contrato de seguridad que solo abre permisos no es un contrato. Esto verifica
 * el suelo: sin autenticar no se puede nada, y ninguna ruta no declarada admite
 * nada. Cada permiso que se abra a partir de aquí tiene que llegar con su test.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { asAnon, asUnauthenticated, setupTestEnv } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'rounds', 'r1'), { phase: 'lobby', currentIndex: -1 });
    await setDoc(doc(ctx.firestore(), 'rutaInventada', 'x'), { a: 1 });
  });
});

describe('cierre por defecto', () => {
  it('sin autenticar no se puede leer nada (denegación 14)', async () => {
    const db = asUnauthenticated(env).firestore();
    await assertFails(getDoc(doc(db, 'rounds', 'r1')));
  });

  it('sin autenticar no se puede escribir nada', async () => {
    const db = asUnauthenticated(env).firestore();
    await assertFails(setDoc(doc(db, 'rounds', 'r2'), { phase: 'lobby' }));
  });

  it('ninguna ruta no declarada admite lectura, ni siquiera autenticado', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertFails(getDoc(doc(db, 'rutaInventada', 'x')));
    await assertFails(getDocs(collection(db, 'rutaInventada')));
  });

  it('ninguna ruta no declarada admite escritura', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertFails(setDoc(doc(db, 'rutaInventada', 'y'), { a: 2 }));
    await assertFails(setDoc(doc(db, 'config', 'cualquiera'), { a: 2 }));
  });

  it('un participante no puede borrar una ronda: delete no está permitido en ninguna ruta', async () => {
    const db = asAnon(env, 'p1').firestore();
    await assertFails(setDoc(doc(db, 'rounds', 'r1'), { phase: 'archived' }));
  });
});
