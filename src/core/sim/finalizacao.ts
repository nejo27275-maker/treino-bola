/**
 * Modo F — Finalização (visão de frente da baliza).
 * Coordenadas em metros: x da trave esquerda (0) à direita (largura); y é a altura
 * a partir do chão (0) até o travessão. É uma simulação de decisão e pontaria:
 * não mede a força de um chute real.
 *
 * Regras, nesta ordem:
 * 1. Fora: a bola (raio 0,11 m) precisa entrar inteira entre as traves e abaixo do travessão.
 * 2. Bloqueado: o ponto está na faixa coberta pelo corpo do defensor.
 * 3. Defendido: o ponto está ao alcance do goleiro (elipse ampliada pelo raio da bola).
 * 4. Gol. Bônus se estiver em um dos alvos dos cantos.
 */
import type { Vec } from '../geometry.ts';
import { clamp, insideEllipse, insideRect, vec } from '../geometry.ts';
import { createRng } from '../rng.ts';
import type { Modality } from '../types.ts';
import type { RoundResult } from './common.ts';
import { BALL_RADIUS, byLevel, timeoutResult } from './common.ts';

export interface GoalSize {
  width: number;
  height: number;
}

export const GOAL_SIZES: Record<Modality, GoalSize> = {
  futsal: { width: 3, height: 2 },
  society: { width: 5, height: 2.2 },
  campo: { width: 7.32, height: 2.44 },
  nao_sei: { width: 5, height: 2.2 },
};

export interface ShotTarget {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShotScenario {
  mode: 'finalizacao';
  seed: number;
  difficulty: number;
  goal: GoalSize;
  keeper: { x: number; y: number; rx: number; ry: number; lean: -1 | 0 | 1 };
  blocker: { x: number; w: number; h: number } | null;
  targets: ShotTarget[];
  timeLimitMs: number;
}

export interface ShotResult extends RoundResult {
  point: Vec;
  targetId?: string;
}

export function keeperReachCenter(s: ShotScenario): Vec {
  return vec(s.keeper.x + s.keeper.lean * s.goal.width * 0.12, s.keeper.y);
}

export function generateShot(seed: number, difficulty: number, modality: Modality): ShotScenario {
  const rng = createRng(seed);
  const goal = GOAL_SIZES[modality];
  const W = goal.width;
  const H = goal.height;
  const keeperX = clamp(W / 2 + rng.range(-0.28, 0.28) * W, 0.3 * W, 0.7 * W);
  const lean: -1 | 0 | 1 = difficulty >= 4 ? (rng.chance(0.5) ? -1 : 1) : 0;
  const hasBlocker = difficulty >= 3 && rng.chance(0.6);
  const blockerW = 0.55;
  const blocker = hasBlocker
    ? {
        x: rng.range(blockerW / 2 + 0.2, W - blockerW / 2 - 0.2),
        w: blockerW,
        h: Math.min(1.5, H * 0.7),
      }
    : null;
  const tw = W * 0.22;
  const th = H * 0.32;
  return {
    mode: 'finalizacao',
    seed,
    difficulty,
    goal,
    keeper: {
      x: keeperX,
      y: H * 0.42,
      rx: W * byLevel(difficulty, [0.22, 0.25, 0.28, 0.31, 0.34] as const),
      ry: H * byLevel(difficulty, [0.55, 0.6, 0.65, 0.7, 0.75] as const),
      lean,
    },
    blocker,
    targets: [
      { id: 'inf-esq', label: 'canto inferior esquerdo', x: 0, y: 0, w: tw, h: th },
      { id: 'inf-dir', label: 'canto inferior direito', x: W - tw, y: 0, w: tw, h: th },
      { id: 'sup-esq', label: 'canto superior esquerdo', x: 0, y: H - th, w: tw, h: th },
      { id: 'sup-dir', label: 'canto superior direito', x: W - tw, y: H - th, w: tw, h: th },
    ],
    timeLimitMs: byLevel(difficulty, [7000, 6000, 5000, 4000, 3000] as const),
  };
}

export function evaluateShot(
  s: ShotScenario,
  point: Vec | null,
  responseMs?: number,
): ShotResult | (RoundResult & { point: null }) {
  if (point === null) return { ...timeoutResult(s.timeLimitMs), point: null };
  const W = s.goal.width;
  const H = s.goal.height;
  const p = vec(point.x, Math.max(point.y, BALL_RADIUS));
  if (p.x < BALL_RADIUS || p.x > W - BALL_RADIUS || p.y > H - BALL_RADIUS) {
    return {
      success: false,
      incomplete: false,
      outcome: 'fora',
      title: 'Para fora',
      explanation:
        'A bola precisa entrar inteira entre as traves e abaixo do travessão. Mire um pouco para dentro do gol.',
      points: 0,
      point: p,
      responseMs,
    };
  }
  if (s.blocker) {
    const rect = { x: s.blocker.x - s.blocker.w / 2, y: 0, w: s.blocker.w, h: s.blocker.h };
    if (insideRect(p, rect, BALL_RADIUS)) {
      return {
        success: false,
        incomplete: false,
        outcome: 'bloqueado',
        title: 'Bloqueado pelo defensor',
        explanation:
          'O chute foi na faixa coberta pelo corpo do defensor. Procure o espaço fora da linha dele.',
        points: 0,
        point: p,
        responseMs,
      };
    }
  }
  const center = keeperReachCenter(s);
  if (insideEllipse(p, center, s.keeper.rx + BALL_RADIUS, s.keeper.ry + BALL_RADIUS)) {
    return {
      success: false,
      incomplete: false,
      outcome: 'defendido',
      title: 'Defesa do goleiro',
      explanation:
        s.keeper.lean !== 0
          ? 'O chute foi ao alcance do goleiro. Repare para que lado ele está inclinado e chute no lado oposto.'
          : 'O chute foi ao alcance do goleiro. Afaste a bola dele, de preferência rasteira e no canto.',
      points: 0,
      point: p,
      responseMs,
    };
  }
  const target = s.targets.find((t) => insideRect(p, t));
  // Margem: quão longe o ponto ficou da área de alcance do goleiro (0 a 1).
  const dx = (p.x - center.x) / (s.keeper.rx + BALL_RADIUS);
  const dy = (p.y - center.y) / (s.keeper.ry + BALL_RADIUS);
  const margin = clamp(Math.sqrt(dx * dx + dy * dy) - 1, 0, 1);
  return {
    success: true,
    incomplete: false,
    outcome: 'gol',
    title: target ? 'Gol no alvo!' : 'Gol!',
    explanation: target
      ? `Bola no ${target.label}, longe do alcance do goleiro.`
      : 'Gol fora do alcance do goleiro. Os cantos (alvos) são ainda mais seguros.',
    points: 6 + (target ? 2 : 0) + Math.round(2 * margin),
    quality: margin,
    point: p,
    targetId: target?.id,
    responseMs,
  };
}
