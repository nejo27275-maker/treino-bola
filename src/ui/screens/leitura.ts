/** Leitura de jogo: situações com explicação de cada resposta (não só certo/errado). */
import { SCENARIOS } from '../../content/mental.ts';
import type { ReadingScenario, ScenarioOption } from '../../content/types.ts';
import { percent } from '../../core/format.ts';
import { createRng, freshSeed } from '../../core/rng.ts';
import { logQuiz, type QuizAnswer } from '../../core/sessionLog.ts';
import { SKILLS } from '../../core/skills.ts';
import type { AppContext } from '../app.ts';
import { button, card, linkButton, pageHeader, pill, progress } from '../components.ts';
import { h, replaceChildren } from '../dom.ts';
import type { Screen } from '../router.ts';

export const QUIZ_LENGTH = 8;

export function quizRound(
  seed: number,
): { scenario: ReadingScenario; options: ScenarioOption[] }[] {
  const rng = createRng(seed);
  return rng
    .shuffle(SCENARIOS)
    .slice(0, QUIZ_LENGTH)
    .map((scenario) => ({ scenario, options: rng.shuffle(scenario.opcoes) }));
}

export function leituraScreen(ctx: AppContext, query: URLSearchParams): Screen {
  const seedParam = Number(query.get('semente'));
  const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam >>> 0 : freshSeed();
  const questions = quizRound(seed);
  const answers: QuizAnswer[] = [];
  let index = -1;
  let shownAt = 0;
  let saved = false;
  const startedAt = ctx.now();
  const body = h('div', { class: 'stack' });

  const showQuestion = () => {
    const q = questions[index];
    if (!q) {
      void finish();
      return;
    }
    shownAt = performance.now();
    const feedback = h('div', { class: 'stack', 'aria-live': 'polite' });
    const optionButtons = q.options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: 'btn block',
          style: { justifyContent: 'flex-start', textAlign: 'left', height: 'auto' },
          onclick: () => answer(o),
        },
        o.texto,
      ),
    );
    const answer = (chosen: ScenarioOption) => {
      const responseMs = performance.now() - shownAt;
      answers.push({
        scenarioId: q.scenario.id,
        skill: q.scenario.skill,
        correct: chosen.correta,
        responseMs,
      });
      if (chosen.correta) ctx.feedback.success();
      else ctx.feedback.error();
      optionButtons.forEach((b, i) => {
        b.disabled = true;
        const o = q.options[i] as ScenarioOption;
        if (o.correta) b.classList.add('success');
        else if (o === chosen) b.classList.add('fail');
      });
      replaceChildren(
        feedback,
        card(
          {
            title: chosen.correta ? 'Boa leitura!' : 'Não era a melhor opção',
            tone: chosen.correta ? 'accent' : 'danger',
            headingLevel: 3,
          },
          h(
            'ul',
            null,
            q.options.map((o) =>
              h(
                'li',
                null,
                h('strong', null, `${o.correta ? '✓' : '✗'} ${o.texto} `),
                h('span', { class: 'muted' }, o.explicacao),
              ),
            ),
          ),
        ),
        button(
          index + 1 < questions.length ? 'Próxima situação' : 'Ver resultado',
          () => {
            index++;
            showQuestion();
          },
          { variant: 'primary', block: true },
        ),
      );
      (feedback.querySelector('button') as HTMLButtonElement | null)?.focus();
    };
    replaceChildren(
      body,
      h(
        'div',
        { class: 'row spread' },
        pill(`Situação ${index + 1} de ${questions.length}`),
        pill(SKILLS[q.scenario.skill].curto, 'info'),
      ),
      progress(index / questions.length, 'Progresso'),
      card(
        { title: q.scenario.tema },
        h('p', { class: 'lead' }, q.scenario.situacao),
        h('p', null, h('strong', null, q.scenario.pergunta)),
      ),
      h('div', { class: 'stack', role: 'group', 'aria-label': 'Respostas' }, optionButtons),
      feedback,
    );
  };

  const finish = async () => {
    const correct = answers.filter((a) => a.correct).length;
    const bySkill = new Map<string, { ok: number; total: number }>();
    for (const a of answers) {
      const entry = bySkill.get(a.skill) ?? { ok: 0, total: 0 };
      entry.total++;
      if (a.correct) entry.ok++;
      bySkill.set(a.skill, entry);
    }
    const logged = logQuiz({ startedAt, endedAt: ctx.now(), answers, seed });
    const status = h('p', { role: 'status', class: 'small' });
    try {
      await ctx.repo.saveSession(logged.session, logged.results);
      saved = true;
      status.textContent = 'Resultado salvo no histórico.';
    } catch (error) {
      status.textContent = `Não foi possível salvar: ${error instanceof Error ? error.message : String(error)}`;
    }
    replaceChildren(
      body,
      card(
        {
          title: `Você acertou ${correct} de ${answers.length} (${percent(correct / Math.max(1, answers.length))})`,
          tone: 'accent',
        },
        h(
          'ul',
          null,
          [...bySkill.entries()].map(([skill, v]) =>
            h('li', null, `${SKILLS[skill as keyof typeof SKILLS].nome}: ${v.ok}/${v.total}`),
          ),
        ),
        h(
          'p',
          { class: 'small muted' },
          `Semente desta rodada: ${seed}. Origem: cenários de leitura (conhecimento de princípios), que contam menos que a execução real.`,
        ),
        status,
        h(
          'div',
          { class: 'row' },
          button('Nova rodada', () => ctx.navigate(`/leitura?semente=${freshSeed()}`), {
            variant: 'primary',
          }),
          linkButton('#/simuladores', 'Ir aos simuladores'),
          linkButton('#/', 'Início', { variant: 'ghost' }),
        ),
      ),
    );
  };

  replaceChildren(
    body,
    card(
      null,
      h(
        'p',
        null,
        `São ${QUIZ_LENGTH} situações de jogo sorteadas. Depois de responder, você vê o raciocínio de todas as opções — o objetivo é entender o porquê, não decorar.`,
      ),
      h('p', { class: 'small muted' }, 'As opções aparecem em ordem diferente a cada rodada.'),
      button(
        'Começar',
        () => {
          index = 0;
          showQuestion();
        },
        { variant: 'primary', block: true, big: true },
      ),
    ),
  );

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader('Leitura de jogo', 'Observar, antecipar e decidir.', {
      href: '#/treinar',
      label: 'Treinar',
    }),
    body,
  );
  return {
    title: 'Leitura de jogo',
    el,
    canLeave: async () => {
      if (saved || answers.length === 0) return true;
      return ctx.confirm({
        title: 'Sair da rodada?',
        message: 'As respostas desta rodada ainda não foram salvas.',
        confirmLabel: 'Sair',
        cancelLabel: 'Continuar',
        danger: true,
      });
    },
  };
}
