/** Consultas ao conteúdo usadas pelo planejador e pelas telas. */
import type { CatalogItem, MentalKind, PlanCatalog, WorkoutKind } from '../core/planner.ts';
import type { Material, SkillId, Space } from '../core/types.ts';
import { EXERCISES } from './exercises.ts';
import { MENTAL_ACTIVITIES } from './mental.ts';
import { WORKOUTS, workoutMinutes } from './physical.ts';
import type { Exercise } from './types.ts';

export const MATERIAL_LABEL: Record<Material, string> = {
  bola: 'Bola',
  cones: 'Cones ou objetos para marcar (garrafas, chinelos)',
  parede: 'Parede lisa',
  parceiro: 'Parceiro para treinar',
  gol: 'Gol ou baliza',
};

export const SPACE_LABEL: Record<Space, string> = {
  pequeno: 'Pequeno (quarto, sala, corredor)',
  medio: 'Médio (quintal, garagem)',
  grande: 'Grande (quadra, campo)',
};

const SPACE_RANK: Record<Space, number> = { pequeno: 0, medio: 1, grande: 2 };

export function hasMaterials(e: Exercise, materials: Material[]): boolean {
  return e.materiais.every((m) => materials.includes(m));
}

export function fitsSpace(e: Exercise, space: Space): boolean {
  return SPACE_RANK[e.espacoMin] <= SPACE_RANK[space];
}

/** Converte a dificuldade do motor (1 a 5) no nível do exercício (1 a 3). */
export function targetLevel(difficulty: number): number {
  return [1, 1, 2, 3, 3][Math.min(4, Math.max(0, Math.round(difficulty) - 1))] ?? 1;
}

export function scoreExercise(
  e: Exercise,
  skill: SkillId,
  opts: {
    difficulty: number;
    materials: Material[];
    space: Space;
    focusError?: string;
    avoid?: string[];
  },
): number {
  let score = 0;
  if (e.skills[0] === skill) score += 3;
  if (hasMaterials(e, opts.materials)) score += 4;
  else if (e.semMaterial) score += 1;
  else score -= 10;
  score += fitsSpace(e, opts.space) ? 2 : -3;
  score -= Math.abs(e.nivel - targetLevel(opts.difficulty));
  if (opts.focusError && e.errosComuns.some((c) => c.tag === opts.focusError)) score += 3;
  if (opts.avoid?.includes(e.id)) score -= 2;
  return score;
}

export function pickExercise(
  skill: SkillId,
  opts: {
    difficulty: number;
    materials: Material[];
    space: Space;
    focusError?: string;
    avoid?: string[];
  },
): Exercise | null {
  const candidates = EXERCISES.filter((e) => !e.teste && e.skills.includes(skill));
  let best: Exercise | null = null;
  let bestScore = -Infinity;
  for (const e of candidates) {
    const s = scoreExercise(e, skill, opts);
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return best;
}

export function testFor(skill: SkillId): Exercise | undefined {
  return EXERCISES.find((e) => e.teste && e.skills[0] === skill);
}

export const catalog: PlanCatalog = {
  pickExercise(skill, opts): CatalogItem | null {
    const e = pickExercise(skill, opts);
    return e ? { id: e.id, nome: e.nome, minutes: e.duracaoMin } : null;
  },
  pickTest(skill): CatalogItem | null {
    const t = testFor(skill);
    return t ? { id: t.id, nome: t.nome, minutes: t.duracaoMin } : null;
  },
  workout(kind: WorkoutKind): CatalogItem | null {
    const w = WORKOUTS.find((x) => x.kind === kind);
    return w ? { id: w.id, nome: w.nome, minutes: workoutMinutes(w) } : null;
  },
  mental(kind: MentalKind): CatalogItem | null {
    const m = MENTAL_ACTIVITIES.find((x) => x.kind === kind);
    return m ? { id: m.id, nome: m.nome, minutes: m.duracaoMin } : null;
  },
};
