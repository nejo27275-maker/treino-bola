/**
 * Controladores de cada modalidade do simulador. Cada um desenha a rodada, recebe a
 * interação (toque, teclado ou botões) e entrega o resultado calculado pelo motor.
 */
import { angleOf, dist, sub, vec, type Vec } from '../../core/geometry.ts';
import type { RoundResult } from '../../core/sim/common.ts';
import {
  DECISION_LABEL,
  DECISION_OPTIONS,
  analyzeDecision,
  evaluateDecision,
  generateDecision,
  type DecisionOption,
} from '../../core/sim/decisao.ts';
import {
  CONTROL_LABEL,
  analyzeControl,
  evaluateControl,
  generateControl,
  type ControlOption,
} from '../../core/sim/dominio.ts';
import { evaluateShot, generateShot, keeperReachCenter } from '../../core/sim/finalizacao.ts';
import {
  SCAN_LABEL,
  SCAN_OPTIONS,
  evaluateScan,
  generateScan,
  isBehindPlayer,
  type ScanOption,
} from '../../core/sim/olhe.ts';
import { evaluatePass, generatePass } from '../../core/sim/passe.ts';
import {
  REACTION_LABEL,
  REACTION_RESPONSES,
  STIMULUS_LABEL,
  evaluateReaction,
  generateReaction,
  type ReactionResponse,
} from '../../core/sim/reacao.ts';
import type { Modality, SimModeId } from '../../core/types.ts';
import type { AppContext } from '../app.ts';
import { button } from '../components.ts';
import { h, prefersReducedMotion, s } from '../dom.ts';
import { FieldView } from './fieldView.ts';

export interface RoundContext {
  ctx: AppContext;
  seed: number;
  difficulty: number;
  modality: Modality;
  stage: HTMLElement;
  signal: AbortSignal;
  done: (result: RoundResult, choice?: string) => void;
}

/** Barra de tempo que encolhe; chama onTimeout ao acabar (se não for cancelada). */
function timeBar(
  ms: number,
  signal: AbortSignal,
  onTimeout: () => void,
): { el: HTMLElement; stop: () => void } {
  const fill = h('span');
  const el = h(
    'div',
    {
      class: 'timebar',
      role: 'timer',
      'aria-label': `Tempo: ${(ms / 1000).toFixed(1).replace('.', ',')} segundos`,
    },
    fill,
  );
  const start = performance.now();
  let raf = 0;
  let stopped = false;
  const timeout = window.setTimeout(() => {
    if (!stopped && !signal.aborted) onTimeout();
  }, ms);
  const step = (now: number) => {
    if (stopped || signal.aborted) return;
    const left = Math.max(0, 1 - (now - start) / ms);
    fill.style.width = `${left * 100}%`;
    if (left > 0) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  const stop = () => {
    stopped = true;
    window.clearTimeout(timeout);
    cancelAnimationFrame(raf);
  };
  signal.addEventListener('abort', stop);
  return { el, stop };
}

function once(rc: RoundContext): (result: RoundResult, choice?: string) => boolean {
  let finished = false;
  return (result, choice) => {
    if (finished || rc.signal.aborted) return false;
    finished = true;
    rc.done(result, choice);
    return true;
  };
}

function keyHandler(rc: RoundContext, map: Record<string, () => void>): void {
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };
  window.addEventListener('keydown', onKey);
  rc.signal.addEventListener('abort', () => window.removeEventListener('keydown', onKey));
}

// ——— A: Passe pela brecha ———
function runPass(rc: RoundContext): void {
  const sc = generatePass(rc.seed, rc.difficulty);
  const finish = once(rc);
  const view = new FieldView(
    'Campo do passe pela brecha. Você é o círculo amarelo embaixo; colegas em azul; adversários em vermelho.',
  );
  for (const t of sc.teammates) view.zone(t.pos, sc.receiveRadius, 'recepcao');
  for (const d of sc.defenders) view.zone(d.pos, sc.interceptRadius, 'alcance');
  for (const t of sc.teammates) view.actor(t.pos, 'colega', t.label, `Colega ${t.label}`);
  for (const d of sc.defenders) view.actor(d.pos, 'adversario', undefined, 'Adversário');
  for (const c of sc.cones) view.actor(c.pos, 'cone', undefined, 'Cone');
  view.actor(sc.passer, 'voce', 'V', 'Você');
  view.ball(vec(sc.passer.x, sc.passer.y - 0.9));
  let angle = -Math.PI / 2;
  let force = 0.5;
  let locked = false;
  const aim = s('g');
  view.layers.overlay.append(aim);
  const forceLabel = h('label', { for: 'forca-passe' }, 'Força: 50%');
  const slider = h('input', {
    type: 'range',
    id: 'forca-passe',
    min: 5,
    max: 100,
    step: 1,
    value: 50,
  });
  const angleLabel = h('span', { class: 'small muted', 'aria-live': 'polite' });
  const drawAim = () => {
    aim.replaceChildren();
    const len = 3 + force * 3;
    const tip = vec(sc.passer.x + Math.cos(angle) * len, sc.passer.y + Math.sin(angle) * len);
    aim.append(
      s('line', {
        x1: sc.passer.x,
        y1: sc.passer.y,
        x2: tip.x,
        y2: tip.y,
        stroke: '#ffd166',
        'stroke-width': 0.18,
        'stroke-dasharray': '0.5 0.25',
      }),
      s('circle', { cx: tip.x, cy: tip.y, r: 0.25, fill: '#ffd166' }),
    );
    const deg = Math.round((-angle * 180) / Math.PI);
    angleLabel.textContent = `Direção: ${deg}° (90° = reto para o ataque)`;
  };
  slider.addEventListener('input', () => {
    force = Number(slider.value) / 100;
    forceLabel.textContent = `Força: ${slider.value}%`;
    drawAim();
  });
  const setAngleFromPoint = (p: Vec | null) => {
    if (!p || locked) return;
    const a = angleOf(sub(p, sc.passer));
    // Limita a direções para a frente/lados (sem passar para trás do próprio jogador).
    angle = Math.max(-Math.PI + 0.05, Math.min(-0.05, a));
    drawAim();
  };
  let dragging = false;
  view.svg.addEventListener('pointerdown', (e) => {
    dragging = true;
    view.svg.setPointerCapture?.(e.pointerId);
    setAngleFromPoint(view.toField(e.clientX, e.clientY));
  });
  view.svg.addEventListener('pointermove', (e) => {
    if (dragging) setAngleFromPoint(view.toField(e.clientX, e.clientY));
  });
  view.svg.addEventListener('pointerup', () => {
    dragging = false;
  });
  const rotate = (deltaDeg: number) => {
    if (locked) return;
    angle = Math.max(-Math.PI + 0.05, Math.min(-0.05, angle + (deltaDeg * Math.PI) / 180));
    drawAim();
  };
  const passBtn = button('Passar', () => void pass(), { variant: 'primary', big: true });
  const pass = async () => {
    if (locked) return;
    locked = true;
    passBtn.disabled = true;
    slider.disabled = true;
    const result = evaluatePass(sc, { angle, force });
    view.line(sc.passer, result.stop, { color: '#ffffff', dashed: true });
    const ms = Math.min(1200, 250 + dist(sc.passer, result.stop) * 35);
    await view.animateBall(sc.passer, result.stop, ms, rc.signal);
    if (result.blockerId) {
      const b = [...sc.defenders, ...sc.cones].find((x) => x.id === result.blockerId);
      if (b) view.zone(b.pos, 1.2, 'destaque');
    }
    if (result.receiverId) {
      const r = sc.teammates.find((x) => x.id === result.receiverId);
      if (r) view.zone(r.pos, 1.2, 'destaque');
    }
    finish(result, `${Math.round((-angle * 180) / Math.PI)}° · ${Math.round(force * 100)}%`);
  };
  keyHandler(rc, {
    ArrowLeft: () => rotate(-3),
    ArrowRight: () => rotate(3),
    ArrowUp: () => {
      slider.value = String(Math.min(100, Number(slider.value) + 2));
      slider.dispatchEvent(new Event('input'));
    },
    ArrowDown: () => {
      slider.value = String(Math.max(5, Number(slider.value) - 2));
      slider.dispatchEvent(new Event('input'));
    },
    Enter: () => void pass(),
  });
  drawAim();
  rc.stage.replaceChildren(
    h('div', { class: 'field-wrap' }, view.svg),
    h(
      'p',
      { class: 'small muted' },
      'Toque ou arraste no campo para apontar. Setas do teclado: ←/→ direção, ↑/↓ força, Enter passa.',
    ),
    angleLabel,
    h(
      'div',
      { class: 'row', style: { flexWrap: 'nowrap' } },
      button('↺ 3°', () => rotate(-3), {
        small: true,
        ariaLabel: 'Girar a mira 3 graus para a esquerda',
      }),
      h('div', { class: 'field', style: { flex: '1', margin: '0' } }, forceLabel, slider),
      button('↻ 3°', () => rotate(3), {
        small: true,
        ariaLabel: 'Girar a mira 3 graus para a direita',
      }),
    ),
    passBtn,
  );
}

// ——— B: Domínio orientado ———
const CONTROL_ARROWS: Record<ControlOption, string> = {
  esquerda: '←',
  direita: '→',
  frente: '↑',
  tras: '↓',
};

function runControl(rc: RoundContext): void {
  const sc = generateControl(rc.seed, rc.difficulty);
  const finish = once(rc);
  const view = new FieldView(
    'Domínio orientado: a bola vem do colega embaixo; os adversários vêm na sua direção.',
  );
  view.actor(sc.passer, 'colega', 'C', 'Colega que passa');
  for (const d of sc.defenders) {
    view.line(
      d.pos,
      vec(d.pos.x + (sc.player.x - d.pos.x) * 0.35, d.pos.y + (sc.player.y - d.pos.y) * 0.35),
      { color: '#ff5a5a', arrow: true, width: 0.12 },
    );
    view.actor(d.pos, 'adversario', undefined, 'Adversário pressionando');
  }
  view.actor(sc.player, 'voce', 'V', 'Você');
  const t0 = performance.now();
  void view.animateBall(
    sc.passer,
    vec(sc.player.x, sc.player.y + 0.9),
    sc.timeLimitMs * 0.9,
    rc.signal,
  );
  const choose = (option: ControlOption | null) => {
    bar.stop();
    const result = evaluateControl(sc, option, option ? performance.now() - t0 : undefined);
    const analysis = analyzeControl(sc);
    for (const o of analysis.options) {
      if (!o.valid) continue;
      const color =
        o.option === analysis.best
          ? '#3ddc84'
          : o.option === option
            ? '#ffd166'
            : 'rgba(255,255,255,0.5)';
      view.line(sc.player, o.ballPos, {
        color,
        arrow: true,
        width: o.option === option || o.option === analysis.best ? 0.22 : 0.1,
      });
      view.label(
        vec(o.ballPos.x, o.ballPos.y - 0.6),
        `${o.space.toFixed(1).replace('.', ',')} m`,
        color,
      );
    }
    if (finish(result, option ?? undefined)) buttons.forEach((b) => (b.disabled = true));
  };
  const bar = timeBar(sc.timeLimitMs, rc.signal, () => choose(null));
  const order: ControlOption[] = ['frente', 'esquerda', 'direita', 'tras'];
  const buttons = order.map((o) =>
    button(`${CONTROL_ARROWS[o]} ${CONTROL_LABEL[o]}`, () => choose(o), { big: true }),
  );
  keyHandler(rc, {
    ArrowUp: () => choose('frente'),
    ArrowLeft: () => choose('esquerda'),
    ArrowRight: () => choose('direita'),
    ArrowDown: () => choose('tras'),
  });
  rc.stage.replaceChildren(
    h('div', { class: 'field-wrap' }, view.svg),
    bar.el,
    h('div', { class: 'option-grid' }, buttons),
  );
}

// ——— C: Olhe antes de receber ———
function runScan(rc: RoundContext): void {
  const sc = generateScan(rc.seed, rc.difficulty);
  const finish = once(rc);
  const view = new FieldView(
    'Olhe antes de receber: memorize o campo; depois, o que está às suas costas fica escondido.',
  );
  const drawAll = (hideBehind: boolean) => {
    view.clear('actors', 'overlay');
    view.actor(sc.passer, 'colega', 'A', 'Colega de apoio (quem passa)');
    for (const t of sc.teammates)
      if (!hideBehind || !isBehindPlayer(sc, t.pos))
        view.actor(t.pos, 'colega', t.label, `Colega ${t.label}`);
    for (const d of sc.defenders)
      if (!hideBehind || !isBehindPlayer(sc, d.pos))
        view.actor(d.pos, 'adversario', undefined, 'Adversário');
    view.actor(sc.player, 'voce', 'V', 'Você (de costas para o ataque)');
    if (hideBehind) view.fog(sc.player.y - 0.5, 'às suas costas — o que você viu?');
  };
  drawAll(false);
  view.ball(sc.passer);
  const phaseLabel = h(
    'p',
    { class: 'lead', 'aria-live': 'assertive' },
    'Observe o campo inteiro!',
  );
  const optionsWrap = h('div', { class: 'option-grid' });
  const barWrap = h('div');
  const scanBar = timeBar(sc.scanMs, rc.signal, () => startDecision());
  barWrap.replaceChildren(scanBar.el);
  let t0 = 0;
  const choose = (option: ScanOption | null) => {
    decisionBar?.stop();
    drawAll(false);
    const result = evaluateScan(sc, option, option ? performance.now() - t0 : undefined);
    if (finish(result, option ?? undefined))
      optionsWrap
        .querySelectorAll('button')
        .forEach((b) => ((b as HTMLButtonElement).disabled = true));
  };
  let decisionBar: { el: HTMLElement; stop: () => void } | null = null;
  const startDecision = () => {
    if (rc.signal.aborted) return;
    drawAll(true);
    void view.animateBall(sc.passer, vec(sc.player.x, sc.player.y + 0.9), 500, rc.signal);
    phaseLabel.textContent = 'A bola chegou! O que você faz?';
    t0 = performance.now();
    decisionBar = timeBar(sc.timeLimitMs, rc.signal, () => choose(null));
    barWrap.replaceChildren(decisionBar.el);
    optionsWrap.replaceChildren(
      ...SCAN_OPTIONS.map((o) => button(SCAN_LABEL[o], () => choose(o), { big: true })),
    );
    (optionsWrap.querySelector('button') as HTMLButtonElement | null)?.focus();
  };
  rc.stage.replaceChildren(
    phaseLabel,
    h('div', { class: 'field-wrap' }, view.svg),
    barWrap,
    optionsWrap,
  );
}

// ——— D: Decisão rápida ———
function runDecision(rc: RoundContext): void {
  const sc = generateDecision(rc.seed, rc.difficulty);
  const finish = once(rc);
  const view = new FieldView(
    'Decisão rápida: você está com a bola (amarelo). Passar, conduzir ou proteger?',
  );
  for (const t of sc.teammates) view.actor(t.pos, 'colega', t.label, `Colega ${t.label}`);
  for (const d of sc.defenders) view.actor(d.pos, 'adversario', undefined, 'Adversário');
  view.actor(sc.player, 'voce', 'V', 'Você com a bola');
  view.ball(vec(sc.player.x, sc.player.y - 0.9));
  const t0 = performance.now();
  const buttons = DECISION_OPTIONS.map((o) =>
    button(DECISION_LABEL[o], () => choose(o), { big: true }),
  );
  const choose = (option: DecisionOption | null) => {
    bar.stop();
    const a = analyzeDecision(sc);
    const result = evaluateDecision(sc, option, option ? performance.now() - t0 : undefined);
    if (a.best === 'passar' && a.bestTeammate) {
      const mate = sc.teammates.find((t) => t.id === a.bestTeammate);
      if (mate) view.line(sc.player, mate.pos, { color: '#3ddc84', arrow: true, width: 0.2 });
    } else if (a.best === 'conduzir') {
      view.line(sc.player, vec(sc.player.x, Math.max(1, sc.player.y - 6)), {
        color: '#3ddc84',
        arrow: true,
        width: 0.2,
      });
    } else {
      view.zone(sc.player, Math.min(3, a.nearestDefender + 0.3), 'destaque');
    }
    if (finish(result, option ?? undefined)) buttons.forEach((b) => (b.disabled = true));
  };
  const bar = timeBar(sc.timeLimitMs, rc.signal, () => choose(null));
  keyHandler(rc, {
    '1': () => choose('passar'),
    '2': () => choose('conduzir'),
    '3': () => choose('proteger'),
  });
  rc.stage.replaceChildren(
    h('div', { class: 'field-wrap' }, view.svg),
    bar.el,
    h('div', { class: 'reaction-pad' }, buttons),
  );
}

// ——— E: Reação à pressão ———
const STIMULUS_TEXT = {
  esquerda: '● ⇢   Pressão pela esquerda',
  direita: 'Pressão pela direita   ⇠ ●',
  dupla: '● ⇢  Pressão dos dois lados  ⇠ ●',
} as const;

function runReaction(rc: RoundContext): void {
  const sc = generateReaction(rc.seed, rc.difficulty);
  const finish = once(rc);
  const stimulus = h(
    'div',
    { class: 'stimulus', role: 'status', 'aria-live': 'assertive' },
    'Aguarde o sinal…',
  );
  let shownAt: number | null = null;
  let windowTimer: number | null = null;
  const foreTimer = window.setTimeout(() => {
    if (rc.signal.aborted) return;
    stimulus.textContent = STIMULUS_TEXT[sc.stimulus];
    stimulus.setAttribute('aria-label', STIMULUS_LABEL[sc.stimulus]);
    stimulus.classList.add('go');
    rc.ctx.feedback.stimulus();
    // Marca o tempo no quadro seguinte, quando o estímulo já foi desenhado.
    requestAnimationFrame(() => {
      shownAt = performance.now();
      windowTimer = window.setTimeout(() => respond(null), sc.windowMs);
    });
  }, sc.foreperiodMs);
  rc.signal.addEventListener('abort', () => {
    window.clearTimeout(foreTimer);
    if (windowTimer !== null) window.clearTimeout(windowTimer);
  });
  const respond = (response: ReactionResponse | null) => {
    if (shownAt === null) {
      if (response === null) return;
      window.clearTimeout(foreTimer);
      const result = evaluateReaction(sc, { response, responseMs: null, early: true });
      stimulus.textContent = 'Cedo demais!';
      if (finish(result, response)) disable();
      return;
    }
    if (windowTimer !== null) window.clearTimeout(windowTimer);
    const responseMs = response ? performance.now() - shownAt : null;
    const result = evaluateReaction(sc, { response, responseMs });
    if (finish(result, response ?? undefined)) disable();
  };
  const buttons = REACTION_RESPONSES.map((r) =>
    button(
      r === 'esquerda'
        ? `⬅ ${REACTION_LABEL[r]}`
        : r === 'direita'
          ? `${REACTION_LABEL[r]} ➡`
          : `⬇ ${REACTION_LABEL[r]}`,
      () => respond(r),
      { big: true },
    ),
  );
  const disable = () => buttons.forEach((b) => (b.disabled = true));
  keyHandler(rc, {
    ArrowLeft: () => respond('esquerda'),
    ArrowRight: () => respond('direita'),
    ArrowDown: () => respond('proteger'),
  });
  rc.stage.replaceChildren(
    stimulus,
    h(
      'p',
      { class: 'small muted' },
      sc.windowMs
        ? `Responda em até ${(sc.windowMs / 1000).toFixed(2).replace('.', ',')} s depois do sinal. Fuja do lado da pressão.`
        : '',
    ),
    h('div', { class: 'reaction-pad' }, buttons),
  );
}

// ——— F: Finalização ———
function runShot(rc: RoundContext): void {
  const sc = generateShot(rc.seed, rc.difficulty, rc.modality);
  const finish = once(rc);
  const W = sc.goal.width;
  const H = sc.goal.height;
  const margin = Math.max(0.8, W * 0.15);
  const top = 0.6;
  const vbW = W + margin * 2;
  const vbH = H + top + 1.2;
  const X = (x: number) => x;
  const Y = (y: number) => H - y; // altura → coordenada do SVG
  const svg = s('svg', {
    viewBox: `${-margin} ${-top} ${vbW} ${vbH}`,
    class: 'field-svg',
    role: 'img',
    'aria-label': `Baliza vista de frente (${W} m × ${H} m). O goleiro e a área de alcance aparecem tracejados.`,
  });
  svg.append(
    s('rect', { x: -margin, y: -top, width: vbW, height: vbH, fill: '#1c3a2b' }),
    s('rect', { x: -margin, y: H, width: vbW, height: 1.2, fill: '#237a49' }),
  );
  // Rede.
  for (let gx = 0; gx <= W; gx += W / 12)
    svg.append(
      s('line', {
        x1: gx,
        y1: 0,
        x2: gx,
        y2: H,
        stroke: 'rgba(255,255,255,0.18)',
        'stroke-width': 0.02,
      }),
    );
  for (let gy = 0; gy <= H; gy += H / 6)
    svg.append(
      s('line', {
        x1: 0,
        y1: gy,
        x2: W,
        y2: gy,
        stroke: 'rgba(255,255,255,0.18)',
        'stroke-width': 0.02,
      }),
    );
  for (const t of sc.targets) {
    svg.append(
      s(
        'rect',
        {
          x: X(t.x),
          y: Y(t.y + t.h),
          width: t.w,
          height: t.h,
          fill: 'rgba(255,209,102,0.12)',
          stroke: '#ffd166',
          'stroke-width': 0.03,
          'stroke-dasharray': '0.08 0.06',
        },
        s('title', null, `Alvo: ${t.label}`),
      ),
    );
  }
  const reach = keeperReachCenter(sc);
  svg.append(
    s('ellipse', {
      cx: reach.x,
      cy: Y(reach.y),
      rx: sc.keeper.rx,
      ry: sc.keeper.ry,
      fill: 'rgba(255,90,90,0.15)',
      stroke: '#ff5a5a',
      'stroke-width': 0.03,
      'stroke-dasharray': '0.08 0.06',
    }),
  );
  const kx = sc.keeper.x;
  const bodyH = Math.min(1.75, H * 0.85);
  const lean = sc.keeper.lean * 8;
  svg.append(
    s(
      'g',
      { transform: `rotate(${lean} ${kx} ${Y(0)})` },
      s('rect', {
        x: kx - 0.22,
        y: Y(bodyH * 0.8),
        width: 0.44,
        height: bodyH * 0.8,
        rx: 0.12,
        fill: '#ff9f1c',
      }),
      s('circle', { cx: kx, cy: Y(bodyH * 0.9), r: 0.13, fill: '#ffd8a8' }),
      s('line', {
        x1: kx - 0.22,
        y1: Y(bodyH * 0.65),
        x2: kx - 0.6,
        y2: Y(bodyH * 0.45),
        stroke: '#ff9f1c',
        'stroke-width': 0.1,
      }),
      s('line', {
        x1: kx + 0.22,
        y1: Y(bodyH * 0.65),
        x2: kx + 0.6,
        y2: Y(bodyH * 0.45),
        stroke: '#ff9f1c',
        'stroke-width': 0.1,
      }),
      s(
        'title',
        null,
        sc.keeper.lean === 0
          ? 'Goleiro'
          : `Goleiro inclinado para a ${sc.keeper.lean < 0 ? 'esquerda' : 'direita'} da imagem`,
      ),
    ),
  );
  if (sc.blocker) {
    const b = sc.blocker;
    svg.append(
      s(
        'rect',
        {
          x: b.x - b.w / 2,
          y: Y(b.h),
          width: b.w,
          height: b.h,
          rx: 0.12,
          fill: 'rgba(255,90,90,0.75)',
        },
        s('title', null, 'Defensor bloqueando'),
      ),
    );
  }
  // Traves e travessão.
  svg.append(
    s('line', { x1: 0, y1: Y(0), x2: 0, y2: Y(H), stroke: '#fff', 'stroke-width': 0.1 }),
    s('line', { x1: W, y1: Y(0), x2: W, y2: Y(H), stroke: '#fff', 'stroke-width': 0.1 }),
    s('line', { x1: -0.05, y1: Y(H), x2: W + 0.05, y2: Y(H), stroke: '#fff', 'stroke-width': 0.1 }),
  );
  const ballStart = { x: W / 2, y: Y(0) + 0.9 };
  const ball = s('circle', {
    cx: ballStart.x,
    cy: ballStart.y,
    r: 0.13,
    fill: '#fff',
    stroke: '#111',
    'stroke-width': 0.03,
  });
  svg.append(ball);
  const t0 = performance.now();
  let locked = false;
  const shoot = (point: Vec | null) => {
    if (locked) return;
    locked = true;
    bar.stop();
    const result = evaluateShot(sc, point, point ? performance.now() - t0 : undefined);
    if (result.point) {
      const target = { x: result.point.x, y: Y(result.point.y) };
      const color = result.success ? '#3ddc84' : '#ff5a5a';
      svg.append(
        s('circle', {
          cx: target.x,
          cy: target.y,
          r: 0.15,
          fill: 'none',
          stroke: color,
          'stroke-width': 0.05,
        }),
      );
      if (prefersReducedMotion()) {
        ball.setAttribute('cx', String(target.x));
        ball.setAttribute('cy', String(target.y));
        finish(result);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 450);
        ball.setAttribute('cx', String(ballStart.x + (target.x - ballStart.x) * t));
        ball.setAttribute('cy', String(ballStart.y + (target.y - ballStart.y) * t));
        ball.setAttribute('r', String(0.13 - 0.04 * t));
        if (t < 1 && !rc.signal.aborted) requestAnimationFrame(step);
        else finish(result);
      };
      requestAnimationFrame(step);
    } else {
      finish(result);
    }
    grid.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
  };
  svg.addEventListener('pointerdown', (e) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    shoot({ x: p.x, y: H - p.y });
  });
  const bar = timeBar(sc.timeLimitMs, rc.signal, () => shoot(null));
  const rows: [string, number][] = [
    ['Alto', 0.82],
    ['Meio', 0.5],
    ['Rasteiro', 0.12],
  ];
  const cols: [string, number][] = [
    ['esquerda', 0.12],
    ['centro', 0.5],
    ['direita', 0.88],
  ];
  const grid = h(
    'div',
    { class: 'reaction-pad', role: 'group', 'aria-label': 'Escolher região do chute' },
    rows.flatMap(([rl, ry]) =>
      cols.map(([cl, cx]) =>
        button(`${rl} ${cl}`, () => shoot({ x: W * cx, y: H * ry }), { small: true }),
      ),
    ),
  );
  rc.stage.replaceChildren(
    h('div', { class: 'field-wrap', style: { background: '#1c3a2b' } }, svg),
    bar.el,
    h(
      'p',
      { class: 'small muted' },
      'Toque no ponto do gol onde quer chutar — ou use os botões de região.',
    ),
    grid,
  );
}

export const RUNNERS: Record<SimModeId, (rc: RoundContext) => void> = {
  passe_brecha: runPass,
  dominio_orientado: runControl,
  olhe_antes: runScan,
  decisao_rapida: runDecision,
  reacao_pressao: runReaction,
  finalizacao: runShot,
};
