/** Plano de preparação até a competição, recalculado a cada abertura. */
import { formatDateBR, formatLong, isValidDate } from '../../core/dates.ts';
import { PHASE_LABEL, type PlanDay } from '../../core/planner.ts';
import type { AppContext } from '../app.ts';
import { button, card, field, linkButton, pageHeader, pill, setFieldError } from '../components.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';
import { blockHref, dayLabel } from './shared.ts';

function dayCard(day: PlanDay, today: string): HTMLElement {
  const classes = [
    'card',
    'day',
    day.isToday ? 'today' : '',
    day.phase === 'competicao' ? 'event' : '',
    day.completedSessions > 0 ? 'done' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return h(
    'li',
    { style: { padding: '0', background: 'transparent' } },
    h(
      'section',
      { class: classes, 'aria-label': `${dayLabel(day.date, today)}: ${day.title}` },
      h(
        'div',
        { class: 'row spread' },
        h('h2', { style: { fontSize: '1.05rem', margin: '0' } }, dayLabel(day.date, today)),
        day.daysToEvent !== null && day.daysToEvent > 0
          ? pill(`faltam ${day.daysToEvent}`, 'info')
          : null,
      ),
      h('p', { style: { margin: '4px 0' } }, h('strong', null, day.title)),
      h(
        'div',
        { class: 'row' },
        pill(
          `Intensidade ${day.intensity}`,
          day.intensity === 'moderada' ? 'accent' : day.intensity === 'descanso' ? 'warn' : 'info',
        ),
        pill(`${day.minutes} min`),
        day.completedSessions > 0
          ? pill(`✓ ${day.completedSessions} registrada(s)`, 'accent')
          : null,
      ),
      day.blocks.length
        ? h(
            'ul',
            { class: 'block-list' },
            day.blocks.map((b) =>
              h(
                'li',
                null,
                h(
                  'div',
                  null,
                  h('strong', null, b.label),
                  h(
                    'div',
                    { class: 'small muted' },
                    `${b.minutes} min${b.optional ? ' · opcional' : ''} · ${b.why}`,
                  ),
                ),
                day.isToday
                  ? linkButton(blockHref(b), 'Começar', { small: true })
                  : linkButton(blockHref(b), 'Ver', { small: true, variant: 'ghost' }),
              ),
            ),
          )
        : null,
      day.notes.length
        ? h(
            'ul',
            { class: 'small' },
            day.notes.map((n) => h('li', null, n)),
          )
        : null,
    ),
  );
}

export async function planoScreen(ctx: AppContext): Promise<Screen> {
  const snap = await ctx.snapshot();
  const { plan, competition } = snap;
  const nome = h('input', { type: 'text', value: competition.nome, maxlength: 80, required: true });
  const data = h('input', { type: 'date', value: competition.data, required: true });
  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'small' });
  const form = h(
    'form',
    {
      novalidate: true,
      onsubmit: async (e: Event) => {
        e.preventDefault();
        const name = nome.value.trim();
        setFieldError(nome, name ? null : 'Informe o nome da competição.');
        setFieldError(data, isValidDate(data.value) ? null : 'Informe uma data válida.');
        if (!name) {
          nome.focus();
          return;
        }
        if (!isValidDate(data.value)) {
          data.focus();
          return;
        }
        await ctx.repo.saveCompetition({ nome: name.slice(0, 80), data: data.value });
        ctx.toast('Competição salva. O plano foi recalculado.', 'sucesso');
        ctx.refresh();
      },
    },
    field('Nome da competição', nome),
    field('Data', data),
    h('button', { type: 'submit', class: 'btn primary' }, 'Salvar e recalcular'),
    status,
  );

  const header =
    plan.mode === 'evento' && plan.daysToEvent !== null
      ? card(
          { title: competition.nome },
          h('p', { class: 'lead' }, formatLong(competition.data)),
          h('p', null, plan.daysToEvent === 0 ? 'É hoje!' : `Faltam ${plan.daysToEvent} dia(s).`),
          h('details', null, h('summary', null, 'Alterar competição'), form),
        )
      : card(
          {
            title: plan.eventPassed ? 'A competição já passou' : 'Configure sua competição',
            tone: 'warn',
          },
          plan.eventPassed
            ? h(
                'p',
                null,
                `"${competition.nome}" foi em ${formatDateBR(competition.data)}. Informe a próxima competição para gerar um novo plano.`,
              )
            : null,
          form,
        );

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Plano de preparação',
      'Calculado com a data de hoje deste aparelho e com seus resultados registrados.',
    ),
    header,
    plan.notes.length
      ? card(
          null,
          h(
            'ul',
            { class: 'small' },
            plan.notes.map((n) => h('li', null, n)),
          ),
        )
      : null,
    h(
      'ol',
      { class: 'list', style: { gap: '10px' }, 'aria-label': 'Dias do plano' },
      plan.days.map((d) => dayCard(d, snap.today)),
    ),
    card(
      { title: 'Como o plano é montado', headingLevel: 2 },
      h(
        'ul',
        { class: 'small' },
        h(
          'li',
          null,
          `${PHASE_LABEL.avaliacao}: quando faltam dados, o primeiro dia mede sua linha de base.`,
        ),
        h(
          'li',
          null,
          `${PHASE_LABEL.desenvolvimento}: técnica do fundamento prioritário, um simulador de leitura e físico moderado opcional.`,
        ),
        h(
          'li',
          null,
          `${PHASE_LABEL.recuperacao}: mobilidade e leitura de jogo — o corpo melhora descansando. Acontece 2 dias antes da competição e a cada 3 dias de treino.`,
        ),
        h(
          'li',
          null,
          `${PHASE_LABEL.vespera}: poucas repetições fáceis, visualização e rotina. Nada de treino forte.`,
        ),
        h(
          'li',
          null,
          `${PHASE_LABEL.competicao}: rotina pré-jogo, aquecimento curto e hidratação. Sem treino extra.`,
        ),
        h(
          'li',
          null,
          'Registros de esforço muito alto ou desconforto deixam o dia de hoje mais leve (ou de descanso).',
        ),
        h(
          'li',
          null,
          'Seis dias não transformam um jogador: o objetivo é chegar confiante, com os fundamentos afinados e descansado.',
        ),
      ),
      button('Recalcular agora', () => ctx.refresh(), { small: true }),
    ),
  );
  return { title: 'Plano', el };
}
