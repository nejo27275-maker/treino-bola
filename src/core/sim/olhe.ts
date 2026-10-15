/**
 * Modo C — Olhe antes de receber.
 * Fase 1: o campo inteiro aparece por alguns segundos (é o "olhar por cima do ombro").
 * Fase 2: a bola chega e tudo que está às costas do jogador (para cima, no ataque) some.
 * O jogador decide com base no que memorizou: girar e avançar, tocar para o lado livre,
 * devolver ao apoio ou proteger. A avaliação usa as posições reais do cenário.
 */
import type { Vec } from '../geometry.ts';
import { angleDiff, angleOf, dist, laneDistance, sub, vec } from '../geometry.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';
import type { Actor, RoundResult } from './common.ts';
import { FIELD, byLevel, fmt, speedBonus, timeoutResult } from './common.ts';

export const SCAN_OPTIONS = ['girar', 'tocar_lado', 'devolver', 'proteger'] as const;
export type ScanOption = (typeof SCAN_OPTIONS)[number];

export const SCAN_LABEL: Record<ScanOption, string> = {
  girar: 'Girar e avançar',
  tocar_lado: 'Tocar para o colega livre',
  devolver: 'Devolver para o apoio',
  proteger: 'Proteger a bola',
};

export type ScanArchetype = 'livre' | 'pressao_com_opcao' | 'pressao_sem_opcao' | 'pressao_media';

export interface ScanScenario {
  mode: 'olhe_antes';
  seed: number;
  difficulty: number;
  archetype: ScanArchetype;
  player: Vec;
  passer: Vec;
  teammates: Actor[];
  defenders: Actor[];
  scanMs: number;
  timeLimitMs: number;
}

export interface ScanFacts {
  /** Distância do adversário mais próximo às costas (para cima). */
  pressureBehind: number;
  /** Não há adversário a menos de 5 m no cone de ±50° para o ataque. */
  turnConeFree: boolean;
  /** Companheiro (exceto o apoio) com corredor livre e sem marcação próxima. */
  openTeammate: string | null;
  /** O apoio (quem passou) segue disponível para receber de volta. */
  supportAvailable: boolean;
}

export interface ScanEvaluation {
  facts: ScanFacts;
  utilities: Record<ScanOption, number>;
  best: ScanOption;
  accepted: ScanOption[];
}

export const SCAN_TOLERANCE = 0.16;
const UP = angleOf(vec(0, -1));

/** Atores que ficam escondidos na fase de decisão (às costas do jogador). */
export function isBehindPlayer(s: ScanScenario, p: Vec): boolean {
  return p.y < s.player.y - 0.5;
}

export function scanFacts(s: ScanScenario): ScanFacts {
  let pressureBehind = Infinity;
  let turnConeFree = true;
  for (const d of s.defenders) {
    const rel = sub(d.pos, s.player);
    const distance = dist(d.pos, s.player);
    if (d.pos.y < s.player.y + 1) pressureBehind = Math.min(pressureBehind, distance);
    if (distance < 5 && angleDiff(angleOf(rel), UP) <= (50 * Math.PI) / 180) turnConeFree = false;
  }
  let openTeammate: string | null = null;
  for (const t of s.teammates) {
    const lane = s.defenders.every((d) => laneDistance(d.pos, s.player, t.pos) > 1.2);
    const marking = Math.min(...s.defenders.map((d) => dist(d.pos, t.pos)));
    if (lane && marking > 3) {
      openTeammate = t.id;
      break;
    }
  }
  const supportLane = s.defenders.every((d) => laneDistance(d.pos, s.player, s.passer) > 1.5);
  const supportMarking = Math.min(...s.defenders.map((d) => dist(d.pos, s.passer)));
  return {
    pressureBehind,
    turnConeFree,
    openTeammate,
    supportAvailable: supportLane && supportMarking > 2.5,
  };
}

export function analyzeScan(s: ScanScenario): ScanEvaluation {
  const facts = scanFacts(s);
  const p = facts.pressureBehind;
  const utilities: Record<ScanOption, number> = {
    girar: facts.turnConeFree ? (p > 4 ? 1 : 0.7) : p > 2.5 ? 0.3 : 0,
    tocar_lado: facts.openTeammate ? 0.85 : 0.1,
    devolver: facts.supportAvailable ? 0.6 : 0.2,
    proteger: p <= 2 ? 0.65 : 0.3,
  };
  let best: ScanOption = 'girar';
  for (const option of SCAN_OPTIONS) {
    if (utilities[option] > utilities[best]) best = option;
  }
  const accepted = SCAN_OPTIONS.filter((o) => utilities[o] >= utilities[best] - SCAN_TOLERANCE);
  return { facts, utilities, best, accepted };
}

function place(rng: Rng, center: Vec, minR: number, maxR: number, a0: number, a1: number): Vec {
  const angle = rng.range(a0, a1);
  const r = rng.range(minR, maxR);
  const p = vec(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r);
  return vec(
    Math.min(FIELD.width - 1, Math.max(1, p.x)),
    Math.min(FIELD.length - 1, Math.max(1, p.y)),
  );
}

function tryGenerate(rng: Rng, seed: number, difficulty: number): ScanScenario {
  const archetype = rng.pick([
    'livre',
    'pressao_com_opcao',
    'pressao_sem_opcao',
    'pressao_media',
  ] as const);
  const player = vec(FIELD.width / 2 + rng.range(-4, 4), FIELD.length / 2 + rng.range(-2, 2));
  const passer = vec(player.x + rng.range(-3, 3), player.y + rng.range(7, 10));
  const defenders: Actor[] = [];
  const teammates: Actor[] = [];
  const up = -Math.PI / 2;
  const sideSign = rng.chance(0.5) ? -1 : 1;
  const lateralAngle = sideSign < 0 ? Math.PI + rng.range(-0.35, 0.2) : rng.range(-0.2, 0.35);
  if (archetype === 'livre') {
    defenders.push({ id: 'a1', pos: place(rng, player, 7, 10, up - 1.2, up + 1.2) });
    teammates.push({
      id: 'c1',
      label: '1',
      pos: place(rng, player, 7, 10, lateralAngle, lateralAngle),
    });
  } else if (archetype === 'pressao_com_opcao') {
    defenders.push({ id: 'a1', pos: place(rng, player, 1.2, 1.9, up - 0.5, up + 0.5) });
    teammates.push({
      id: 'c1',
      label: '1',
      pos: place(rng, player, 6, 9, lateralAngle, lateralAngle),
    });
  } else if (archetype === 'pressao_sem_opcao') {
    defenders.push({ id: 'a1', pos: place(rng, player, 1.2, 1.9, up - 0.5, up + 0.5) });
    const mate = place(rng, player, 6, 9, lateralAngle, lateralAngle);
    teammates.push({ id: 'c1', label: '1', pos: mate });
    // Marcador colado no companheiro lateral.
    defenders.push({
      id: 'a2',
      pos: vec(mate.x + rng.range(-0.8, 0.8), mate.y + rng.range(-1.2, -0.6)),
    });
  } else {
    defenders.push({ id: 'a1', pos: place(rng, player, 2.8, 3.8, up - 0.4, up + 0.4) });
    teammates.push({
      id: 'c1',
      label: '1',
      pos: place(rng, player, 6, 9, lateralAngle, lateralAngle),
    });
  }
  if (difficulty >= 3) {
    // Um adversário extra distante (ruído visual que precisa ser lido).
    defenders.push({
      id: `a${defenders.length + 1}`,
      pos: place(rng, player, 9, 12, up - 1.4, up + 1.4),
    });
  }
  if (difficulty >= 4) {
    teammates.push({
      id: `c${teammates.length + 1}`,
      label: String(teammates.length + 1),
      pos: place(rng, player, 10, 13, up - 0.6, up + 0.6),
    });
  }
  return {
    mode: 'olhe_antes',
    seed,
    difficulty,
    archetype,
    player,
    passer,
    teammates,
    defenders,
    scanMs: byLevel(difficulty, [3500, 3000, 2500, 2000, 1500] as const),
    timeLimitMs: byLevel(difficulty, [6000, 5000, 4000, 3200, 2500] as const),
  };
}

const EXPECTED: Record<ScanArchetype, ScanOption[]> = {
  livre: ['girar'],
  pressao_com_opcao: ['tocar_lado'],
  pressao_sem_opcao: ['proteger', 'devolver'],
  pressao_media: ['tocar_lado', 'devolver'],
};

/** Gera um cenário em que a melhor resposta calculada é coerente com o tipo sorteado. */
export function generateScan(seed: number, difficulty: number): ScanScenario {
  const rng = createRng(seed);
  let scenario = tryGenerate(rng, seed, difficulty);
  for (let attempt = 0; attempt < 80; attempt++) {
    const { best } = analyzeScan(scenario);
    if (EXPECTED[scenario.archetype].includes(best)) return scenario;
    scenario = tryGenerate(rng, seed, difficulty);
  }
  return scenario;
}

export function evaluateScan(
  s: ScanScenario,
  choice: ScanOption | null,
  responseMs?: number,
): RoundResult {
  if (choice === null) return timeoutResult(s.timeLimitMs);
  const analysis = analyzeScan(s);
  const { facts } = analysis;
  const pressureText = Number.isFinite(facts.pressureBehind)
    ? `adversário às suas costas a ${fmt(facts.pressureBehind)}`
    : 'nenhum adversário às suas costas';
  const context = [
    pressureText,
    facts.turnConeFree ? 'espaço livre para girar' : 'giro bloqueado',
    facts.openTeammate ? 'colega livre ao lado' : 'sem colega livre ao lado',
  ].join('; ');
  const ok = analysis.accepted.includes(choice);
  const isBest = choice === analysis.best;
  if (ok) {
    return {
      success: true,
      incomplete: false,
      outcome: isBest ? 'acerto' : 'aceitavel',
      title: isBest ? 'Leitura perfeita!' : 'Decisão aceitável',
      explanation: isBest
        ? `Você usou o que viu antes de receber: ${context}.`
        : `Funciona, mas a melhor era "${SCAN_LABEL[analysis.best]}" (${context}).`,
      points: (isBest ? 7 : 5) + speedBonus(responseMs, s.timeLimitMs, 3),
      quality: isBest ? 1 : 0.7,
      responseMs,
    };
  }
  return {
    success: false,
    incomplete: false,
    outcome: 'leitura_errada',
    title: 'Leitura incompleta',
    explanation: `O que estava às suas costas: ${context}. Melhor decisão: "${SCAN_LABEL[analysis.best]}".`,
    points: 0,
    responseMs,
  };
}
