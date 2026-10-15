import type {
  Profile,
  ResultRecord,
  ResultSource,
  SkillId,
  TrainingSession,
} from '../../src/core/types.ts';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter++;
  return `${prefix}-${counter}`;
}

export function result(
  skill: SkillId,
  attempts: number,
  successes: number,
  opts: Partial<ResultRecord> & { source?: ResultSource } = {},
): ResultRecord {
  const date = opts.date ?? '2026-10-14';
  return {
    id: uid('r'),
    sessionId: opts.sessionId ?? uid('s'),
    createdAt: `${date}T15:00:00.000Z`,
    date,
    skill,
    activityId: opts.activityId ?? 'teste',
    activityKind: opts.activityKind ?? 'tecnico',
    source: opts.source ?? 'contagem_manual',
    attempts,
    successes,
    difficulty: opts.difficulty ?? 1,
    ...opts,
  };
}

export function session(date: string, opts: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: opts.id ?? uid('s'),
    date,
    startedAt: `${date}T15:00:00.000Z`,
    endedAt: `${date}T15:20:00.000Z`,
    durationSec: 1200,
    kind: 'fisico',
    activityId: 'treino',
    activityName: 'Treino',
    status: 'concluida',
    ...opts,
  };
}

export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    apelido: 'Teste',
    posicao: 'meio',
    experiencia: 'as_vezes',
    focos: [],
    minutosDisponiveis: 30,
    espaco: 'medio',
    materiais: ['bola', 'parede', 'cones'],
    dificuldade: 'facil',
    preferenciaSessao: 'curtas',
    modalidade: 'futsal',
    criadoEm: '2026-10-14T12:00:00.000Z',
    atualizadoEm: '2026-10-14T12:00:00.000Z',
    ...overrides,
  };
}
