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
    return { level: level + 1, changed: true, reason: `Acerto de ${pct}%: nível aumentado para ${level + 1}.` };
  }
  if (rate < 0.4 && level > 1) {
    return { level: level - 1, changed: true, reason: `Acerto de ${pct}%: nível reduzido para ${level - 1} para consolidar a base.` };
  }
  return { level, changed: false, reason: `Acerto de ${pct}%: nível ${level} mantido.` };
}
