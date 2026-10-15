/**
 * Câmera ao vivo. Modos:
 * - Treino livre: a câmera é só um espelho; cronômetro e contagem manual (nenhuma análise automática).
 * - Reação com movimento: detecção de movimento por diferença de quadros (real), mede o tempo
 *   até o jogador se mover para o lado indicado. Não reconhece pessoas, bola nem adversários.
 * - Pose ao vivo (experimental): só aparece se o detector de pose estiver instalado.
 */
import { EXERCISES } from '../../content/exercises.ts';
import { clock, millis, percent } from '../../core/format.ts';
import {
  baselineIsNoisy,
  computeBaseline,
  frameDiff,
  OnsetDetector,
  type Baseline,
  type GrayFrame,
  type MotionSample,
} from '../../core/motion.ts';
import { computePoseMetrics } from '../../core/poseMetrics.ts';
import { createRng, freshSeed } from '../../core/rng.ts';
import { logCameraReaction, logExercise, type ReactionTrial } from '../../core/sessionLog.ts';
import { CameraController, type Facing, type Resolution } from '../../media/camera.ts';
import { FrameSampler, frameLoop } from '../../media/frames.ts';
import type { MediaProblem } from '../../media/mediaErrors.ts';
import {
  checkPoseAvailability,
  drawPose,
  loadPoseDetector,
  type PoseDetector,
} from '../../media/pose.ts';
import type { AppContext } from '../app.ts';
import { button, card, field, linkButton, pageHeader, pill, select } from '../components.ts';
import { h, replaceChildren } from '../dom.ts';
import type { Screen } from '../router.ts';
import { Stopwatch } from '../timers.ts';

type Mode = 'livre' | 'reacao' | 'pose';
const DEFAULT_TRIALS = 8;
const RESPONSE_WINDOW_MS = 2500;
const MIN_HUMAN_REACTION_MS = 100;

function problemCard(p: MediaProblem): HTMLElement {
  return card(
    { title: p.title, tone: 'danger' },
    h('p', null, p.message),
    h(
      'ol',
      null,
      p.steps.map((s) => h('li', null, s)),
    ),
  );
}

export async function cameraScreen(ctx: AppContext, query: URLSearchParams): Promise<Screen> {
  // Tentativas válidas por série (padrão 8; ?tentativas=N permite séries curtas).
  const requestedTrials = Number(query.get('tentativas'));
  const TRIALS =
    Number.isInteger(requestedTrials) && requestedTrials >= 1 && requestedTrials <= 20
      ? requestedTrials
      : DEFAULT_TRIALS;
  const camera = new CameraController();
  const unsupported = CameraController.support();
  const video = h('video', {
    muted: true,
    playsInline: true,
    autoplay: true,
    'aria-label': 'Imagem da câmera ao vivo',
  });
  const overlay = h('canvas', { class: 'overlay', 'aria-hidden': 'true' });
  const statusBox = h('div', { 'aria-live': 'polite' });
  const modeBox = h('div', { class: 'stack' });
  const meterLeft = h('span');
  const meterRight = h('span');
  const meter = h(
    'div',
    { class: 'meter', 'aria-hidden': 'true' },
    h(
      'div',
      null,
      h('div', { class: 'small muted' }, 'Movimento à esquerda'),
      h('div', { class: 'bar' }, meterLeft),
    ),
    h(
      'div',
      null,
      h('div', { class: 'small muted' }, 'Movimento à direita'),
      h('div', { class: 'bar' }, meterRight),
    ),
  );
  let stopLoop: (() => void) | null = null;
  let mode: Mode = 'livre';
  let poseDetector: PoseDetector | null = null;
  const cleanups: (() => void)[] = [];

  const facingSelect = select<Facing>(
    [
      { value: 'user', label: 'Frontal (tela virada para você)' },
      { value: 'environment', label: 'Traseira' },
    ],
    'user',
    'cam-facing',
  );
  const resolutionSelect = select<Resolution>(
    [
      { value: 'baixa', label: 'Baixa (640×480) — mais leve' },
      { value: 'media', label: 'Média (1280×720)' },
    ],
    'baixa',
    'cam-res',
  );
  const fpsSelect = select(
    [
      { value: '10', label: '10 análises por segundo' },
      { value: '15', label: '15 análises por segundo' },
      { value: '5', label: '5 por segundo (aparelhos modestos)' },
    ],
    '15',
    'cam-fps',
  );
  const facingPlayer = h('input', { type: 'checkbox', checked: true });

  const permissionInfo = h('p', { class: 'small muted' });
  void (async () => {
    try {
      const status = await navigator.permissions?.query({ name: 'camera' as PermissionName });
      if (!status) return;
      const show = () => {
        permissionInfo.textContent = `Permissão da câmera neste navegador: ${status.state === 'granted' ? 'concedida' : status.state === 'denied' ? 'negada (libere nas configurações do site)' : 'será pedida quando você ligar a câmera'}.`;
      };
      show();
      status.onchange = show;
      cleanups.push(() => (status.onchange = null));
    } catch {
      // Navegador sem a API de permissões: o pedido aparece ao ligar a câmera.
    }
  })();

  const stopProcessing = () => {
    stopLoop?.();
    stopLoop = null;
  };

  const updateIndicator = () => {
    ctx.setHeaderStatus('camera', camera.active ? pill('Câmera ligada', 'live') : null);
  };

  const stopCamera = () => {
    stopProcessing();
    camera.stop();
    overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  };

  const drawStatus = () => {
    updateIndicator();
    const mirror = facingSelect.value === 'user';
    video.classList.toggle('mirror', mirror);
    overlay.classList.toggle('mirror', mirror);
    if (camera.state === 'erro' && camera.problem) {
      replaceChildren(statusBox, problemCard(camera.problem));
    } else if (camera.problem) {
      replaceChildren(statusBox, problemCard(camera.problem));
    } else if (camera.state === 'solicitando') {
      replaceChildren(statusBox, h('p', null, 'Aguardando a permissão da câmera…'));
    } else if (camera.active) {
      const s = camera.settings();
      replaceChildren(
        statusBox,
        h(
          'p',
          { class: 'small' },
          pill('Câmera ligada', 'live'),
          ` ${s?.width ?? '?'}×${s?.height ?? '?'} · nada é gravado ou enviado.`,
        ),
      );
    } else {
      replaceChildren(statusBox, h('p', { class: 'small muted' }, 'Câmera desligada.'));
    }
    startBtn.disabled = camera.state === 'solicitando';
    startBtn.textContent = camera.active ? 'Desligar câmera' : 'Ligar câmera';
    startBtn.classList.toggle('danger', camera.active);
    startBtn.classList.toggle('primary', !camera.active);
  };
  cleanups.push(camera.onChange(drawStatus));

  const startBtn = button(
    'Ligar câmera',
    async () => {
      if (camera.active) {
        stopCamera();
        renderMode();
        return;
      }
      ctx.feedback.unlock();
      const ok = await camera.start(video, {
        facing: facingSelect.value as Facing,
        resolution: resolutionSelect.value as Resolution,
      });
      if (ok) {
        overlay.width = video.videoWidth || 640;
        overlay.height = video.videoHeight || 480;
      }
      renderMode();
    },
    { variant: 'primary', big: true },
  );

  // Ao trocar de câmera com ela ligada, reinicia com a nova escolha.
  for (const control of [facingSelect, resolutionSelect]) {
    control.addEventListener('change', async () => {
      if (!camera.active) {
        drawStatus();
        return;
      }
      stopCamera();
      await camera.start(video, {
        facing: facingSelect.value as Facing,
        resolution: resolutionSelect.value as Resolution,
      });
      renderMode();
    });
  }

  // ——— Treino livre ———
  const freeMode = () => {
    const options = EXERCISES.filter((e) => !e.teste);
    const exerciseSelect = select(
      options.map((e) => ({ value: e.id, label: e.nome })),
      options[0]?.id ?? '',
      'cam-exercicio',
    );
    const watch = new Stopwatch();
    let ok = 0;
    let total = 0;
    const counter = h('p', { class: 'big-number', 'aria-live': 'polite' }, '0 / 0');
    const timer = h('span', { class: 'timer' }, '0:00');
    const criterion = h('p', { class: 'small' });
    const showCriterion = () => {
      const e = options.find((x) => x.id === exerciseSelect.value);
      criterion.textContent = e ? `Critério de sucesso: ${e.criterioSucesso}` : '';
    };
    exerciseSelect.addEventListener('change', showCriterion);
    showCriterion();
    const tick = window.setInterval(
      () => (timer.textContent = clock(watch.elapsedMs() / 1000)),
      500,
    );
    cleanups.push(() => window.clearInterval(tick));
    const mark = (success: boolean) => {
      if (!watch.running) watch.start();
      total++;
      if (success) {
        ok++;
        ctx.feedback.tick();
      } else ctx.feedback.error();
      counter.textContent = `${ok} / ${total}`;
    };
    return card(
      { title: 'Treino livre (contagem manual)' },
      h(
        'p',
        { class: 'small muted' },
        'Aqui a câmera funciona só como espelho para você se observar. Nenhuma análise automática é feita neste modo: você conta os acertos.',
      ),
      field('Exercício', exerciseSelect),
      criterion,
      h('div', { class: 'row spread' }, counter, timer),
      h(
        'div',
        { class: 'counter-pad' },
        button('✓ Acerto', () => mark(true), { variant: 'success', big: true }),
        button('✗ Erro', () => mark(false), { variant: 'fail', big: true }),
      ),
      h(
        'div',
        { class: 'row', style: { marginTop: '8px' } },
        button(
          watch.running ? 'Pausar' : 'Iniciar cronômetro',
          (e) => {
            if (watch.running) watch.pause();
            else watch.start();
            (e.currentTarget as HTMLButtonElement).textContent = watch.running
              ? 'Pausar'
              : 'Iniciar cronômetro';
          },
          { small: true },
        ),
        button(
          'Salvar sessão',
          async () => {
            const exercise = options.find((x) => x.id === exerciseSelect.value);
            if (!exercise || total === 0) {
              ctx.toast('Registre pelo menos uma tentativa.', 'info');
              return;
            }
            watch.pause();
            const end = ctx.now();
            const logged = logExercise({
              exercise,
              startedAt: new Date(end.getTime() - watch.elapsedMs()),
              endedAt: end,
              activeSec: Math.round(watch.elapsedMs() / 1000),
              counted: true,
              attempts: total,
              successes: ok,
              seriesDone: 1,
              seriesTotal: 1,
              notes: 'Treino livre com a câmera como espelho.',
            });
            await ctx.repo.saveSession(logged.session, logged.results);
            ctx.toast('Sessão salva no histórico.', 'sucesso');
            ok = 0;
            total = 0;
            watch.reset();
            counter.textContent = '0 / 0';
          },
          { small: true, variant: 'primary' },
        ),
      ),
    );
  };

  // ——— Reação com movimento ———
  const reactionMode = () => {
    const sampler = new FrameSampler(80, 60);
    const stimulus = h(
      'div',
      { class: 'stimulus', role: 'status', 'aria-live': 'assertive' },
      'Pronto para começar',
    );
    const info = h('p', { class: 'small' });
    const results = h('ul', { class: 'list' });
    const controls = h('div', { class: 'row' });
    let baseline: Baseline | null = null;
    let prev: GrayFrame | null = null;
    let phase: 'parado' | 'calibrando' | 'espera' | 'sinal' | 'pausa' | 'fim' = 'parado';
    const calibration: number[] = [];
    const trials: ReactionTrial[] = [];
    let expected: 'esquerda' | 'direita' = 'esquerda';
    let stimulusAt = 0;
    let phaseTimer: number | null = null;
    let detector: OnsetDetector | null = null;
    let rng = createRng(freshSeed());
    const startedAt = ctx.now();

    const clearPhaseTimer = () => {
      if (phaseTimer !== null) window.clearTimeout(phaseTimer);
      phaseTimer = null;
    };
    cleanups.push(clearPhaseTimer);

    const onSample = (sample: MotionSample, now: number) => {
      meterLeft.style.width = `${Math.min(100, sample.leftRatio * 400)}%`;
      meterRight.style.width = `${Math.min(100, sample.rightRatio * 400)}%`;
      if (phase === 'calibrando') {
        calibration.push(sample.ratio);
        return;
      }
      if ((phase === 'espera' || phase === 'sinal') && detector) {
        const onset = detector.push(sample, now);
        if (!onset) return;
        if (phase === 'espera' || onset.time - stimulusAt < MIN_HUMAN_REACTION_MS) {
          finishTrial({ expected, detected: onset.side, reactionMs: null, falseStart: true });
        } else {
          finishTrial({
            expected,
            detected: onset.side,
            reactionMs: onset.time - stimulusAt,
            falseStart: false,
          });
        }
      }
    };

    const ensureLoop = () => {
      if (stopLoop) return;
      prev = null;
      stopLoop = frameLoop(video, Number(fpsSelect.value), (now) => {
        const frame = sampler.grab(video);
        if (!frame) return;
        if (prev) onSample(frameDiff(prev, frame, 25, facingPlayer.checked), now);
        prev = frame;
      });
    };

    // Som diferente para cada lado: útil com a câmera traseira (tela virada para fora).
    const cue = (dir: 'esquerda' | 'direita') => ctx.feedback.directional(dir);

    const nextTrial = () => {
      const valid = trials.filter((t) => !t.falseStart && t.detected !== 'indefinido').length;
      if (valid >= TRIALS) {
        void finishSession();
        return;
      }
      phase = 'espera';
      expected = rng.chance(0.5) ? 'esquerda' : 'direita';
      detector = new OnsetDetector({ threshold: baseline?.threshold ?? 0.02, consecutive: 2 });
      stimulus.classList.remove('go');
      stimulus.textContent = 'Fique parado… espere o sinal';
      const wait = Math.round(rng.range(1500, 3500));
      phaseTimer = window.setTimeout(() => {
        if (phase !== 'espera') return;
        phase = 'sinal';
        detector?.reset();
        stimulus.textContent = expected === 'esquerda' ? '⬅ ESQUERDA' : 'DIREITA ➡';
        stimulus.classList.add('go');
        cue(expected);
        stimulusAt = performance.now();
        // Refina para o quadro em que o sinal foi de fato desenhado.
        requestAnimationFrame(() => {
          stimulusAt = performance.now();
        });
        phaseTimer = window.setTimeout(() => {
          if (phase === 'sinal')
            finishTrial({ expected, detected: null, reactionMs: null, falseStart: false });
        }, RESPONSE_WINDOW_MS);
      }, wait);
    };

    const finishTrial = (trial: ReactionTrial) => {
      clearPhaseTimer();
      trials.push(trial);
      phase = 'pausa';
      stimulus.classList.remove('go');
      let text: string;
      if (trial.falseStart) text = 'Saiu antes do sinal — tentativa repetida.';
      else if (trial.detected === null) text = 'Nenhum movimento detectado a tempo.';
      else if (trial.detected === 'indefinido')
        text = 'Movimento dos dois lados — tentativa anulada. Desloque-se claramente para um lado.';
      else if (trial.detected === trial.expected) text = `Certo! ${millis(trial.reactionMs ?? 0)}`;
      else text = `Lado errado (detectado: ${trial.detected}).`;
      stimulus.textContent = text;
      if (!trial.falseStart && trial.detected === trial.expected) ctx.feedback.success();
      else ctx.feedback.error();
      results.prepend(
        h('li', { class: 'small' }, `${trials.length}. Sinal: ${trial.expected} → ${text}`),
      );
      // Três saídas antecipadas seguidas: provavelmente há movimento no fundo da cena.
      const lastThree = trials.slice(-3);
      if (lastThree.length === 3 && lastThree.every((t) => t.falseStart)) {
        phase = 'parado';
        stimulus.textContent =
          'Três movimentos antes do sinal seguidos. Fique totalmente parado até a seta aparecer e confira se nada se mexe ao fundo (pessoas, cortinas, luz piscando).';
        replaceChildren(
          controls,
          button('Calibrar e tentar de novo', () => startSeries(), { variant: 'primary' }),
        );
        return;
      }
      phaseTimer = window.setTimeout(nextTrial, 2200);
    };

    const finishSession = async () => {
      phase = 'fim';
      clearPhaseTimer();
      const logged = logCameraReaction({
        startedAt,
        endedAt: ctx.now(),
        trials,
        facing: facingSelect.value === 'user' ? 'frontal' : 'traseira',
      });
      const sum = logged.session.summary;
      stimulus.textContent = 'Fim da série';
      try {
        if (logged.results.length) await ctx.repo.saveSession(logged.session, logged.results);
        info.textContent =
          sum && sum.attempts
            ? `${sum.successes}/${sum.attempts} reações no lado certo (${percent(sum.successes / sum.attempts)})${sum.avgResponseMs ? `, tempo médio ${millis(sum.avgResponseMs)}` : ''}. Salvo no histórico (métrica calculada por detecção de movimento; inclui o atraso da câmera).`
            : 'Nenhuma tentativa válida para salvar.';
      } catch (error) {
        info.textContent = `Não foi possível salvar: ${error instanceof Error ? error.message : String(error)}`;
      }
      replaceChildren(
        controls,
        button('Nova série', () => startSeries(), { variant: 'primary' }),
      );
    };

    const startSeries = () => {
      if (!camera.active) {
        ctx.toast('Ligue a câmera primeiro.', 'info');
        return;
      }
      trials.length = 0;
      replaceChildren(results);
      rng = createRng(freshSeed());
      calibration.length = 0;
      phase = 'calibrando';
      stimulus.classList.remove('go');
      stimulus.textContent = 'Calibrando: fique parado por 2 segundos…';
      ensureLoop();
      replaceChildren(
        controls,
        button(
          'Parar série',
          () => {
            clearPhaseTimer();
            phase = 'parado';
            stimulus.textContent = 'Série interrompida';
            replaceChildren(
              controls,
              button('Começar série', () => startSeries(), { variant: 'primary' }),
            );
          },
          { variant: 'ghost' },
        ),
      );
      phaseTimer = window.setTimeout(() => {
        baseline = computeBaseline(calibration);
        if (baseline.samples < 5) {
          phase = 'parado';
          stimulus.textContent = 'Poucos quadros recebidos da câmera. Tente a resolução baixa.';
          replaceChildren(
            controls,
            button('Tentar de novo', () => startSeries(), { variant: 'primary' }),
          );
          return;
        }
        if (baselineIsNoisy(baseline)) {
          phase = 'parado';
          stimulus.textContent =
            'Muito movimento com você parado: apoie o celular, evite luz piscando e pessoas passando ao fundo.';
          replaceChildren(
            controls,
            button('Calibrar de novo', () => startSeries(), { variant: 'primary' }),
          );
          return;
        }
        info.textContent = `Calibração: ruído de ${percent(baseline.mean, 1)} dos pixels; limiar de movimento ${percent(baseline.threshold, 1)}.`;
        nextTrial();
      }, 2000);
    };

    replaceChildren(
      controls,
      button('Começar série', () => startSeries(), { variant: 'primary' }),
    );
    cleanups.push(() => {
      phase = 'fim';
    });
    return card(
      { title: 'Reação com movimento (detecção automática)' },
      h(
        'ol',
        { class: 'small' },
        h(
          'li',
          null,
          'Apoie o celular parado, de pé, a 2–3 m de você, com o corpo inteiro na imagem.',
        ),
        h(
          'li',
          null,
          'Use a câmera frontal para ver as setas na tela. Com a traseira, siga o som: grave = esquerda, agudo = direita.',
        ),
        h('li', null, 'Quando o sinal aparecer, dê 2 passos rápidos para o lado indicado.'),
      ),
      h(
        'label',
        { class: 'choice' },
        facingPlayer,
        h('span', null, 'Estou de frente para a câmera (esquerda/direita do meu ponto de vista)'),
      ),
      stimulus,
      meter,
      info,
      controls,
      h(
        'p',
        { class: 'small muted' },
        `Como funciona: o aplicativo compara quadros e mede em qual metade da imagem os pixels mudaram primeiro. Tentativas: ${TRIALS} válidas por série. Qualquer movimento grande no fundo atrapalha. Não identifica você, a bola ou adversários.`,
      ),
      results,
    );
  };

  // ——— Pose ao vivo (experimental) ———
  const poseMode = () => {
    const out = h('div', { class: 'small', 'aria-live': 'polite' }, 'Carregando o detector…');
    void (async () => {
      try {
        poseDetector = poseDetector ?? (await loadPoseDetector());
      } catch (error) {
        replaceChildren(
          out,
          problemCard({
            code: 'pose',
            title: 'Detector de pose indisponível',
            message: error instanceof Error ? error.message : String(error),
            steps: ['Use os outros modos da câmera.'],
          }),
        );
        return;
      }
      stopProcessing();
      const octx = overlay.getContext('2d');
      stopLoop = frameLoop(video, Math.min(10, Number(fpsSelect.value)), (now) => {
        if (!poseDetector) return;
        overlay.width = video.videoWidth || overlay.width;
        overlay.height = video.videoHeight || overlay.height;
        const lms = poseDetector.detect(video, now);
        if (!lms) {
          octx?.clearRect(0, 0, overlay.width, overlay.height);
          out.textContent = 'Nenhuma pessoa detectada.';
          return;
        }
        if (octx) drawPose(octx, lms, overlay.width, overlay.height);
        const lean = computePoseMetrics(lms, overlay.width / Math.max(1, overlay.height)).find(
          (m) => m.id === 'inclinacao_tronco',
        );
        out.textContent =
          lean?.reliable && lean.value !== null
            ? `Inclinação do tronco: ${Math.round(lean.value)}° (confiança ${percent(lean.confidence)})`
            : 'Pontos pouco visíveis: medida não confiável neste momento.';
      });
    })();
    return card(
      { title: 'Pose ao vivo (experimental)' },
      h(
        'p',
        { class: 'small muted' },
        'Desenha pontos do corpo estimados pelo modelo. Não reconhece ações de futebol, bola ou adversários, e não foi validado em aparelho real.',
      ),
      out,
    );
  };

  const modeTabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Modo da câmera' });
  let poseAvailable = false;
  const renderTabs = () => {
    const modes: { id: Mode; label: string }[] = [
      { id: 'livre', label: 'Treino livre' },
      { id: 'reacao', label: 'Reação com movimento' },
      ...(poseAvailable ? [{ id: 'pose' as Mode, label: 'Pose (experimental)' }] : []),
    ];
    replaceChildren(
      modeTabs,
      modes.map((m) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'btn small',
            'aria-selected': String(m.id === mode),
            onclick: () => {
              mode = m.id;
              renderTabs();
              renderMode();
            },
          },
          m.label,
        ),
      ),
    );
  };
  const renderMode = () => {
    stopProcessing();
    overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    meterLeft.style.width = '0';
    meterRight.style.width = '0';
    if (!camera.active) {
      replaceChildren(
        modeBox,
        h('p', { class: 'muted' }, 'Ligue a câmera para usar os modos de treino.'),
      );
      return;
    }
    replaceChildren(
      modeBox,
      mode === 'livre' ? freeMode() : mode === 'reacao' ? reactionMode() : poseMode(),
    );
  };
  void checkPoseAvailability().then((a) => {
    poseAvailable = a.available;
    renderTabs();
  });

  // Ao sair da tela (trocar de aplicativo, bloquear o celular), a câmera é desligada.
  const onVisibility = () => {
    if (document.hidden && camera.active) {
      stopCamera();
      renderMode();
      ctx.toast('Câmera desligada porque o aplicativo saiu da tela.', 'info', 5000);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

  renderTabs();
  drawStatus();
  renderMode();

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader('Câmera ao vivo', 'A câmera só liga quando você pede. Nada é gravado nem enviado.', {
      href: '#/mais',
      label: 'Mais',
    }),
    unsupported
      ? problemCard(unsupported)
      : card(
          null,
          h('div', { class: 'media-box' }, video, overlay),
          statusBox,
          startBtn,
          permissionInfo,
          h(
            'details',
            null,
            h('summary', null, 'Ajustes da câmera'),
            field('Câmera', facingSelect),
            field('Resolução', resolutionSelect),
            field('Frequência de análise', fpsSelect),
          ),
        ),
    unsupported ? null : modeTabs,
    unsupported ? null : modeBox,
    card(
      { title: 'Importante', headingLevel: 2 },
      h(
        'ul',
        { class: 'small' },
        h(
          'li',
          null,
          'Detectar movimento (ou o corpo) não é o mesmo que reconhecer adversários ou espaços livres no campo.',
        ),
        h(
          'li',
          null,
          'Tempos medidos pela câmera incluem o atraso do próprio aparelho: compare só com você mesmo.',
        ),
        h('li', null, 'Treine em local seguro, longe de móveis e de pessoas.'),
      ),
      linkButton('#/sobre', 'Sobre e limitações', { small: true, variant: 'ghost' }),
    ),
  );

  return {
    title: 'Câmera',
    el,
    destroy: () => {
      stopCamera();
      ctx.setHeaderStatus('camera', null);
      poseDetector?.close();
      poseDetector = null;
      cleanups.forEach((c) => c());
    },
  };
}
