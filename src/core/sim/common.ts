import type { Vec } from '../geometry.ts';
import { clamp } from '../geometry.ts';

/**
 * Campo dos simuladores (metros). O ataque é para cima: y = 0 é a linha do gol adversário
 * e y = FIELD.length é o lado do próprio campo. x vai da lateral esquerda (0) à direita.
 */
export const FIELD = { width: 24, length: 32 } as const;
export const BALL_RADIUS = 0.11;

export interface Actor {
  id: string;
  pos: Vec;
  label?: string;
}

/** Resultado de uma rodada, calculado exclusivamente pelas regras do motor. */
export interface RoundResult {
  success: boolean;
  /** Rodada sem resposta válida (tempo esgotado ou resposta antecipada). */
  incomplete: boolean;
  /** Código do desfecho (ex.: "acerto", "interceptado", "tempo_esgotado"). */
  outcome: string;
  title: string;
  explanation: string;
  points: number;
  /** Qualidade da execução em [0, 1] quando houver acerto. */
  quality?: number;
  responseMs?: number;
}

export function levelIndex(difficulty: number): number {
  return clamp(Math.round(difficulty), 1, 5) - 1;
}

/** Valor da tabela para a dificuldade (1 a 5). */
export function byLevel<T>(difficulty: number, table: readonly [T, T, T, T, T]): T {
  return table[levelIndex(difficulty)] as T;
}

export function insideField(p: Vec, margin = 0): boolean {
  return (
    p.x >= margin &&
    p.x <= FIELD.width - margin &&
    p.y >= margin &&
    p.y <= FIELD.length - margin
  );
}

/** Bônus de rapidez (0 a `max`) em modos com tempo limite. */
export function speedBonus(responseMs: number | undefined, limitMs: number, max: number): number {
  if (responseMs === undefined || limitMs <= 0) return 0;
  const fraction = 1 - clamp(responseMs / limitMs, 0, 1);
  return Math.round(fraction * max);
}

export function fmt(meters: number): string {
  return `${meters.toFixed(1).replace('.', ',')} m`;
}

export function timeoutResult(limitMs: number): RoundResult {
  return {
    success: false,
    incomplete: true,
    outcome: 'tempo_esgotado',
    title: 'Tempo esgotado',
    explanation: `Nenhuma decisão em ${(limitMs / 1000).toFixed(1).replace('.', ',')} s. No jogo, decidir tarde dá tempo para o adversário fechar o espaço — tente observar antes e decidir mais cedo.`,
    points: 0,
  };
}
