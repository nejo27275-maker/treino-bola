/**
 * Modo D — Decisão rápida: passar, conduzir ou proteger.
 * A utilidade de cada ação é calculada a partir da geometria do cenário:
 * - conduzir: espaço livre à frente (cone de ±35° em direção ao ataque);
 * - passar: corredor livre até um colega, marcação sobre ele e progressão;
 * - proteger: proximidade do marcador mais perto.
 */
import type { Vec } from '../geometry.ts';
import { angleDiff, angleOf, clamp, dist, laneDistance, sub, vec } from '../geometry.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { Actor, RoundResult } from './common.ts';
import { FIELD, byLevel, fmt, speedBonus, timeoutResult } from './common.ts';

export const DECISION_OPTIONS = ['passar', 'conduzir', 'proteger'] as const;
export type DecisionOption = (typeof DECISION_OPTIONS)[number];

export const DECISION_LABEL: Record<DecisionOption, string> = {
  passar: 'Passar',
  conduzir: 'Conduzir',
  proteger: 'Proteger',
};

export type DecisionArchetype = 'espaco' | 'passe' | 'pressao';

export interface DecisionScenario {
  mode: 'decisao_rapida';
  seed: number;
  difficulty: number;
  archetype: DecisionArchetype;
  player: Vec;
  teammates: Actor[];
  defenders: Actor[];
  timeLimitMs: number;
}

export interface DecisionEvaluation {
  spaceAhead: number;
  nearestDefender: number;
  bestTeammate: string | null;
  utilities: Record<DecisionOption, number>;
  best: DecisionOption;
  accepted: DecisionOption[];
}

export const DECISION_TOLERANCE = 0.12;
const LANE_RADIUS = 1.3;
const UP = angleOf(vec(0, -1));

export function analyzeDecision(s: DecisionScenario): DecisionEvaluation {
  let spaceAhead = 10;
  let nearestDefender = Infinity;
  for (const d of s.defenders) {
    const distance = dist(d.pos, s.player);
    nearestDefender = Math.min(nearestDefender, distance);
    if (angleDiff(angleOf(sub(d.pos, s.player)), UP) <= (35 * Math.PI) / 180) {
      spaceAhead = Math.min(spaceAhead, distance);
    }
  }
  let passUtility = 0;
  let bestTeammate: string | null = null;
  for (const t of s.teammates) {
    const laneClear = s.defenders.every((d) => laneDistance(d.pos, s.player, t.pos) > LANE_RADIUS);
    if (!laneClear) continue;
    const marking = Math.min(...s.defenders.map((d) => dist(d.pos, t.pos)));
    const openness = clamp((marking - 1.5) / 4, 0, 1);
    const progression = clamp((s.player.y - t.pos.y) / 10, -0.5, 1);
    const utility = openness * (0.75 + 0.25 * Math.max(0, progression));
    if (utility > passUtility) {
      passUtility = utility;
      bestTeammate = t.id;
    }
  }
  const utilities: Record<DecisionOption, number> = {
    conduzir: clamp((spaceAhead - 2.5) / 5, 0, 1),
    passar: passUtility,
    proteger: nearestDefender < 2.2 ? 0.7 : nearestDefender < 3.5 ? 0.4 : 0.1,
  };
  let best: DecisionOption = 'passar';
  for (const option of DECISION_OPTIONS) {
    if (utilities[option] > utilities[best]) best = option;
  }
  const accepted = DECISION_OPTIONS.filter(
    (o) => utilities[o] >= utilities[best] - DECISION_TOLERANCE,
  );
  return { spaceAhead, nearestDefender, bestTeammate, utilities, best, accepted };
}

function clampToField(p: Vec): Vec {
  return vec(clamp(p.x, 1, FIELD.width - 1), clamp(p.y, 1, FIELD.length - 1));
}

function polar(center: Vec, r: number, angle: number): Vec {
  return clampToField(vec(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r));
}

function tryGenerate(rng: Rng, seed: number, difficulty: number): DecisionScenario {
  const archetype = rng.pick(['espaco', 'passe', 'pressao'] as const);
  const player = vec(FIELD.width / 2 + rng.range(-5, 5), FIELD.length * 0.6 + rng.range(-2, 2));
  const up = -Math.PI / 2;
  const teammates: Actor[] = [];
  const defenders: Actor[] = [];
  const nMates = byLevel(difficulty, [2, 2, 2, 3, 3] as const);
  if (archetype === 'espaco') {
    // Espaço à frente; colegas marcados de perto.
    for (let i = 0; i < nMates; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mate = polar(player, rng.range(6, 9), up + side * rng.range(0.9, 1.4));
      teammates.push({ id: `c${i + 1}`, label: String(i + 1), pos: mate });
      defenders.push({
        id: `a${i + 1}`,
        pos: clampToField(vec(mate.x + rng.range(-0.7, 0.7), mate.y + rng.range(-1.1, -0.5))),
      });
    }
    defenders.push({
      id: `a${defenders.length + 1}`,
      pos: polar(player, rng.range(9, 12), up + rng.range(-0.25, 0.25)),
    });
  } else if (archetype === 'passe') {
    // Marcador fechando a frente; um colega livre com corredor aberto.
    defenders.push({ id: 'a1', pos: polar(player, rng.range(2.6, 3.4), up + rng.range(-0.3, 0.3)) });
    const freeSide = rng.chance(0.5) ? -1 : 1;
    teammates.push({
      id: 'c1',
      label: '1',
      pos: polar(player, rng.range(6, 9), up + freeSide * rng.range(0.7, 1.1)),
    });
    for (let i = 1; i < nMates; i++) {
      const mate = polar(player, rng.range(6, 9), up - freeSide * rng.range(0.8, 1.3));
      teammates.push({ id: `c${i + 1}`, label: String(i + 1), pos: mate });
      defenders.push({
        id: `a${defenders.length + 1}`,
        pos: clampToField(vec(mate.x + rng.range(-0.6, 0.6), mate.y + rng.range(-1, -0.5))),
      });
    }
  } else {
    // Pressão forte (por trás ou de lado), sem espaço e sem colega livre.
    defenders.push({
      id: 'a1',
      pos: polar(player, rng.range(1.2, 1.9), rng.pick([0, Math.PI, Math.PI / 2]) + rng.range(-0.4, 0.4)),
    });
    defenders.push({ id: 'a2', pos: polar(player, rng.range(2.6, 3.4), up + rng.range(-0.3, 0.3)) });
    for (let i = 0; i < nMates; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const mate = polar(player, rng.range(6, 9), up + side * rng.range(0.8, 1.3));
      teammates.push({ id: `c${i + 1}`, label: String(i + 1), pos: mate });
      defenders.push({
        id: `a${defenders.length + 1}`,
        pos: clampToField(vec(mate.x + rng.range(-0.6, 0.6), mate.y + rng.range(-1, -0.5))),
      });
    }
  }
  return {
    mode: 'decisao_rapida',
    seed,
    difficulty,
    archetype,
    player,
    teammates,
    defenders,
    timeLimitMs: byLevel(difficulty, [6000, 5000, 4000, 3000, 2200] as const),
  };
}

const EXPECTED: Record<DecisionArchetype, DecisionOption> = {
  espaco: 'conduzir',
  passe: 'passar',
  pressao: 'proteger',
};

export function generateDecision(seed: number, difficulty: number): DecisionScenario {
  const rng = createRng(seed);
  let scenario = tryGenerate(rng, seed, difficulty);
  for (let attempt = 0; attempt < 80; attempt++) {
    const analysis = analyzeDecision(scenario);
    if (analysis.best === EXPECTED[scenario.archetype] && analysis.accepted.length === 1) {
      return scenario;
    }
    scenario = tryGenerate(rng, seed, difficulty);
  }
  return scenario;
}

export function evaluateDecision(
  s: DecisionScenario,
  choice: DecisionOption | null,
  responseMs?: number,
): RoundResult {
  if (choice === null) return timeoutResult(s.timeLimitMs);
  const a = analyzeDecision(s);
  const facts = [
    `espaço à frente: ${a.spaceAhead >= 10 ? 'mais de 10 m' : fmt(a.spaceAhead)}`,
    `marcador mais perto: ${fmt(a.nearestDefender)}`,
    a.bestTeammate ? `colega ${a.bestTeammate.replace('c', '')} com corredor livre` : 'nenhum colega livre',
  ].join('; ');
  if (a.accepted.includes(choice)) {
    const isBest = choice === a.best;
    return {
      success: true,
      incomplete: false,
      outcome: isBest ? 'acerto' : 'aceitavel',
      title: isBest ? `${DECISION_LABEL[choice]}: decisão certa!` : 'Decisão aceitável',
      explanation: isBest
        ? `Boa leitura (${facts}).`
        : `Também funciona, mas "${DECISION_LABEL[a.best]}" era melhor (${facts}).`,
      points: (isBest ? 7 : 5) + speedBonus(responseMs, s.timeLimitMs, 3),
      quality: isBest ? 1 : 0.7,
      responseMs,
    };
  }
  return {
    success: false,
    incomplete: false,
    outcome: 'decisao_errada',
    title: 'Outra opção era melhor',
    explanation: `${facts}. Melhor decisão: "${DECISION_LABEL[a.best]}".`,
    points: 0,
    responseMs,
  };
}
