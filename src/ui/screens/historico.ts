/** Histórico e evolução: sessões, gráficos por fundamento, simuladores e comparação. */
import { formatDayMonth, formatLong } from '../../core/dates.ts';
import { clock, localTime, millis, percent } from '../../core/format.ts';
import { SIM_MODES, SIM_MODE_ORDER, isSimModeId } from '../../core/sim/index.ts';
import { SKILLS, SKILL_ORDER, SOURCE_INFO } from '../../core/skills.ts';
import type { TrainingSession } from '../../core/types.ts';
import { DISCOMFORT_LABELS } from '../../content/physical.ts';
import type { AppContext, Snapshot } from '../app.ts';
import { trendChart, type ChartPoint } from '../chart.ts';
import {
  button,
  card,
  dataTable,
  emptyState,
  field,
  linkButton,
  pageHeader,
  pill,
  select,
  sourceBadge,
  tabList,
} from '../components.ts';
import { h, replaceChildren } from '../dom.ts';
import type { Screen } from '../router.ts';
import { KIND_LABEL, activityHref, dayLabel, sessionSummaryText } from './shared.ts';

type Tab = 'sessoes' | 'evolucao' | 'simuladores' | 'comparar';
const TABS: { id: Tab; label: string }[] = [
  { id: 'sessoes', label: 'Sessões' },
  { id: 'evolucao', label: 'Evolução' },
  { id: 'simuladores', label: 'Simuladores' },
  { id: 'comparar', label: 'Comparar' },
];

function sessionsView(snap: Snapshot): HTMLElement {
  if (snap.sessions.length === 0) {
    return emptyState(
      'Nenhuma sessão ainda',
      'Quando você concluir um exercício, simulador ou avaliação, ele aparece aqui.',
      linkButton('#/avaliacao', 'Começar pela avaliação', { variant: 'primary' }),
    );
  }
  const kindSelect = select(
    [
      { value: 'todos', label: 'Todas as atividades' },
      ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })),
    ],
    'todos',
    'filtro-tipo',
  );
  const list = h('div', { class: 'stack' });
  const draw = () => {
    const filtered = snap.sessions.filter(
      (s) => kindSelect.value === 'todos' || s.kind === kindSelect.value,
    );
    const byDate = new Map<string, TrainingSession[]>();
    for (const s of filtered) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    replaceChildren(
      list,
      filtered.length
        ? [...byDate.entries()].map(([date, items]) =>
            h(
              'section',
              null,
              h('h2', { style: { fontSize: '1rem' } }, dayLabel(date, snap.today)),
              h(
                'ul',
                { class: 'list' },
                items.map((s) =>
                  h(
                    'li',
                    null,
                    h(
                      'div',
                      { class: 'row spread' },
                      h('a', { href: `#/historico/${s.id}` }, s.activityName),
                      pill(KIND_LABEL[s.kind]),
                    ),
                    h('div', { class: 'small muted' }, sessionSummaryText(s)),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'Nenhuma sessão deste tipo.'),
    );
  };
  kindSelect.addEventListener('change', draw);
  draw();
  return h('div', { class: 'stack' }, field('Filtrar', kindSelect), list);
}

function evolutionView(snap: Snapshot): HTMLElement {
  const charts = SKILL_ORDER.filter((s) => SKILLS[s].medidoPorAcerto)
    .map((skill) => {
      const a = snap.engine.assessments[skill];
      const rates = a.sessionRates;
      if (rates.length === 0) return null;
      const points: ChartPoint[] = rates.map((r, i) => ({
        x: i,
        series: r.channel === 'real' ? 0 : 1,
        value: r.rate,
        label: formatDayMonth(r.date),
        detail: `${r.attempts} tentativa(s), nível ${r.difficulty}`,
      }));
      return card(
        { title: SKILLS[skill].nome, headingLevel: 2 },
        trendChart({
          points,
          seriesNames: ['Execução real', 'Simulação/cenários'],
          title: `Taxa de acerto por sessão — ${SKILLS[skill].curto}`,
          valueFormat: (v) => percent(v),
        }),
        h(
          'p',
          { class: 'small muted' },
          a.trend === 'indefinido'
            ? 'Tendência: precisa de pelo menos 3 sessões com 5 tentativas.'
            : `Tendência: ${a.trend}.`,
        ),
      );
    })
    .filter((c): c is HTMLElement => c !== null);
  if (!charts.length) {
    return emptyState(
      'Sem dados para gráficos',
      'Os gráficos aparecem depois das primeiras sessões com contagem de acertos ou simuladores.',
      linkButton('#/simuladores', 'Jogar um simulador'),
    );
  }
  return h(
    'div',
    { class: 'stack' },
    h(
      'p',
      { class: 'small muted' },
      'Cada ponto é uma sessão. Execução real e simulação ficam separadas porque medem coisas diferentes.',
    ),
    ...charts,
  );
}

function simulatorsView(snap: Snapshot): HTMLElement {
  const cards = SIM_MODE_ORDER.map((mode) => {
    const sessions = snap.sessions
      .filter(
        (s) =>
          s.kind === 'simulador' && s.activityId === mode && s.summary && s.summary.attempts > 0,
      )
      .reverse();
    const info = SIM_MODES[mode];
    if (!sessions.length) {
      return card(
        { title: `${info.letra}. ${info.nome}`, headingLevel: 2 },
        h('p', { class: 'muted small' }, 'Ainda não jogado.'),
        linkButton(`#/simuladores/${mode}`, 'Jogar', { small: true }),
      );
    }
    const total = sessions.reduce(
      (acc, s) => ({
        a: acc.a + (s.summary?.attempts ?? 0),
        ok: acc.ok + (s.summary?.successes ?? 0),
      }),
      { a: 0, ok: 0 },
    );
    const times = sessions
      .map((s) => s.summary?.avgResponseMs)
      .filter((t): t is number => typeof t === 'number');
    const best = Math.max(...sessions.map((s) => s.summary?.score ?? 0));
    const points: ChartPoint[] = sessions.map((s, i) => ({
      x: i,
      series: 0,
      value: (s.summary?.successes ?? 0) / Math.max(1, s.summary?.attempts ?? 1),
      label: formatDayMonth(s.date),
      detail: `nível ${s.difficulty ?? 1}, ${s.summary?.score ?? 0} pts`,
    }));
    return card(
      { title: `${info.letra}. ${info.nome}`, headingLevel: 2 },
      h(
        'div',
        { class: 'grid-3' },
        h(
          'div',
          { class: 'stat' },
          h('span', { class: 'value' }, String(sessions.length)),
          h('span', { class: 'label' }, 'sessões'),
        ),
        h(
          'div',
          { class: 'stat' },
          h('span', { class: 'value' }, percent(total.ok / Math.max(1, total.a))),
          h('span', { class: 'label' }, 'acerto geral'),
        ),
        h(
          'div',
          { class: 'stat' },
          h('span', { class: 'value' }, String(best)),
          h('span', { class: 'label' }, 'recorde (pts)'),
        ),
      ),
      times.length
        ? h(
            'p',
            { class: 'small' },
            `Tempo médio de resposta: ${millis(times.reduce((a, b) => a + b, 0) / times.length)}.`,
          )
        : null,
      sessions.length >= 2
        ? trendChart({
            points,
            seriesNames: ['Acerto por sessão'],
            title: 'Acerto por sessão',
            valueFormat: (v) => percent(v),
          })
        : null,
    );
  });
  return h('div', { class: 'stack' }, ...cards);
}

function compareView(snap: Snapshot): HTMLElement {
  const comparable = snap.sessions.filter((s) => s.summary && s.summary.attempts > 0);
  const byActivity = new Map<string, TrainingSession[]>();
  for (const s of comparable)
    byActivity.set(s.activityId, [...(byActivity.get(s.activityId) ?? []), s]);
  const options = [...byActivity.entries()].filter(([, list]) => list.length >= 2);
  if (!options.length) {
    return emptyState(
      'Nada para comparar ainda',
      'É preciso ter pelo menos duas sessões da mesma atividade com contagem de acertos.',
    );
  }
  const activitySelect = select(
    options.map(([id, list]) => ({
      value: id,
      label: `${list[0]?.activityName ?? id} (${list.length})`,
    })),
    options[0]?.[0] ?? '',
    'cmp-atividade',
  );
  const aWrap = h('div');
  const bWrap = h('div');
  const result = h('div', { 'aria-live': 'polite' });
  let aSelect: HTMLSelectElement;
  let bSelect: HTMLSelectElement;
  const label = (s: TrainingSession) =>
    `${formatDayMonth(s.date)} ${localTime(s.startedAt)} — ${s.summary?.successes}/${s.summary?.attempts}`;
  const drawSelects = () => {
    const list = byActivity.get(activitySelect.value) ?? [];
    aSelect = select(
      list.map((s) => ({ value: s.id, label: label(s) })),
      list[list.length - 1]?.id ?? '',
      'cmp-a',
    );
    bSelect = select(
      list.map((s) => ({ value: s.id, label: label(s) })),
      list[0]?.id ?? '',
      'cmp-b',
    );
    aSelect.addEventListener('change', drawResult);
    bSelect.addEventListener('change', drawResult);
    replaceChildren(aWrap, field('Sessão A (mais antiga)', aSelect));
    replaceChildren(bWrap, field('Sessão B (mais recente)', bSelect));
    drawResult();
  };
  const drawResult = () => {
    const a = comparable.find((s) => s.id === aSelect.value);
    const b = comparable.find((s) => s.id === bSelect.value);
    if (!a || !b || !a.summary || !b.summary) return;
    const rate = (s: TrainingSession) =>
      (s.summary?.successes ?? 0) / Math.max(1, s.summary?.attempts ?? 1);
    const diff = rate(b) - rate(a);
    const rows: [string, string, string][] = [
      ['Data', formatDayMonth(a.date), formatDayMonth(b.date)],
      ['Tentativas', String(a.summary.attempts), String(b.summary.attempts)],
      ['Acertos', String(a.summary.successes), String(b.summary.successes)],
      ['Aproveitamento', percent(rate(a)), percent(rate(b))],
      ['Nível/dificuldade', String(a.difficulty ?? '—'), String(b.difficulty ?? '—')],
      [
        'Tempo médio',
        a.summary.avgResponseMs ? millis(a.summary.avgResponseMs) : '—',
        b.summary.avgResponseMs ? millis(b.summary.avgResponseMs) : '—',
      ],
      ['Pontos', String(a.summary.score ?? '—'), String(b.summary.score ?? '—')],
    ];
    replaceChildren(
      result,
      dataTable(
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col' }, ''),
            h('th', { scope: 'col' }, 'A'),
            h('th', { scope: 'col' }, 'B'),
          ),
        ),
        h(
          'tbody',
          null,
          rows.map(([k, va, vb]) =>
            h('tr', null, h('th', { scope: 'row' }, k), h('td', null, va), h('td', null, vb)),
          ),
        ),
      ),
      h(
        'p',
        { style: { marginTop: '8px' } },
        diff === 0
          ? 'Mesmo aproveitamento nas duas sessões.'
          : `Diferença de aproveitamento: ${diff > 0 ? '+' : ''}${Math.round(diff * 100)} pontos percentuais${a.difficulty !== b.difficulty ? ' (atenção: níveis diferentes)' : ''}.`,
      ),
      Math.min(a.summary.attempts, b.summary.attempts) < 8
        ? h(
            'p',
            { class: 'small muted' },
            'Poucas tentativas em uma das sessões: a diferença pode ser acaso.',
          )
        : null,
    );
  };
  activitySelect.addEventListener('change', drawSelects);
  drawSelects();
  return h('div', { class: 'stack' }, field('Atividade', activitySelect), aWrap, bWrap, result);
}

export async function historicoScreen(ctx: AppContext, query: URLSearchParams): Promise<Screen> {
  const snap = await ctx.snapshot();
  const requested = query.get('aba');
  let current: Tab = TABS.some((t) => t.id === requested) ? (requested as Tab) : 'sessoes';
  const panel = h('div', { id: 'hist-panel' });
  const show = (tab: Tab) => {
    current = tab;
    replaceChildren(
      panel,
      tab === 'sessoes'
        ? sessionsView(snap)
        : tab === 'evolucao'
          ? evolutionView(snap)
          : tab === 'simuladores'
            ? simulatorsView(snap)
            : compareView(snap),
    );
  };
  const tabs = tabList<Tab>({
    label: 'Visões do histórico',
    idPrefix: 'hist',
    panel,
    tabs: TABS,
    selected: current,
    onSelect: show,
  });
  show(current);
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Histórico e evolução',
      `${snap.sessions.length} sessão(ões) registrada(s) neste aparelho.`,
      { href: '#/mais', label: 'Mais' },
    ),
    tabs.el,
    panel,
  );
  return { title: 'Histórico', el };
}

export async function sessionDetailScreen(ctx: AppContext, id: string): Promise<Screen> {
  const [sessions, results] = await Promise.all([ctx.repo.listSessions(), ctx.repo.listResults()]);
  const s = sessions.find((x) => x.id === id);
  if (!s) throw new Error('Sessão não encontrada (pode ter sido apagada).');
  const mine = results.filter((r) => r.sessionId === s.id);
  const again = activityHref(s);
  const replay =
    s.kind === 'simulador' && isSimModeId(s.activityId) && s.seed !== undefined
      ? `#/simuladores/${s.activityId}?semente=${s.seed}&nivel=${s.difficulty ?? 1}`
      : null;
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(s.activityName, `${KIND_LABEL[s.kind]} · ${formatLong(s.date)}`, {
      href: '#/historico',
      label: 'Histórico',
    }),
    card(
      { title: 'Resumo' },
      h('p', null, sessionSummaryText(s)),
      h(
        'ul',
        { class: 'small' },
        h('li', null, `Início: ${localTime(s.startedAt)} · duração ativa ${clock(s.durationSec)}`),
        h(
          'li',
          null,
          `Situação: ${s.status === 'concluida' ? 'concluída' : 'interrompida antes do fim'}`,
        ),
        s.difficulty ? h('li', null, `Nível/dificuldade: ${s.difficulty}`) : null,
        s.seed !== undefined
          ? h('li', null, `Semente: ${s.seed} (permite repetir os mesmos cenários)`)
          : null,
        typeof s.rpe === 'number' ? h('li', null, `Esforço percebido: ${s.rpe}/10`) : null,
        typeof s.discomfort === 'number'
          ? h(
              'li',
              null,
              `Desconforto: ${DISCOMFORT_LABELS[s.discomfort]}${s.discomfortArea ? ` (${s.discomfortArea})` : ''}`,
            )
          : null,
        s.skills?.length
          ? h(
              'li',
              null,
              `Fundamentos trabalhados: ${s.skills.map((k) => SKILLS[k].curto).join(', ')}`,
            )
          : null,
      ),
      s.notes ? h('p', null, h('strong', null, 'Notas: '), s.notes) : null,
    ),
    mine.length
      ? card(
          { title: 'Resultados registrados' },
          h(
            'ul',
            { class: 'list' },
            mine.map((r) =>
              h(
                'li',
                null,
                h(
                  'div',
                  { class: 'row spread' },
                  h('strong', null, SKILLS[r.skill].nome),
                  sourceBadge(r.source),
                ),
                h(
                  'div',
                  { class: 'small' },
                  r.source === 'autoavaliacao'
                    ? `Nota ${r.rating}/5`
                    : `${r.successes}/${r.attempts} (${percent(r.successes / Math.max(1, r.attempts))})`,
                  r.responseTimesMs?.length
                    ? ` · tempo médio ${millis(r.responseTimesMs.reduce((a, b) => a + b, 0) / r.responseTimesMs.length)}`
                    : '',
                  r.incomplete ? ` · ${r.incomplete} sem resposta a tempo` : '',
                ),
                h('div', { class: 'small muted' }, SOURCE_INFO[r.source].tipo),
              ),
            ),
          ),
        )
      : null,
    s.rounds?.length
      ? card(
          { title: 'Rodadas' },
          dataTable(
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', { scope: 'col' }, '#'),
                h('th', { scope: 'col' }, 'Desfecho'),
                h('th', { scope: 'col' }, 'Pts'),
                h('th', { scope: 'col' }, 'Tempo'),
              ),
            ),
            h(
              'tbody',
              null,
              s.rounds.map((r, i) =>
                h(
                  'tr',
                  null,
                  h('td', null, String(i + 1)),
                  h('td', null, `${r.success ? '✓' : '✗'} ${r.outcome.replace(/_/g, ' ')}`),
                  h('td', null, String(r.points)),
                  h('td', null, r.responseMs ? millis(r.responseMs) : '—'),
                ),
              ),
            ),
          ),
        )
      : null,
    h(
      'div',
      { class: 'row' },
      again ? linkButton(again, 'Fazer de novo', { variant: 'primary' }) : null,
      replay ? linkButton(replay, 'Repetir com a mesma semente') : null,
      button(
        'Excluir sessão',
        async () => {
          const ok = await ctx.confirm({
            title: 'Excluir esta sessão?',
            message: 'A sessão e os resultados ligados a ela serão apagados deste aparelho.',
            confirmLabel: 'Excluir',
            danger: true,
          });
          if (!ok) return;
          await ctx.repo.deleteSession(s.id);
          ctx.toast('Sessão excluída.', 'sucesso');
          ctx.navigate('/historico');
        },
        { variant: 'danger' },
      ),
    ),
  );
  return { title: s.activityName, el };
}
