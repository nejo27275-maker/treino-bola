/**
 * Planejador adaptativo até a competição.
 *
 * As datas são calculadas a partir da data real do aparelho em cada abertura. Fases:
 * - dia do evento: rotina pré-jogo, aquecimento e hidratação (sem treino extra);
 * - véspera: familiarização leve e descanso;
 * - 2 dias antes: recuperação ativa;
 * - demais dias: desenvolvimento (técnica prioritária + leitura + físico moderado),
 *   com um dia de recuperação a cada três dias de desenvolvimento;
 * - primeiro dia sem dados: avaliação inicial (linha de base).
 * O bem-estar registrado (esforço/desconforto) reduz a intensidade de hoje.
 */
import {
  addDays,
  dateRange,
  diffDays,
  formatDateBR,
  isValidDate,
  weekdayIndex,
  weekdayName,
} from './dates.ts';
import type { EngineOutput, Recommendation } from './engine.ts';
import { SKILLS, SKILL_ORDER } from './skills.ts';
import type {
  Competition,
  Material,
  Profile,
  SimModeId,
  SkillId,
  Space,
  TrainingSession,
} from './types.ts';

export type PlanPhase =
  | 'avaliacao'
  | 'desenvolvimento'
  | 'recuperacao'
  | 'vespera'
  | 'competicao'
  | 'manutencao'
  | 'descanso';
export type PlanIntensity = 'descanso' | 'leve' | 'moderada';
export type BlockKind =
  | 'aquecimento'
  | 'tecnico'
  | 'teste'
  | 'simulador'
  | 'fisico'
  | 'mental'
  | 'leitura';

export interface CatalogItem {
  id: string;
  nome: string;
  minutes: number;
}

export type WorkoutKind =
  | 'aquecimento'
  | 'coordenacao'
  | 'agilidade'
  | 'equilibrio'
  | 'aceleracao'
  | 'core'
  | 'forca'
  | 'mobilidade'
  | 'aquecimento_jogo'
  | 'chute';

export type MentalKind = 'respiracao' | 'rotina' | 'reset_erro' | 'visualizacao' | 'confianca';

/** Consultas ao conteúdo (biblioteca de exercícios, treinos físicos e mentais). */
export interface PlanCatalog {
  pickExercise(
    skill: SkillId,
    opts: {
      difficulty: number;
      materials: Material[];
      space: Space;
      focusError?: string;
      avoid?: string[];
    },
  ): CatalogItem | null;
  pickTest(skill: SkillId, materials: Material[]): CatalogItem | null;
  workout(kind: WorkoutKind): CatalogItem | null;
  mental(kind: MentalKind): CatalogItem | null;
}

export interface PlanBlock {
  kind: BlockKind;
  label: string;
  minutes: number;
  activityId: string;
  skill?: SkillId;
  simMode?: SimModeId;
  why: string;
  optional?: boolean;
}

export interface PlanDay {
  date: string;
  weekday: string;
  daysToEvent: number | null;
  isToday: boolean;
  phase: PlanPhase;
  intensity: PlanIntensity;
  title: string;
  minutes: number;
  blocks: PlanBlock[];
  notes: string[];
  completedSessions: number;
}

export interface Plan {
  mode: 'evento' | 'manutencao';
  today: string;
  competition: Competition | null;
  daysToEvent: number | null;
  eventPassed: boolean;
  truncated: boolean;
  days: PlanDay[];
  notes: string[];
}

export interface PlanInput {
  today: string;
  competition: Competition | null;
  profile: Profile | null;
  engine: EngineOutput;
  sessions: TrainingSession[];
  catalog: PlanCatalog;
}

export const MAX_PLAN_DAYS = 21;
const DEFAULT_MATERIALS: Material[] = ['bola'];

export const PHASE_LABEL: Record<PlanPhase, string> = {
  avaliacao: 'Avaliação inicial',
  desenvolvimento: 'Desenvolvimento técnico',
  recuperacao: 'Recuperação ativa',
  vespera: 'Véspera: familiarização leve',
  competicao: 'Dia da competição',
  manutencao: 'Treino de manutenção',
  descanso: 'Descanso',
};

function budgetMinutes(profile: Profile | null, intensity: PlanIntensity): number {
  let base = profile?.minutosDisponiveis ?? 20;
  if (profile?.preferenciaSessao === 'curtas') base = Math.min(base, 20);
  if (intensity === 'descanso') return Math.min(10, base);
  if (intensity === 'leve') return Math.max(10, Math.round(base * 0.6));
  return Math.max(10, base);
}

function prioritySkills(recs: Recommendation[], group: 'tecnica' | 'leitura'): Recommendation[] {
  return recs.filter((r) => r.skill !== null && SKILLS[r.skill].grupo === group);
}

/** Sequência de fundamentos para alternar ao longo dos dias, em ordem de prioridade. */
function rotation(
  engine: EngineOutput,
  profile: Profile | null,
  group: 'tecnica' | 'leitura',
): { skill: SkillId; why: string; difficulty: number; focusError?: string }[] {
  const recs = prioritySkills(engine.ranked, group);
  const seen = new Set<SkillId>();
  const out: { skill: SkillId; why: string; difficulty: number; focusError?: string }[] = [];
  for (const r of recs) {
    if (!r.skill || seen.has(r.skill)) continue;
    seen.add(r.skill);
    out.push({
      skill: r.skill,
      why: r.reasons[0] ?? r.title,
      difficulty: r.difficulty,
      focusError: r.focusError,
    });
  }
  // Completa com focos do perfil e a ordem padrão, para nunca ficar sem opção.
  const fallback = [...(profile?.focos ?? []), ...SKILL_ORDER];
  for (const skill of fallback) {
    if (seen.has(skill) || SKILLS[skill].grupo !== group) continue;
    const a = engine.assessments[skill];
    seen.add(skill);
    out.push({
      skill,
      why:
        a.status === 'pendente'
          ? `Ainda sem dados de ${SKILLS[skill].curto.toLowerCase()}: treinar também gera informação para o motor.`
          : `Manutenção de ${SKILLS[skill].curto.toLowerCase()}.`,
      difficulty: 1,
    });
  }
  return out;
}

function needsBaseline(engine: EngineOutput): boolean {
  const core: SkillId[] = [
    'primeiro_toque',
    'passe',
    'conducao',
    'finalizacao',
    'percepcao',
    'decisao',
  ];
  const pending = core.filter((s) => engine.assessments[s].status === 'pendente').length;
  return pending >= 3;
}

/**
 * Fase do dia. Depende só da data (e da distância até o evento), para que o plano
 * não mude de um dia para o outro sem motivo; a única exceção é a avaliação inicial,
 * que ocupa o dia de hoje quando ainda faltam dados de base.
 */
function phaseFor(
  date: string,
  index: number,
  daysToEvent: number | null,
  mode: Plan['mode'],
  baseline: boolean,
): PlanPhase {
  if (mode === 'evento' && daysToEvent !== null) {
    if (daysToEvent === 0) return 'competicao';
    if (daysToEvent === 1) return 'vespera';
    if (daysToEvent === 2) return 'recuperacao';
    if (index === 0 && baseline) return 'avaliacao';
    // Três dias de desenvolvimento para cada dia de recuperação (4, 8, 12... dias antes).
    if ((daysToEvent - 4) % 4 === 0) return 'recuperacao';
    return 'desenvolvimento';
  }
  if (index === 0 && baseline) return 'avaliacao';
  const weekday = weekdayIndex(date);
  if (weekday === 0) return 'descanso';
  if (weekday === 3) return 'recuperacao';
  return 'manutencao';
}

function intensityFor(phase: PlanPhase): PlanIntensity {
  switch (phase) {
    case 'desenvolvimento':
    case 'manutencao':
    case 'avaliacao':
      return 'moderada';
    case 'descanso':
      return 'descanso';
    default:
      return 'leve';
  }
}

function item(
  kind: BlockKind,
  it: CatalogItem | null,
  minutes: number,
  why: string,
  extra: Partial<PlanBlock> = {},
): PlanBlock | null {
  if (!it) return null;
  return { kind, label: it.nome, minutes, activityId: it.id, why, ...extra };
}

function fit(blocks: (PlanBlock | null)[], budget: number): PlanBlock[] {
  const out: PlanBlock[] = [];
  let used = 0;
  for (const block of blocks) {
    if (!block) continue;
    if (used + block.minutes > budget && out.length > 0) {
      if (block.optional) continue;
      const remaining = budget - used;
      if (remaining >= 4) {
        out.push({ ...block, minutes: remaining });
        used = budget;
      }
      continue;
    }
    out.push(block);
    used += block.minutes;
  }
  return out;
}

export function buildPlan(input: PlanInput): Plan {
  const { today, competition, profile, engine, sessions, catalog } = input;
  const materials = profile?.materiais?.length ? profile.materiais : DEFAULT_MATERIALS;
  const space: Space = profile?.espaco ?? 'medio';
  const validEvent = competition && isValidDate(competition.data) ? competition : null;
  const daysToEvent = validEvent ? diffDays(today, validEvent.data) : null;
  const eventPassed = daysToEvent !== null && daysToEvent < 0;
  const mode: Plan['mode'] = daysToEvent !== null && daysToEvent >= 0 ? 'evento' : 'manutencao';
  let end = mode === 'evento' && validEvent ? validEvent.data : addDays(today, 6);
  let truncated = false;
  if (diffDays(today, end) >= MAX_PLAN_DAYS) {
    end = addDays(today, 13);
    truncated = true;
  }
  const baseline = needsBaseline(engine);
  const tech = rotation(engine, profile, 'tecnica');
  const reading = rotation(engine, profile, 'leitura');
  const notes: string[] = [
    'O plano é recalculado sempre que você abre o aplicativo, a partir dos resultados registrados.',
  ];
  if (eventPassed && validEvent) {
    notes.unshift(
      `A competição "${validEvent.nome}" foi em ${formatDateBR(validEvent.data)} e já passou. Configure a próxima competição para gerar um novo plano; até lá, segue um plano de manutenção.`,
    );
  }
  if (truncated)
    notes.push('A competição ainda está distante: mostrando as próximas duas semanas.');
  if (engine.wellbeing.level !== 'ok') notes.push(...engine.wellbeing.reasons);

  let devIndex = 0;
  const days: PlanDay[] = dateRange(today, end).map((date, index) => {
    const dte = validEvent ? diffDays(date, validEvent.data) : null;
    let phase = phaseFor(date, index, dte, mode, baseline);
    const isToday = index === 0;
    if (isToday && engine.wellbeing.level === 'descanso' && phase !== 'competicao')
      phase = 'descanso';
    let intensity = intensityFor(phase);
    if (isToday && engine.wellbeing.level === 'atencao' && intensity === 'moderada')
      intensity = 'leve';
    const budget = budgetMinutes(profile, intensity);
    const dayNotes: string[] = [];
    let blocks: (PlanBlock | null)[] = [];
    const warmup = item(
      'aquecimento',
      catalog.workout('aquecimento'),
      5,
      'Prepara músculos e articulações e reduz o risco de lesão.',
    );

    if (phase === 'competicao') {
      blocks = [
        item(
          'mental',
          catalog.mental('rotina'),
          5,
          'Sua rotina pré-jogo ajuda a entrar concentrado e tranquilo.',
        ),
        item(
          'aquecimento',
          catalog.workout('aquecimento_jogo'),
          12,
          'Aquecimento curto antes do jogo, sem gastar energia.',
        ),
        item(
          'mental',
          catalog.mental('respiracao'),
          3,
          'Respiração calma antes de entrar e depois de um erro.',
          { optional: true },
        ),
      ];
      dayNotes.push(
        'Hoje não há treino extra: guarde energia para o jogo.',
        'Beba água ao longo do dia e em pequenos goles durante o jogo.',
        'Faça uma refeição leve 2 a 3 horas antes; evite comer muito perto da partida.',
        'Chegue com antecedência para aquecer sem pressa.',
      );
    } else if (phase === 'vespera') {
      const t = tech[0];
      blocks = [
        warmup,
        t
          ? item(
              'tecnico',
              catalog.pickExercise(t.skill, { difficulty: 1, materials, space }),
              8,
              'Familiarização: poucas repetições, fáceis e bem feitas, para ganhar confiança.',
              { skill: t.skill },
            )
          : null,
        item(
          'mental',
          catalog.mental('visualizacao'),
          4,
          'Visualize boas jogadas: prepara a atenção sem cansar o corpo.',
        ),
        item('mental', catalog.mental('rotina'), 3, 'Revise a rotina de amanhã.'),
      ];
      dayNotes.push(
        'Nada de treino forte hoje: o objetivo é chegar descansado.',
        'Durma cedo, separe chuteira/tênis, meião e garrafa de água.',
        'Hidrate-se ao longo do dia.',
      );
    } else if (phase === 'recuperacao' || phase === 'descanso') {
      const r = reading[0];
      blocks = [
        item(
          'fisico',
          catalog.workout('mobilidade'),
          phase === 'descanso' ? 5 : 8,
          'Mobilidade leve ajuda a recuperar sem impacto.',
        ),
        r && r.skill
          ? ({
              kind: 'simulador',
              label: `Simulador: ${SKILLS[r.skill].curto}`,
              minutes: 5,
              activityId: SKILLS[r.skill].simulador ?? 'decisao_rapida',
              simMode: SKILLS[r.skill].simulador,
              skill: r.skill,
              why: 'Leitura de jogo treina a cabeça sem cansar as pernas.',
            } satisfies PlanBlock)
          : null,
        item('mental', catalog.mental('respiracao'), 3, 'Respiração para relaxar e recuperar.'),
      ];
      if (phase === 'descanso')
        dayNotes.push('Dia de descanso: priorize sono, alimentação e hidratação.');
      else dayNotes.push('Dia leve: o corpo melhora durante a recuperação.');
    } else if (phase === 'avaliacao') {
      const pending = SKILL_ORDER.filter(
        (s) => SKILLS[s].medidoPorAcerto && engine.assessments[s].status === 'pendente',
      );
      const focusFirst = [...(profile?.focos ?? []).filter((s) => pending.includes(s)), ...pending];
      const techPending = focusFirst.filter((s) => SKILLS[s].grupo === 'tecnica');
      const readPending = focusFirst.filter((s) => SKILLS[s].grupo === 'leitura');
      const testBlocks: (PlanBlock | null)[] = [];
      for (const s of techPending.slice(0, 2)) {
        testBlocks.push(
          item(
            'teste',
            catalog.pickTest(s, materials),
            8,
            `Linha de base de ${SKILLS[s].curto.toLowerCase()}: sem ela, o motor não sabe o que priorizar.`,
            { skill: s },
          ),
        );
      }
      for (const s of readPending.slice(0, 1)) {
        const mode = SKILLS[s].simulador;
        if (mode) {
          testBlocks.push({
            kind: 'simulador',
            label: `Simulador: ${SKILLS[s].curto}`,
            minutes: 5,
            activityId: mode,
            simMode: mode,
            skill: s,
            why: 'Medição automática da leitura de jogo (10 rodadas).',
          });
        }
      }
      blocks = [warmup, ...testBlocks];
      dayNotes.push('Faça os testes com calma: o objetivo é medir, não acertar tudo.');
    } else {
      // desenvolvimento / manutenção
      const t = tech[devIndex % Math.max(1, tech.length)];
      const r = reading[devIndex % Math.max(1, reading.length)];
      const physicalKind: WorkoutKind = devIndex % 2 === 0 ? 'coordenacao' : 'core';
      const nearEvent = dte !== null && dte <= 3;
      blocks = [
        warmup,
        t
          ? item(
              'tecnico',
              catalog.pickExercise(t.skill, {
                difficulty: t.difficulty,
                materials,
                space,
                focusError: t.focusError,
              }),
              Math.max(6, Math.round(budget * 0.4)),
              t.why,
              { skill: t.skill },
            )
          : null,
        r && SKILLS[r.skill].simulador
          ? ({
              kind: 'simulador',
              label: `Simulador: ${SKILLS[r.skill].curto}`,
              minutes: 5,
              activityId: SKILLS[r.skill].simulador as SimModeId,
              simMode: SKILLS[r.skill].simulador,
              skill: r.skill,
              why: r.why,
            } satisfies PlanBlock)
          : null,
        intensity === 'moderada'
          ? item(
              'fisico',
              catalog.workout(nearEvent ? 'agilidade' : physicalKind),
              8,
              nearEvent
                ? 'Agilidade em volume baixo: rapidez sem acumular cansaço perto do jogo.'
                : physicalKind === 'core'
                  ? 'Estabilidade do tronco ajuda no equilíbrio e na proteção da bola.'
                  : 'Coordenação melhora o controle do corpo com a bola.',
              { optional: true },
            )
          : null,
        item(
          'mental',
          catalog.mental(devIndex % 2 === 0 ? 'respiracao' : 'reset_erro'),
          3,
          'Treino mental curto para manter o foco nos lances.',
          { optional: true },
        ),
      ];
      devIndex++;
    }

    // No dia do jogo, rotina e aquecimento não são encurtados pelo limite de tempo de treino.
    const finalBlocks =
      phase === 'competicao' ? fit(blocks, Number.POSITIVE_INFINITY) : fit(blocks, budget);
    const minutes = finalBlocks.reduce((sum, b) => sum + b.minutes, 0);
    const completedSessions = sessions.filter((s) => s.date === date).length;
    let title = PHASE_LABEL[phase];
    if (isToday && engine.wellbeing.level === 'atencao' && phase !== 'competicao')
      title = `${title} (leve hoje)`;
    return {
      date,
      weekday: weekdayName(date),
      daysToEvent: dte,
      isToday,
      phase,
      intensity,
      title,
      minutes,
      blocks: finalBlocks,
      notes: dayNotes,
      completedSessions,
    };
  });

  return {
    mode,
    today,
    competition: validEvent,
    daysToEvent,
    eventPassed,
    truncated,
    days,
    notes,
  };
}
