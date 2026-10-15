/**
 * Modo A — Passe pela brecha.
 * O jogador escolhe a direção e a força. A bola rola em linha reta e para após uma
 * distância proporcional à força. Acerta quando a trajetória não passa ao alcance de
 * nenhum adversário/cone e a bola para dentro da zona de recepção de um companheiro.
 */
import type { Vec } from '../geometry.ts';
import {
  add,
  clamp,
  cross,
  dist,
  distPointSegment,
  dot,
  fromAngle,
  scale,
  segmentCircleEntry,
  sub,
  vec,
} from '../geometry.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { Actor, RoundResult } from './common.ts';
import { BALL_RADIUS, FIELD, byLevel, fmt, insideField } from './common.ts';

export interface PassScenario {
  mode: 'passe_brecha';
  seed: number;
  difficulty: number;
  passer: Vec;
  teammates: Actor[];
  defenders: Actor[];
  cones: Actor[];
  interceptRadius: number;
  coneRadius: number;
  receiveRadius: number;
  maxDistance: number;
}

export interface PassInput {
  /** Ângulo da direção do passe, em radianos (coordenadas do campo). */
  angle: number;
  /** Força de 0 a 1 (proporcional à distância percorrida). */
  force: number;
}

export interface PassResult extends RoundResult {
  end: Vec;
  stop: Vec;
  blockerId?: string;
  receiverId?: string;
}

export const PASS_MAX_DISTANCE = 30;

function laneClear(s: PassScenario, target: Vec, margin: number): boolean {
  for (const d of s.defenders) {
    if (distPointSegment(d.pos, s.passer, target) <= s.interceptRadius + margin) return false;
  }
  for (const c of s.cones) {
    if (distPointSegment(c.pos, s.passer, target) <= s.coneRadius + BALL_RADIUS + margin) {
      return false;
    }
  }
  return true;
}

/** Companheiros que podem receber por um corredor livre (com folga de segurança). */
export function openTeammates(s: PassScenario): string[] {
  return s.teammates.filter((t) => laneClear(s, t.pos, 0.35)).map((t) => t.id);
}

function tryGenerate(rng: Rng, seed: number, difficulty: number): PassScenario {
  const nDef = byLevel(difficulty, [2, 2, 3, 3, 4] as const);
  const nMates = byLevel(difficulty, [2, 2, 3, 3, 3] as const);
  const nCones = byLevel(difficulty, [0, 0, 1, 1, 2] as const);
  const passer = vec(FIELD.width / 2 + rng.range(-4, 4), FIELD.length - 3.5);
  const teammates: Actor[] = [];
  const segment = (FIELD.width - 4) / nMates;
  for (let i = 0; i < nMates; i++) {
    teammates.push({
      id: `c${i + 1}`,
      label: String(i + 1),
      pos: vec(2 + segment * i + rng.range(0.6, segment - 0.6), rng.range(5, 13)),
    });
  }
  const defenders: Actor[] = [];
  let guard = 0;
  while (defenders.length < nDef && guard++ < 200) {
    const candidate = vec(rng.range(2, FIELD.width - 2), rng.range(14.5, 20.5));
    if (defenders.every((d) => dist(d.pos, candidate) >= 3.2)) {
      defenders.push({ id: `a${defenders.length + 1}`, pos: candidate });
    }
  }
  const cones: Actor[] = [];
  guard = 0;
  while (cones.length < nCones && guard++ < 200) {
    const candidate = vec(rng.range(3, FIELD.width - 3), rng.range(21.5, 25));
    if (dist(candidate, passer) > 3 && cones.every((c) => dist(c.pos, candidate) >= 3)) {
      cones.push({ id: `k${cones.length + 1}`, pos: candidate });
    }
  }
  return {
    mode: 'passe_brecha',
    seed,
    difficulty,
    passer,
    teammates,
    defenders,
    cones,
    interceptRadius: byLevel(difficulty, [1.0, 1.15, 1.3, 1.45, 1.6] as const),
    coneRadius: 0.35,
    receiveRadius: byLevel(difficulty, [2.2, 1.9, 1.6, 1.35, 1.1] as const),
    maxDistance: PASS_MAX_DISTANCE,
  };
}

/** Gera um cenário válido: ao menos um corredor livre e, a partir do nível 2, ao menos um bloqueado. */
export function generatePass(seed: number, difficulty: number): PassScenario {
  const rng = createRng(seed);
  let scenario = tryGenerate(rng, seed, difficulty);
  for (let attempt = 0; attempt < 60; attempt++) {
    const open = openTeammates(scenario);
    const blocked = scenario.teammates.length - open.length;
    if (open.length >= 1 && (difficulty < 2 || blocked >= 1)) return scenario;
    scenario = tryGenerate(rng, seed, difficulty);
  }
  // Recurso determinístico: garante um corredor livre até o primeiro companheiro.
  const target = scenario.teammates[0];
  if (target) {
    scenario.defenders = scenario.defenders.map((d) =>
      distPointSegment(d.pos, scenario.passer, target.pos) <= scenario.interceptRadius + 0.6
        ? { ...d, pos: vec(d.pos.x < FIELD.width / 2 ? d.pos.x + 6 : d.pos.x - 6, d.pos.y) }
        : d,
    );
    scenario.cones = scenario.cones.filter(
      (c) => distPointSegment(c.pos, scenario.passer, target.pos) > 1.2,
    );
  }
  return scenario;
}

export function evaluatePass(s: PassScenario, input: PassInput): PassResult {
  const force = clamp(input.force, 0.05, 1);
  const direction = fromAngle(input.angle);
  const distance = force * s.maxDistance;
  const end = add(s.passer, scale(direction, distance));

  // Primeiro obstáculo encontrado na trajetória.
  let firstT = Infinity;
  let blocker: Actor | undefined;
  let blockerKind: 'adversario' | 'cone' = 'adversario';
  for (const d of s.defenders) {
    const t = segmentCircleEntry(s.passer, end, d.pos, s.interceptRadius);
    if (t !== null && t < firstT) {
      firstT = t;
      blocker = d;
      blockerKind = 'adversario';
    }
  }
  for (const c of s.cones) {
    const t = segmentCircleEntry(s.passer, end, c.pos, s.coneRadius + BALL_RADIUS);
    if (t !== null && t < firstT) {
      firstT = t;
      blocker = c;
      blockerKind = 'cone';
    }
  }
  if (blocker) {
    const stop = add(s.passer, scale(sub(end, s.passer), firstT));
    return {
      success: false,
      incomplete: false,
      outcome: 'interceptado',
      title: blockerKind === 'cone' ? 'Bola bateu no obstáculo' : 'Passe interceptado',
      explanation:
        blockerKind === 'cone'
          ? 'A trajetória passou pelo obstáculo. Escolha um corredor que contorne os cones.'
          : `A bola passou a menos de ${fmt(s.interceptRadius)} de um adversário, que alcançou o passe. Procure a brecha entre os marcadores.`,
      points: 0,
      end,
      stop,
      blockerId: blocker.id,
    };
  }

  // Sem obstáculos: a bola para em `end`.
  let receiver: Actor | undefined;
  let bestDistance = Infinity;
  for (const t of s.teammates) {
    const d = dist(end, t.pos);
    if (d <= s.receiveRadius && d < bestDistance) {
      bestDistance = d;
      receiver = t;
    }
  }
  if (receiver && insideField(end)) {
    const quality = clamp(1 - bestDistance / s.receiveRadius, 0, 1);
    return {
      success: true,
      incomplete: false,
      outcome: 'acerto',
      title: 'Passe certo!',
      explanation: `Corredor livre e força correta: a bola parou a ${fmt(bestDistance)} do companheiro ${receiver.label ?? ''}.`,
      points: 6 + Math.round(4 * quality),
      quality,
      end,
      stop: end,
      receiverId: receiver.id,
    };
  }

  if (!insideField(end)) {
    return {
      success: false,
      incomplete: false,
      outcome: 'fora',
      title: 'Bola saiu do campo',
      explanation:
        'A força ou a direção levou a bola para fora. Dose a força para que ela pare perto do colega.',
      points: 0,
      end,
      stop: end,
    };
  }

  // Classifica o erro em relação ao companheiro mais próximo da linha do passe.
  let target: Actor | undefined;
  let bestLateral = Infinity;
  let along = 0;
  for (const t of s.teammates) {
    const rel = sub(t.pos, s.passer);
    const a = dot(rel, direction);
    if (a <= 0) continue;
    const lateral = Math.abs(cross(direction, rel));
    if (lateral < bestLateral) {
      bestLateral = lateral;
      target = t;
      along = a;
    }
  }
  if (!target || bestLateral > s.receiveRadius) {
    return {
      success: false,
      incomplete: false,
      outcome: 'desviado',
      title: 'Direção errada',
      explanation: target
        ? `A linha do passe passou a ${fmt(bestLateral)} do companheiro mais próximo. Aponte para o colega que está com o corredor livre.`
        : 'O passe não foi na direção de nenhum companheiro.',
      points: 0,
      end,
      stop: end,
    };
  }
  if (distance < along - s.receiveRadius) {
    return {
      success: false,
      incomplete: false,
      outcome: 'curto',
      title: 'Faltou força',
      explanation: `A direção estava boa, mas a bola parou ${fmt(along - distance)} antes do companheiro ${target.label ?? ''}. Aumente a força.`,
      points: 0,
      end,
      stop: end,
    };
  }
  return {
    success: false,
    incomplete: false,
    outcome: 'longo',
    title: 'Força demais',
    explanation: `A direção estava boa, mas a bola passou ${fmt(distance - along)} além do companheiro ${target.label ?? ''}. Diminua a força.`,
    points: 0,
    end,
    stop: end,
  };
}
