/** Início: painel do jogador com contagem regressiva, plano de hoje e prioridades. */
import { pickExercise, testFor } from '../../content/catalog.ts';
import { formatDateBR, formatLong } from '../../core/dates.ts';
import type { Recommendation } from '../../core/engine.ts';
import { SKILLS, SKILL_ORDER } from '../../core/skills.ts';
import type { Profile } from '../../core/types.ts';
import type { AppContext } from '../app.ts';
import { button, card, linkButton, pageHeader, pill, statusPill } from '../components.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { blockHref, dayLabel, sessionSummaryText } from './shared.ts';

const TYPE_LABEL: Record<Recommendation['type'], string> = {
  descansar: 'Recuperação',
  avaliar: 'Avaliar',
  reavaliar: 'Medir de novo',
  treinar: 'Treinar',
  progredir: 'Progredir',
};

/** Para onde levar o jogador ao tocar em uma recomendação. */
export function recommendationHref(rec: Recommendation, profile: Profile | null): string {
  if (!rec.skill) return '#/mental/respiracao-4-6';
  const info = SKILLS[rec.skill];
  if (rec.type === 'avaliar' || rec.type === 'reavaliar') {
    const test = testFor(rec.skill);
    if (test) return `#/tecnico/${test.id}`;
  }
  if (info.grupo === 'leitura' && info.simulador) return `#/simuladores/${info.simulador}`;
  const exercise = pickExercise(rec.skill, {
    difficulty: rec.difficulty,
    materials: profile?.materiais?.length ? profile.materiais : ['bola'],
    space: profile?.espaco ?? 'medio',
    focusError: rec.focusError,
  });
  if (exercise) return `#/tecnico/${exercise.id}`;
  if (info.simulador) return `#/simuladores/${info.simulador}`;
  return rec.skill === 'concentracao' ? '#/mental' : '#/treinar';
}

export function recommendationCard(rec: Recommendation, profile: Profile | null): HTMLElement {
  return h(
    'li',
    null,
    h('div', { class: 'row spread' }, h('strong', null, rec.title), pill(TYPE_LABEL[rec.type], rec.type === 'treinar' ? 'accent' : rec.type === 'descansar' ? 'warn' : 'info')),
    h('details', null, h('summary', null, 'Por quê?'), h('ul', null, rec.reasons.map((r) => h('li', null, r))), h('p', { class: 'small muted' }, `Confiança nos dados: ${rec.confidence}.`)),
    h('div', { class: 'row' }, linkButton(recommendationHref(rec, profile), rec.type === 'avaliar' || rec.type === 'reavaliar' ? 'Fazer agora' : 'Começar', { small: true, variant: 'primary' })),
  );
}

export async function homeScreen(ctx: AppContext): Promise<Screen> {
  const snap = await ctx.snapshot();
  const { plan, engine, profile, competition } = snap;
  const today = plan.days[0];
  const name = profile?.apelido?.trim();

  const welcome = !snap.onboardingSeen
    ? card(
        { title: 'Bem-vindo ao Cláudio Futebol AI', tone: 'accent' },
        h('p', null, 'Responda algumas perguntas rápidas (opcional) para personalizar seus treinos. Seus dados ficam só neste aparelho.'),
        h(
          'div',
          { class: 'row' },
          linkButton('#/perfil', 'Configurar perfil', { variant: 'primary' }),
          button('Agora não', async () => {
            await ctx.repo.setOnboardingSeen();
            ctx.refresh();
          }, { variant: 'ghost' }),
        ),
      )
    : null;

  let countdown: HTMLElement;
  if (plan.mode === 'evento' && plan.daysToEvent !== null) {
    countdown = card(
      { tone: plan.daysToEvent <= 1 ? 'warn' : undefined },
      h('p', { class: 'muted small' }, competition.nome),
      h('p', { class: 'big-number' }, plan.daysToEvent === 0 ? 'É hoje!' : plan.daysToEvent === 1 ? 'É amanhã!' : `Faltam ${plan.daysToEvent} dias`),
      h('p', null, formatLong(competition.data)),
      plan.daysToEvent === 0 ? h('p', null, 'Aquecimento, água e confiança. Nada de treino extra hoje — bom jogo!') : null,
    );
  } else if (plan.eventPassed) {
    countdown = card(
      { title: `${competition.nome} já aconteceu`, tone: 'warn' },
      h('p', null, `Foi em ${formatDateBR(competition.data)}. Configure a próxima competição para gerar um novo plano.`),
      linkButton('#/plano', 'Configurar próxima competição', { variant: 'primary' }),
    );
  } else {
    countdown = card({ title: 'Sem competição marcada' }, linkButton('#/plano', 'Configurar competição'));
  }

  const wellbeing =
    engine.wellbeing.level !== 'ok'
      ? card(
          { title: engine.wellbeing.level === 'descanso' ? 'Hoje é dia de descanso' : 'Hoje, treino leve', tone: engine.wellbeing.level === 'descanso' ? 'danger' : 'warn' },
          h('ul', null, engine.wellbeing.reasons.map((r) => h('li', null, r))),
        )
      : null;

  const todayCard = today
    ? card(
        { title: `Plano de hoje: ${today.title}` },
        h('div', { class: 'row' }, pill(`Intensidade ${today.intensity}`, today.intensity === 'moderada' ? 'accent' : 'info'), pill(`${today.minutes} min`)),
        today.blocks.length
          ? h(
              'ul',
              { class: 'block-list' },
              today.blocks.map((b) =>
                h(
                  'li',
                  null,
                  h('div', null, h('strong', null, b.label), h('div', { class: 'small muted' }, `${b.minutes} min · ${b.why}`)),
                  linkButton(blockHref(b), 'Começar', { small: true }),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Sem atividades programadas para hoje.'),
        today.notes.length ? h('ul', { class: 'small' }, today.notes.map((n) => h('li', null, n))) : null,
        today.completedSessions > 0 ? h('p', { class: 'small' }, `✓ Você já registrou ${today.completedSessions} atividade(s) hoje.`) : null,
        h('div', { class: 'row' }, linkButton('#/plano', 'Ver o plano completo', { small: true, variant: 'ghost' })),
      )
    : null;

  const recs = engine.recommendations.filter((r) => r.type !== 'descansar').slice(0, 3);
  const priorities = card(
    { title: 'Prioridades do treinador' },
    h('p', { class: 'small muted' }, 'Calculadas a partir dos seus resultados registrados. Toque em "Por quê?" para ver o motivo.'),
    h('ul', { class: 'list' }, recs.map((r) => recommendationCard(r, profile))),
  );

  const skills = card(
    { title: 'Seus fundamentos' },
    h(
      'ul',
      { class: 'list' },
      SKILL_ORDER.filter((s) => SKILLS[s].medidoPorAcerto).map((s) =>
        h('li', { class: 'row spread' }, h('span', null, SKILLS[s].curto), statusPill(engine.assessments[s])),
      ),
    ),
    h('div', { class: 'row', style: { marginTop: '10px' } }, linkButton('#/avaliacao', 'Avaliação de habilidades', { small: true })),
  );

  const recent = snap.sessions.slice(0, 3);
  const history = card(
    { title: 'Atividades recentes' },
    recent.length
      ? h(
          'ul',
          { class: 'list' },
          recent.map((s) =>
            h('li', null, h('a', { href: `#/historico/${s.id}` }, s.activityName), h('div', { class: 'small muted' }, `${dayLabel(s.date, snap.today)} · ${sessionSummaryText(s)}`)),
          ),
        )
      : h('p', { class: 'muted' }, 'Nenhuma atividade registrada ainda. Comece pela avaliação inicial ou por um simulador.'),
    h('div', { class: 'row', style: { marginTop: '10px' } }, linkButton('#/historico', 'Ver histórico e evolução', { small: true })),
  );

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(name ? `Olá, ${name}!` : 'Olá!', 'Seu treinador de futebol, direto no celular — sem enviar seus dados para lugar nenhum.'),
    welcome,
    countdown,
    wellbeing,
    todayCard,
    priorities,
    skills,
    history,
  );
  return { title: 'Início', el };
}
