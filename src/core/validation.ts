/**
 * Formato de exportação e validação de importação.
 *
 * O arquivo importado é tratado apenas como dados: cada registro é reconstruído campo a
 * campo, com tipos, limites e enumerações conferidos. Campos desconhecidos são descartados.
 * Nada do arquivo é executado ou inserido como HTML.
 */
import { isValidDate } from './dates.ts';
import { isSimModeId } from './sim/index.ts';
import { isSkillId } from './skills.ts';
import type {
  ActivityKind,
  Competition,
  CriterionRating,
  DiscomfortLevel,
  Profile,
  ResultRecord,
  ResultSource,
  RoundLog,
  Settings,
  SimLevels,
  SkillId,
  TrainingSession,
  VideoAnalysis,
  VideoMarker,
} from './types.ts';
import {
  ACTIVITY_KINDS,
  DIFFICULTY_PREFS,
  EXPERIENCE_LEVELS,
  MATERIALS,
  MODALITIES,
  POSITIONS,
  RESULT_SOURCES,
  SESSION_PREFS,
  SPACES,
} from './types.ts';

export const EXPORT_APP_ID = 'claudio-futebol-ai';
export const EXPORT_SCHEMA_VERSION = 1;
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const LIMITS = {
  sessions: 20_000,
  results: 100_000,
  videoAnalyses: 2_000,
  text: 2_000,
  shortText: 120,
  rounds: 500,
  markers: 200,
  routine: 30,
};

export interface ExportData {
  app: typeof EXPORT_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  profile: Profile | null;
  settings: Settings | null;
  competition: Competition | null;
  simLevels: SimLevels | null;
  preGameRoutine: string[] | null;
  sessions: TrainingSession[];
  results: ResultRecord[];
  videoAnalyses: VideoAnalysis[];
}

export type ImportValidation =
  | { ok: true; data: ExportData; warnings: string[] }
  | { ok: false; errors: string[] };

class Invalid extends Error {}

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new Invalid(`${path}: deveria ser um objeto`);
  return v as Record<string, unknown>;
}

function str(v: unknown, path: string, max = LIMITS.text): string {
  if (typeof v !== 'string') throw new Invalid(`${path}: deveria ser texto`);
  if (v.length > max) throw new Invalid(`${path}: texto longo demais`);
  return v;
}

function optStr(v: unknown, path: string, max = LIMITS.text): string | undefined {
  return v === undefined || v === null ? undefined : str(v, path, max);
}

function id(v: unknown, path: string): string {
  const s = str(v, path, 100);
  if (!ID_RE.test(s)) throw new Invalid(`${path}: identificador inválido`);
  return s;
}

function num(v: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new Invalid(`${path}: deveria ser um número`);
  if (v < min || v > max) throw new Invalid(`${path}: fora do intervalo ${min}–${max}`);
  if (integer && !Number.isInteger(v)) throw new Invalid(`${path}: deveria ser inteiro`);
  return v;
}

/** Número não negativo; valores acima do limite são reduzidos ao limite (não recusados). */
function capped(v: unknown, path: string, max: number): number {
  return Math.min(max, num(v, path, 0, Number.POSITIVE_INFINITY));
}

function optNum(
  v: unknown,
  path: string,
  min: number,
  max: number,
  integer = false,
): number | undefined {
  return v === undefined || v === null ? undefined : num(v, path, min, max, integer);
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new Invalid(`${path}: deveria ser verdadeiro/falso`);
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new Invalid(`${path}: valor não permitido`);
  }
  return v as T;
}

function date(v: unknown, path: string): string {
  if (!isValidDate(v)) throw new Invalid(`${path}: data inválida (use AAAA-MM-DD)`);
  return v;
}

function iso(v: unknown, path: string): string {
  const s = str(v, path, 40);
  if (!ISO_RE.test(s) || Number.isNaN(Date.parse(s)))
    throw new Invalid(`${path}: data/hora inválida`);
  return s;
}

function arr(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) throw new Invalid(`${path}: deveria ser uma lista`);
  if (v.length > max) throw new Invalid(`${path}: itens demais (máximo ${max})`);
  return v;
}

function skill(v: unknown, path: string): SkillId {
  if (!isSkillId(v)) throw new Invalid(`${path}: fundamento desconhecido`);
  return v;
}

export function validateProfile(v: unknown, path = 'perfil'): Profile {
  const o = obj(v, path);
  const focos = arr(o.focos ?? [], `${path}.focos`, 20).map((s, i) =>
    skill(s, `${path}.focos[${i}]`),
  );
  const materiais = arr(o.materiais ?? [], `${path}.materiais`, 10).map((m, i) =>
    oneOf(m, MATERIALS, `${path}.materiais[${i}]`),
  );
  return {
    apelido: str(o.apelido ?? '', `${path}.apelido`, 40),
    posicao: oneOf(o.posicao, POSITIONS, `${path}.posicao`),
    experiencia: oneOf(o.experiencia, EXPERIENCE_LEVELS, `${path}.experiencia`),
    focos: [...new Set(focos)],
    minutosDisponiveis: num(o.minutosDisponiveis, `${path}.minutosDisponiveis`, 5, 180, true),
    espaco: oneOf(o.espaco, SPACES, `${path}.espaco`),
    materiais: [...new Set(materiais)],
    dificuldade: oneOf(o.dificuldade, DIFFICULTY_PREFS, `${path}.dificuldade`),
    preferenciaSessao: oneOf(o.preferenciaSessao, SESSION_PREFS, `${path}.preferenciaSessao`),
    modalidade: oneOf(o.modalidade, MODALITIES, `${path}.modalidade`),
    criadoEm: iso(o.criadoEm, `${path}.criadoEm`),
    atualizadoEm: iso(o.atualizadoEm, `${path}.atualizadoEm`),
  };
}

export function validateSettings(v: unknown, path = 'configuracoes'): Settings {
  const o = obj(v, path);
  return {
    som: bool(o.som, `${path}.som`),
    vibracao: bool(o.vibracao, `${path}.vibracao`),
    tema: oneOf(o.tema, ['sistema', 'claro', 'escuro'] as const, `${path}.tema`),
    reduzirAnimacoes: bool(o.reduzirAnimacoes, `${path}.reduzirAnimacoes`),
  };
}

export function validateCompetition(v: unknown, path = 'competicao'): Competition {
  const o = obj(v, path);
  const nome = str(o.nome, `${path}.nome`, 80).trim();
  if (!nome) throw new Invalid(`${path}.nome: obrigatório`);
  return { nome, data: date(o.data, `${path}.data`) };
}

function validateSimLevels(v: unknown, path = 'niveisSimulador'): SimLevels {
  const o = obj(v, path);
  const out: Partial<SimLevels> = {};
  for (const [k, value] of Object.entries(o)) {
    if (!isSimModeId(k)) continue;
    out[k] = num(value, `${path}.${k}`, 1, 5, true);
  }
  return {
    passe_brecha: out.passe_brecha ?? 1,
    dominio_orientado: out.dominio_orientado ?? 1,
    olhe_antes: out.olhe_antes ?? 1,
    decisao_rapida: out.decisao_rapida ?? 1,
    reacao_pressao: out.reacao_pressao ?? 1,
    finalizacao: out.finalizacao ?? 1,
  };
}

function validateRound(v: unknown, path: string): RoundLog {
  const o = obj(v, path);
  const round: RoundLog = {
    round: num(o.round, `${path}.round`, 0, 10_000, true),
    seed: num(o.seed, `${path}.seed`, 0, 4_294_967_295, true),
    outcome: str(o.outcome, `${path}.outcome`, 40),
    success: bool(o.success, `${path}.success`),
    points: num(o.points, `${path}.points`, 0, 100),
  };
  if (o.incomplete !== undefined) round.incomplete = bool(o.incomplete, `${path}.incomplete`);
  const responseMs = optNum(o.responseMs, `${path}.responseMs`, 0, 600_000);
  if (responseMs !== undefined) round.responseMs = responseMs;
  const choice = optStr(o.choice, `${path}.choice`, 40);
  if (choice !== undefined) round.choice = choice;
  return round;
}

export function validateSession(v: unknown, path = 'sessao'): TrainingSession {
  const o = obj(v, path);
  const session: TrainingSession = {
    id: id(o.id, `${path}.id`),
    date: date(o.date, `${path}.date`),
    startedAt: iso(o.startedAt, `${path}.startedAt`),
    endedAt: iso(o.endedAt, `${path}.endedAt`),
    durationSec: capped(o.durationSec, `${path}.durationSec`, 86_400),
    kind: oneOf<ActivityKind>(o.kind, ACTIVITY_KINDS, `${path}.kind`),
    activityId: str(o.activityId, `${path}.activityId`, 100),
    activityName: str(o.activityName, `${path}.activityName`, LIMITS.shortText),
    status: oneOf(o.status, ['concluida', 'interrompida'] as const, `${path}.status`),
  };
  if (o.skills !== undefined) {
    session.skills = arr(o.skills, `${path}.skills`, 20).map((s, i) =>
      skill(s, `${path}.skills[${i}]`),
    );
  }
  const difficulty = optNum(o.difficulty, `${path}.difficulty`, 1, 5, true);
  if (difficulty !== undefined) session.difficulty = difficulty;
  const seed = optNum(o.seed, `${path}.seed`, 0, 4_294_967_295, true);
  if (seed !== undefined) session.seed = seed;
  const rpe = optNum(o.rpe, `${path}.rpe`, 0, 10, true);
  if (rpe !== undefined) session.rpe = rpe;
  if (o.discomfort !== undefined && o.discomfort !== null) {
    session.discomfort = num(o.discomfort, `${path}.discomfort`, 0, 3, true) as DiscomfortLevel;
  }
  const area = optStr(o.discomfortArea, `${path}.discomfortArea`, LIMITS.shortText);
  if (area !== undefined) session.discomfortArea = area;
  const notes = optStr(o.notes, `${path}.notes`);
  if (notes !== undefined) session.notes = notes;
  if (o.summary !== undefined && o.summary !== null) {
    const s = obj(o.summary, `${path}.summary`);
    session.summary = {
      attempts: num(s.attempts, `${path}.summary.attempts`, 0, 100_000, true),
      successes: num(s.successes, `${path}.summary.successes`, 0, 100_000, true),
    };
    if (session.summary.successes > session.summary.attempts) {
      throw new Invalid(`${path}.summary: mais acertos que tentativas`);
    }
    const inc = optNum(s.incomplete, `${path}.summary.incomplete`, 0, 100_000, true);
    if (inc !== undefined) session.summary.incomplete = inc;
    const avg = optNum(s.avgResponseMs, `${path}.summary.avgResponseMs`, 0, 600_000);
    if (avg !== undefined) session.summary.avgResponseMs = avg;
    const score = optNum(s.score, `${path}.summary.score`, 0, 1_000_000);
    if (score !== undefined) session.summary.score = score;
  }
  if (o.rounds !== undefined) {
    session.rounds = arr(o.rounds, `${path}.rounds`, LIMITS.rounds).map((r, i) =>
      validateRound(r, `${path}.rounds[${i}]`),
    );
  }
  return session;
}

export function validateResult(v: unknown, path = 'resultado'): ResultRecord {
  const o = obj(v, path);
  const attempts = num(o.attempts, `${path}.attempts`, 0, 100_000, true);
  const successes = num(o.successes, `${path}.successes`, 0, 100_000, true);
  if (successes > attempts) throw new Invalid(`${path}: mais acertos que tentativas`);
  const record: ResultRecord = {
    id: id(o.id, `${path}.id`),
    sessionId: id(o.sessionId, `${path}.sessionId`),
    createdAt: iso(o.createdAt, `${path}.createdAt`),
    date: date(o.date, `${path}.date`),
    skill: skill(o.skill, `${path}.skill`),
    activityId: str(o.activityId, `${path}.activityId`, 100),
    activityKind: oneOf<ActivityKind>(o.activityKind, ACTIVITY_KINDS, `${path}.activityKind`),
    source: oneOf<ResultSource>(o.source, RESULT_SOURCES, `${path}.source`),
    attempts,
    successes,
    difficulty: num(o.difficulty, `${path}.difficulty`, 1, 5, true),
  };
  if (o.responseTimesMs !== undefined) {
    record.responseTimesMs = arr(o.responseTimesMs, `${path}.responseTimesMs`, 1000).map((t, i) =>
      num(t, `${path}.responseTimesMs[${i}]`, 0, 600_000),
    );
  }
  const incomplete = optNum(o.incomplete, `${path}.incomplete`, 0, 100_000, true);
  if (incomplete !== undefined) record.incomplete = incomplete;
  if (o.errorTags !== undefined && o.errorTags !== null) {
    const tags = obj(o.errorTags, `${path}.errorTags`);
    const clean: Record<string, number> = {};
    for (const [k, value] of Object.entries(tags).slice(0, 50)) {
      if (!ID_RE.test(k)) throw new Invalid(`${path}.errorTags: marca inválida`);
      clean[k] = num(value, `${path}.errorTags.${k}`, 0, 100_000, true);
    }
    record.errorTags = clean;
  }
  const rating = optNum(o.rating, `${path}.rating`, 1, 5, true);
  if (rating !== undefined) record.rating = rating;
  if (record.source === 'autoavaliacao' && record.rating === undefined) {
    throw new Invalid(`${path}: autoavaliação sem nota`);
  }
  const notes = optStr(o.notes, `${path}.notes`);
  if (notes !== undefined) record.notes = notes;
  return record;
}

const RATINGS: readonly CriterionRating[] = ['bom', 'parcial', 'melhorar', 'nao_visivel'];

export function validateAnalysis(v: unknown, path = 'analise'): VideoAnalysis {
  const o = obj(v, path);
  const markers = arr(o.markers ?? [], `${path}.markers`, LIMITS.markers).map(
    (m, i): VideoMarker => {
      const mo = obj(m, `${path}.markers[${i}]`);
      return {
        id: id(mo.id, `${path}.markers[${i}].id`),
        timeSec: num(mo.timeSec, `${path}.markers[${i}].timeSec`, 0, 86_400),
        label: str(mo.label, `${path}.markers[${i}].label`, LIMITS.shortText),
      };
    },
  );
  const criteriaObj = obj(o.criteria ?? {}, `${path}.criteria`);
  const criteria: Record<string, CriterionRating> = {};
  for (const [k, value] of Object.entries(criteriaObj).slice(0, 30)) {
    if (!ID_RE.test(k)) throw new Invalid(`${path}.criteria: critério inválido`);
    criteria[k] = oneOf(value, RATINGS, `${path}.criteria.${k}`);
  }
  const analysis: VideoAnalysis = {
    id: id(o.id, `${path}.id`),
    date: date(o.date, `${path}.date`),
    createdAt: iso(o.createdAt, `${path}.createdAt`),
    videoName: str(o.videoName, `${path}.videoName`, 200),
    durationSec: capped(o.durationSec, `${path}.durationSec`, 86_400),
    markers,
    criteria,
    notes: str(o.notes ?? '', `${path}.notes`),
    frameIds: [],
    sessionId: id(o.sessionId, `${path}.sessionId`),
  };
  if (o.motionPeaks !== undefined) {
    analysis.motionPeaks = arr(o.motionPeaks, `${path}.motionPeaks`, 50).map((t, i) =>
      num(t, `${path}.motionPeaks[${i}]`, 0, 86_400),
    );
  }
  if (o.poseSummary !== undefined && o.poseSummary !== null) {
    const ps = obj(o.poseSummary, `${path}.poseSummary`);
    const clean: Record<string, number> = {};
    for (const [k, value] of Object.entries(ps).slice(0, 20)) {
      if (!ID_RE.test(k)) continue;
      clean[k] = num(value, `${path}.poseSummary.${k}`, -1_000_000, 1_000_000);
    }
    analysis.poseSummary = clean;
  }
  return analysis;
}

function validateList<T>(
  list: unknown[],
  name: string,
  validator: (v: unknown, path: string) => T,
  warnings: string[],
): T[] {
  const out: T[] = [];
  let skipped = 0;
  const examples: string[] = [];
  const ids = new Set<string>();
  list.forEach((item, i) => {
    try {
      const value = validator(item, `${name}[${i}]`);
      const key = (value as { id?: string }).id;
      if (key !== undefined) {
        if (ids.has(key)) throw new Invalid(`${name}[${i}]: identificador repetido`);
        ids.add(key);
      }
      out.push(value);
    } catch (error) {
      if (!(error instanceof Invalid)) throw error;
      skipped++;
      if (examples.length < 3) examples.push(error.message);
    }
  });
  if (skipped > 0) {
    warnings.push(
      `${skipped} registro(s) inválido(s) em "${name}" foram ignorados (ex.: ${examples.join('; ')}).`,
    );
  }
  return out;
}

/** Valida um objeto já convertido de JSON. */
export function validateExport(input: unknown): ImportValidation {
  const warnings: string[] = [];
  try {
    const root = obj(input, 'arquivo');
    if (root.app !== EXPORT_APP_ID) {
      return { ok: false, errors: ['Este arquivo não é uma exportação do Cláudio Futebol AI.'] };
    }
    const version = num(root.schemaVersion, 'schemaVersion', 1, 1000, true);
    if (version > EXPORT_SCHEMA_VERSION) {
      return {
        ok: false,
        errors: [
          `O arquivo foi criado por uma versão mais nova do aplicativo (formato ${version}). Atualize o aplicativo para importá-lo.`,
        ],
      };
    }
    const optional = <T>(value: unknown, fn: (v: unknown) => T, label: string): T | null => {
      if (value === undefined || value === null) return null;
      try {
        return fn(value);
      } catch (error) {
        if (!(error instanceof Invalid)) throw error;
        warnings.push(`${label} inválido(a) foi ignorado(a): ${error.message}`);
        return null;
      }
    };
    const sessions = validateList(
      arr(root.sessions ?? [], 'sessions', LIMITS.sessions),
      'sessions',
      validateSession,
      warnings,
    );
    const sessionIds = new Set(sessions.map((s) => s.id));
    const results = validateList(
      arr(root.results ?? [], 'results', LIMITS.results),
      'results',
      validateResult,
      warnings,
    );
    const orphan = results.filter((r) => !sessionIds.has(r.sessionId)).length;
    if (orphan > 0)
      warnings.push(`${orphan} resultado(s) sem sessão correspondente foram mantidos.`);
    const routine = optional(
      root.preGameRoutine,
      (v) =>
        arr(v, 'preGameRoutine', LIMITS.routine).map((s, i) => str(s, `preGameRoutine[${i}]`, 200)),
      'Rotina pré-jogo',
    );
    return {
      ok: true,
      warnings,
      data: {
        app: EXPORT_APP_ID,
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt.slice(0, 40) : '',
        profile: optional(root.profile, validateProfile, 'Perfil'),
        settings: optional(root.settings, validateSettings, 'Configurações'),
        competition: optional(root.competition, validateCompetition, 'Competição'),
        simLevels: optional(root.simLevels, validateSimLevels, 'Níveis do simulador'),
        preGameRoutine: routine,
        sessions,
        results,
        videoAnalyses: validateList(
          arr(root.videoAnalyses ?? [], 'videoAnalyses', LIMITS.videoAnalyses),
          'videoAnalyses',
          validateAnalysis,
          warnings,
        ),
      },
    };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, errors: [error.message] };
    throw error;
  }
}

/** Faz o parse do texto do arquivo com limites de tamanho. */
export function parseImportText(text: string): ImportValidation {
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, errors: ['Arquivo grande demais para importar (máximo 15 MB).'] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['O arquivo não é um JSON válido.'] };
  }
  return validateExport(parsed);
}
