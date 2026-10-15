/**
 * Modo B — Domínio orientado.
 * A bola chega ao jogador e um ou dois marcadores pressionam. O jogador escolhe para
 * onde direcionar o primeiro toque. O motor calcula, para cada opção, o espaço que
 * sobra entre a bola e o marcador mais próximo depois que os marcadores avançam.
 */
import type { Vec } from '../geometry.ts';
import { add, clamp, dist, normalize, scale, sub, vec } from '../geometry.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { Actor, RoundResult } from './common.ts';
import { FIELD, byLevel, fmt, insideField, speedBonus, timeoutResult } from './common.ts';

export const CONTROL_OPTIONS = ['esquerda', 'direita', 'frente', 'tras'] as const;
export type ControlOption = (typeof CONTROL_OPTIONS)[number];

export const CONTROL_LABEL: Record<ControlOption, string> = {
  esquerda: 'Para a esquerda',
  direita: 'Para a direita',
  frente: 'Para a frente (ataque)',
  tras: 'Para trás (proteger)',
};

const DIRECTION: Record<ControlOption, Vec> = {
  esquerda: vec(-1, 0),
  direita: vec(1, 0),
  frente: vec(0, -1),
  tras: vec(0, 1),
};

/**
 * Ajuste de progressão (em metros equivalentes): avançar vale um pouco mais e recuar,
 * um pouco menos — mas nunca a ponto de superar a regra principal, que é levar a
 * bola para longe da pressão.
 */
const PROGRESSION: Record<ControlOption, number> = {
  esquerda: 0,
  direita: 0,
  frente: 0.4,
  tras: -0.4,
};

export interface ControlScenario {
  mode: 'dominio_orientado';
  seed: number;
  difficulty: number;
  player: Vec;
  passer: Vec;
  defenders: Actor[];
  defenderSpeed: number;
  /** Tempo (s) entre o toque e a próxima ação, usado para avançar os marcadores. */
  actionTime: number;
  touchDistance: number;
  timeLimitMs: number;
}

export interface ControlOptionEval {
  option: ControlOption;
  ballPos: Vec;
  space: number;
  utility: number;
  valid: boolean;
}

export interface ControlEvaluation {
  options: ControlOptionEval[];
  best: ControlOption;
  accepted: ControlOption[];
}

export const CONTROL_TOLERANCE = 0.4;
export const CONTROL_MIN_SPACE = 2.0;

function defendersAfter(s: ControlScenario): Vec[] {
  return s.defenders.map((d) => {
    const toPlayer = sub(s.player, d.pos);
    const gap = Math.max(0, dist(s.player, d.pos) - 0.6);
    const move = Math.min(gap, s.defenderSpeed * s.actionTime);
    return add(d.pos, scale(normalize(toPlayer), move));
  });
}

export function analyzeControl(s: ControlScenario): ControlEvaluation {
  const moved = defendersAfter(s);
  const options: ControlOptionEval[] = CONTROL_OPTIONS.map((option) => {
    const ballPos = add(s.player, scale(DIRECTION[option], s.touchDistance));
    const valid = insideField(ballPos, 0.5);
    const space = valid ? Math.min(...moved.map((m) => dist(ballPos, m))) : 0;
    const utility = valid ? space + PROGRESSION[option] : -Infinity;
    return { option, ballPos, space, utility, valid };
  });
  const best = options.reduce((a, b) => (b.utility > a.utility ? b : a));
  const accepted = options
    .filter(
      (o) =>
        o.valid && o.utility >= best.utility - CONTROL_TOLERANCE && o.space >= CONTROL_MIN_SPACE,
    )
    .map((o) => o.option);
  if (!accepted.includes(best.option)) accepted.unshift(best.option);
  return { options, best: best.option, accepted };
}

function insideBounds(p: Vec): Vec {
  return vec(clamp(p.x, 0.5, FIELD.width - 0.5), clamp(p.y, 0.5, FIELD.length - 0.5));
}

function tryGenerate(rng: Rng, seed: number, difficulty: number): ControlScenario {
  const player = vec(FIELD.width / 2 + rng.range(-5, 5), FIELD.length / 2 + rng.range(-3, 3));
  const passer = vec(player.x + rng.range(-5, 5), player.y + rng.range(7, 10));
  const nDef = byLevel(difficulty, [1, 1, 2, 2, 2] as const);
  const [minD, maxD] = byLevel(difficulty, [
    [5.5, 8],
    [5, 7],
    [4.5, 6.5],
    [4, 6],
    [3.5, 5.5],
  ] as const);
  const defenders: Actor[] = [];
  // Marcador principal: vem de um dos lados (esquerda ou direita), levemente à frente ou atrás.
  const side = rng.chance(0.5) ? -1 : 1;
  const angle1 = side < 0 ? Math.PI + rng.range(-0.6, 0.6) : rng.range(-0.6, 0.6);
  const r1 = rng.range(minD, maxD);
  defenders.push({
    id: 'a1',
    pos: insideBounds(add(player, vec(Math.cos(angle1) * r1, Math.sin(angle1) * r1))),
  });
  if (nDef > 1) {
    // Segundo marcador: à frente ou do outro lado, mais distante.
    const ahead = rng.chance(0.5);
    const angle2 = ahead
      ? -Math.PI / 2 + rng.range(-0.5, 0.5)
      : (side < 0 ? 0 : Math.PI) + rng.range(-0.5, 0.5);
    const r2 = rng.range(minD + 1.5, maxD + 3);
    defenders.push({
      id: 'a2',
      pos: insideBounds(add(player, vec(Math.cos(angle2) * r2, Math.sin(angle2) * r2))),
    });
  }
  return {
    mode: 'dominio_orientado',
    seed,
    difficulty,
    player,
    passer,
    defenders,
    defenderSpeed: byLevel(difficulty, [4.5, 5, 5.5, 6, 6.5] as const),
    actionTime: 0.9,
    touchDistance: 2.2,
    timeLimitMs: byLevel(difficulty, [5000, 4000, 3200, 2500, 2000] as const),
  };
}

/** Gera cenários com uma melhor opção clara (diferença mínima de 0,6 m para a 2ª colocada). */
export function generateControl(seed: number, difficulty: number): ControlScenario {
  const rng = createRng(seed);
  let scenario = tryGenerate(rng, seed, difficulty);
  for (let attempt = 0; attempt < 60; attempt++) {
    const analysis = analyzeControl(scenario);
    const sorted = analysis.options
      .filter((o) => o.valid)
      .map((o) => o.utility)
      .sort((a, b) => b - a);
    const gap = (sorted[0] ?? 0) - (sorted[1] ?? -Infinity);
    const bestSpace = analysis.options.find((o) => o.option === analysis.best)?.space ?? 0;
    if (gap >= 0.6 && bestSpace >= CONTROL_MIN_SPACE) return scenario;
    scenario = tryGenerate(rng, seed, difficulty);
  }
  return scenario;
}

export function evaluateControl(
  s: ControlScenario,
  choice: ControlOption | null,
  responseMs?: number,
): RoundResult {
  if (choice === null) return timeoutResult(s.timeLimitMs);
  const analysis = analyzeControl(s);
  const chosen = analysis.options.find((o) => o.option === choice);
  const best = analysis.options.find((o) => o.option === analysis.best);
  if (!chosen || !best) throw new Error('Opção inválida');
  const ok = analysis.accepted.includes(choice);
  const bestText = `${CONTROL_LABEL[best.option].toLowerCase()} (${fmt(best.space)} de espaço)`;
  if (!chosen.valid) {
    return {
      success: false,
      incomplete: false,
      outcome: 'fora',
      title: 'A bola sairia do campo',
      explanation: `Com o toque ${CONTROL_LABEL[choice].toLowerCase()}, a bola sairia pela linha. Melhor opção: ${bestText}.`,
      points: 0,
      responseMs,
    };
  }
  if (ok) {
    const isBest = choice === analysis.best;
    const quality = isBest ? 1 : 0.7;
    return {
      success: true,
      incomplete: false,
      outcome: isBest ? 'acerto' : 'aceitavel',
      title: isBest ? 'Ótimo domínio orientado!' : 'Boa escolha',
      explanation: isBest
        ? `Você levou a bola para longe da pressão: ${fmt(chosen.space)} até o marcador mais próximo depois do toque.`
        : `Opção segura (${fmt(chosen.space)} de espaço). A melhor seria ${bestText}.`,
      points: (isBest ? 7 : 5) + speedBonus(responseMs, s.timeLimitMs, 3),
      quality,
      responseMs,
    };
  }
  return {
    success: false,
    incomplete: false,
    outcome: 'pressionado',
    title: 'Toque na direção da pressão',
    explanation: `Depois do toque ${CONTROL_LABEL[choice].toLowerCase()}, o marcador ficaria a ${fmt(chosen.space)} da bola. Melhor opção: ${bestText}.`,
    points: 0,
    responseMs,
  };
}
