/** Preparação física: lista de treinos seguros e treino guiado por temporizador. */
import {
  DISCOMFORT_LABELS,
  RPE_SCALE,
  SAFETY_RULES,
  WORKOUTS,
  workoutById,
  workoutMinutes,
} from '../../content/physical.ts';
import { clock } from '../../core/format.ts';
import { logPhysical } from '../../core/sessionLog.ts';
import type { DiscomfortLevel } from '../../core/types.ts';
import type { AppContext } from '../app.ts';
import {
  button,
  card,
  field,
  linkButton,
  pageHeader,
  pill,
  progress,
  select,
} from '../components.ts';
import { h, replaceChildren } from '../dom.ts';
import type { Screen } from '../router.ts';

function safetyCard(): HTMLElement {
  return card(
    { title: 'Segurança em primeiro lugar', tone: 'warn', headingLevel: 2 },
    h(
      'ul',
      null,
      SAFETY_RULES.map((r) => h('li', null, r)),
    ),
  );
}

export async function fisicoListScreen(ctx: AppContext): Promise<Screen> {
  const snap = await ctx.snapshot();
  const wellbeing = snap.engine.wellbeing;
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Preparação física',
      'Treinos curtos, com progressão conservadora. Antes da competição, o foco é coordenação, agilidade e recuperação — não ganhar força em poucos dias.',
      { href: '#/treinar', label: 'Treinar' },
    ),
    wellbeing.level !== 'ok'
      ? card(
          {
            title: wellbeing.level === 'descanso' ? 'Hoje: descanso' : 'Hoje: apenas treinos leves',
            tone: 'danger',
          },
          h(
            'ul',
            null,
            wellbeing.reasons.map((r) => h('li', null, r)),
          ),
        )
      : null,
    safetyCard(),
    h(
      'ul',
      { class: 'list', style: { gap: '10px' } },
      WORKOUTS.map((w) =>
        h(
          'li',
          { style: { padding: '0', background: 'transparent' } },
          h(
            'a',
            { href: `#/fisico/${w.id}`, class: 'card-link' },
            h(
              'div',
              { class: 'card flat stack', style: { gap: '6px' } },
              h('h2', { style: { fontSize: '1.05rem', margin: '0' } }, w.nome),
              h(
                'div',
                { class: 'row' },
                pill(`Intensidade ${w.intensidade}`, w.intensidade === 'leve' ? 'info' : 'accent'),
                pill(`≈ ${workoutMinutes(w)} min`),
                wellbeing.level !== 'ok' && w.intensidade === 'moderada'
                  ? pill('Evite hoje', 'danger')
                  : null,
              ),
              h('p', { class: 'small muted', style: { margin: '0' } }, w.objetivo),
            ),
          ),
        ),
      ),
    ),
  );
  return { title: 'Preparação física', el };
}

type Phase = 'detalhe' | 'checagem' | 'bloco' | 'descanso' | 'pausado' | 'relato' | 'salvo';

export async function workoutScreen(ctx: AppContext, id: string): Promise<Screen> {
  const w = workoutById(id);
  if (!w) throw new Error('Treino não encontrado.');
  const snap = await ctx.snapshot();
  let phase: Phase = 'detalhe';
  let pausedFrom: 'bloco' | 'descanso' = 'bloco';
  let index = 0;
  let remaining = 0;
  let timer: number | null = null;
  let startedAt: Date | null = null;
  let activeMs = 0;
  let lastTick = 0;
  /** Blocos feitos até o fim do tempo; os pulados não contam como feitos. */
  const completedBlocks = new Set<number>();
  let blocksSkipped = 0;
  let stoppedForPain = false;
  const body = h('div', { class: 'stack' });

  const stopTimer = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };

  const startTimer = () => {
    stopTimer();
    lastTick = performance.now();
    timer = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastTick;
      lastTick = now;
      if (phase === 'bloco') activeMs += delta;
      remaining -= delta / 1000;
      const el = document.getElementById('workout-remaining');
      if (el) el.textContent = clock(Math.max(0, Math.ceil(remaining)));
      if (remaining <= 0) advance();
    }, 250);
  };

  const enterBlock = (i: number) => {
    index = i;
    const block = w.blocos[i];
    if (!block) {
      finish();
      return;
    }
    phase = 'bloco';
    remaining = block.duracaoSeg;
    ctx.feedback.stimulus();
    render();
    startTimer();
  };

  const advance = (skipped = false) => {
    const block = w.blocos[index];
    if (!block) return;
    if (phase === 'bloco') {
      if (skipped) blocksSkipped++;
      else completedBlocks.add(index);
      if (block.descansoSeg > 0 && index < w.blocos.length - 1) {
        phase = 'descanso';
        remaining = block.descansoSeg;
        ctx.feedback.tick();
        render();
        startTimer();
      } else {
        enterBlock(index + 1);
      }
    } else if (phase === 'descanso') {
      enterBlock(index + 1);
    }
  };

  const finish = () => {
    stopTimer();
    phase = 'relato';
    render();
  };

  const reportForm = () => {
    const rpe = select(
      RPE_SCALE.map((r) => ({ value: String(r.value), label: r.label })),
      stoppedForPain ? '5' : '4',
      'rpe-fisico',
    );
    const discomfort = h(
      'fieldset',
      null,
      h('legend', null, 'Desconforto ou dor'),
      h(
        'div',
        { class: 'choice-grid' },
        DISCOMFORT_LABELS.map((label, i) =>
          h(
            'label',
            { class: 'choice' },
            h('input', {
              type: 'radio',
              name: 'desconforto-fisico',
              value: String(i),
              checked: i === (stoppedForPain ? 2 : 0),
            }),
            h('span', null, label),
          ),
        ),
      ),
    );
    const area = h('input', {
      type: 'text',
      maxlength: 120,
      placeholder: 'Ex.: joelho direito, panturrilha',
    });
    const notes = h('textarea', { maxlength: 2000, placeholder: 'Opcional' });
    const status = h('p', { role: 'status', class: 'small' });
    const save = async () => {
      const discomfortValue = Number(
        (discomfort.querySelector('input:checked') as HTMLInputElement | null)?.value ?? 0,
      ) as DiscomfortLevel;
      const logged = logPhysical({
        workout: w,
        startedAt: startedAt ?? ctx.now(),
        endedAt: ctx.now(),
        activeSec: Math.round(activeMs / 1000),
        blocksDone: completedBlocks.size,
        blocksTotal: w.blocos.length,
        rpe: Number(rpe.value),
        discomfort: discomfortValue,
        discomfortArea: area.value.trim(),
        notes: notes.value.trim(),
      });
      try {
        await ctx.repo.saveSession(logged.session);
        phase = 'salvo';
        ctx.toast('Treino registrado.', 'sucesso');
        const advice: string[] = [];
        if (discomfortValue === 3)
          advice.push(
            'Desconforto forte: pare os treinos físicos, descanse e avise um adulto responsável. Se a dor continuar, procure um profissional de saúde.',
          );
        else if (discomfortValue === 2)
          advice.push(
            'Desconforto moderado: amanhã, só atividades leves (técnica sem impacto, leitura de jogo, respiração).',
          );
        if (Number(rpe.value) >= 8)
          advice.push(
            'Esforço muito alto: amanhã o plano ficará mais leve para você se recuperar.',
          );
        if (!advice.length)
          advice.push('Bom trabalho. Hidrate-se e descanse — a melhora acontece na recuperação.');
        replaceChildren(
          body,
          card(
            { title: 'Treino registrado ✓', tone: discomfortValue >= 2 ? 'warn' : 'accent' },
            h(
              'ul',
              null,
              advice.map((a) => h('li', null, a)),
            ),
            h(
              'div',
              { class: 'row' },
              linkButton(`#/historico/${logged.session.id}`, 'Ver no histórico'),
              linkButton('#/', 'Início', { variant: 'primary' }),
            ),
          ),
        );
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    };
    return card(
      { title: stoppedForPain ? 'Treino interrompido' : 'Como foi o treino?' },
      stoppedForPain
        ? h(
            'p',
            null,
            'Você parou por desconforto. Isso é o certo a fazer. Registre o que sentiu para o plano se ajustar.',
          )
        : null,
      h(
        'p',
        { class: 'small muted' },
        `Blocos concluídos: ${completedBlocks.size} de ${w.blocos.length}${blocksSkipped ? ` (${blocksSkipped} pulado${blocksSkipped > 1 ? 's' : ''})` : ''}. Tempo ativo: ${clock(activeMs / 1000)}.`,
      ),
      field('Esforço percebido (0 a 10)', rpe, 'Quão puxado foi? 0 = repouso; 10 = máximo.'),
      discomfort,
      field('Onde? (se houve desconforto)', area),
      field('Observações', notes),
      h(
        'div',
        { class: 'row' },
        button('Salvar registro', () => void save(), { variant: 'primary' }),
        button(
          'Descartar',
          () => {
            phase = 'salvo';
            ctx.navigate('/fisico');
          },
          { variant: 'ghost' },
        ),
      ),
      status,
    );
  };

  const render = () => {
    if (phase === 'relato') {
      replaceChildren(body, reportForm());
      return;
    }
    if (phase === 'detalhe') {
      replaceChildren(
        body,
        card(
          null,
          h('p', null, w.objetivo),
          h(
            'div',
            { class: 'row' },
            pill(`Intensidade ${w.intensidade}`),
            pill(`≈ ${workoutMinutes(w)} min`),
          ),
          h(
            'p',
            { class: 'small' },
            h('strong', null, 'Espaço: '),
            w.espaco,
            ' ',
            h('strong', null, 'Alternativa: '),
            w.alternativasEspaco,
          ),
          h('p', { class: 'small' }, h('strong', null, 'Recuperação: '), w.recuperacao),
          w.avisos?.length
            ? h(
                'ul',
                { class: 'small' },
                w.avisos.map((a) => h('li', null, a)),
              )
            : null,
        ),
        card(
          { title: 'Blocos', headingLevel: 2 },
          h(
            'ol',
            { class: 'steps' },
            w.blocos.map((b) =>
              h(
                'li',
                null,
                h('strong', null, b.nome),
                ` — ${b.instrucoes} (${b.duracaoSeg} s${b.descansoSeg ? `, descanso ${b.descansoSeg} s` : ''})`,
              ),
            ),
          ),
        ),
        snap.engine.wellbeing.level !== 'ok' && w.intensidade === 'moderada'
          ? card(
              { tone: 'danger' },
              h(
                'p',
                null,
                'Seus registros indicam que hoje é melhor fazer apenas atividades leves. Considere a mobilidade ou o equilíbrio.',
              ),
            )
          : null,
        button(
          'Começar treino guiado',
          () => {
            phase = 'checagem';
            render();
          },
          { variant: 'primary', block: true, big: true },
        ),
      );
      return;
    }
    if (phase === 'checagem') {
      const items = [
        'Estou sem dor e me sentindo bem',
        'Bebi água',
        'O espaço está livre de obstáculos e o piso não escorrega',
      ];
      const checks = items.map(() => h('input', { type: 'checkbox' }));
      const startBtn = button(
        'Tudo certo, começar',
        () => {
          if (!checks.every((c) => c.checked)) {
            ctx.toast(
              'Confirme os três itens antes de começar. Se algo não estiver bem, prefira descansar hoje.',
              'erro',
            );
            return;
          }
          startedAt = ctx.now();
          enterBlock(0);
        },
        { variant: 'primary', block: true },
      );
      replaceChildren(
        body,
        card(
          { title: 'Antes de começar' },
          items.map((t, i) =>
            h(
              'label',
              { class: 'choice', style: { marginBottom: '8px' } },
              checks[i],
              h('span', null, t),
            ),
          ),
          startBtn,
          h(
            'p',
            { class: 'small muted' },
            'Se sentir dor, tontura ou falta de ar fora do normal durante o treino, use o botão "Parar: não estou bem".',
          ),
        ),
      );
      return;
    }
    const block = w.blocos[index];
    if (!block) return;
    const isRest = phase === 'descanso' || (phase === 'pausado' && pausedFrom === 'descanso');
    const next = w.blocos[index + 1];
    replaceChildren(
      body,
      card(
        { tone: isRest ? 'accent' : undefined },
        h(
          'div',
          { class: 'row spread' },
          pill(`Bloco ${index + 1} de ${w.blocos.length}`),
          phase === 'pausado' ? pill('Pausado', 'warn') : null,
        ),
        h('h2', null, isRest ? `Descanso — a seguir: ${next?.nome ?? 'fim'}` : block.nome),
        h(
          'p',
          { class: 'big-number', id: 'workout-remaining', 'aria-live': 'off' },
          clock(Math.max(0, Math.ceil(remaining))),
        ),
        isRest
          ? h('p', null, 'Respire, caminhe devagar e beba água se precisar.')
          : h('p', { class: 'lead' }, block.instrucoes),
        progress((index + (isRest ? 1 : 0)) / w.blocos.length, 'Progresso do treino'),
      ),
      h(
        'div',
        { class: 'row' },
        button(phase === 'pausado' ? 'Continuar' : 'Pausar', () => {
          if (phase === 'pausado') {
            phase = pausedFrom;
            render();
            startTimer();
          } else {
            pausedFrom = phase === 'descanso' ? 'descanso' : 'bloco';
            phase = 'pausado';
            stopTimer();
            render();
          }
        }),
        button(
          'Pular',
          () => {
            if (phase === 'pausado') phase = pausedFrom;
            advance(true);
          },
          { variant: 'ghost' },
        ),
        button('Encerrar', finish, { variant: 'ghost' }),
      ),
      button(
        'Parar: não estou bem',
        () => {
          stoppedForPain = true;
          finish();
        },
        { variant: 'danger', block: true },
      ),
    );
  };

  render();
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(w.nome, null, { href: '#/fisico', label: 'Preparação física' }),
    body,
  );
  return {
    title: w.nome,
    el,
    canLeave: async () => {
      if (!['bloco', 'descanso', 'pausado', 'relato'].includes(phase)) return true;
      return ctx.confirm({
        title: 'Sair do treino?',
        message: 'O treino não foi registrado. Deseja sair mesmo assim?',
        confirmLabel: 'Sair',
        cancelLabel: 'Continuar',
        danger: true,
      });
    },
    destroy: stopTimer,
  };
}
