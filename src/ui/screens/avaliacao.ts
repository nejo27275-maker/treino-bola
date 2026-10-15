/** Avaliação de habilidades: linha de base, origem das evidências e autoavaliação. */
import { testFor } from '../../content/catalog.ts';
import { formatDayMonth } from '../../core/dates.ts';
import type { SkillAssessment } from '../../core/engine.ts';
import { millis, percent } from '../../core/format.ts';
import { logSelfAssessment } from '../../core/sessionLog.ts';
import { SKILLS, SKILL_ORDER, SOURCE_INFO } from '../../core/skills.ts';
import type { ResultSource, SkillId } from '../../core/types.ts';
import type { AppContext } from '../app.ts';
import { button, card, linkButton, pageHeader, pill, statusPill } from '../components.ts';
import { h } from '../dom.ts';
import type { Screen } from '../router.ts';

const TREND_LABEL = {
  melhorando: 'melhorando',
  piorando: 'piorando',
  estavel: 'estável',
  indefinido: '',
} as const;

function sourcesText(sources: Partial<Record<ResultSource, number>>): string {
  return Object.entries(sources)
    .map(([src, n]) => `${SOURCE_INFO[src as ResultSource].rotulo}: ${n}`)
    .join(', ');
}

function skillRow(a: SkillAssessment): HTMLElement {
  const info = SKILLS[a.skill];
  const test = testFor(a.skill);
  const details: HTMLElement[] = [];
  if (a.real) {
    details.push(
      h(
        'li',
        null,
        `Execução real: ${a.real.successes}/${a.real.attempts} acertos · estimativa ${percent(a.real.rate)} (${sourcesText(a.real.sources)}) · último registro ${formatDayMonth(a.real.lastDate)}`,
      ),
    );
  }
  if (a.simulado) {
    details.push(
      h(
        'li',
        null,
        `Simulação/cenários: ${a.simulado.successes}/${a.simulado.attempts} acertos · estimativa ${percent(a.simulado.rate)} (${sourcesText(a.simulado.sources)})${a.simulado.avgResponseMs ? ` · tempo médio ${millis(a.simulado.avgResponseMs)}` : ''}`,
      ),
    );
  }
  if (a.selfRating)
    details.push(
      h('li', null, `Autoavaliação: ${a.selfRating.rating}/5 (peso menor; não é medição)`),
    );
  if (a.inconsistent)
    details.push(
      h(
        'li',
        null,
        'Resultados muito diferentes entre sessões: repita a medição antes de concluir.',
      ),
    );
  if (a.trend !== 'indefinido') details.push(h('li', null, `Tendência: ${TREND_LABEL[a.trend]}`));
  if (!details.length)
    details.push(
      h('li', null, 'Pendente: ainda não há nenhum resultado. Nenhuma nota é inventada.'),
    );
  const actions: HTMLElement[] = [];
  if (test)
    actions.push(
      linkButton(`#/tecnico/${test.id}`, 'Fazer teste', { small: true, variant: 'primary' }),
    );
  if (info.simulador && info.grupo === 'leitura')
    actions.push(
      linkButton(`#/simuladores/${info.simulador}`, 'Medir no simulador', {
        small: true,
        variant: 'primary',
      }),
    );
  if (info.grupo === 'tecnica')
    actions.push(linkButton(`#/tecnico?fundamento=${a.skill}`, 'Exercícios', { small: true }));
  if (a.skill === 'concentracao')
    actions.push(
      linkButton('#/leitura', 'Cenários de leitura', { small: true, variant: 'primary' }),
    );
  return h(
    'li',
    null,
    h('div', { class: 'row spread' }, h('strong', null, info.nome), statusPill(a)),
    h('ul', { class: 'small', style: { margin: '6px 0' } }, details),
    h('div', { class: 'row' }, actions),
  );
}

export async function avaliacaoScreen(ctx: AppContext): Promise<Screen> {
  const snap = await ctx.snapshot();
  const measured = SKILL_ORDER.filter((s) => SKILLS[s].medidoPorAcerto);
  const physical = SKILL_ORDER.filter((s) => !SKILLS[s].medidoPorAcerto);

  const ratingInputs = new Map<SkillId, () => number | null>();
  const selfForm = h(
    'div',
    { class: 'stack' },
    measured.map((skill) => {
      const name = `auto-${skill}`;
      const current = snap.engine.assessments[skill].selfRating?.rating;
      const radios = [1, 2, 3, 4, 5].map((n) =>
        h('input', {
          type: 'radio',
          name,
          value: String(n),
          checked: current === n,
          'aria-label': `${n} de 5`,
        }),
      );
      ratingInputs.set(skill, () => {
        const checked = radios.find((r) => r.checked);
        return checked ? Number(checked.value) : null;
      });
      return h(
        'fieldset',
        null,
        h('legend', null, SKILLS[skill].nome),
        h(
          'div',
          { class: 'rating' },
          radios.map((r, i) => h('label', null, r, String(i + 1))),
        ),
      );
    }),
  );
  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'small' });

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Avaliação de habilidades',
      'Medir antes de concluir: cada fundamento mostra de onde vêm os dados e quanto confiar neles.',
      { href: '#/treinar', label: 'Treinar' },
    ),
    card(
      { title: 'Como ler' },
      h(
        'div',
        { class: 'row' },
        pill('Pendente', 'warn'),
        h('span', { class: 'small' }, 'sem nenhum dado'),
      ),
      h(
        'div',
        { class: 'row' },
        pill('Dados insuficientes', 'info'),
        h('span', { class: 'small' }, 'menos de 8 tentativas efetivas'),
      ),
      h(
        'div',
        { class: 'row' },
        pill('Atenção', 'danger'),
        pill('Em desenvolvimento', 'info'),
        pill('Bom', 'accent'),
        h('span', { class: 'small' }, 'estimativa ponderada'),
      ),
      h(
        'p',
        { class: 'small muted' },
        'Pesos: execução real (contagem, câmera, vídeo) > simuladores e cenários > autoavaliação. Resultados recentes pesam mais (meia-vida de 14 dias).',
      ),
    ),
    card(
      { title: 'Fundamentos' },
      h(
        'ul',
        { class: 'list' },
        measured.map((s) => skillRow(snap.engine.assessments[s])),
      ),
    ),
    card(
      { title: 'Preparação física' },
      h(
        'p',
        { class: 'small muted' },
        'Agilidade e força funcional são acompanhadas por treinos concluídos, esforço e desconforto — não por nota.',
      ),
      h(
        'ul',
        { class: 'list' },
        physical.map((s) => {
          const a = snap.engine.assessments[s];
          return h(
            'li',
            { class: 'row spread' },
            h('span', null, SKILLS[s].nome),
            pill(
              a.trainedSessions
                ? `${a.trainedSessions} treino(s)${a.lastTrained ? ` · último ${formatDayMonth(a.lastTrained)}` : ''}`
                : 'Nenhum treino ainda',
            ),
          );
        }),
      ),
      linkButton('#/fisico', 'Treinos físicos', { small: true }),
    ),
    card(
      { title: 'Autoavaliação (opcional)' },
      h(
        'p',
        { class: 'small muted' },
        'Dê uma nota de 1 (preciso melhorar muito) a 5 (muito bom). Ela conta pouco e nunca substitui um teste — serve para quando você ainda não mediu.',
      ),
      selfForm,
      button(
        'Salvar autoavaliação',
        async () => {
          const ratings: Partial<Record<SkillId, number>> = {};
          for (const [skill, get] of ratingInputs) {
            const value = get();
            if (value !== null) ratings[skill] = value;
          }
          if (!Object.keys(ratings).length) {
            status.textContent = 'Marque pelo menos uma nota.';
            return;
          }
          const logged = logSelfAssessment(ctx.now(), ratings);
          await ctx.repo.saveSession(logged.session, logged.results);
          ctx.toast('Autoavaliação salva.', 'sucesso');
          ctx.refresh();
        },
        { variant: 'primary' },
      ),
      status,
    ),
    card(
      { title: 'Avaliação por vídeo' },
      h('p', null, 'Grave um exercício e faça a avaliação guiada com critérios observáveis.'),
      linkButton('#/video', 'Abrir vídeos'),
    ),
  );
  return { title: 'Avaliação', el };
}
