/**
 * T095 — Presupuesto de una ronda completa contra la cuota de Spark (SC-006).
 *
 * Juega una ronda real con el código de la aplicación: N participantes, cada uno con su
 * cliente y **las mismas suscripciones que abre su pantalla**, y un presentador que
 * conduce, cuenta respuestas y califica. Cuenta:
 *
 * - Lecturas por suscripción: cada evento de snapshot entregado a un participante o al
 *   presentador, medido.
 * - Lecturas puntuales del presentador: documentos devueltos por cada consulta, medidos
 *   con las mismas consultas.
 * - Lecturas de reglas: cada get()/exists()/getAfter() de una regla se factura como
 *   lectura. Se cuentan por operación según firestore.rules (ver RULE_READS).
 * - Escrituras: cada operación, contada.
 *
 * La entrada no se juega aquí (tiene su propia medición y tarda ~1 s por persona en
 * ráfaga): se cuentan sus escrituras, sus lecturas de transacción y de reglas, y el
 * reparto del contador a todos los que ya miran la ronda.
 *
 *   npx firebase emulators:exec --only firestore,auth \
 *     "npx tsx scripts/measure-round-budget.ts 50 10"
 */
import { onSnapshot, doc } from 'firebase/firestore';
import { countAnswers, submitAnswer, watchOwnAnswer } from '../src/data/answers';
import { publishQuiz } from '../src/data/quizzes';
import {
  openQuestion,
  publishRound,
  revealQuestion,
  watchOwnParticipant,
  watchRound,
} from '../src/data/rounds';
import {
  closeRound,
  gradeCurrentQuestion,
  watchOwnScore,
  watchPodium,
  watchResult,
} from '../src/data/scores';
import { parseQuizFile } from '../src/domain/quizFile';
import {
  admin,
  anonymousClient,
  closeAll,
  presenterClient,
  seedParticipants,
  type Client,
} from './lib/emulator-clients';

const N = Number(process.argv[2] ?? 50);
const Q = Number(process.argv[3] ?? 10);
/** El presentador revela, en promedio, a los 20 s; su pantalla cuenta cada 2 s. */
const COUNT_POLLS_PER_QUESTION = 10;

/** Accesos de reglas por operación, leídos de firestore.rules. Las repeticiones se cachean. */
const RULE_READS = {
  joinParticipant: 3, // get(round), getAfter(round), getAfter(nickname)
  joinNickname: 2, // exists(P) / existsAfter(P) / getAfter(P) sobre el mismo documento
  joinIncrement: 2, // exists(P), existsAfter(P)
  answer: 3, // exists(participant), get(round), get(question)
  openQuestion: 2, // get(question), exists(result previo) desde la segunda
  result: 1, // get(round)
  podiumTransition: 1, // exists(result)
  publishRound: 4, // get(quiz), getAfter(A), exists(A)/get(A), getAfter(ronda)
} as const;

const Spark = { readsPerDay: 50_000, writesPerDay: 20_000 };

async function main() {
  const reads = { suscripciones: 0, presentador: 0, reglas: 0, transacciones: 0 };
  const writes = { total: 0 };
  const w = (n: number) => (writes.total += n);

  const presenter = await presenterClient();
  const parsed = parseQuizFile({
    title: 'Presupuesto',
    questions: Array.from({ length: Q }, (_, i) => ({
      text: `P${i}`,
      options: ['A', 'B', 'C', 'D'],
      correctIndex: i % 4,
      teachingNote: `Nota ${i}`,
      timeLimitSec: 60,
    })),
  });
  if (!parsed.ok) throw new Error('inválido');

  // Publicación: fuera del costo por ronda, pero se reporta.
  const quizId = await publishQuiz(presenter.db, parsed.quiz);
  const publishQuizWrites = 1 + 2 * Q;
  const roundId = await publishRound(presenter.db, quizId, N + 10);
  w(2);
  reads.transacciones += 3;
  reads.reglas += RULE_READS.publishRound;

  const players: Client[] = await Promise.all(Array.from({ length: N }, () => anonymousClient()));
  await seedParticipants(roundId, players);

  // Entrada, contada: 3 escrituras, 3 lecturas de transacción y las lecturas de reglas por
  // persona; y cada incremento del contador llega a todos los que ya miran la ronda.
  w(3 * N);
  reads.transacciones += 3 * N;
  reads.reglas +=
    N * (RULE_READS.joinParticipant + RULE_READS.joinNickname + RULE_READS.joinIncrement);
  const joinFanout = N * N; // peor caso: todos miran la ronda desde la pantalla de entrada
  reads.suscripciones += joinFanout;

  // Suscripciones de cada participante, como su pantalla.
  const count = () => reads.suscripciones++;
  const unsubs: Array<() => void> = [];
  for (const p of players) {
    unsubs.push(onSnapshot(doc(p.db, 'config', 'activeRound'), count));
    unsubs.push(watchRound(p.db, roundId, count));
    unsubs.push(watchOwnParticipant(p.db, roundId, p.uid, count));
    unsubs.push(watchOwnScore(p.db, roundId, p.uid, count));
  }
  unsubs.push(onSnapshot(doc(presenter.db, 'config', 'activeRound'), count));
  unsubs.push(watchRound(presenter.db, roundId, count));

  const settle = () => new Promise((r) => setTimeout(r, 400));
  const { db: adminDb } = admin();
  const size = async (path: string, where?: [string, number]) => {
    let q: FirebaseFirestore.Query = adminDb.collection(path);
    if (where !== undefined) q = q.where(where[0], '==', where[1]);
    return (await q.count().get()).data().count;
  };

  for (let n = 0; n < Q; n++) {
    const perQuestion: Array<() => void> = [];
    for (const p of players) {
      perQuestion.push(watchOwnAnswer(p.db, roundId, p.uid, n, count));
      perQuestion.push(watchResult(p.db, roundId, n, count));
    }
    perQuestion.push(watchResult(presenter.db, roundId, n, count));

    await openQuestion(presenter.db, roundId, n);
    w(1);
    reads.transacciones += 2;
    reads.reglas += RULE_READS.openQuestion;
    reads.presentador += 1; // pantalla: la pregunta

    await Promise.all(players.map((p, i) => submitAnswer(p.db, roundId, p.uid, n, (i + n) % 4)));
    w(N);
    reads.reglas += N * RULE_READS.answer;
    await countAnswers(presenter.db, roundId, n);
    reads.presentador += COUNT_POLLS_PER_QUESTION; // una agregación = 1 lectura por cada 1000 entradas

    await revealQuestion(presenter.db, roundId);
    w(1);
    reads.transacciones += 1;

    // Calificación: lo que lee gradeCurrentQuestion, medido con las mismas consultas.
    const graded = {
      round: 1,
      resultCheck: 1,
      questions: await size(`quizzes/${quizId}/questions`),
      solution: 1,
      participants: await size(`rounds/${roundId}/participants`),
      answers: await size(`rounds/${roundId}/answers`, ['questionIndex', n]),
      scores: await size(`rounds/${roundId}/scores`),
    };
    await gradeCurrentQuestion(presenter.db, roundId);
    reads.presentador += Object.values(graded).reduce((a, b) => a + b, 0);
    reads.presentador += 1; // la nota pedagógica en pantalla
    w(N + 1);
    reads.reglas += RULE_READS.result;

    await settle();
    perQuestion.forEach((u) => u());
  }

  // Cierre y podio.
  for (const p of players) unsubs.push(watchPodium(p.db, roundId, count));
  unsubs.push(watchPodium(presenter.db, roundId, count));
  const closeReads = 1 + 1 + Q + N + N;
  await closeRound(presenter.db, roundId);
  reads.presentador += closeReads;
  reads.transacciones += 1;
  reads.reglas += RULE_READS.podiumTransition;
  w(N + 2);
  await settle();
  unsubs.forEach((u) => u());

  const totalReads = reads.suscripciones + reads.presentador + reads.reglas + reads.transacciones;
  const report = {
    participantes: N,
    preguntas: Q,
    lecturas: { ...reads, total: totalReads, deLasCualesRepartoDeLaEntrada: joinFanout },
    escrituras: writes.total,
    escriturasPorPublicarCuestionario: publishQuizWrites,
    cuotaSpark: Spark,
    rondasPorDiaDentroDeLaCuota: Math.floor(
      Math.min(Spark.readsPerDay / totalReads, Spark.writesPerDay / writes.total),
    ),
  };
  console.log(JSON.stringify(report, null, 2));
  await closeAll([presenter, ...players]);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});
