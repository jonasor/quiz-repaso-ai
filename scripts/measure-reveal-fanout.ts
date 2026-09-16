/**
 * T097 — Latencia de revelación (SC-002: menos de 2 s con 50 participantes).
 *
 * 50 participantes reales suscritos, cada uno con su propio cliente, a lo que su pantalla
 * espera al revelar: el agregado de la pregunta. Todos responden. El presentador revela y
 * califica con el código de la aplicación, y se mide desde que pulsa "Revelar" hasta que
 * el último participante recibe el agregado.
 *
 *   npx firebase emulators:exec --only firestore,auth \
 *     "npx tsx scripts/measure-reveal-fanout.ts 50"
 */
import { publishQuiz } from '../src/data/quizzes';
import { openQuestion, publishRound, revealQuestion } from '../src/data/rounds';
import { submitAnswer } from '../src/data/answers';
import { gradeCurrentQuestion, watchOwnScore, watchResult } from '../src/data/scores';
import { parseQuizFile } from '../src/domain/quizFile';
import {
  anonymousClient,
  closeAll,
  percentile,
  presenterClient,
  seedParticipants,
} from './lib/emulator-clients';

const N = Number(process.argv[2] ?? 50);

async function main() {
  const presenter = await presenterClient();
  const parsed = parseQuizFile({
    title: 'Latencia',
    questions: [
      {
        text: 'Q',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 2,
        teachingNote: 'N',
        timeLimitSec: 120,
      },
    ],
  });
  if (!parsed.ok) throw new Error('cuestionario inválido');
  const quizId = await publishQuiz(presenter.db, parsed.quiz);
  const roundId = await publishRound(presenter.db, quizId, N + 10);

  const players = await Promise.all(Array.from({ length: N }, () => anonymousClient()));
  await seedParticipants(roundId, players);
  await openQuestion(presenter.db, roundId, 0);
  const answers = await Promise.all(
    players.map((p, i) => submitAnswer(p.db, roundId, p.uid, 0, i % 4)),
  );
  const confirmed = answers.filter((a) => a.kind === 'confirmed').length;

  const resultAt = new Map<string, number>();
  const scoreAt = new Map<string, number>();
  let t0 = 0;
  const unsubs = players.flatMap((p) => [
    watchResult(p.db, roundId, 0, (r) => {
      if (r !== null && !resultAt.has(p.uid)) resultAt.set(p.uid, performance.now() - t0);
    }),
    watchOwnScore(p.db, roundId, p.uid, (s) => {
      if (s !== null && !scoreAt.has(p.uid)) scoreAt.set(p.uid, performance.now() - t0);
    }),
  ]);
  await new Promise((r) => setTimeout(r, 1_500)); // suscripciones establecidas

  t0 = performance.now();
  await revealQuestion(presenter.db, roundId);
  const tReveal = performance.now() - t0;
  await gradeCurrentQuestion(presenter.db, roundId);
  const tGrade = performance.now() - t0;

  const deadline = performance.now() + 30_000;
  while ((resultAt.size < N || scoreAt.size < N) && performance.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  unsubs.forEach((u) => u());

  const res = [...resultAt.values()];
  const sco = [...scoreAt.values()];
  const report = {
    participantes: N,
    respuestasConfirmadas: confirmed,
    msHastaFaseRevelada: Math.round(tReveal),
    msHastaCalificacionEscrita: Math.round(tGrade),
    agregadoRecibido: {
      participantes: res.length,
      p50: Math.round(percentile(res, 50)),
      p95: Math.round(percentile(res, 95)),
      ultimo: Math.round(Math.max(...res)),
    },
    puntajePropioRecibido: {
      participantes: sco.length,
      p95: Math.round(percentile(sco, 95)),
      ultimo: Math.round(Math.max(...sco)),
    },
    sc002: res.length === N && Math.max(...res) < 2_000 ? 'CUMPLE (último < 2 s)' : 'NO CUMPLE',
  };
  console.log(JSON.stringify(report, null, 2));
  await closeAll([presenter, ...players]);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(2);
});
