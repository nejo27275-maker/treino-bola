/**
 * Planejador adaptativo até a competição.
 *
 * As datas são calculadas a partir da data real do aparelho em cada abertura. Fases:
 * - dia do evento: rotina pré-jogo, aquecimento e hidratação (sem treino extra);
 * - véspera: familiarização leve e descanso;
 * - 2 dias antes: recuperação ativa;
 * - demais dias: desenvolvimento (técnica prioritária + leitura + rotação física moderada),
 *   com coordenação, core, equilíbrio, força funcional e aceleração em ciclos; recuperação
 *   continua intercalada para proteger a consistência e evitar carga repetida;
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
  /**
   * Atividade guiada com duração própria (aquecimento, treino físico, atividade mental, teste,
   * simulador): os minutos são os da atividade e não podem ser encurtados pelo plano.
   */
  fixed?: boolean;
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

/**
 * Rotação física deliberada: distribui capacidades diferentes ao longo da semana.
 * Força funcional não se repete em dias consecutivos; perto do evento, a seleção é
 * substituída por agilidade de baixo volume, sem força pesada ou esforço máximo.
 */
const PHYSICAL_ROTATION = [
  'coordenacao',
  'core',
  'equilibrio',
  'forca',
  'aceleracao',
] as const satisfies readonly WorkoutKind[];

const PHYSICAL_ROTATION_REASON: Record<(typeof PHYSICAL_ROTATION)[number], string> = {
  coordenacao: 'Coordenação melhora o controle do corpo com e sem a bola.',
  core: 'Estabilidade do tronco ajuda no equilíbrio e na proteção da bola.',
  equilibrio: 'Equilíbrio e propriocepção ajudam a manter o controle nas mudanças de direção.',
  forca: 'Força funcional apoia a proteção da bola e a estabilidade, sem buscar cargas máximas.',
  aceleracao: 'Arrancadas curtas treinam a saída rápida; mantenha o volume baixo e a técnica limpa.',
};
const ROTATING_PHYSICAL_ACTIVITY_IDS = new Set([
  'coordenacao-escada',
  'core-estabilidade',
  'equilibrio-propriocepcao',
  'forca-peso-corporal',
  'aceleracao-curta',
]);

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

/** Atividade guiada: usa a duração real da atividade (o temporizador dela não encolhe). */
function guided(
  kind: BlockKind,
  it: CatalogItem | null,
  why: string,
  extra: Partial<PlanBlock> = {},
): PlanBlock | null {
  if (!it) return null;
  return {
    kind,
    label: it.nome,
    minutes: it.minutes,
    activityId: it.id,
    why,
    fixed: true,
    ...extra,
  };
}

/** Exercício técnico: o volume se adapta ao tempo do dia (menos séries cabem em menos tempo). */
function flexible(
  kind: BlockKind,
  it: CatalogItem | null,
  minutes: number,
  why: string,
  extra: Partial<PlanBlock> = {},
): PlanBlock | null {
  if (!it) return null;
  return { kind, label: it.nome, minutes, activityId: it.id, why, ...extra };
}

/** Simulador: uma sessão de 10 rodadas leva cerca de 5 minutos. */
function simBlock(skill: SkillId, why: string, extra: Partial<PlanBlock> = {}): PlanBlock | null {
  const mode = SKILLS[skill].simulador;
  if (!mode) return null;
  return {
    kind: 'simulador',
    label: `Simulador: ${SKILLS[skill].curto}`,
    minutes: 5,
    activityId: mode,
    simMode: mode,
    skill,
    why,
    fixed: true,
    ...extra,
  };
}

/** Exercícios técnicos encurtados abaixo disso deixam de fazer sentido. */
const MIN_FLEX_MINUTES = 4;
/**
 * Uma atividade guiada obrigatória pode passar até 2 minutos do tempo do dia: o tempo
 * disponível é aproximado, e cortar um teste ou aquecimento por 1 minuto ajudaria menos.
 */
const FIXED_TOLERANCE_MINUTES = 2;

/**
 * Encaixa os blocos no tempo do dia, na ordem de prioridade:
 * - o primeiro bloco sempre entra;
 * - blocos opcionais só entram se couberem inteiros; guiados obrigatórios têm 2 min de folga;
 * - o exercício técnico pode ser encurtado (até 4 min); atividades guiadas, não;
 * - o que não couber fica de fora (e é informado no dia), sem impedir blocos seguintes menores.
 */
function fit(
  blocks: (PlanBlock | null)[],
  budget: number,
): { kept: PlanBlock[]; dropped: PlanBlock[] } {
  const kept: PlanBlock[] = [];
  const dropped: PlanBlock[] = [];
  let used = 0;
  for (const block of blocks) {
    if (!block) continue;
    const limit = block.fixed && !block.optional ? budget + FIXED_TOLERANCE_MINUTES : budget;
    if (kept.length === 0 || used + block.minutes <= limit) {
      kept.push(block);
      used += block.minutes;
      continue;
    }
    const remaining = budget - used;
    if (!block.optional && !block.fixed && remaining >= MIN_FLEX_MINUTES) {
      kept.push({ ...block, minutes: remaining });
      used = budget;
      continue;
    }
    if (!block.optional) dropped.push(block);
  }
  return { kept, dropped };
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
  // Histórico de exercícios técnicos concluídos na última semana: ajuda a variar estímulos.
  const technicalHistory = sessions
    .filter((s) => {
      const age = diffDays(s.date, today);
      return s.kind === 'tecnico' && s.status === 'concluida' && age >= 0 && age <= 7;
    })
    .map((s) => ({ date: s.date, activityId: s.activityId }));
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
  let physicalIndex = 0;
  const days: PlanDay[] = dateRange(today, end).map((date, index) => {
    const avoidRecentExercises = [
      ...new Set(
        technicalHistory
          .filter((entry) => {
            const age = diffDays(entry.date, date);
            return age >= 0 && age <= 7;
          })
          .map((entry) => entry.activityId),
      ),
    ];
    const dte = validEvent ? diffDays(date, validEvent.data) : null;
    let phase = phaseFor(date, index, dte, mode, baseline);
    const isToday = index === 0;
    if (isToday && engine.wellbeing.level === 'descanso' && phase !== 'competicao')
      phase = 'descanso';
    let intensity = intensityFor(phase);
    if (isToday && engine.wellbeing.level === 'atencao' && intensity === 'moderada')
      intensity = 'leve';
    const budget = budgetMinutes(profile, intensity);
    // Na véspera o conteúdo é leve por natureza (pouca técnica e preparação mental), então pode
    // usar todo o tempo disponível — exceto se hoje o bem-estar pediu uma sessão mais curta.
    const dayBudget =
      phase === 'competicao'
        ? Number.POSITIVE_INFINITY
        : phase === 'vespera' && !(isToday && engine.wellbeing.level !== 'ok')
          ? budgetMinutes(profile, 'moderada')
          : budget;
    const dayNotes: string[] = [];
    let blocks: (PlanBlock | null)[] = [];
    const warmup = guided(
      'aquecimento',
      catalog.workout('aquecimento'),
      'Prepara músculos e articulações e reduz o risco de lesão.',
    );

    if (phase === 'competicao') {
      // No dia do jogo, rotina e aquecimento nunca são encurtados pelo limite de tempo de treino.
      blocks = [
        guided(
          'mental',
          catalog.mental('rotina'),
          'Sua rotina pré-jogo ajuda a entrar concentrado e tranquilo.',
        ),
        guided(
          'aquecimento',
          catalog.workout('aquecimento_jogo'),
          'Aquecimento curto antes do jogo, sem gastar energia.',
        ),
        guided(
          'mental',
          catalog.mental('respiracao'),
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
      const routine = guided('mental', catalog.mental('rotina'), 'Revise a rotina de amanhã.');
      // A familiarização técnica usa o tempo que sobra depois do aquecimento e da rotina.
      const techMinutes = Math.min(
        8,
        Math.max(MIN_FLEX_MINUTES, dayBudget - (warmup?.minutes ?? 0) - (routine?.minutes ?? 0)),
      );
      blocks = [
        warmup,
        t
          ? flexible(
              'tecnico',
              catalog.pickExercise(t.skill, {
                difficulty: 1,
                materials,
                space,
                avoid: avoidRecentExercises,
              }),
              techMinutes,
              'Familiarização: poucas repetições, fáceis e bem feitas, para ganhar confiança.',
              { skill: t.skill },
            )
          : null,
        routine,
        guided(
          'mental',
          catalog.mental('visualizacao'),
          'Visualize boas jogadas: prepara a atenção sem cansar o corpo.',
          { optional: true },
        ),
      ];
      dayNotes.push(
        'Nada de treino forte hoje: o objetivo é chegar descansado.',
        'Durma cedo, separe chuteira/tênis, meião e garrafa de água.',
        'Hidrate-se ao longo do dia.',
      );
    } else if (phase === 'recuperacao' || phase === 'descanso') {
      const r = reading[0];
      blocks = [
        guided(
          'fisico',
          catalog.workout('mobilidade'),
          'Mobilidade leve ajuda a recuperar sem impacto.',
        ),
        r ? simBlock(r.skill, 'Leitura de jogo treina a cabeça sem cansar as pernas.') : null,
        guided('mental', catalog.mental('respiracao'), 'Respiração para relaxar e recuperar.', {
          optional: true,
        }),
      ];
      if (phase === 'descanso')
        dayNotes.push('Dia de descanso: priorize sono, alimentação e hidratação.');
      else dayNotes.push('Dia leve: o corpo melhora durante a recuperação.');
    } else if (phase === 'avaliacao') {
      const pending = SKILL_ORDER.filter(
        (s) => SKILLS[s].medidoPorAcerto && engine.assessments[s].status === 'pendente',
      );
      // Focos do perfil primeiro, sem repetir o mesmo teste.
      const focusFirst = [
        ...new Set([...(profile?.focos ?? []).filter((s) => pending.includes(s)), ...pending]),
      ];
      const techPending = focusFirst.filter((s) => SKILLS[s].grupo === 'tecnica');
      const readPending = focusFirst.filter((s) => SKILLS[s].grupo === 'leitura');
      const testFor = (s: SkillId) =>
        guided(
          'teste',
          catalog.pickTest(s, materials),
          `Linha de base de ${SKILLS[s].curto.toLowerCase()}: sem ela, o motor não sabe o que priorizar.`,
          { skill: s },
        );
      const [firstTech, secondTech] = techPending;
      const firstRead = readPending[0];
      // Leitura de jogo entre os testes: mede outra área sem cansar as pernas.
      blocks = [
        warmup,
        firstTech ? testFor(firstTech) : null,
        firstRead
          ? simBlock(firstRead, 'Medição automática da leitura de jogo (10 rodadas).')
          : null,
        secondTech ? testFor(secondTech) : null,
      ];
      dayNotes.push('Faça os testes com calma: o objetivo é medir, não acertar tudo.');
    } else {
      // Desenvolvimento/manutenção: técnica sempre; o físico segue rotação de capacidades.
      const t = tech[devIndex % Math.max(1, tech.length)];
      const r = reading[devIndex % Math.max(1, reading.length)];
      const physicalKind =
        PHYSICAL_ROTATION[physicalIndex % PHYSICAL_ROTATION.length] ?? 'coordenacao';
      const nearEvent = dte !== null && dte >= 0 && dte <= 3;
      const technical = t
        ? flexible(
            'tecnico',
            catalog.pickExercise(t.skill, {
              difficulty: t.difficulty,
              materials,
              space,
              focusError: t.focusError,
              avoid: avoidRecentExercises,
            }),
            Math.max(6, Math.round(budget * 0.4)),
            t.why,
            { skill: t.skill },
          )
        : null;
      const readingBlock = r ? simBlock(r.skill, r.why) : null;
      const physical =
        intensity === 'moderada'
          ? guided(
              'fisico',
              catalog.workout(nearEvent ? 'agilidade' : physicalKind),
              nearEvent
                ? 'Agilidade em volume baixo: rapidez sem acumular cansaço perto do jogo.'
                : PHYSICAL_ROTATION_REASON[physicalKind],
            )
          : null;
      const physicalFirst = devIndex % 2 === 1 && physical !== null;
      blocks = [
        warmup,
        technical,
        physicalFirst ? physical : readingBlock,
        physicalFirst
          ? readingBlock
            ? { ...readingBlock, optional: true }
            : null
          : physical
            ? { ...physical, optional: true }
            : null,
        guided(
          'mental',
          catalog.mental(devIndex % 2 === 0 ? 'respiracao' : 'reset_erro'),
          'Treino mental curto para manter o foco nos lances.',
          { optional: true },
        ),
      ];
      devIndex++;
    }

    const { kept: finalBlocks, dropped } = fit(blocks, dayBudget);
    if (
      finalBlocks.some(
        (block) => block.kind === 'fisico' && ROTATING_PHYSICAL_ACTIVITY_IDS.has(block.activityId),
      )
    ) {
      // Se o bloco opcional não couber no tempo, não avançamos para a próxima capacidade.
      physicalIndex++;
    }
    for (const block of finalBlocks) {
      if (block.kind === 'tecnico') technicalHistory.push({ date, activityId: block.activityId });
    }
    if (dropped.length) {
      const onlyMental = dropped.every((b) => b.kind === 'mental');
      dayNotes.push(
        `Não coube no tempo de hoje: ${dropped.map((b) => b.label).join(', ')}. ${
          onlyMental
            ? 'Se puder, faça antes de dormir: não exige esforço físico.'
            : 'Se tiver mais tempo, faça depois; senão, fica para outro dia.'
        }`,
      );
    }
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
