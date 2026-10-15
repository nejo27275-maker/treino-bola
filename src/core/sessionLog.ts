/**
 * Monta os registros (sessão + resultados) de cada tipo de atividade. Cada resultado
 * guarda a origem (simulador, contagem manual, observação de vídeo, câmera, autoavaliação)
 * para que o motor saiba o quanto confiar nele.
 */
import { localDate } from './dates.ts';
import { newId } from './ids.ts';
import { summarizeRounds } from './scoring.ts';
import { SIM_MODES } from './sim/index.ts';
import type {
  ActivityKind,
  CriterionRating,
  DiscomfortLevel,
  ResultRecord,
  ResultSource,
  RoundLog,
  SimModeId,
  SkillId,
  TrainingSession,
} from './types.ts';

export interface Logged {
  session: TrainingSession;
  results: ResultRecord[];
}

interface Timing {
  startedAt: Date;
  endedAt: Date;
  /** Tempo ativo (sem pausas), em segundos. */
  activeSec?: number;
}

function baseSession(
  kind: ActivityKind,
  activityId: string,
  activityName: string,
  timing: Timing,
  extra: Partial<TrainingSession> = {},
): TrainingSession {
  const durationSec =
    timing.activeSec ?? Math.max(0, Math.round((timing.endedAt.getTime() - timing.startedAt.getTime()) / 1000));
  return {
    id: newId(),
    date: localDate(timing.startedAt),
    startedAt: timing.startedAt.toISOString(),
    endedAt: timing.endedAt.toISOString(),
    durationSec: Math.round(durationSec),
    kind,
    activityId,
    activityName,
    status: 'concluida',
    ...extra,
  };
}

function record(
  session: TrainingSession,
  skill: SkillId,
  source: ResultSource,
  attempts: number,
  successes: number,
  extra: Partial<ResultRecord> = {},
): ResultRecord {
  if (successes > attempts) throw new Error('Mais acertos que tentativas');
  return {
    id: newId(),
    sessionId: session.id,
    createdAt: session.endedAt,
    date: session.date,
    skill,
    activityId: session.activityId,
    activityKind: session.kind,
    source,
    attempts,
    successes,
    difficulty: session.difficulty ?? 1,
    ...extra,
  };
}

export interface ExerciseLogInput extends Timing {
  exercise: { id: string; nome: string; skills: SkillId[]; teste?: boolean; nivel: number };
  /** false quando o jogador concluiu sem contar acertos. */
  counted: boolean;
  attempts: number;
  successes: number;
  errorTags?: Record<string, number>;
  seriesDone: number;
  seriesTotal: number;
  rpe?: number;
  discomfort?: DiscomfortLevel;
  notes?: string;
}

export function logExercise(input: ExerciseLogInput): Logged {
  const complete = input.seriesDone >= input.seriesTotal;
  const session = baseSession(
    input.exercise.teste ? 'teste' : 'tecnico',
    input.exercise.id,
    input.exercise.nome,
    input,
    {
      status: complete ? 'concluida' : 'interrompida',
      skills: input.exercise.skills,
      difficulty: input.exercise.nivel,
      ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
      ...(input.discomfort !== undefined ? { discomfort: input.discomfort } : {}),
      ...(input.notes ? { notes: input.notes.slice(0, 2000) } : {}),
    },
  );
  const results: ResultRecord[] = [];
  if (input.counted && input.attempts > 0) {
    session.summary = { attempts: input.attempts, successes: input.successes };
    const tags = Object.fromEntries(Object.entries(input.errorTags ?? {}).filter(([, n]) => n > 0));
    // O resultado é atribuído ao fundamento principal (o critério de sucesso mede esse fundamento).
    results.push(
      record(session, input.exercise.skills[0] as SkillId, 'contagem_manual', input.attempts, input.successes, {
        ...(Object.keys(tags).length ? { errorTags: tags } : {}),
      }),
    );
  }
  return { session, results };
}

export interface SimLogInput extends Timing {
  mode: SimModeId;
  seed: number;
  difficulty: number;
  rounds: RoundLog[];
}

export function logSimulator(input: SimLogInput): Logged {
  const info = SIM_MODES[input.mode];
  const summary = summarizeRounds(input.rounds);
  const session = baseSession('simulador', input.mode, `Simulador: ${info.nome}`, input, {
    skills: [info.skill],
    difficulty: input.difficulty,
    seed: input.seed,
    summary,
    rounds: input.rounds.slice(0, 500),
  });
  const results: ResultRecord[] = [];
  if (summary.attempts > 0) {
    const times = input.rounds
      .filter((r) => r.success && typeof r.responseMs === 'number')
      .map((r) => Math.round(r.responseMs as number));
    results.push(
      record(session, info.skill, 'simulador', summary.attempts, summary.successes, {
        ...(times.length ? { responseTimesMs: times } : {}),
        ...(summary.incomplete ? { incomplete: summary.incomplete } : {}),
      }),
    );
  }
  return { session, results };
}

export interface QuizAnswer {
  scenarioId: string;
  skill: SkillId;
  correct: boolean;
  responseMs?: number;
}

export function logQuiz(input: Timing & { answers: QuizAnswer[]; seed: number }): Logged {
  const skills = [...new Set(input.answers.map((a) => a.skill))];
  const correct = input.answers.filter((a) => a.correct).length;
  const session = baseSession('leitura', 'cenarios-leitura', 'Cenários de leitura de jogo', input, {
    skills,
    seed: input.seed,
    summary: { attempts: input.answers.length, successes: correct },
  });
  const results = skills.map((skill) => {
    const mine = input.answers.filter((a) => a.skill === skill);
    return record(session, skill, 'quiz', mine.length, mine.filter((a) => a.correct).length);
  });
  return { session, results };
}

export interface PhysicalLogInput extends Timing {
  workout: { id: string; nome: string; skills: SkillId[] };
  blocksDone: number;
  blocksTotal: number;
  rpe?: number;
  discomfort?: DiscomfortLevel;
  discomfortArea?: string;
  notes?: string;
}

export function logPhysical(input: PhysicalLogInput): Logged {
  const session = baseSession('fisico', input.workout.id, input.workout.nome, input, {
    status: input.blocksDone >= input.blocksTotal ? 'concluida' : 'interrompida',
    skills: input.workout.skills,
    ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
    ...(input.discomfort !== undefined ? { discomfort: input.discomfort } : {}),
    ...(input.discomfortArea ? { discomfortArea: input.discomfortArea.slice(0, 120) } : {}),
    ...(input.notes ? { notes: input.notes.slice(0, 2000) } : {}),
  });
  return { session, results: [] };
}

export function logMental(input: Timing & { activity: { id: string; nome: string }; notes?: string }): Logged {
  const session = baseSession('mental', input.activity.id, input.activity.nome, input, {
    skills: ['concentracao'],
    ...(input.notes ? { notes: input.notes.slice(0, 2000) } : {}),
  });
  return { session, results: [] };
}

export function logSelfAssessment(now: Date, ratings: Partial<Record<SkillId, number>>): Logged {
  const entries = Object.entries(ratings).filter(
    (e): e is [SkillId, number] => typeof e[1] === 'number' && e[1] >= 1 && e[1] <= 5,
  );
  const session = baseSession('autoavaliacao', 'autoavaliacao', 'Autoavaliação', { startedAt: now, endedAt: now, activeSec: 0 }, {
    skills: entries.map(([s]) => s),
  });
  const results = entries.map(([skill, rating]) =>
    record(session, skill, 'autoavaliacao', 0, 0, { rating: Math.round(rating) }),
  );
  return { session, results };
}

export interface ReactionTrial {
  expected: 'esquerda' | 'direita';
  detected: 'esquerda' | 'direita' | 'indefinido' | null;
  reactionMs: number | null;
  falseStart: boolean;
}

/** Treino de reação com a câmera: só tentativas válidas (sem saída antecipada) contam. */
export function logCameraReaction(input: Timing & { trials: ReactionTrial[]; facing: string }): Logged {
  const valid = input.trials.filter((t) => !t.falseStart && t.detected !== 'indefinido');
  const successes = valid.filter((t) => t.detected === t.expected).length;
  const timeouts = valid.filter((t) => t.detected === null).length;
  const session = baseSession('camera', 'camera-reacao', 'Câmera: reação com movimento', input, {
    skills: ['reacao', 'agilidade'],
    summary: { attempts: valid.length, successes, incomplete: timeouts },
    notes: `Câmera ${input.facing}. Tentativas anuladas: ${input.trials.length - valid.length}.`,
  });
  const times = valid
    .filter((t) => t.detected === t.expected && t.reactionMs !== null)
    .map((t) => Math.round(t.reactionMs as number));
  const results =
    valid.length > 0
      ? [
          record(session, 'reacao', 'camera_movimento', valid.length, successes, {
            ...(times.length ? { responseTimesMs: times } : {}),
            ...(timeouts ? { incomplete: timeouts } : {}),
          }),
        ]
      : [];
  if (times.length) session.summary = { ...session.summary!, avgResponseMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length) };
  return { session, results };
}

export function logVideoAnalysis(
  timing: Timing,
  videoName: string,
  ratings: Record<string, CriterionRating>,
  criteria: { id: string; skill: SkillId }[],
  toEvidence: (r: CriterionRating) => { attempts: number; successes: number } | null,
): Logged {
  const session = baseSession('video', 'analise-video', `Vídeo: ${videoName.slice(0, 80)}`, timing, {
    skills: [...new Set(criteria.filter((c) => ratings[c.id] && ratings[c.id] !== 'nao_visivel').map((c) => c.skill))],
  });
  const results: ResultRecord[] = [];
  let attempts = 0;
  let successes = 0;
  for (const c of criteria) {
    const rating = ratings[c.id];
    if (!rating) continue;
    const evidence = toEvidence(rating);
    if (!evidence) continue;
    attempts += evidence.attempts;
    successes += evidence.successes;
    results.push(record(session, c.skill, 'observacao_video', evidence.attempts, evidence.successes, { notes: `Critério: ${c.id}` }));
  }
  if (attempts > 0) session.summary = { attempts, successes };
  return { session, results };
}
