/** Treinamento técnico: biblioteca, detalhe do exercício e sessão guiada com contagem. */
import { MATERIAL_LABEL, SPACE_LABEL, hasMaterials, fitsSpace } from '../../content/catalog.ts';
import { EXERCISES, exerciseById } from '../../content/exercises.ts';
import { DISCOMFORT_LABELS, RPE_SCALE } from '../../content/physical.ts';
import type { Exercise } from '../../content/types.ts';
import { clock, percent } from '../../core/format.ts';
import { logExercise } from '../../core/sessionLog.ts';
import { SKILLS, isSkillId } from '../../core/skills.ts';
import type { DiscomfortLevel, SkillId } from '../../core/types.ts';
import type { AppContext } from '../app.ts';
import {
  button,
  card,
  emptyState,
  field,
  linkButton,
  pageHeader,
  pill,
  progress,
  select,
} from '../components.ts';
import { h, replaceChildren } from '../dom.ts';
import type { Screen } from '../router.ts';
import { SignalGenerator, Stopwatch } from '../timers.ts';
import { dayLabel } from './shared.ts';

const LEVEL_LABEL = ['', 'Iniciante', 'Intermediário', 'Avançado'];

function exerciseCard(e: Exercise, recommended: boolean, canDo: boolean): HTMLElement {
  return h(
    'li',
    { style: { padding: '0', background: 'transparent' } },
    h(
      'a',
      { href: `#/tecnico/${e.id}`, class: 'card-link' },
      h(
        'div',
        { class: 'card flat stack', style: { gap: '6px' } },
        h(
          'div',
          { class: 'row spread' },
          h('h2', { style: { fontSize: '1.05rem', margin: '0' } }, e.nome),
          e.teste ? pill('Teste', 'warn') : null,
        ),
        h(
          'div',
          { class: 'row' },
          e.skills.map((s, i) => pill(SKILLS[s].curto, i === 0 ? 'accent' : undefined)),
          pill(LEVEL_LABEL[e.nivel] ?? ''),
          pill(`${e.duracaoMin} min`),
          recommended ? pill('Recomendado', 'info') : null,
        ),
        h('p', { class: 'small muted', style: { margin: '0' } }, e.objetivo),
        canDo
          ? null
          : h(
              'p',
              { class: 'small', style: { margin: '0', color: 'var(--warn)' } },
              'Precisa de material que você não marcou — veja a alternativa no exercício.',
            ),
      ),
    ),
  );
}

export async function tecnicoScreen(ctx: AppContext, query: URLSearchParams): Promise<Screen> {
  const snap = await ctx.snapshot();
  const profile = snap.profile;
  const materials = profile?.materiais?.length ? profile.materiais : null;
  const recommendedSkills = new Set(
    snap.engine.recommendations.map((r) => r.skill).filter((s): s is SkillId => s !== null),
  );
  const initialSkill = query.get('fundamento');
  const skillOptions = [
    { value: 'todos', label: 'Todos os fundamentos' },
    ...[...new Set(EXERCISES.flatMap((e) => e.skills))].map((s) => ({
      value: s,
      label: SKILLS[s].nome,
    })),
  ];
  const skillSelect = select(
    skillOptions,
    initialSkill && isSkillId(initialSkill) ? initialSkill : 'todos',
    'filtro-fundamento',
  );
  const onlyMine = h('input', {
    type: 'checkbox',
    checked: Boolean(materials),
    id: 'filtro-materiais',
  });
  const showTests = h('input', {
    type: 'checkbox',
    checked: query.get('testes') === '1',
    id: 'filtro-testes',
  });
  const list = h('ul', { class: 'list', style: { gap: '10px' }, 'aria-live': 'polite' });

  const render = () => {
    const skill = skillSelect.value;
    const filtered = EXERCISES.filter((e) => {
      if (!showTests.checked && e.teste) return false;
      if (skill !== 'todos' && !e.skills.includes(skill as SkillId)) return false;
      if (onlyMine.checked && materials && !hasMaterials(e, materials) && !e.semMaterial)
        return false;
      if (onlyMine.checked && profile && !fitsSpace(e, profile.espaco)) return false;
      return true;
    });
    replaceChildren(
      list,
      filtered.length
        ? filtered.map((e) =>
            exerciseCard(
              e,
              e.skills.some((s) => recommendedSkills.has(s)),
              !materials || hasMaterials(e, materials),
            ),
          )
        : h(
            'li',
            null,
            emptyState(
              'Nenhum exercício com esses filtros',
              'Tente outro fundamento ou desmarque o filtro de materiais.',
            ),
          ),
    );
  };
  for (const control of [skillSelect, onlyMine, showTests])
    control.addEventListener('change', render);
  render();

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Treinamento técnico',
      'Cada exercício tem objetivo, organização, instruções, critério de sucesso, erros comuns e variações.',
      { href: '#/treinar', label: 'Treinar' },
    ),
    card(
      null,
      field('Fundamento', skillSelect),
      h(
        'label',
        { class: 'choice' },
        onlyMine,
        h(
          'span',
          null,
          profile
            ? 'Só o que posso fazer com meus materiais e espaço'
            : 'Filtrar por materiais (configure no perfil)',
        ),
      ),
      h(
        'label',
        { class: 'choice', style: { marginTop: '8px' } },
        showTests,
        h('span', null, 'Mostrar testes de linha de base'),
      ),
    ),
    list,
  );
  return { title: 'Treinamento técnico', el };
}

function section(title: string, ...children: (Node | string | null)[]): HTMLElement {
  return h('section', { class: 'stack', style: { gap: '4px' } }, h('h2', null, title), ...children);
}

export async function exerciseDetailScreen(ctx: AppContext, id: string): Promise<Screen> {
  const e = exerciseById(id);
  if (!e) throw new Error('Exercício não encontrado.');
  const sessions = (await ctx.repo.listSessions()).filter((s) => s.activityId === e.id).slice(0, 3);
  const today = ctx.today();
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(e.nome, null, { href: '#/tecnico', label: 'Biblioteca' }),
    h(
      'div',
      { class: 'row' },
      e.skills.map((s, i) => pill(SKILLS[s].nome, i === 0 ? 'accent' : undefined)),
      pill(LEVEL_LABEL[e.nivel] ?? ''),
      pill(`${e.duracaoMin} min`),
      e.teste ? pill('Teste de linha de base', 'warn') : null,
    ),
    card(
      { class: 'stack' },
      section('1. Objetivo', h('p', null, e.objetivo)),
      section(
        '2. Materiais',
        h(
          'ul',
          null,
          e.materiais.map((m) => h('li', null, MATERIAL_LABEL[m])),
        ),
        e.semMaterial
          ? h('p', { class: 'small' }, h('strong', null, 'Sem o material? '), e.semMaterial)
          : null,
        h('p', { class: 'small muted' }, `Espaço mínimo: ${SPACE_LABEL[e.espacoMin]}`),
      ),
      section('3. Organização do espaço', h('p', null, e.organizacao)),
      section(
        '4. Instruções',
        h(
          'ol',
          { class: 'steps' },
          e.instrucoes.map((i) => h('li', null, i)),
        ),
      ),
      section(
        '5. Duração e repetições',
        h('p', null, `${e.volume} (cerca de ${e.duracaoMin} minutos).`),
      ),
      section(
        '6. Pausas',
        h(
          'p',
          null,
          e.pausaSeg > 0
            ? `${e.pausaSeg} segundos de descanso entre as séries. Beba água.`
            : 'Sem pausa programada: é um teste curto.',
        ),
      ),
      section('7. Critério de sucesso', h('p', null, e.criterioSucesso)),
      section(
        '8 e 9. Erros comuns e como corrigir',
        h(
          'ul',
          null,
          e.errosComuns.map((c) => h('li', null, h('strong', null, `${c.texto}: `), c.correcao)),
        ),
      ),
      section(
        '10. Variações',
        h('p', null, h('strong', null, 'Mais fácil: '), e.maisFacil),
        h('p', null, h('strong', null, 'Mais difícil: '), e.maisDificil),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      linkButton(
        `#/tecnico/${e.id}/sessao`,
        e.teste ? 'Iniciar teste (10 tentativas)' : 'Iniciar sessão',
        { variant: 'primary', block: true },
      ),
    ),
    sessions.length
      ? card(
          { title: 'Suas últimas sessões deste exercício' },
          h(
            'ul',
            { class: 'list' },
            sessions.map((s) =>
              h(
                'li',
                null,
                h('a', { href: `#/historico/${s.id}` }, dayLabel(s.date, today)),
                ' · ',
                s.summary && s.summary.attempts > 0
                  ? `${s.summary.successes}/${s.summary.attempts} (${percent(s.summary.successes / s.summary.attempts)})`
                  : 'sem contagem',
              ),
            ),
          ),
        )
      : null,
  );
  return { title: e.nome, el };
}

type Phase = 'pronto' | 'ativo' | 'pausado' | 'descanso' | 'resumo' | 'salvo';

export async function exerciseSessionScreen(ctx: AppContext, id: string): Promise<Screen> {
  const e = exerciseById(id);
  if (!e) throw new Error('Exercício não encontrado.');
  const stopwatch = new Stopwatch();
  const startedAt = ctx.now();
  let phase: Phase = 'pronto';
  let attempts = 0;
  let successes = 0;
  const errorTags: Record<string, number> = {};
  const marks: { kind: 'acerto' | 'erro'; tag: string | null }[] = [];
  let restLeft = 0;
  let restTimer: number | null = null;
  let tickTimer: number | null = null;
  let signals: SignalGenerator | null = null;
  let undoBtn: HTMLButtonElement | null = null;

  const timerEl = h('span', { class: 'timer', 'aria-label': 'Tempo ativo' }, '0:00');
  const seriesEl = h('span', { class: 'pill' });
  const countEl = h('p', { class: 'big-number', 'aria-live': 'polite' });
  const rateEl = h('p', { class: 'muted small' });
  const progressWrap = h('div');
  const statusEl = h('p', { role: 'status', 'aria-live': 'polite', class: 'small' });
  const errorChips = h('div', {
    class: 'chip-row',
    'aria-label': 'O que aconteceu no erro? (opcional)',
  });
  const body = h('div', { class: 'stack' });
  const signalDisplay = h(
    'div',
    { class: 'signal-display', 'aria-live': 'assertive', role: 'status' },
    '—',
  );
  let signalHideTimer: number | null = null;

  const totalPlanned = e.series * e.repeticoes;

  const stopTimers = () => {
    if (restTimer !== null) window.clearInterval(restTimer);
    restTimer = null;
    signals?.stop();
    if (signalHideTimer !== null) window.clearTimeout(signalHideTimer);
  };

  /** Série atual e repetições derivadas do total de tentativas (desfazer fica sempre consistente). */
  const seriesInfo = () => {
    const completed = Math.floor(attempts / e.repeticoes);
    const reps = attempts % e.repeticoes;
    const current = phase === 'descanso' ? completed : Math.min(e.series, completed + 1);
    return { completed, reps, current };
  };

  const updateCounters = () => {
    if (undoBtn) undoBtn.disabled = marks.length === 0;
    const info = seriesInfo();
    seriesEl.textContent = `Série ${info.current} de ${e.series}`;
    countEl.textContent = `${successes} / ${attempts}`;
    rateEl.textContent =
      attempts > 0
        ? `Acertos: ${percent(successes / attempts)} · repetição ${info.reps} de ${e.repeticoes} nesta série`
        : `Meta: ${e.repeticoes} repetições por série`;
    replaceChildren(progressWrap, progress(attempts / totalPlanned, 'Progresso do exercício'));
  };

  const tick = () => {
    timerEl.textContent = clock(stopwatch.elapsedMs() / 1000);
  };

  const startRest = () => {
    phase = 'descanso';
    stopwatch.pause();
    restLeft = e.pausaSeg;
    render();
    restTimer = window.setInterval(() => {
      restLeft--;
      const restEl = document.getElementById('rest-left');
      if (restEl) restEl.textContent = clock(restLeft);
      if (restLeft <= 0) endRest();
    }, 1000);
  };

  const endRest = () => {
    if (restTimer !== null) window.clearInterval(restTimer);
    restTimer = null;
    phase = 'ativo';
    stopwatch.start();
    ctx.feedback.stimulus();
    render();
  };

  const register = (kind: 'acerto' | 'erro') => {
    if (phase !== 'ativo') return;
    marks.push({ kind, tag: null });
    attempts++;
    if (kind === 'acerto') {
      successes++;
      ctx.feedback.tick();
    } else {
      ctx.feedback.error();
    }
    statusEl.textContent =
      kind === 'acerto'
        ? 'Acerto registrado.'
        : 'Erro registrado. Se quiser, marque o que aconteceu.';
    renderErrorChips(kind === 'erro');
    if (attempts % e.repeticoes === 0) {
      if (attempts >= totalPlanned) {
        finish();
        return;
      }
      if (e.pausaSeg > 0) {
        startRest();
        return;
      }
    }
    updateCounters();
  };

  const undo = () => {
    const last = marks.pop();
    if (!last) return;
    attempts--;
    if (last.kind === 'acerto') successes--;
    if (last.tag) errorTags[last.tag] = Math.max(0, (errorTags[last.tag] ?? 0) - 1);
    statusEl.textContent = 'Última marcação desfeita.';
    renderErrorChips(false);
    render();
  };

  const renderErrorChips = (show: boolean) => {
    replaceChildren(
      errorChips,
      show
        ? [
            h(
              'span',
              { class: 'small muted', style: { width: '100%' } },
              'O que aconteceu? (opcional)',
            ),
            ...e.errosComuns.map((c) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'chip',
                  'aria-pressed': 'false',
                  onclick: (ev: Event) => {
                    const last = marks[marks.length - 1];
                    if (!last || last.kind !== 'erro' || last.tag) return;
                    last.tag = c.tag;
                    errorTags[c.tag] = (errorTags[c.tag] ?? 0) + 1;
                    (ev.currentTarget as HTMLElement).setAttribute('aria-pressed', 'true');
                    statusEl.textContent = `Anotado: ${c.texto}. Dica: ${c.correcao}`;
                  },
                },
                c.texto,
              ),
            ),
          ]
        : [],
    );
  };

  const finish = () => {
    stopwatch.pause();
    stopTimers();
    phase = 'resumo';
    render();
  };

  const showSignal = (text: string, label: string) => {
    signalDisplay.textContent = text;
    signalDisplay.setAttribute('aria-label', label);
    signalDisplay.classList.add('on');
    ctx.feedback.stimulus();
    if (signalHideTimer !== null) window.clearTimeout(signalHideTimer);
    signalHideTimer = window.setTimeout(() => signalDisplay.classList.remove('on'), 1500);
  };

  const signalsCard = () => {
    if (!e.sinais) return null;
    const toggle = button(
      signals?.running ? 'Parar sinais' : 'Ativar sinais do aplicativo',
      () => {
        if (signals?.running) {
          signals.stop();
          toggle.textContent = 'Ativar sinais do aplicativo';
        } else {
          signals = new SignalGenerator(e.sinais!, (sig) => showSignal(sig.text, sig.label));
          signals.start();
          toggle.textContent = 'Parar sinais';
        }
      },
      { small: true },
    );
    return card(
      { title: 'Sinais do aplicativo', headingLevel: 3 },
      h(
        'p',
        { class: 'small muted' },
        'Apoie o celular onde você consiga ver a tela. O aplicativo mostra sinais (e toca um bipe, se o som estiver ligado) em intervalos aleatórios — como um parceiro apontando.',
      ),
      signalDisplay,
      h('div', { class: 'row', style: { marginTop: '8px' } }, toggle),
    );
  };

  const summaryForm = () => {
    const rpeSelect = select(
      [
        { value: '', label: 'Não informar' },
        ...RPE_SCALE.map((r) => ({ value: String(r.value), label: r.label })),
      ],
      '',
      'rpe',
    );
    const discomfort = h(
      'fieldset',
      null,
      h('legend', null, 'Sentiu algum desconforto?'),
      h(
        'div',
        { class: 'choice-grid' },
        DISCOMFORT_LABELS.map((label, i) =>
          h(
            'label',
            { class: 'choice' },
            h('input', { type: 'radio', name: 'desconforto', value: String(i), checked: i === 0 }),
            h('span', null, label),
          ),
        ),
      ),
    );
    const notes = h('textarea', {
      maxlength: 2000,
      placeholder: 'Opcional: como foi, o que sentiu, o que quer ajustar.',
    });
    const saveBtn = button('Salvar sessão', () => void save(true), { variant: 'primary' });
    const save = async (counted: boolean) => {
      saveBtn.disabled = true;
      const discomfortValue = Number(
        (discomfort.querySelector('input:checked') as HTMLInputElement | null)?.value ?? 0,
      ) as DiscomfortLevel;
      const logged = logExercise({
        exercise: e,
        startedAt,
        endedAt: ctx.now(),
        activeSec: Math.round(stopwatch.elapsedMs() / 1000),
        counted,
        attempts,
        successes,
        errorTags,
        seriesDone: Math.floor(attempts / e.repeticoes),
        seriesTotal: e.series,
        ...(rpeSelect.value !== '' ? { rpe: Number(rpeSelect.value) } : {}),
        discomfort: discomfortValue,
        notes: notes.value.trim(),
      });
      try {
        await ctx.repo.saveSession(logged.session, logged.results);
        phase = 'salvo';
        ctx.feedback.success();
        ctx.toast('Sessão salva no histórico.', 'sucesso');
        renderSaved(logged.session.id, discomfortValue);
      } catch (error) {
        saveBtn.disabled = false;
        statusEl.textContent = error instanceof Error ? error.message : String(error);
        ctx.toast('Não foi possível salvar. Seus dados continuam na tela.', 'erro');
      }
    };
    return card(
      { title: 'Resumo da sessão' },
      h(
        'div',
        { class: 'grid-3' },
        h(
          'div',
          { class: 'stat' },
          h('span', { class: 'value' }, String(attempts)),
          h('span', { class: 'label' }, 'tentativas'),
        ),
        h(
          'div',
          { class: 'stat' },
          h('span', { class: 'value' }, String(successes)),
          h('span', { class: 'label' }, 'acertos'),
        ),
        h(
          'div',
          { class: 'stat' },
          h('span', { class: 'value' }, attempts ? percent(successes / attempts) : '—'),
          h('span', { class: 'label' }, 'aproveitamento'),
        ),
      ),
      h(
        'p',
        { class: 'small muted', style: { marginTop: '8px' } },
        `Tempo ativo: ${clock(stopwatch.elapsedMs() / 1000)}. Origem: contagem manual (você contou os acertos).`,
      ),
      field('Esforço percebido (0 a 10)', rpeSelect),
      discomfort,
      field('Observações', notes),
      h(
        'div',
        { class: 'row' },
        attempts > 0 ? saveBtn : null,
        button(
          attempts > 0 ? 'Salvar sem a contagem' : 'Salvar como concluído (sem contagem)',
          () => void save(false),
          { variant: 'ghost' },
        ),
        button(
          'Descartar',
          async () => {
            if (
              await ctx.confirm({
                title: 'Descartar sessão?',
                message: 'Nada desta sessão será salvo.',
                confirmLabel: 'Descartar',
                danger: true,
              })
            ) {
              phase = 'salvo';
              ctx.navigate(`/tecnico/${e.id}`);
            }
          },
          { variant: 'danger' },
        ),
      ),
      statusEl,
    );
  };

  const renderSaved = (sessionId: string, discomfort: DiscomfortLevel) => {
    replaceChildren(
      body,
      card(
        { title: 'Sessão registrada ✓', tone: discomfort >= 2 ? 'warn' : 'accent' },
        h(
          'p',
          null,
          attempts > 0
            ? `${successes} acertos em ${attempts} tentativas (${percent(successes / attempts)}).`
            : 'Sessão registrada sem contagem de acertos.',
        ),
        discomfort === 3
          ? h(
              'p',
              null,
              'Você marcou desconforto forte: descanse e avise um adulto responsável. Se a dor continuar, procure um profissional de saúde.',
            )
          : null,
        discomfort === 2
          ? h('p', null, 'Desconforto moderado: amanhã, faça apenas atividades leves.')
          : null,
        h(
          'div',
          { class: 'row' },
          linkButton(`#/historico/${sessionId}`, 'Ver no histórico'),
          linkButton('#/', 'Ver novas prioridades', { variant: 'primary' }),
        ),
      ),
    );
  };

  const render = () => {
    if (phase === 'resumo') {
      replaceChildren(body, summaryForm());
      return;
    }
    const controls =
      phase === 'pronto'
        ? card(
            null,
            h('p', null, h('strong', null, 'Critério de sucesso: '), e.criterioSucesso),
            h(
              'p',
              { class: 'small muted' },
              'Toque em "Acerto" ou "Erro" depois de cada repetição. O tempo só conta enquanto a sessão está ativa.',
            ),
            button(
              'Começar',
              () => {
                phase = 'ativo';
                stopwatch.start();
                ctx.feedback.unlock();
                render();
              },
              { variant: 'primary', block: true, big: true },
            ),
          )
        : phase === 'descanso'
          ? card(
              { title: 'Descanso', tone: 'accent' },
              h('p', { class: 'big-number', id: 'rest-left', 'aria-live': 'off' }, clock(restLeft)),
              h(
                'p',
                null,
                `Série ${seriesInfo().completed} concluída. Respire e beba água. Próxima: série ${seriesInfo().completed + 1} de ${e.series}.`,
              ),
              button('Pular descanso', endRest, { block: true }),
            )
          : card(
              null,
              h(
                'div',
                { class: 'counter-pad' },
                button('✓ Acerto', () => register('acerto'), {
                  variant: 'success',
                  big: true,
                  disabled: phase !== 'ativo',
                }),
                button('✗ Erro', () => register('erro'), {
                  variant: 'fail',
                  big: true,
                  disabled: phase !== 'ativo',
                }),
              ),
              errorChips,
              h(
                'div',
                { class: 'row', style: { marginTop: '10px' } },
                button(phase === 'pausado' ? 'Continuar' : 'Pausar', () => {
                  if (phase === 'pausado') {
                    phase = 'ativo';
                    stopwatch.start();
                  } else {
                    phase = 'pausado';
                    stopwatch.pause();
                  }
                  render();
                }),
                (undoBtn = button('Desfazer', undo, {
                  variant: 'ghost',
                  disabled: marks.length === 0,
                })),
                button('Concluir', finish, { variant: 'primary' }),
              ),
            );
    replaceChildren(
      body,
      card(
        null,
        h('div', { class: 'row spread' }, seriesEl, timerEl),
        countEl,
        rateEl,
        progressWrap,
      ),
      controls,
      statusEl,
      phase !== 'pronto' ? signalsCard() : null,
      h(
        'details',
        { class: 'card flat' },
        h('summary', null, 'Instruções e erros comuns'),
        h(
          'ol',
          { class: 'steps' },
          e.instrucoes.map((i) => h('li', null, i)),
        ),
        h(
          'ul',
          null,
          e.errosComuns.map((c) => h('li', null, `${c.texto} → ${c.correcao}`)),
        ),
      ),
    );
    updateCounters();
  };

  render();
  tickTimer = window.setInterval(tick, 250);

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      e.nome,
      e.teste ? 'Teste de linha de base: 10 tentativas nas mesmas condições.' : e.volume,
      { href: `#/tecnico/${e.id}`, label: 'Exercício' },
    ),
    body,
  );
  return {
    title: `Sessão: ${e.nome}`,
    el,
    canLeave: async () => {
      if (phase === 'salvo' || attempts === 0) return true;
      return ctx.confirm({
        title: 'Sair sem salvar?',
        message: 'Você registrou tentativas nesta sessão. Se sair agora, elas serão perdidas.',
        confirmLabel: 'Sair sem salvar',
        cancelLabel: 'Continuar a sessão',
        danger: true,
      });
    },
    destroy: () => {
      stopTimers();
      if (tickTimer !== null) window.clearInterval(tickTimer);
      stopwatch.pause();
    },
  };
}
