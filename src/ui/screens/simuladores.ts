/** Simuladores: lista das seis modalidades e partida com rodadas, semente e pontuação. */
import { percent, millis } from '../../core/format.ts';
import { clamp } from '../../core/geometry.ts';
import { freshSeed } from '../../core/rng.ts';
import { nextStoredLevel, summarizeRounds } from '../../core/scoring.ts';
import { logSimulator } from '../../core/sessionLog.ts';
import type { RoundResult } from '../../core/sim/common.ts';
import { SIM_MODES, SIM_MODE_ORDER, isSimModeId, roundSeed } from '../../core/sim/index.ts';
import { SKILLS } from '../../core/skills.ts';
import type { RoundLog, SimModeId } from '../../core/types.ts';
import type { AppContext } from '../app.ts';
import { button, card, field, linkButton, pageHeader, pill, select } from '../components.ts';
import { h, replaceChildren } from '../dom.ts';
import type { Screen } from '../router.ts';
import { RUNNERS } from '../sim/modes.ts';

export const ROUNDS_PER_SESSION = 10;

export async function simulatorListScreen(ctx: AppContext): Promise<Screen> {
  const [levels, sessions] = await Promise.all([ctx.repo.getSimLevels(), ctx.repo.listSessions()]);
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Simuladores',
      'Cenários virtuais com regras explícitas. Treinam leitura e decisão — não substituem a execução real com bola.',
    ),
    h(
      'ul',
      { class: 'list', style: { gap: '10px' } },
      SIM_MODE_ORDER.map((mode) => {
        const info = SIM_MODES[mode];
        const mine = sessions.filter(
          (s) =>
            s.kind === 'simulador' && s.activityId === mode && s.summary && s.summary.attempts > 0,
        );
        const last = mine[0];
        const best = mine.reduce((b, s) => Math.max(b, s.summary?.score ?? 0), 0);
        return h(
          'li',
          { style: { padding: '0', background: 'transparent' } },
          h(
            'a',
            { href: `#/simuladores/${mode}`, class: 'card-link' },
            h(
              'div',
              { class: 'card flat stack', style: { gap: '6px' } },
              h(
                'h2',
                { style: { fontSize: '1.05rem', margin: '0' } },
                `${info.letra}. ${info.nome}`,
              ),
              h('p', { class: 'small muted', style: { margin: '0' } }, info.resumo),
              h(
                'div',
                { class: 'row' },
                pill(SKILLS[info.skill].curto, 'info'),
                pill(`Nível ${levels[mode]}`, 'accent'),
                last?.summary
                  ? pill(`Última: ${last.summary.successes}/${last.summary.attempts}`)
                  : pill('Ainda não jogado'),
                best > 0 ? pill(`Recorde: ${best} pts`) : null,
              ),
            ),
          ),
        );
      }),
    ),
  );
  return { title: 'Simuladores', el };
}

export async function simulatorScreen(
  ctx: AppContext,
  modeParam: string,
  query: URLSearchParams,
): Promise<Screen> {
  if (!isSimModeId(modeParam)) throw new Error('Simulador não encontrado.');
  const mode: SimModeId = modeParam;
  const info = SIM_MODES[mode];
  const [levels, profile] = await Promise.all([ctx.repo.getSimLevels(), ctx.repo.getProfile()]);
  const modality = profile?.modalidade ?? 'nao_sei';
  const levelParam = Number(query.get('nivel'));
  let level =
    Number.isInteger(levelParam) && levelParam >= 1 && levelParam <= 5 ? levelParam : levels[mode];
  const seedParam = Number(query.get('semente'));
  let sessionSeed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam >>> 0 : freshSeed();

  let rounds: RoundLog[] = [];
  let attemptIndex = 0;
  let startedAt: Date | null = null;
  let saved = false;
  let roundAbort: AbortController | null = null;
  let running = false;

  // A barra de estatísticas não é região viva (era anunciada a cada rodada, com a semente).
  const statsBar = h('div', { class: 'row' });
  const stage = h('div', { class: 'stack', tabindex: '-1' });
  const feedback = h('div', { class: 'stack' });
  const actions = h('div', { class: 'row' });

  const counted = () => rounds.filter((r) => r.outcome !== 'antecipado');

  const updateStats = () => {
    const c = counted();
    const ok = c.filter((r) => r.success).length;
    const score = c.reduce((sum, r) => sum + r.points, 0);
    replaceChildren(
      statsBar,
      pill(`Nível ${level}`, 'accent'),
      pill(
        `Rodada ${Math.min(c.length + (running ? 1 : 0), ROUNDS_PER_SESSION)} de ${ROUNDS_PER_SESSION}`,
      ),
      pill(`Acertos ${ok}/${c.length}`),
      pill(`${score} pts`),
      pill(`Semente ${sessionSeed}`),
    );
  };

  const intro = () => {
    running = false;
    const levelSelect = select(
      [1, 2, 3, 4, 5].map((n) => ({
        value: String(n),
        label: `Nível ${n}${n === levels[mode] ? ' (seu nível atual)' : ''}`,
      })),
      String(level),
      'nivel-sim',
    );
    levelSelect.addEventListener('change', () => {
      level = clamp(Number(levelSelect.value), 1, 5);
      updateStats();
    });
    replaceChildren(
      stage,
      card(
        { title: 'Como funciona' },
        h(
          'ul',
          null,
          info.regras.map((r) => h('li', null, r)),
        ),
        h('p', { class: 'small' }, h('strong', null, 'Controles: '), info.controles),
        h(
          'p',
          { class: 'small muted' },
          `Uma sessão tem ${ROUNDS_PER_SESSION} rodadas. Com 80% de acerto o nível sobe; abaixo de 40% ele desce. A semente permite repetir exatamente os mesmos cenários.`,
        ),
        field('Dificuldade', levelSelect),
        button('Começar sessão', startSession, { variant: 'primary', block: true, big: true }),
      ),
    );
    replaceChildren(feedback);
    replaceChildren(actions);
    updateStats();
  };

  const startSession = () => {
    ending = false;
    rounds = [];
    attemptIndex = 0;
    startedAt = ctx.now();
    saved = false;
    ctx.feedback.unlock();
    nextRound();
  };

  const nextRound = () => {
    if (counted().length >= ROUNDS_PER_SESSION) {
      void endSession();
      return;
    }
    roundAbort?.abort();
    roundAbort = new AbortController();
    running = true;
    replaceChildren(feedback);
    replaceChildren(
      actions,
      button('Encerrar sessão', () => void confirmEnd(), { variant: 'ghost' }),
    );
    updateStats();
    const seed = roundSeed(sessionSeed, mode, attemptIndex);
    const roundNumber = attemptIndex;
    // Se o foco estava no botão que sumiu ("Começar"/"Próxima rodada"), ele vai para a rodada.
    const active = document.activeElement;
    const focusLost =
      !active || active === document.body || stage.contains(active) || feedback.contains(active);
    RUNNERS[mode]({
      ctx,
      seed,
      difficulty: level,
      modality,
      stage,
      signal: roundAbort.signal,
      done: (result, choice) => onRoundDone(result, seed, roundNumber, choice),
    });
    stage.setAttribute(
      'aria-label',
      `Rodada ${Math.min(counted().length + 1, ROUNDS_PER_SESSION)} de ${ROUNDS_PER_SESSION}: ${info.nome}`,
    );
    // A rodada começa com o campo inteiro à vista (logo abaixo do cabeçalho fixo): os alvos
    // ficam na parte de cima do campo e não podem começar escondidos.
    stage.scrollIntoView({ block: 'start' });
    if (focusLost) stage.focus({ preventScroll: true });
  };

  const onRoundDone = (result: RoundResult, seed: number, roundNumber: number, choice?: string) => {
    running = false;
    rounds.push({
      round: roundNumber,
      seed,
      outcome: result.outcome,
      success: result.success,
      ...(result.incomplete ? { incomplete: true } : {}),
      ...(typeof result.responseMs === 'number'
        ? { responseMs: Math.round(result.responseMs) }
        : {}),
      points: result.points,
      ...(choice ? { choice } : {}),
    });
    attemptIndex++;
    if (result.success) ctx.feedback.success();
    else ctx.feedback.error();
    updateStats();
    const isLast = counted().length >= ROUNDS_PER_SESSION;
    const nextBtn = button(
      isLast
        ? 'Ver resultado da sessão'
        : result.outcome === 'antecipado'
          ? 'Repetir rodada'
          : 'Próxima rodada',
      nextRound,
      { variant: 'primary', block: true },
    );
    const resultCard = card(
      {
        title: result.title,
        tone: result.success ? 'accent' : result.incomplete ? 'warn' : 'danger',
        headingLevel: 2,
        class: 'sim-feedback',
      },
      h('p', null, result.explanation),
      h(
        'p',
        { class: 'small muted' },
        [
          result.success ? `+${result.points} pontos` : '0 pontos',
          typeof result.responseMs === 'number'
            ? ` · tempo de resposta ${millis(result.responseMs)}`
            : '',
        ].join(''),
      ),
    );
    replaceChildren(feedback, resultCard, nextBtn);
    // O botão seguinte é descrito pelo resultado: o leitor de tela anuncia os dois juntos.
    const resultTitle = resultCard.querySelector('h2');
    if (resultTitle) {
      resultTitle.id = `resultado-rodada-${roundNumber}`;
      nextBtn.setAttribute('aria-describedby', resultTitle.id);
    }
    nextBtn.focus();
  };

  const confirmEnd = async () => {
    if (counted().length === 0) {
      roundAbort?.abort();
      intro();
      return;
    }
    const ok = await ctx.confirm({
      title: 'Encerrar a sessão agora?',
      message: `As ${counted().length} rodadas jogadas serão salvas no histórico.`,
      confirmLabel: 'Encerrar e salvar',
      cancelLabel: 'Continuar jogando',
    });
    if (ok) void endSession();
  };

  /** Evita salvar a mesma sessão duas vezes (toque duplo em "Ver resultado"). */
  let ending = false;
  const endSession = async () => {
    if (ending) return;
    ending = true;
    roundAbort?.abort();
    running = false;
    const summary = summarizeRounds(rounds);
    const storedLevel = levels[mode];
    const change = nextStoredLevel(storedLevel, level, summary);
    const status = h('p', { role: 'status', class: 'small' });
    let sessionId: string | null = null;
    if (summary.attempts > 0 && startedAt) {
      const logged = logSimulator({
        mode,
        seed: sessionSeed,
        difficulty: level,
        rounds,
        startedAt,
        endedAt: ctx.now(),
      });
      try {
        await ctx.repo.saveSession(logged.session, logged.results);
        sessionId = logged.session.id;
        saved = true;
        if (change.changed && change.level !== storedLevel) {
          const updated = { ...(await ctx.repo.getSimLevels()), [mode]: change.level };
          await ctx.repo.saveSimLevels(updated);
          levels[mode] = change.level;
        }
        status.textContent = 'Sessão salva no histórico.';
      } catch (error) {
        status.textContent = `Não foi possível salvar: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    const playedLevel = level;
    // A próxima sessão começa no nível salvo (atualizado ou não por esta sessão).
    level = levels[mode];
    const rate = summary.attempts ? summary.successes / summary.attempts : 0;
    replaceChildren(
      stage,
      card(
        { title: 'Resultado da sessão', tone: 'accent' },
        h(
          'div',
          { class: 'grid-3' },
          h(
            'div',
            { class: 'stat' },
            h('span', { class: 'value' }, `${summary.successes}/${summary.attempts}`),
            h('span', { class: 'label' }, 'acertos'),
          ),
          h(
            'div',
            { class: 'stat' },
            h('span', { class: 'value' }, summary.attempts ? percent(rate) : '—'),
            h('span', { class: 'label' }, 'aproveitamento'),
          ),
          h(
            'div',
            { class: 'stat' },
            h('span', { class: 'value' }, String(summary.score ?? 0)),
            h('span', { class: 'label' }, 'pontos'),
          ),
        ),
        summary.avgResponseMs
          ? h('p', null, `Tempo médio de resposta nos acertos: ${millis(summary.avgResponseMs)}.`)
          : null,
        summary.incomplete
          ? h('p', { class: 'small' }, `Rodadas sem resposta a tempo: ${summary.incomplete}.`)
          : null,
        h('p', null, change.reason),
        h(
          'p',
          { class: 'small muted' },
          `Nível jogado: ${playedLevel}. Semente: ${sessionSeed}. Resultado de cenário virtual (métrica calculada pelo simulador), não de uma partida real.`,
        ),
        status,
        h(
          'div',
          { class: 'row' },
          button(
            'Jogar de novo',
            () => {
              sessionSeed = freshSeed();
              intro();
            },
            { variant: 'primary' },
          ),
          button('Repetir com a mesma semente', () => {
            level = playedLevel;
            intro();
          }),
          sessionId
            ? linkButton(`#/historico/${sessionId}`, 'Ver detalhes', { variant: 'ghost' })
            : null,
        ),
      ),
    );
    replaceChildren(feedback);
    replaceChildren(actions);
    updateStats();
  };

  intro();

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(`${info.letra}. ${info.nome}`, info.resumo, {
      href: '#/simuladores',
      label: 'Simuladores',
    }),
    statsBar,
    stage,
    feedback,
    actions,
  );
  return {
    title: `Simulador: ${info.nome}`,
    el,
    canLeave: async () => {
      if (saved || counted().length === 0) return true;
      return ctx.confirm({
        title: 'Sair do simulador?',
        message: 'As rodadas desta sessão ainda não foram salvas e serão perdidas.',
        confirmLabel: 'Sair sem salvar',
        cancelLabel: 'Continuar',
        danger: true,
      });
    },
    destroy: () => roundAbort?.abort(),
  };
}
