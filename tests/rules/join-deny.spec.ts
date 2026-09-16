/**
 * T033 — Entrada: denegaciones 15 a 22.
 *
 * Por cada condición cruzada, dos tests: el documento ausente y el documento ya
 * presente de antes. El segundo es el que se olvida, y es el que dejó pasar las
 * fugas 20 y 21 en el primer diseño.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { asAnon, setupTestEnv } from './helpers';
import { ROUND, joinBatch, seedParticipant, seedQuiz, seedRound } from './fixtures';

let env: RulesTestEnvironment;
const anon = (uid: string) => asAnon(env, uid).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedQuiz(env);
  await seedRound(env);
});

describe('denegación 15 — apodo ya tomado (FR-007)', () => {
  it('reservar un apodo cuya reserva ya existe', async () => {
    await seedParticipant(env, 'p1', 'Astuto', 'Zorro');
    await assertFails(joinBatch(anon('p2'), 'p2', 1, { adjective: 'Astuto', animal: 'Zorro' }));
  });
});

describe('denegación 16 — apodo fuera del catálogo (FR-006, FR-054)', () => {
  it('un adjetivo inventado', async () => {
    await assertFails(joinBatch(anon('p1'), 'p1', 0, { adjective: 'Juan', animal: 'Zorro' }));
  });

  it('un animal inventado', async () => {
    await assertFails(joinBatch(anon('p1'), 'p1', 0, { adjective: 'Astuto', animal: 'Pérez' }));
  });

  it('texto libre como campo extra del participante', async () => {
    const db = anon('p1');
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', ROUND, 'participants', 'p1'), {
      adjective: 'Astuto',
      animal: 'Zorro',
      joinedAt: new Date(),
      nombre: 'Juan Pérez',
    });
    b.set(doc(db, 'rounds', ROUND, 'nicknames', 'Astuto_Zorro'), { uid: 'p1' });
    b.update(doc(db, 'rounds', ROUND), { participantCount: 1 });
    await assertFails(b.commit());
  });
});

describe('denegación 17 — incrementar el contador sin entrar (FR-009, FR-010)', () => {
  it('el incremento suelto, sin documento de participante', async () => {
    await assertFails(updateDoc(doc(anon('p1'), 'rounds', ROUND), { participantCount: 1 }));
  });

  it('incremento con reserva, pero sin documento de participante', async () => {
    await assertFails(joinBatch(anon('p1'), 'p1', 0, { participant: false }));
  });
});

describe('denegación 18 — entrar sin contarse (FR-009)', () => {
  it('participante y reserva, sin incremento', async () => {
    await assertFails(joinBatch(anon('p1'), 'p1', 0, { counter: false }));
  });

  it('incremento de más de uno', async () => {
    await assertFails(joinBatch(anon('p1'), 'p1', 0, { counterTo: 5 }));
  });
});

describe('denegación 19 — cupo lleno (FR-010)', () => {
  it('con participantCount == maxParticipants', async () => {
    await env.clearFirestore();
    await seedQuiz(env);
    await seedRound(env, { maxParticipants: 2, participantCount: 2 });
    await assertFails(joinBatch(anon('p9'), 'p9', 2));
  });
});

describe('denegación 20 — entrar con la reserva de otro (FR-007)', () => {
  it('la reserva ya existe y es de otro: el participante no crea nada nuevo', async () => {
    await seedParticipant(env, 'p1', 'Astuto', 'Zorro');
    await assertFails(
      joinBatch(anon('p2'), 'p2', 1, { adjective: 'Astuto', animal: 'Zorro', nickname: false }),
    );
  });

  it('crea la reserva, pero a nombre de otro uid', async () => {
    await assertFails(joinBatch(anon('p1'), 'p1', 0, { nicknameUid: 'p2' }));
  });

  it('entra con un apodo y reserva uno distinto', async () => {
    await assertFails(
      joinBatch(anon('p1'), 'p1', 0, {
        adjective: 'Astuto',
        animal: 'Zorro',
        nickname: 'Sabio_Lince',
      }),
    );
  });
});

describe('denegación 21 — incrementar el contador ya estando dentro (FR-009, FR-010)', () => {
  it('el participante ya existe de antes: el incremento suelto se rechaza', async () => {
    await seedParticipant(env, 'p1');
    await assertFails(updateDoc(doc(anon('p1'), 'rounds', ROUND), { participantCount: 2 }));
  });

  it('repetir incrementos para llenar la sala', async () => {
    await seedParticipant(env, 'p1');
    for (const n of [2, 3, 4]) {
      await assertFails(updateDoc(doc(anon('p1'), 'rounds', ROUND), { participantCount: n }));
    }
  });
});

describe('denegación 22 — reservar apodos adicionales (FR-007)', () => {
  it('ya dentro, reservar un segundo apodo', async () => {
    await seedParticipant(env, 'p1', 'Astuto', 'Zorro');
    await assertFails(
      setDoc(doc(anon('p1'), 'rounds', ROUND, 'nicknames', 'Sabio_Lince'), { uid: 'p1' }),
    );
  });

  it('reservar sin entrar', async () => {
    await assertFails(
      setDoc(doc(anon('p1'), 'rounds', ROUND, 'nicknames', 'Sabio_Lince'), { uid: 'p1' }),
    );
  });

  it('dentro del mismo acto de entrada, reservar además un apodo ajeno', async () => {
    const db = anon('p1');
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', ROUND, 'participants', 'p1'), {
      adjective: 'Astuto',
      animal: 'Zorro',
      joinedAt: new Date(),
    });
    b.set(doc(db, 'rounds', ROUND, 'nicknames', 'Astuto_Zorro'), { uid: 'p1' });
    b.set(doc(db, 'rounds', ROUND, 'nicknames', 'Sabio_Lince'), { uid: 'p1' });
    b.update(doc(db, 'rounds', ROUND), { participantCount: 1 });
    await assertFails(b.commit());
  });
});

describe('otras condiciones de la entrada', () => {
  it('entrar en una ronda archivada', async () => {
    await env.clearFirestore();
    await seedQuiz(env);
    await seedRound(env, { phase: 'archived', active: false });
    await assertFails(joinBatch(anon('p1'), 'p1', 0));
  });

  it('crear el documento de participante de otro uid', async () => {
    const db = anon('p1');
    const b = writeBatch(db);
    b.set(doc(db, 'rounds', ROUND, 'participants', 'p2'), {
      adjective: 'Astuto',
      animal: 'Zorro',
      joinedAt: new Date(),
    });
    b.set(doc(db, 'rounds', ROUND, 'nicknames', 'Astuto_Zorro'), { uid: 'p1' });
    b.update(doc(db, 'rounds', ROUND), { participantCount: 1 });
    await assertFails(b.commit());
  });
});
