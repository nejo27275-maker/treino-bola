/** Resumo de sessões de simulador e ajuste progressivo de dificuldade. */
import type { RoundLog, SessionSummary } from './types.ts';

/** Rodadas antecipadas são repetidas e não entram na contagem de tentativas. */
export function countedRounds(rounds: RoundLog[]): RoundLog[] {
  return rounds.filter((r) => r.outcome !== 'antecipado');
}

export function summarizeRounds(rounds: RoundLog[]): SessionSummary {
  const counted = countedRounds(rounds);
  const successes = counted.filter((r) => r.success).length;
  const incomplete = counted.filter((r) => r.incomplete).length;
  const times = counted
    .filter((r) => r.success && typeof r.responseMs === 'number')
    .map((r) => r.responseMs as number);
  const summary: SessionSummary = {
    attempts: counted.length,
    successes,
    incomplete,
    score: counted.reduce((sum, r) => sum + r.points, 0),
  };
  if (times.length > 0) {
    summary.avgResponseMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  }
  return summary;
}

export interface DifficultyChange {
  level: number;
  changed: boolean;
  reason: string;
}

export const MIN_ROUNDS_FOR_PROGRESSION = 8;

/**
 * Regra de progressão: com pelo menos 8 tentativas, ≥ 80% de acerto sobe um nível e
 * < 40% desce um nível (mínimo 1, máximo 5). Caso contrário, mantém.
 */
export function nextDifficulty(current: number, summary: SessionSummary): DifficultyChange {
  const level = Math.min(5, Math.max(1, Math.round(current)));
  if (summary.attempts < MIN_ROUNDS_FOR_PROGRESSION) {
    return {
      level,
      changed: false,
      reason: `Nível mantido: são necessárias ao menos ${MIN_ROUNDS_FOR_PROGRESSION} tentativas para ajustar a dificuldade.`,
    };
  }
  const rate = summary.successes / summary.attempts;
  const pct = Math.round(rate * 100);
  if (rate >= 0.8 && level < 5) {
    return {
      level: level + 1,
      changed: true,
      reason: `Acerto de ${pct}%: nível aumentado para ${level + 1}.`,
    };
  }
  if (rate < 0.4 && level > 1) {
    return {
      level: level - 1,
      changed: true,
      reason: `Acerto de ${pct}%: nível reduzido para ${level - 1} para consolidar a base.`,
    };
  }
  return { level, changed: false, reason: `Acerto de ${pct}%: nível ${level} mantido.` };
}

/**
 * Nível salvo do jogador depois de uma sessão jogada em `played` (que pode ter sido escolhido
 * manualmente). A regra de progressão só vale na direção que a sessão comprova:
 * - jogou no próprio nível: regra normal (sobe com ≥ 80 %, desce com < 40 %);
 * - jogou acima e foi bem: o nível salvo passa para um acima do jogado;
 * - jogou abaixo e foi mal: o nível salvo passa para um abaixo do jogado;
 * - nos demais casos (ex.: ir mal acima do próprio nível) o nível salvo não muda.
 */
export function nextStoredLevel(
  stored: number,
  played: number,
  summary: SessionSummary,
): DifficultyChange {
  const current = Math.min(5, Math.max(1, Math.round(stored)));
  const level = Math.min(5, Math.max(1, Math.round(played)));
  const change = nextDifficulty(level, summary);
  if (level === current) return change;
  const keep = (why: string): DifficultyChange => ({
    level: current,
    changed: false,
    reason: `${why} Seu nível salvo continua ${current}.`,
  });
  if (!change.changed) return keep(change.reason);
  const above = level > current;
  const improved = change.level > level;
  if (above && improved && change.level > current) {
    return {
      level: change.level,
      changed: true,
      reason: `${change.reason.replace(/:.*$/, '')} no nível ${level}, acima do seu nível ${current}: seu nível passa a ser ${change.level}.`,
    };
  }
  if (!above && !improved && change.level < current) {
    return {
      level: change.level,
      changed: true,
      reason: `${change.reason.replace(/:.*$/, '')} no nível ${level}, abaixo do seu nível ${current}: seu nível passa a ser ${change.level}.`,
    };
  }
  const pct = Math.round((summary.successes / Math.max(1, summary.attempts)) * 100);
  return keep(
    `Acerto de ${pct}% no nível ${level}, escolhido ${above ? 'acima' : 'abaixo'} do seu nível ${current}.`,
  );
}
