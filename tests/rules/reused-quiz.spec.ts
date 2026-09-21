/**
 * Cuestionario reutilizado: los resultados de una ronda anterior no pueden revelar las
 * respuestas de la ronda en curso (FR-021, FR-045, FR-051; denegación 25).
 *
 * `results/{n}` guarda una copia de `correctIndex` y nunca se borra. Como un cuestionario
 * se juega varias veces, esa copia sobrevive en la ronda vieja mientras las mismas
 * preguntas siguen abiertas en la ronda nueva.
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, Timestamp, type Firestore } from 'firebase/firestore';
import { asAnon, asPresenter, setupTestEnv } from './helpers';
import { ROUND, seedDoc, seedOpenRound, seedParticipant, seedQuiz, seedRound } from './fixtures';

const VIEJA = 'r0';

let env: RulesTestEnvironment;
const anon = (uid = 'p1') => asAnon(env, uid).firestore() as unknown as Firestore;
const presenter = () => asPresenter(env).firestore() as unknown as Firestore;

const resultDoc = (n = 0) => ({
  questionIndex: n,
  distribution: [0, 2, 0, 0],
  answerCount: 2,
  correctIndex: 1,
  correctPct: 100,
  revealedAt: Timestamp.now(),
});

beforeAll(async () => {
  env = await setupTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedQuiz(env);
  // La ronda vieja del mismo cuestionario, ya archivada y con su pregunta 0 calificada.
  await seedRound(env, { phase: 'archived', active: false, currentIndex: 1 }, VIEJA);
  await seedDoc(env, `rounds/${VIEJA}/results/0`, resultDoc());
  // La ronda en curso, con esa misma pregunta 0 abierta.
  await seedOpenRound(env);
  await seedParticipant(env, 'p1');
});

describe('cuestionario reutilizado (denegación 25)', () => {
  it('el participante de la ronda nueva no lee el agregado de la vieja', async () => {
    // El id de la ronda vieja es alcanzable: el puntero era público mientras estuvo viva.
    await assertSucceeds(getDoc(doc(anon('p1'), 'rounds', VIEJA)));
    await assertFails(getDoc(doc(anon('p1'), 'rounds', VIEJA, 'results', '0')));
  });

  it('tampoco lo lee quien nunca entró a ninguna de las dos rondas', async () => {
    await assertFails(getDoc(doc(anon('fuera'), 'rounds', VIEJA, 'results', '0')));
    await assertFails(getDocs(collection(anon('fuera'), 'rounds', VIEJA, 'results')));
  });

  it('el presentador sí, porque revisa rondas pasadas (FR-074)', async () => {
    await assertSucceeds(getDoc(doc(presenter(), 'rounds', VIEJA, 'results', '0')));
  });

  it('y el agregado de la ronda viva sigue siendo público al revelar', async () => {
    await seedDoc(env, `rounds/${ROUND}/results/0`, resultDoc());
    await assertSucceeds(getDoc(doc(anon('p1'), 'rounds', ROUND, 'results', '0')));
    await assertSucceeds(getDoc(doc(anon('fuera'), 'rounds', ROUND, 'results', '0')));
  });
});
