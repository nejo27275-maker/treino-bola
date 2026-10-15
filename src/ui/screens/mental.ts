/** Preparação mental: respiração guiada, rotina pré-jogo, 3R, visualização e diário. */
import { DEFAULT_ROUTINE, MENTAL_ACTIVITIES, mentalById } from '../../content/mental.ts';
import type { MentalActivity } from '../../content/types.ts';
import { clock } from '../../core/format.ts';
import { logMental } from '../../core/sessionLog.ts';
import type { AppContext } from '../app.ts';
import { button, card, field, linkButton, pageHeader, pill } from '../components.ts';
import { h, prefersReducedMotion, replaceChildren } from '../dom.ts';
import type { Screen } from '../router.ts';

export function mentalListScreen(_ctx: AppContext): Screen {
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Preparação mental',
      'Técnicas práticas de atenção, calma e confiança. Nada de "superpoderes": treino de hábitos.',
      { href: '#/treinar', label: 'Treinar' },
    ),
    h(
      'ul',
      { class: 'list', style: { gap: '10px' } },
      MENTAL_ACTIVITIES.map((m) =>
        h(
          'li',
          { style: { padding: '0', background: 'transparent' } },
          h(
            'a',
            { href: `#/mental/${m.id}`, class: 'card-link' },
            h(
              'div',
              { class: 'card flat' },
              h('h2', { style: { fontSize: '1.05rem' } }, m.nome),
              h('p', { class: 'small muted', style: { margin: '0' } }, m.objetivo),
              h('div', { class: 'row', style: { marginTop: '6px' } }, pill(`${m.duracaoMin} min`)),
            ),
          ),
        ),
      ),
    ),
    card(
      { title: 'Leitura de jogo' },
      h('p', null, 'Situações de jogo para treinar observação e decisão.'),
      linkButton('#/leitura', 'Abrir cenários', { variant: 'primary' }),
    ),
  );
  return { title: 'Preparação mental', el };
}

function breathingRunner(
  ctx: AppContext,
  onDone: () => void,
): { el: HTMLElement; stop: () => void } {
  const circle = h('div', { class: 'breath', 'aria-hidden': 'true' }, 'Pronto');
  const label = h(
    'p',
    { class: 'lead', 'aria-live': 'polite', style: { textAlign: 'center' } },
    'Toque em começar e acompanhe o círculo.',
  );
  const counter = h('p', { class: 'muted', style: { textAlign: 'center' } });
  const cycles = 8;
  let timer: number | null = null;
  let cycle = 0;
  let running = false;
  const stop = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    running = false;
  };
  const phase = (inhale: boolean) => {
    const seconds = inhale ? 4 : 6;
    label.textContent = inhale ? 'Inspire pelo nariz… (4 s)' : 'Solte o ar devagar… (6 s)';
    circle.textContent = inhale ? 'Inspire' : 'Solte';
    circle.style.transitionDuration = prefersReducedMotion() ? '0s' : `${seconds}s`;
    circle.style.transform = inhale ? 'scale(1)' : 'scale(0.6)';
    timer = window.setTimeout(() => {
      if (!running) return;
      if (inhale) phase(false);
      else {
        cycle++;
        counter.textContent = `Ciclo ${cycle} de ${cycles}`;
        if (cycle >= cycles) {
          stop();
          label.textContent = 'Pronto. Perceba como o corpo está mais calmo.';
          circle.textContent = '✓';
          onDone();
        } else phase(true);
      }
    }, seconds * 1000);
  };
  const startBtn = button(
    'Começar',
    () => {
      if (running) return;
      running = true;
      cycle = 0;
      counter.textContent = `Ciclo 1 de ${cycles}`;
      ctx.feedback.unlock();
      phase(true);
    },
    { variant: 'primary' },
  );
  const stopBtn = button(
    'Parar',
    () => {
      stop();
      label.textContent = 'Pausado.';
    },
    { variant: 'ghost' },
  );
  return {
    el: h(
      'div',
      { class: 'stack' },
      circle,
      label,
      counter,
      h('div', { class: 'row', style: { justifyContent: 'center' } }, startBtn, stopBtn),
    ),
    stop,
  };
}

async function routineEditor(ctx: AppContext): Promise<HTMLElement> {
  const items = (await ctx.repo.getRoutine()) ?? DEFAULT_ROUTINE;
  const list = h('ol', { class: 'stack', style: { paddingLeft: '20px' } });
  let current = [...items];
  const status = h('p', { role: 'status', class: 'small' });
  const draw = () => {
    replaceChildren(
      list,
      current.map((text, i) => {
        const input = h('input', {
          type: 'text',
          value: text,
          maxlength: 200,
          'aria-label': `Passo ${i + 1}`,
        });
        input.addEventListener('input', () => {
          current[i] = input.value;
        });
        return h(
          'li',
          null,
          h(
            'div',
            { class: 'row', style: { flexWrap: 'nowrap' } },
            input,
            button(
              'Remover',
              () => {
                current.splice(i, 1);
                draw();
              },
              { small: true, variant: 'ghost', ariaLabel: `Remover passo ${i + 1}` },
            ),
          ),
        );
      }),
    );
  };
  draw();
  return h(
    'div',
    { class: 'stack' },
    list,
    h(
      'div',
      { class: 'row' },
      button(
        'Adicionar passo',
        () => {
          if (current.length >= 30) return;
          current.push('');
          draw();
          (list.querySelector('li:last-child input') as HTMLInputElement | null)?.focus();
        },
        { small: true },
      ),
      button(
        'Salvar rotina',
        async () => {
          current = current.map((t) => t.trim()).filter(Boolean);
          await ctx.repo.saveRoutine(current);
          draw();
          status.textContent = 'Rotina salva.';
          ctx.toast('Rotina salva.', 'sucesso');
        },
        { small: true, variant: 'primary' },
      ),
      button(
        'Restaurar sugestão',
        () => {
          current = [...DEFAULT_ROUTINE];
          draw();
        },
        { small: true, variant: 'ghost' },
      ),
    ),
    status,
  );
}

function stepsRunner(activity: MentalActivity): { el: HTMLElement; stop: () => void } {
  let timer: number | null = null;
  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const el = h(
    'ol',
    { class: 'stack', style: { paddingLeft: '20px' } },
    activity.passos.map((p) => {
      const countdown = h('span', { class: 'timer', style: { fontSize: '1.1rem' } });
      return h(
        'li',
        null,
        h('strong', null, p.titulo),
        h('p', { style: { margin: '2px 0' } }, p.texto),
        p.duracaoSeg
          ? h(
              'div',
              { class: 'row' },
              button(
                `Cronometrar ${p.duracaoSeg} s`,
                () => {
                  stop();
                  let left = p.duracaoSeg as number;
                  countdown.textContent = clock(left);
                  timer = window.setInterval(() => {
                    left--;
                    countdown.textContent = left > 0 ? clock(left) : '✓';
                    if (left <= 0) stop();
                  }, 1000);
                },
                { small: true },
              ),
              countdown,
            )
          : null,
      );
    }),
  );
  return { el, stop };
}

export async function mentalActivityScreen(ctx: AppContext, id: string): Promise<Screen> {
  const activity = mentalById(id);
  if (!activity) throw new Error('Atividade não encontrada.');
  const startedAt = ctx.now();
  let saved = false;
  const cleanups: (() => void)[] = [];
  const status = h('p', { role: 'status', class: 'small' });
  const notes = h('textarea', {
    maxlength: 2000,
    'aria-label': activity.kind === 'confianca' ? 'Diário de confiança' : 'Anotações',
    placeholder: activity.kind === 'confianca' ? '1. …\n2. …\n3. …\nAjuste: …' : 'Opcional',
  });

  let content: HTMLElement;
  if (activity.kind === 'respiracao') {
    const runner = breathingRunner(ctx, () => ctx.feedback.success());
    cleanups.push(runner.stop);
    content = card(
      null,
      runner.el,
      h(
        'ul',
        { class: 'small muted' },
        activity.passos.map((p) => h('li', null, `${p.titulo}: ${p.texto}`)),
      ),
    );
  } else if (activity.kind === 'rotina') {
    content = card(
      { title: 'Edite sua rotina' },
      h(
        'p',
        { class: 'small muted' },
        'Use a sugestão ou escreva seus próprios passos. A rotina fica salva no aparelho.',
      ),
      await routineEditor(ctx),
    );
  } else if (activity.kind === 'confianca') {
    content = card(
      { title: 'Diário de confiança' },
      h(
        'ol',
        { class: 'steps' },
        activity.passos.map((p) => h('li', null, h('strong', null, `${p.titulo}: `), p.texto)),
      ),
      field('Escreva aqui', notes),
    );
  } else {
    const runner = stepsRunner(activity);
    cleanups.push(runner.stop);
    content = card(null, runner.el);
  }

  const doneBtn = button(
    'Concluir e registrar',
    async () => {
      const logged = logMental({
        activity,
        startedAt,
        endedAt: ctx.now(),
        notes: notes.value.trim(),
      });
      try {
        await ctx.repo.saveSession(logged.session);
        saved = true;
        doneBtn.disabled = true;
        status.textContent = 'Atividade registrada no histórico.';
        ctx.toast('Atividade registrada.', 'sucesso');
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    },
    { variant: 'primary', block: true },
  );

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(activity.nome, activity.objetivo, { href: '#/mental', label: 'Preparação mental' }),
    content,
    activity.kind !== 'confianca'
      ? h('details', { class: 'card flat' }, h('summary', null, 'Anotações (opcional)'), notes)
      : null,
    doneBtn,
    status,
  );
  return {
    title: activity.nome,
    el,
    destroy: () => cleanups.forEach((c) => c()),
    canLeave: async () =>
      saved ||
      notes.value.trim() === '' ||
      ctx.confirm({
        title: 'Sair sem registrar?',
        message: 'Suas anotações não foram salvas.',
        confirmLabel: 'Sair',
        danger: true,
      }),
  };
}
