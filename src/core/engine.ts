/**
 * Motor de treinamento adaptativo (determinístico e explicável).
 *
 * Para cada fundamento, combina as evidências registradas em três canais:
 * - real: execução real (contagem manual, observação de vídeo, câmera);
 * - simulado: simuladores e cenários de leitura;
 * - autoavaliação: nota que o jogador se deu (peso baixo).
 *
 * Cada resultado entra com peso = confiabilidade da origem × decaimento por idade
 * (meia-vida de 14 dias). A taxa de acerto de cada canal é uma média ponderada
 * suavizada (Beta(1,1)). A confiança cresce com o número efetivo de tentativas.
 * As recomendações são regras explícitas sobre esses números, sempre com o motivo.
 */
import { diffDays } from './dates.ts';
import { POSITION_EMPHASIS, SKILLS, SKILL_ORDER, SOURCE_INFO } from './skills.ts';
import type {
  DifficultyPref,
  EvidenceChannel,
  Profile,
  ResultRecord,
  SimModeId,
  SkillId,
  TrainingSession,
} from './types.ts';

export const HALF_LIFE_DAYS = 14;
/** Tentativas efetivas mínimas para considerar um canal confiável. */
export const MIN_EFFECTIVE_ATTEMPTS = 8;
export const LEVEL_LOW = 0.5;
export const LEVEL_HIGH = 0.75;
const CHANNEL_WEIGHT: Record<EvidenceChannel, number> = { real: 1, simulado: 0.6, autoavaliacao: 0.3 };
const SELF_RATING_EFFECTIVE = 3;

export type SkillStatus = 'pendente' | 'insuficiente' | 'avaliado';
export type SkillLevel = 'baixo' | 'medio' | 'alto' | 'indefinido';
export type Trend = 'melhorando' | 'estavel' | 'piorando' | 'indefinido';

export interface ChannelEstimate {
  rate: number;
  effectiveAttempts: number;
  attempts: number;
  successes: number;
  sessions: number;
  lastDate: string;
  sources: Partial<Record<ResultRecord['source'], number>>;
  avgResponseMs?: number;
}

export interface SessionRate {
  sessionId: string;
  date: string;
  rate: number;
  attempts: number;
  channel: EvidenceChannel;
  difficulty: number;
}

export interface SkillAssessment {
  skill: SkillId;
  status: SkillStatus;
  level: SkillLevel;
  /** Estimativa combinada (0 a 1) ou null se não houver evidência. */
  score: number | null;
  confidence: number; // 0 a 1
  real?: ChannelEstimate;
  simulado?: ChannelEstimate;
  selfRating?: { rating: number; date: string };
  trend: Trend;
  inconsistent: boolean;
  sessionRates: SessionRate[];
  topError?: { tag: string; count: number };
  trainedSessions: number;
  lastTrained?: string;
  highSustained: boolean;
}

export type RecommendationType = 'descansar' | 'avaliar' | 'reavaliar' | 'treinar' | 'progredir';

export interface Recommendation {
  id: string;
  skill: SkillId | null;
  type: RecommendationType;
  priority: number;
  title: string;
  reasons: string[];
  difficulty: number;
  simMode?: SimModeId;
  /** Tag de erro mais frequente, para escolher exercícios que a corrigem. */
  focusError?: string;
  confidence: 'baixa' | 'media' | 'alta';
}

export type WellbeingLevel = 'ok' | 'atencao' | 'descanso';

export interface WellbeingStatus {
  level: WellbeingLevel;
  reasons: string[];
}

export interface EngineInput {
  today: string;
  results: ResultRecord[];
  sessions: TrainingSession[];
  profile: Profile | null;
}

export interface EngineOutput {
  assessments: Record<SkillId, SkillAssessment>;
  /** As recomendações mais importantes (para exibir). */
  recommendations: Recommendation[];
  /** Todas as recomendações, em ordem de prioridade (usadas pelo planejador). */
  ranked: Recommendation[];
  wellbeing: WellbeingStatus;
}

function recencyWeight(today: string, date: string): number {
  const age = Math.max(0, diffDays(date, today));
  return 0.5 ** (age / HALF_LIFE_DAYS);
}

function emptyEstimate(): ChannelEstimate {
  return {
    rate: 0,
    effectiveAttempts: 0,
    attempts: 0,
    successes: 0,
    sessions: 0,
    lastDate: '',
    sources: {},
  };
}

function estimateChannel(results: ResultRecord[], today: string): ChannelEstimate | undefined {
  if (results.length === 0) return undefined;
  const est = emptyEstimate();
  let weightedSuccess = 0;
  let weightedAttempts = 0;
  const sessions = new Set<string>();
  const times: number[] = [];
  for (const r of results) {
    if (r.attempts <= 0) continue;
    const w = SOURCE_INFO[r.source].peso * recencyWeight(today, r.date);
    weightedSuccess += w * r.successes;
    weightedAttempts += w * r.attempts;
    est.attempts += r.attempts;
    est.successes += r.successes;
    est.sources[r.source] = (est.sources[r.source] ?? 0) + r.attempts;
    sessions.add(r.sessionId);
    if (r.date > est.lastDate) est.lastDate = r.date;
    if (r.responseTimesMs) times.push(...r.responseTimesMs);
  }
  if (est.attempts === 0) return undefined;
  est.effectiveAttempts = weightedAttempts;
  est.rate = (weightedSuccess + 1) / (weightedAttempts + 2);
  est.sessions = sessions.size;
  if (times.length > 0) est.avgResponseMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  return est;
}

function levelOf(score: number): SkillLevel {
  if (score < LEVEL_LOW) return 'baixo';
  if (score < LEVEL_HIGH) return 'medio';
  return 'alto';
}

function sessionRatesFor(results: ResultRecord[]): SessionRate[] {
  const bySession = new Map<string, SessionRate>();
  for (const r of results) {
    const channel = SOURCE_INFO[r.source].canal;
    if (channel === 'autoavaliacao' || r.attempts <= 0) continue;
    const key = `${r.sessionId}|${channel}`;
    const current = bySession.get(key);
    if (current) {
      const total = current.attempts + r.attempts;
      current.rate = (current.rate * current.attempts + r.successes) / total;
      current.attempts = total;
    } else {
      bySession.set(key, {
        sessionId: r.sessionId,
        date: r.date,
        rate: r.successes / r.attempts,
        attempts: r.attempts,
        channel,
        difficulty: r.difficulty,
      });
    }
  }
  return [...bySession.values()].sort((a, b) =>
    a.date === b.date ? a.sessionId.localeCompare(b.sessionId) : a.date.localeCompare(b.date),
  );
}

function trendOf(rates: SessionRate[]): Trend {
  const relevant = rates.filter((r) => r.attempts >= 5);
  if (relevant.length < 3) return 'indefinido';
  const last = relevant[relevant.length - 1] as SessionRate;
  const previous = relevant.slice(0, -1);
  const avg = previous.reduce((s, r) => s + r.rate, 0) / previous.length;
  if (last.rate - avg >= 0.15) return 'melhorando';
  if (avg - last.rate >= 0.15) return 'piorando';
  return 'estavel';
}

function isInconsistent(rates: SessionRate[]): boolean {
  // Compara sessões do mesmo canal com ao menos 5 tentativas cada.
  for (const channel of ['real', 'simulado'] as const) {
    const relevant = rates.filter((r) => r.channel === channel && r.attempts >= 5).slice(-4);
    if (relevant.length < 2) continue;
    const values = relevant.map((r) => r.rate);
    if (Math.max(...values) - Math.min(...values) >= 0.35) return true;
  }
  return false;
}

export function assessSkill(
  skill: SkillId,
  allResults: ResultRecord[],
  sessions: TrainingSession[],
  today: string,
): SkillAssessment {
  const results = allResults.filter((r) => r.skill === skill);
  const real = estimateChannel(
    results.filter((r) => SOURCE_INFO[r.source].canal === 'real'),
    today,
  );
  const simulado = estimateChannel(
    results.filter((r) => SOURCE_INFO[r.source].canal === 'simulado'),
    today,
  );
  const selfResults = results
    .filter((r) => r.source === 'autoavaliacao' && typeof r.rating === 'number')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const lastSelf = selfResults[selfResults.length - 1];
  const selfRating = lastSelf ? { rating: lastSelf.rating as number, date: lastSelf.date } : undefined;

  const sessionIds = new Set(
    results.filter((r) => r.source !== 'autoavaliacao').map((r) => r.sessionId),
  );
  const trained = sessions.filter(
    (s) => s.kind !== 'autoavaliacao' && (sessionIds.has(s.id) || (s.skills ?? []).includes(skill)),
  );
  const lastTrained = trained
    .map((s) => s.date)
    .sort()
    .pop();

  // Combinação dos canais, ponderada pela confiança de cada um.
  let num = 0;
  let den = 0;
  const parts: [EvidenceChannel, number, number][] = [];
  if (real) parts.push(['real', real.rate, Math.min(1, real.effectiveAttempts / 10)]);
  if (simulado) parts.push(['simulado', simulado.rate, Math.min(1, simulado.effectiveAttempts / 10)]);
  if (selfRating) {
    parts.push(['autoavaliacao', (selfRating.rating - 1) / 4, SELF_RATING_EFFECTIVE / 10]);
  }
  for (const [channel, rate, conf] of parts) {
    num += CHANNEL_WEIGHT[channel] * conf * rate;
    den += CHANNEL_WEIGHT[channel] * conf;
  }
  const score = den > 0 ? num / den : null;
  const measuredEffective = (real?.effectiveAttempts ?? 0) + (simulado?.effectiveAttempts ?? 0);
  const confidence = Math.min(1, measuredEffective / 20 + (selfRating ? 0.05 : 0));

  let status: SkillStatus;
  if (!real && !simulado && !selfRating) status = 'pendente';
  else if (measuredEffective < MIN_EFFECTIVE_ATTEMPTS) status = 'insuficiente';
  else status = 'avaliado';

  const sessionRates = sessionRatesFor(results);
  const highSessions = sessionRates.filter((r) => r.attempts >= 5 && r.rate >= 0.8);
  const highSustained =
    status === 'avaliado' &&
    score !== null &&
    score >= 0.8 &&
    highSessions.length >= 2 &&
    measuredEffective >= 15;

  const errorCounts = new Map<string, number>();
  for (const r of results) {
    if (!r.errorTags || diffDays(r.date, today) > 21) continue;
    for (const [tag, count] of Object.entries(r.errorTags)) {
      errorCounts.set(tag, (errorCounts.get(tag) ?? 0) + count);
    }
  }
  let topError: { tag: string; count: number } | undefined;
  for (const [tag, count] of [...errorCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count >= 2 && (!topError || count > topError.count)) topError = { tag, count };
  }

  return {
    skill,
    status,
    level: score === null || status === 'pendente' ? 'indefinido' : levelOf(score),
    score,
    confidence,
    real,
    simulado,
    selfRating,
    trend: trendOf(sessionRates),
    inconsistent: isInconsistent(sessionRates),
    sessionRates,
    topError,
    trainedSessions: trained.length,
    lastTrained,
    highSustained,
  };
}

/** Avalia esforço e desconforto recentes para evitar sobrecarga. */
export function assessWellbeing(sessions: TrainingSession[], today: string): WellbeingStatus {
  const reasons: string[] = [];
  let level: WellbeingLevel = 'ok';
  const recent = sessions.filter((s) => {
    const age = diffDays(s.date, today);
    return age >= 0 && age <= 2;
  });
  const strong = recent.filter((s) => s.discomfort === 3);
  const moderate = recent.filter((s) => s.discomfort === 2);
  if (strong.length > 0) {
    level = 'descanso';
    reasons.push(
      'Você registrou desconforto forte nos últimos dias. Descanse hoje. Se a dor continuar ou atrapalhar movimentos do dia a dia, avise um adulto responsável e procure um profissional de saúde.',
    );
  } else if (moderate.length > 0) {
    level = 'atencao';
    reasons.push(
      'Você registrou desconforto moderado recentemente: hoje, apenas atividades leves (técnica sem impacto, leitura de jogo e respiração).',
    );
  }
  const hard = sessions.filter((s) => {
    const age = diffDays(s.date, today);
    return age >= 0 && age <= 1 && (s.rpe ?? 0) >= 8;
  });
  if (hard.length > 0 && level === 'ok') {
    level = 'atencao';
    reasons.push(
      'Seu último treino foi muito intenso (esforço 8 ou mais em 10). Hoje, prefira uma sessão leve para o corpo se recuperar.',
    );
  }
  const lastThreeDays = [0, 1, 2].map((offset) =>
    sessions.some(
      (s) => diffDays(s.date, today) === offset && (s.rpe ?? 0) >= 7,
    ),
  );
  if (lastThreeDays.every(Boolean) && level === 'ok') {
    level = 'atencao';
    reasons.push('Três dias seguidos de esforço alto: inclua recuperação antes de outro treino forte.');
  }
  return { level, reasons };
}

function difficultyFromPref(pref: DifficultyPref | undefined): number {
  if (pref === 'dificil') return 3;
  if (pref === 'medio') return 2;
  return 1;
}

function confidenceLabel(c: number): 'baixa' | 'media' | 'alta' {
  if (c < 0.4) return 'baixa';
  if (c < 0.8) return 'media';
  return 'alta';
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function describeEvidence(a: SkillAssessment): string {
  const bits: string[] = [];
  if (a.real) bits.push(`execução real ${pct(a.real.rate)} em ${a.real.attempts} tentativas`);
  if (a.simulado) bits.push(`simulação ${pct(a.simulado.rate)} em ${a.simulado.attempts} rodadas`);
  if (a.selfRating) bits.push(`autoavaliação ${a.selfRating.rating}/5 (peso menor)`);
  return bits.join('; ');
}

/** Gera recomendações ordenadas por prioridade, cada uma com seus motivos. */
export function recommend(
  assessments: Record<SkillId, SkillAssessment>,
  wellbeing: WellbeingStatus,
  profile: Profile | null,
  limit = 5,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const baseDifficulty = difficultyFromPref(profile?.dificuldade);
  if (wellbeing.level !== 'ok') {
    recs.push({
      id: 'bem-estar',
      skill: null,
      type: 'descansar',
      priority: 10,
      title: wellbeing.level === 'descanso' ? 'Descanso e recuperação hoje' : 'Sessão leve hoje',
      reasons: wellbeing.reasons,
      difficulty: 1,
      confidence: 'alta',
    });
  }
  const focus = new Set(profile?.focos ?? []);
  const emphasis = new Set(profile ? POSITION_EMPHASIS[profile.posicao] : []);

  SKILL_ORDER.forEach((skill, index) => {
    const info = SKILLS[skill];
    if (!info.medidoPorAcerto) return; // físicos são planejados por volume e bem-estar
    const a = assessments[skill];
    const reasons: string[] = [];
    let type: RecommendationType;
    let priority: number;
    let difficulty = baseDifficulty;
    const need = a.score === null ? 0.5 : 1 - a.score;

    if (a.status === 'pendente') {
      type = 'avaliar';
      priority = 0.55;
      reasons.push(`Ainda não há nenhum resultado de ${info.curto.toLowerCase()}. Faça o teste para criar sua linha de base em vez de adivinhar seu nível.`);
    } else if (a.status === 'insuficiente') {
      type = 'reavaliar';
      priority = 0.5;
      const total = (a.real?.attempts ?? 0) + (a.simulado?.attempts ?? 0);
      reasons.push(
        total > 0
          ? `Só ${total} tentativas medidas até agora — pouco para concluir algo. Faça mais tentativas antes de tirar conclusões.`
          : 'Há apenas a sua autoavaliação. Faça um teste medido para confirmar.',
      );
    } else if (a.inconsistent) {
      type = 'reavaliar';
      priority = 0.6;
      const values = a.sessionRates.filter((r) => r.attempts >= 5).map((r) => pct(r.rate));
      reasons.push(`Resultados variaram muito entre sessões (${values.join(', ')}). Repita o teste antes de concluir que existe uma dificuldade.`);
    } else if (a.highSustained) {
      type = 'progredir';
      priority = 0.3;
      difficulty = Math.min(5, baseDifficulty + 1);
      reasons.push(`Bom desempenho sustentado (${describeEvidence(a)}). Aumente a dificuldade aos poucos.`);
    } else if (a.level === 'baixo') {
      type = 'treinar';
      priority = 0.7 + 0.3 * need;
      difficulty = Math.max(1, baseDifficulty - 1);
      reasons.push(`Precisa de atenção: ${describeEvidence(a)}. Treine em dificuldade mais baixa para ganhar consistência.`);
    } else if (a.level === 'medio') {
      type = 'treinar';
      priority = 0.5 + 0.3 * need;
      reasons.push(`Em desenvolvimento: ${describeEvidence(a)}.`);
    } else {
      type = 'treinar';
      priority = 0.25 + 0.3 * need;
      reasons.push(`Nível bom: ${describeEvidence(a)}. Mantenha com repetições curtas.`);
    }

    if (a.real && a.simulado && a.real.effectiveAttempts >= 5 && a.simulado.effectiveAttempts >= 5) {
      if (a.simulado.rate - a.real.rate >= 0.25) {
        reasons.push('Você decide bem no simulador, mas a execução real ainda está abaixo: priorize repetições técnicas com bola.');
        priority += 0.05;
      } else if (a.real.rate - a.simulado.rate >= 0.25) {
        reasons.push('A técnica real está boa; a leitura nas simulações ainda pode melhorar.');
      }
    }
    if (a.topError) {
      reasons.push(`Erro mais frequente nas últimas semanas: "${errorLabel(a.topError.tag)}" (${a.topError.count} vezes).`);
    }
    if (a.trend === 'piorando') reasons.push('A última sessão foi pior que a média anterior — confira cansaço e concentração.');
    if (a.trend === 'melhorando') reasons.push('Tendência de melhora nas últimas sessões.');
    if (focus.has(skill)) {
      priority += 0.25;
      reasons.push('Você marcou este fundamento como foco.');
    }
    if (emphasis.has(skill) && profile) {
      priority += 0.1;
      reasons.push('É importante para a posição em que você joga.');
    }
    recs.push({
      id: `${type}-${skill}`,
      skill,
      type,
      priority: Math.round((priority - index * 0.0001) * 10000) / 10000,
      title: recommendationTitle(type, info.nome),
      reasons,
      difficulty,
      simMode: info.simulador,
      focusError: a.topError?.tag,
      confidence: confidenceLabel(a.confidence),
    });
  });

  recs.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return recs.slice(0, limit);
}

function recommendationTitle(type: RecommendationType, name: string): string {
  switch (type) {
    case 'avaliar':
      return `Avaliar: ${name}`;
    case 'reavaliar':
      return `Medir de novo: ${name}`;
    case 'progredir':
      return `Subir o nível: ${name}`;
    case 'descansar':
      return 'Recuperação';
    default:
      return `Treinar: ${name}`;
  }
}

/** Rótulos legíveis das marcas de erro (definidas nos exercícios). */
const ERROR_LABELS = new Map<string, string>();
export function registerErrorLabels(labels: Record<string, string>): void {
  for (const [k, v] of Object.entries(labels)) ERROR_LABELS.set(k, v);
}
export function errorLabel(tag: string): string {
  return ERROR_LABELS.get(tag) ?? tag.replace(/_/g, ' ');
}

export function runEngine(input: EngineInput): EngineOutput {
  const assessments = {} as Record<SkillId, SkillAssessment>;
  for (const skill of SKILL_ORDER) {
    assessments[skill] = assessSkill(skill, input.results, input.sessions, input.today);
  }
  const wellbeing = assessWellbeing(input.sessions, input.today);
  const ranked = recommend(assessments, wellbeing, input.profile, Number.POSITIVE_INFINITY);
  return { assessments, recommendations: ranked.slice(0, 5), ranked, wellbeing };
}
