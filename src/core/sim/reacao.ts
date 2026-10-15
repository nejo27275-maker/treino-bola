/**
 * Modo E — Reação à pressão.
 * Depois de uma espera variável, aparece a pressão de um marcador. Regra:
 * - pressão pela esquerda → sair pela direita;
 * - pressão pela direita → sair pela esquerda;
 * - pressão dos dois lados (a partir do nível 3) → proteger a bola.
 * Resposta antes do sinal é "antecipada" (a rodada é repetida, sem contar como erro).
 */
import { createRng } from '../rng.ts';
import type { RoundResult } from './common.ts';
import { byLevel } from './common.ts';

export type ReactionStimulus = 'esquerda' | 'direita' | 'dupla';
export const REACTION_RESPONSES = ['esquerda', 'proteger', 'direita'] as const;
export type ReactionResponse = (typeof REACTION_RESPONSES)[number];

export const REACTION_LABEL: Record<ReactionResponse, string> = {
  esquerda: 'Sair pela esquerda',
  proteger: 'Proteger',
  direita: 'Sair pela direita',
};

export const STIMULUS_LABEL: Record<ReactionStimulus, string> = {
  esquerda: 'Pressão pela esquerda',
  direita: 'Pressão pela direita',
  dupla: 'Pressão dos dois lados',
};

export interface ReactionScenario {
  mode: 'reacao_pressao';
  seed: number;
  difficulty: number;
  foreperiodMs: number;
  stimulus: ReactionStimulus;
  windowMs: number;
}

export interface ReactionInput {
  response: ReactionResponse | null;
  /** Tempo desde o aparecimento do estímulo (ms). */
  responseMs: number | null;
  /** Verdadeiro se a resposta veio antes do estímulo. */
  early?: boolean;
}

export function correctResponse(stimulus: ReactionStimulus): ReactionResponse {
  if (stimulus === 'esquerda') return 'direita';
  if (stimulus === 'direita') return 'esquerda';
  return 'proteger';
}

export function generateReaction(seed: number, difficulty: number): ReactionScenario {
  const rng = createRng(seed);
  const foreperiodMs = Math.round(rng.range(1000, 2500));
  const allowDouble = difficulty >= 3;
  const roll = rng.next();
  const stimulus: ReactionStimulus =
    allowDouble && roll < 0.2 ? 'dupla' : roll < (allowDouble ? 0.6 : 0.5) ? 'esquerda' : 'direita';
  return {
    mode: 'reacao_pressao',
    seed,
    difficulty,
    foreperiodMs,
    stimulus,
    windowMs: byLevel(difficulty, [2000, 1600, 1300, 1050, 850] as const),
  };
}

export function evaluateReaction(s: ReactionScenario, input: ReactionInput): RoundResult {
  if (input.early) {
    return {
      success: false,
      incomplete: true,
      outcome: 'antecipado',
      title: 'Saiu antes do sinal',
      explanation:
        'Você respondeu antes de a pressão aparecer. Espere ver de onde vem o marcador — a rodada será repetida.',
      points: 0,
    };
  }
  const expected = correctResponse(s.stimulus);
  if (input.response === null || input.responseMs === null || input.responseMs > s.windowMs) {
    return {
      success: false,
      incomplete: true,
      outcome: 'tempo_esgotado',
      title: 'Tempo esgotado',
      explanation: `Era preciso responder em até ${(s.windowMs / 1000).toFixed(2).replace('.', ',')} s. Resposta certa: "${REACTION_LABEL[expected]}".`,
      points: 0,
    };
  }
  if (input.response !== expected) {
    return {
      success: false,
      incomplete: false,
      outcome: 'erro',
      title: 'Lado errado',
      explanation: `${STIMULUS_LABEL[s.stimulus]}: o certo era "${REACTION_LABEL[expected]}" — fuja do lado de onde vem a pressão.`,
      points: 0,
      responseMs: input.responseMs,
    };
  }
  const fraction = 1 - Math.min(1, input.responseMs / s.windowMs);
  return {
    success: true,
    incomplete: false,
    outcome: 'acerto',
    title: 'Reação certa!',
    explanation: `${STIMULUS_LABEL[s.stimulus]} → "${REACTION_LABEL[expected]}" em ${Math.round(input.responseMs)} ms.`,
    points: 6 + Math.round(4 * fraction),
    quality: fraction,
    responseMs: input.responseMs,
  };
}
