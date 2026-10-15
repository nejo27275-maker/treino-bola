/**
 * Vídeos: importação local, navegação quadro a quadro, marcação de momentos, captura de
 * quadros, mapa de movimento (métrica calculada), pose opcional e avaliação guiada (manual).
 */
import { RATING_LABEL, VIDEO_CRITERIA, ratingToEvidence } from '../../content/videoCriteria.ts';
import { formatDayMonth } from '../../core/dates.ts';
import { bytes, decimal, percent, videoTime } from '../../core/format.ts';
import { newId } from '../../core/ids.ts';
import {
  computePoseMetrics,
  summarizePoseSeries,
  type PoseMetric,
} from '../../core/poseMetrics.ts';
import { logVideoAnalysis } from '../../core/sessionLog.ts';
import type {
  CriterionRating,
  FrameCapture,
  VideoAnalysis,
  VideoMarker,
} from '../../core/types.ts';
import { checkVideoFile, describeVideoError, type MediaProblem } from '../../media/mediaErrors.ts';
import {
  checkPoseAvailability,
  drawPose,
  loadPoseDetector,
  type PoseDetector,
} from '../../media/pose.ts';
import {
  AbortedError,
  captureFrame,
  computeMotionMap,
  seekTo,
  type MotionMap,
} from '../../media/videoTools.ts';
import type { AppContext } from '../app.ts';
import {
  button,
  card,
  field,
  pageHeader,
  pill,
  progress,
  select,
  showFocusOnLabel,
} from '../components.ts';
import { h, replaceChildren, s } from '../dom.ts';
import type { Screen } from '../router.ts';

const MARKER_LABELS = [
  'Domínio',
  'Passe',
  'Condução',
  'Drible',
  'Finalização',
  'Proteção',
  'Outro',
];
const RATINGS: CriterionRating[] = ['bom', 'parcial', 'melhorar', 'nao_visivel'];
const FRAME_STEP = 1 / 30;

interface LocalFrame {
  id: string;
  timeSec: number;
  blob: Blob;
  url: string;
}

function problemCard(p: MediaProblem): HTMLElement {
  return card(
    { title: p.title, tone: 'danger' },
    h('p', null, p.message),
    h(
      'ul',
      null,
      p.steps.map((s) => h('li', null, s)),
    ),
  );
}

/** Resumo salvo da análise de pose, sempre identificado como automático e experimental. */
function poseSummaryLine(sum: Record<string, number>): HTMLElement {
  const parts = [
    `${sum.quadros ?? 0} quadro(s), ${sum.quadrosConfiaveis ?? 0} confiável(is)`,
    sum.inclinacaoMedia !== undefined ? `tronco ${decimal(sum.inclinacaoMedia, 1)}°` : null,
    sum.variacaoTronco !== undefined ? `variação ${decimal(sum.variacaoTronco, 1)}°` : null,
    sum.flexaoJoelhos !== undefined ? `joelhos ${decimal(sum.flexaoJoelhos, 1)}°` : null,
  ].filter(Boolean);
  return h('p', { class: 'small' }, `Pose (automática, experimental): ${parts.join(' · ')}.`);
}

function motionChart(map: MotionMap, duration: number, onSeek: (t: number) => void): SVGSVGElement {
  const W = 320;
  const H = 90;
  const max = Math.max(0.02, ...map.values);
  const bw = Math.max(1, W / Math.max(1, map.values.length) - 0.5);
  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': 'Mapa de movimento ao longo do vídeo (barras mais altas = mais pixels mudando).',
  });
  map.values.forEach((v, i) => {
    const x = ((map.times[i] ?? 0) / duration) * W;
    const hgt = Math.max(1, (v / max) * (H - 14));
    svg.append(
      s('rect', { x, y: H - 12 - hgt, width: bw, height: hgt, rx: 1, fill: 'var(--series-1)' }),
    );
  });
  for (const p of map.peaks) {
    const x = (p.time / duration) * W;
    svg.append(
      s('line', {
        x1: x,
        x2: x,
        y1: 0,
        y2: H - 12,
        stroke: 'var(--warn)',
        'stroke-width': 1,
        'stroke-dasharray': '3 2',
      }),
    );
  }
  svg.append(
    s('text', { x: 0, y: H - 1 }, '0 s'),
    s('text', { x: W, y: H - 1, 'text-anchor': 'end' }, `${decimal(duration, 1)} s`),
  );
  svg.addEventListener('pointerdown', (e) => {
    const rect = svg.getBoundingClientRect();
    onSeek(((e.clientX - rect.left) / rect.width) * duration);
  });
  return svg;
}

export async function videoScreen(ctx: AppContext): Promise<Screen> {
  /** Início da avaliação atual (abrir um vídeo ou salvar começa uma nova). */
  let startedAt = ctx.now();
  let objectUrl: string | null = null;
  let fileName = '';
  let markers: VideoMarker[] = [];
  let frames: LocalFrame[] = [];
  let ratings: Record<string, CriterionRating> = {};
  let motion: MotionMap | null = null;
  let motionAbort: AbortController | null = null;
  let detector: PoseDetector | null = null;
  let poseSummary: Record<string, number> | null = null;
  let dirty = false;
  const historyUrls: string[] = [];

  const video = h('video', {
    playsInline: true,
    preload: 'metadata',
    'aria-label': 'Vídeo selecionado',
  });
  video.muted = true;
  const overlay = h('canvas', { class: 'overlay', 'aria-hidden': 'true' });
  const timeLabel = h(
    'span',
    { class: 'timer', style: { fontSize: '1.05rem' }, 'aria-live': 'off' },
    '00:00,0 / 00:00,0',
  );
  const timeline = h('input', {
    type: 'range',
    min: 0,
    max: 0,
    step: 0.01,
    value: 0,
    'aria-label': 'Linha do tempo do vídeo',
    disabled: true,
  });
  const playBtn = button('▶ Reproduzir', () => togglePlay(), { variant: 'primary' });
  const speed = select(
    [
      { value: '1', label: 'Velocidade 1×' },
      { value: '0.5', label: 'Velocidade 0,5×' },
      { value: '0.25', label: 'Velocidade 0,25×' },
    ],
    '1',
    'vel-video',
  );
  speed.setAttribute('aria-label', 'Velocidade de reprodução');
  const infoEl = h('p', { class: 'small muted', 'aria-live': 'polite' });
  const errorBox = h('div');
  const playerCard = h('section', { class: 'card stack', hidden: true });
  const toolsBox = h('div', { class: 'stack', hidden: true });
  const markersList = h('ul', { class: 'list' });
  const framesBox = h('div', { class: 'thumbs' });
  const saveFrames = h('input', { type: 'checkbox' });
  const motionBox = h('div', { class: 'stack', 'aria-live': 'polite' });
  const poseBox = h('div', { class: 'stack', 'aria-live': 'polite' });
  const evalBox = h('div', { class: 'stack' });
  const notes = h('textarea', {
    maxlength: 2000,
    placeholder: 'O que você observou? O que treinar a seguir?',
  });
  const historyBox = h('div', { class: 'stack' });

  const updateTime = () => {
    const d = Number.isFinite(video.duration) ? video.duration : 0;
    timeLabel.textContent = `${videoTime(video.currentTime)} / ${videoTime(d)}`;
    if (document.activeElement !== timeline) timeline.value = String(video.currentTime);
  };
  const togglePlay = () => {
    if (!objectUrl) return;
    if (video.paused)
      void video
        .play()
        .catch((e: unknown) =>
          ctx.toast(
            `Não foi possível reproduzir: ${e instanceof Error ? e.message : String(e)}`,
            'erro',
          ),
        );
    else video.pause();
  };
  const step = (delta: number) => {
    if (!objectUrl) return;
    video.pause();
    const d = Number.isFinite(video.duration) ? video.duration : 0;
    video.currentTime = Math.max(0, Math.min(d, video.currentTime + delta));
  };
  video.addEventListener('timeupdate', updateTime);
  video.addEventListener('seeked', updateTime);
  video.addEventListener('play', () => (playBtn.textContent = '⏸ Pausar'));
  video.addEventListener('pause', () => (playBtn.textContent = '▶ Reproduzir'));
  video.addEventListener('ended', () => (playBtn.textContent = '▶ Reproduzir'));
  const onReady = () => {
    const d = video.duration;
    const known = Number.isFinite(d) && d > 0;
    timeline.max = String(known ? d : 0);
    timeline.disabled = !known;
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 360;
    infoEl.textContent = `${fileName} · ${known ? videoTime(d) : 'duração desconhecida'} · ${video.videoWidth}×${video.videoHeight}`;
    playerCard.hidden = false;
    toolsBox.hidden = false;
    replaceChildren(errorBox);
    updateTime();
  };
  // Alguns WebM (ex.: gravados pelo navegador) não informam a duração no cabeçalho:
  // buscar um tempo enorme faz o navegador percorrer o arquivo e descobrir o fim.
  let resolvingDuration = false;
  video.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(video.duration)) {
      onReady();
      return;
    }
    resolvingDuration = true;
    const fallback = window.setTimeout(() => {
      if (!resolvingDuration) return;
      resolvingDuration = false;
      onReady();
    }, 4000);
    const onDuration = () => {
      if (!resolvingDuration || !Number.isFinite(video.duration)) return;
      resolvingDuration = false;
      window.clearTimeout(fallback);
      video.removeEventListener('durationchange', onDuration);
      video.currentTime = 0;
      onReady();
    };
    video.addEventListener('durationchange', onDuration);
    video.currentTime = 1e101;
  });
  video.addEventListener('error', () => {
    if (!objectUrl) return;
    replaceChildren(errorBox, problemCard(describeVideoError(video.error?.code)));
    playerCard.hidden = true;
    toolsBox.hidden = true;
  });
  timeline.addEventListener('input', () => {
    video.currentTime = Number(timeline.value);
  });
  speed.addEventListener('change', () => {
    video.playbackRate = Number(speed.value);
  });

  const releaseVideo = () => {
    motionAbort?.abort();
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    for (const f of frames) URL.revokeObjectURL(f.url);
    frames = [];
  };

  /**
   * Começa uma nova avaliação do mesmo vídeo depois de salvar: cada avaliação salva é um
   * registro próprio, então nada é contado duas vezes e os quadros não são compartilhados.
   */
  const startNewEvaluation = () => {
    markers = [];
    ratings = {};
    poseSummary = null;
    notes.value = '';
    dirty = false;
    for (const f of frames) URL.revokeObjectURL(f.url);
    frames = [];
    startedAt = ctx.now();
    drawMarkers();
    drawFrames();
    drawEval();
    void drawPoseSection();
    overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  };

  const resetAnalysis = () => {
    startedAt = ctx.now();
    markers = [];
    ratings = {};
    motion = null;
    poseSummary = null;
    notes.value = '';
    dirty = false;
    drawMarkers();
    drawFrames();
    drawEval();
    replaceChildren(motionBox, motionIntro());
    void drawPoseSection();
    overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
  };

  const openFile = (file: File | undefined) => {
    if (!file) return;
    const check = checkVideoFile(file);
    if (!check.ok && check.problem) {
      replaceChildren(errorBox, problemCard(check.problem));
      return;
    }
    releaseVideo();
    resetAnalysis();
    fileName = file.name;
    if (file.type && video.canPlayType(file.type) === '') {
      ctx.toast('Este navegador talvez não reproduza esse formato. Vamos tentar.', 'info', 5000);
    }
    if (check.warning) ctx.toast(check.warning, 'info', 6000);
    objectUrl = URL.createObjectURL(file);
    infoEl.textContent = `Abrindo ${file.name} (${bytes(file.size)})…`;
    video.src = objectUrl;
    video.load();
  };

  const galleryInput = h('input', {
    type: 'file',
    accept: 'video/*',
    class: 'visually-hidden',
    id: 'video-galeria',
  });
  const recordInput = h('input', {
    type: 'file',
    accept: 'video/*',
    capture: 'environment',
    class: 'visually-hidden',
    id: 'video-gravar',
  });
  const galleryLabel = h(
    'label',
    { for: 'video-galeria', class: 'btn primary' },
    'Escolher da galeria',
  );
  const recordLabel = h(
    'label',
    { for: 'video-gravar', class: 'btn' },
    'Gravar com a câmera do celular',
  );
  showFocusOnLabel(galleryInput, galleryLabel);
  showFocusOnLabel(recordInput, recordLabel);
  for (const input of [galleryInput, recordInput]) {
    input.addEventListener('change', () => {
      openFile(input.files?.[0]);
      input.value = '';
    });
  }

  // ——— Marcadores ———
  const markerLabel = select(
    MARKER_LABELS.map((l) => ({ value: l, label: l })),
    'Domínio',
    'marcador-rotulo',
  );
  const drawMarkers = () => {
    replaceChildren(
      markersList,
      markers.length
        ? [...markers]
            .sort((a, b) => a.timeSec - b.timeSec)
            .map((m) =>
              h(
                'li',
                { class: 'row spread' },
                h('span', null, `${videoTime(m.timeSec)} · ${m.label}`),
                h(
                  'span',
                  { class: 'row' },
                  button('Ir', () => void seekTo(video, m.timeSec).catch(() => {}), {
                    small: true,
                  }),
                  button(
                    'Remover',
                    () => {
                      markers = markers.filter((x) => x.id !== m.id);
                      drawMarkers();
                    },
                    { small: true, variant: 'ghost', ariaLabel: `Remover marcador ${m.label}` },
                  ),
                ),
              ),
            )
        : h('li', { class: 'muted small' }, 'Nenhum momento marcado.'),
    );
  };

  // ——— Quadros ———
  const drawFrames = () => {
    replaceChildren(
      framesBox,
      frames.map((f) =>
        h(
          'figure',
          null,
          h(
            'button',
            {
              type: 'button',
              class: 'btn ghost',
              style: { padding: '0', minHeight: '0' },
              onclick: () => void seekTo(video, f.timeSec).catch(() => {}),
              'aria-label': `Ir para ${videoTime(f.timeSec)}`,
            },
            h('img', { src: f.url, alt: `Quadro em ${videoTime(f.timeSec)}` }),
          ),
          h(
            'figcaption',
            null,
            videoTime(f.timeSec),
            ' ',
            h(
              'button',
              {
                type: 'button',
                class: 'chip',
                onclick: () => {
                  URL.revokeObjectURL(f.url);
                  frames = frames.filter((x) => x.id !== f.id);
                  drawFrames();
                },
                'aria-label': `Remover quadro de ${videoTime(f.timeSec)}`,
              },
              '✕',
            ),
          ),
        ),
      ),
    );
  };
  const capture = async () => {
    if (!objectUrl) return;
    if (frames.length >= 8) {
      ctx.toast('Limite de 8 quadros por avaliação.', 'info');
      return;
    }
    try {
      video.pause();
      const blob = await captureFrame(video, 640);
      frames.push({
        id: newId(),
        timeSec: video.currentTime,
        blob,
        url: URL.createObjectURL(blob),
      });
      dirty = true;
      drawFrames();
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : String(error), 'erro');
    }
  };

  // ——— Mapa de movimento ———
  const motionIntro = () =>
    h(
      'div',
      { class: 'stack' },
      h(
        'p',
        { class: 'small' },
        'Percorre o vídeo e mede quantos pixels mudam entre quadros para achar os trechos com mais ação. É uma métrica calculada: não reconhece bola, jogadores nem acertos.',
      ),
      button('Encontrar momentos com movimento', () => void runMotion(), { small: true }),
    );
  const runMotion = async () => {
    if (!objectUrl) return;
    motionAbort?.abort();
    motionAbort = new AbortController();
    const bar = h('div');
    const cancel = button('Cancelar', () => motionAbort?.abort(), {
      small: true,
      variant: 'ghost',
    });
    replaceChildren(motionBox, h('p', { class: 'small' }, 'Analisando…'), bar, cancel);
    try {
      motion = await computeMotionMap(video, {
        signal: motionAbort.signal,
        onProgress: (f) => replaceChildren(bar, progress(f, 'Progresso da análise de movimento')),
      });
      const d = video.duration;
      replaceChildren(
        motionBox,
        motionChart(motion, d, (t) => void seekTo(video, t).catch(() => {})),
        motion.peaks.length
          ? h(
              'div',
              { class: 'row' },
              h('span', { class: 'small' }, 'Momentos sugeridos:'),
              motion.peaks.map((p) =>
                button(videoTime(p.time), () => void seekTo(video, p.time).catch(() => {}), {
                  small: true,
                }),
              ),
            )
          : h(
              'p',
              { class: 'small muted' },
              'Nenhum pico de movimento claro (câmera muito tremida ou cena sem ação).',
            ),
        h(
          'p',
          { class: 'small muted' },
          `Amostras a cada ${decimal(motion.step, 2)} s. Câmera parada dá resultados melhores; tremidas e mudanças de luz também contam como movimento.`,
        ),
        button('Analisar de novo', () => void runMotion(), { small: true, variant: 'ghost' }),
      );
    } catch (error) {
      replaceChildren(
        motionBox,
        h(
          'p',
          { class: 'small' },
          error instanceof AbortedError
            ? 'Análise cancelada.'
            : `Falha na análise: ${error instanceof Error ? error.message : String(error)}`,
        ),
        motionIntro(),
      );
    }
  };

  // ——— Pose (opcional) ———
  const metricsTable = (metrics: PoseMetric[]) =>
    h(
      'table',
      { class: 'data-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, 'Métrica'),
          h('th', { scope: 'col' }, 'Valor'),
          h('th', { scope: 'col' }, 'Confiança'),
        ),
      ),
      h(
        'tbody',
        null,
        metrics.map((m) =>
          h(
            'tr',
            null,
            h('td', null, m.label, h('div', { class: 'small muted' }, m.explanation)),
            h('td', null, m.reliable && m.value !== null ? `${decimal(m.value, 1)}${m.unit}` : '—'),
            h(
              'td',
              null,
              m.reliable ? percent(m.confidence) : `insuficiente (${percent(m.confidence)})`,
            ),
          ),
        ),
      ),
    );
  const ensureDetector = async (): Promise<PoseDetector | null> => {
    if (detector) return detector;
    try {
      replaceChildren(
        poseBox,
        h('p', { class: 'small' }, 'Carregando o detector de pose (pode levar alguns segundos)…'),
      );
      detector = await loadPoseDetector();
      return detector;
    } catch (error) {
      replaceChildren(
        poseBox,
        card(
          { tone: 'danger', title: 'Detector de pose indisponível', headingLevel: 3 },
          h('p', null, error instanceof Error ? error.message : String(error)),
          h('p', { class: 'small' }, 'A avaliação guiada abaixo continua disponível.'),
        ),
      );
      return null;
    }
  };
  let poseBusy = false;
  const analyzeFrame = async () => {
    if (poseBusy) return;
    poseBusy = true;
    try {
      await analyzeFrameNow();
    } finally {
      poseBusy = false;
    }
  };
  const analyzeFrameNow = async () => {
    const det = await ensureDetector();
    if (!det || !objectUrl || detector !== det) return;
    video.pause();
    const lms = det.detect(video, performance.now());
    const octx = overlay.getContext('2d');
    if (!lms) {
      octx?.clearRect(0, 0, overlay.width, overlay.height);
      replaceChildren(
        poseBox,
        h(
          'p',
          null,
          'Nenhuma pessoa detectada neste quadro. Tente outro momento, com o corpo inteiro visível.',
        ),
        poseActions(),
      );
      return;
    }
    if (octx) drawPose(octx, lms, overlay.width, overlay.height);
    const metrics = computePoseMetrics(lms, (video.videoWidth || 16) / (video.videoHeight || 9));
    replaceChildren(
      poseBox,
      h(
        'p',
        { class: 'small' },
        `Detector: ${det.delegate}. Inferência automática experimental: são medidas 2D da imagem, dependem do ângulo da câmera e não reconhecem ações de futebol.`,
      ),
      metricsTable(metrics),
      poseActions(),
    );
  };
  const analyzeSegment = async () => {
    if (poseBusy) return;
    poseBusy = true;
    try {
      await analyzeSegmentNow();
    } finally {
      poseBusy = false;
    }
  };
  const analyzeSegmentNow = async () => {
    const det = await ensureDetector();
    const src = objectUrl;
    if (!det || !src) return;
    video.pause();
    const start = video.currentTime;
    const end = Math.min(video.duration, start + 3);
    const series: PoseMetric[][] = [];
    replaceChildren(poseBox, h('p', { class: 'small' }, 'Analisando o trecho…'));
    for (let t = start; t <= end; t += 0.3) {
      await seekTo(video, t).catch(() => {});
      // Saiu da tela ou trocou de vídeo no meio da análise: descarta o trecho.
      if (objectUrl !== src || detector !== det) return;
      const lms = det.detect(video, performance.now());
      if (lms)
        series.push(computePoseMetrics(lms, (video.videoWidth || 16) / (video.videoHeight || 9)));
    }
    const sum = summarizePoseSeries(series);
    poseSummary = {
      quadros: sum.frames,
      quadrosConfiaveis: sum.reliableFrames,
      ...(sum.trunkLeanMean !== null ? { inclinacaoMedia: sum.trunkLeanMean } : {}),
      ...(sum.trunkLeanStd !== null ? { variacaoTronco: sum.trunkLeanStd } : {}),
      ...(sum.kneeFlexMean !== null ? { flexaoJoelhos: sum.kneeFlexMean } : {}),
    };
    dirty = true;
    replaceChildren(
      poseBox,
      h(
        'p',
        null,
        `Trecho de ${videoTime(start)} a ${videoTime(end)}: ${sum.frames} quadro(s) com pessoa detectada, ${sum.reliableFrames} confiável(is).`,
      ),
      sum.stability === 'indefinido'
        ? h(
            'p',
            { class: 'small' },
            'Dados insuficientes para avaliar a estabilidade do tronco (são necessários 5 quadros confiáveis).',
          )
        : h(
            'p',
            null,
            `Tronco ${sum.stability === 'estavel' ? 'estável' : 'variável'}: inclinação média ${decimal(sum.trunkLeanMean ?? 0, 1)}°, variação ${decimal(sum.trunkLeanStd ?? 0, 1)}°.`,
          ),
      sum.kneeFlexMean !== null
        ? h('p', null, `Flexão média dos joelhos: ${decimal(sum.kneeFlexMean, 1)}°.`)
        : null,
      h(
        'p',
        { class: 'small muted' },
        'Métricas 2D experimentais. Use como pista para observar, não como diagnóstico.',
      ),
      poseActions(),
    );
  };
  const poseActions = () =>
    h(
      'div',
      { class: 'row' },
      button('Analisar pose neste quadro', () => void analyzeFrame(), { small: true }),
      button('Analisar 3 s a partir daqui', () => void analyzeSegment(), { small: true }),
    );
  const drawPoseSection = async () => {
    const availability = await checkPoseAvailability();
    if (!availability.available) {
      replaceChildren(
        poseBox,
        h(
          'p',
          { class: 'small' },
          `Detector de pose não instalado neste servidor (${availability.detail}). A detecção automática de pose não está disponível; use a avaliação guiada abaixo.`,
        ),
      );
      return;
    }
    replaceChildren(
      poseBox,
      h(
        'p',
        { class: 'small' },
        `Detector instalado (${availability.detail}), experimental e não validado em aparelho real.`,
      ),
      poseActions(),
    );
  };

  // ——— Avaliação guiada ———
  const drawEval = () => {
    replaceChildren(
      evalBox,
      VIDEO_CRITERIA.map((c) => {
        const name = `crit-${c.id}`;
        return h(
          'fieldset',
          null,
          h('legend', null, c.nome),
          h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, c.observar),
          h(
            'div',
            { class: 'choice-grid' },
            RATINGS.map((r) => {
              const input = h('input', {
                type: 'radio',
                name,
                value: r,
                checked: ratings[c.id] === r,
              });
              input.addEventListener('change', () => {
                ratings[c.id] = r;
                dirty = true;
              });
              return h('label', { class: 'choice' }, input, h('span', null, RATING_LABEL[r]));
            }),
          ),
        );
      }),
    );
  };

  const saveStatus = h('p', { role: 'status', 'aria-live': 'polite', class: 'small' });
  const saveEvaluation = async () => {
    if (!objectUrl) {
      saveStatus.textContent = 'Abra um vídeo antes de salvar a avaliação.';
      return;
    }
    const evaluated = Object.values(ratings).filter((r) => r !== 'nao_visivel').length;
    if (
      Object.keys(ratings).length === 0 &&
      markers.length === 0 &&
      !notes.value.trim() &&
      !poseSummary
    ) {
      saveStatus.textContent =
        'Marque pelo menos um critério, um momento ou escreva uma observação.';
      return;
    }
    const logged = logVideoAnalysis(
      { startedAt, endedAt: ctx.now() },
      fileName,
      ratings,
      VIDEO_CRITERIA,
      ratingToEvidence,
    );
    const analysisId = newId();
    const storedFrames: FrameCapture[] = saveFrames.checked
      ? frames.map((f) => ({
          id: f.id,
          analysisId,
          timeSec: f.timeSec,
          createdAt: ctx.now().toISOString(),
          blob: f.blob,
        }))
      : [];
    const analysis: VideoAnalysis = {
      id: analysisId,
      date: logged.session.date,
      createdAt: ctx.now().toISOString(),
      videoName: fileName.slice(0, 200),
      durationSec: Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : 0,
      markers: markers.map((m) => ({ ...m, timeSec: Math.round(m.timeSec * 100) / 100 })),
      criteria: { ...ratings },
      notes: notes.value.trim(),
      frameIds: storedFrames.map((f) => f.id),
      sessionId: logged.session.id,
      ...(motion ? { motionPeaks: motion.peaks.map((p) => Math.round(p.time * 100) / 100) } : {}),
      ...(poseSummary ? { poseSummary } : {}),
    };
    if (analysis.notes) logged.session.notes = analysis.notes;
    try {
      await ctx.repo.saveAnalysis(analysis, logged.session, logged.results, storedFrames);
      ctx.toast('Avaliação salva.', 'sucesso');
      startNewEvaluation();
      saveStatus.textContent = `Avaliação salva: ${evaluated} critério(s) com evidência${storedFrames.length ? `, ${storedFrames.length} quadro(s) guardado(s)` : ''}. Origem: avaliação manual (observação de vídeo). Para avaliar de novo, marque os critérios outra vez: cada avaliação salva é um registro separado.`;
      void drawHistory();
    } catch (error) {
      saveStatus.textContent = `Não foi possível salvar: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  // ——— Avaliações anteriores ———
  const drawHistory = async () => {
    for (const u of historyUrls.splice(0)) URL.revokeObjectURL(u);
    const analyses = await ctx.repo.listAnalyses();
    if (!analyses.length) {
      replaceChildren(
        historyBox,
        h('p', { class: 'muted small' }, 'Nenhuma avaliação de vídeo salva ainda.'),
      );
      return;
    }
    const items = await Promise.all(
      analyses.slice(0, 20).map(async (a) => {
        const thumbs: HTMLElement[] = [];
        for (const id of a.frameIds.slice(0, 4)) {
          const f = await ctx.repo.getFrame(id);
          if (f) {
            const u = URL.createObjectURL(f.blob);
            historyUrls.push(u);
            thumbs.push(
              h('img', {
                src: u,
                alt: `Quadro salvo em ${videoTime(f.timeSec)}`,
                style: { width: '72px', borderRadius: '6px' },
              }),
            );
          }
        }
        const rated = Object.entries(a.criteria).filter(([, r]) => r !== 'nao_visivel');
        return h(
          'li',
          null,
          h(
            'div',
            { class: 'row spread' },
            h('strong', null, a.videoName),
            pill(formatDayMonth(a.date)),
          ),
          h(
            'div',
            { class: 'small' },
            `${rated.length} critério(s) avaliado(s) · ${a.markers.length} marcador(es)${a.motionPeaks?.length ? ` · ${a.motionPeaks.length} pico(s) de movimento` : ''}`,
          ),
          rated.length
            ? h(
                'ul',
                { class: 'small' },
                rated.map(([id, r]) =>
                  h(
                    'li',
                    null,
                    `${VIDEO_CRITERIA.find((c) => c.id === id)?.nome ?? id}: ${RATING_LABEL[r]}`,
                  ),
                ),
              )
            : null,
          a.notes ? h('p', { class: 'small' }, a.notes) : null,
          a.poseSummary ? poseSummaryLine(a.poseSummary) : null,
          thumbs.length ? h('div', { class: 'row' }, thumbs) : null,
          h(
            'div',
            { class: 'row' },
            h('a', { class: 'btn small', href: `#/historico/${a.sessionId}` }, 'Detalhes'),
            button(
              'Excluir',
              async () => {
                if (
                  await ctx.confirm({
                    title: 'Excluir esta avaliação?',
                    message: 'A avaliação, seus resultados e os quadros salvos serão apagados.',
                    confirmLabel: 'Excluir',
                    danger: true,
                  })
                ) {
                  await ctx.repo.deleteSession(a.sessionId);
                  void drawHistory();
                }
              },
              { small: true, variant: 'danger' },
            ),
          ),
        );
      }),
    );
    replaceChildren(historyBox, h('ul', { class: 'list' }, items));
  };

  // ——— Montagem ———
  replaceChildren(
    playerCard,
    h('div', { class: 'media-box' }, video, overlay),
    infoEl,
    h('div', { class: 'row spread' }, timeLabel, speed),
    timeline,
    h(
      'div',
      { class: 'controls', role: 'group', 'aria-label': 'Controles do vídeo' },
      button('−5 s', () => step(-5), { small: true, ariaLabel: 'Voltar 5 segundos' }),
      button('−1 s', () => step(-1), { small: true, ariaLabel: 'Voltar 1 segundo' }),
      button('◀ quadro', () => step(-FRAME_STEP), { small: true, ariaLabel: 'Voltar um quadro' }),
      button('quadro ▶', () => step(FRAME_STEP), { small: true, ariaLabel: 'Avançar um quadro' }),
      button('+1 s', () => step(1), { small: true, ariaLabel: 'Avançar 1 segundo' }),
      button('+5 s', () => step(5), { small: true, ariaLabel: 'Avançar 5 segundos' }),
      button('Início', () => step(-Infinity), { small: true, ariaLabel: 'Ir para o início' }),
      button('Capturar', () => void capture(), {
        small: true,
        ariaLabel: 'Capturar o quadro atual',
      }),
    ),
    playBtn,
  );

  replaceChildren(
    toolsBox,
    card(
      { title: 'Momentos marcados', headingLevel: 2 },
      h(
        'div',
        { class: 'row' },
        h('div', { style: { flex: '1' } }, field('Tipo de momento', markerLabel)),
        button(
          'Marcar momento atual',
          () => {
            if (!objectUrl) return;
            markers.push({ id: newId(), timeSec: video.currentTime, label: markerLabel.value });
            dirty = true;
            drawMarkers();
          },
          { small: true },
        ),
      ),
      markersList,
    ),
    card(
      { title: 'Quadros capturados', headingLevel: 2 },
      h(
        'p',
        { class: 'small muted' },
        'Use "Capturar" para guardar o quadro atual (até 8). Por padrão, eles ficam só na memória e somem ao sair.',
      ),
      framesBox,
      h(
        'label',
        { class: 'choice' },
        saveFrames,
        h(
          'span',
          null,
          'Salvar os quadros junto com a avaliação (imagens reduzidas, só neste aparelho)',
        ),
      ),
    ),
    card({ title: 'Mapa de movimento (automático)', headingLevel: 2 }, motionBox),
    card({ title: 'Pose corporal (experimental)', headingLevel: 2 }, poseBox),
    card(
      { title: 'Avaliação guiada (manual)', headingLevel: 2 },
      h(
        'p',
        { class: 'small muted' },
        'Assista ao vídeo e marque o que você realmente consegue ver. Use "Não dá para ver no vídeo" quando faltar evidência — assim nada é concluído sem base.',
      ),
      evalBox,
      field('Observações', notes),
      button('Salvar avaliação', () => void saveEvaluation(), { variant: 'primary' }),
      button('Nova avaliação deste vídeo', () => resetAnalysis(), {
        variant: 'ghost',
        small: true,
      }),
      saveStatus,
    ),
  );

  resetAnalysis();
  void drawHistory();

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Vídeos',
      'Analise vídeos do seu treino. O vídeo é aberto só na memória do aparelho: não é enviado nem guardado.',
      { href: '#/mais', label: 'Mais' },
    ),
    card(
      { title: 'Escolher vídeo' },
      h('div', { class: 'row' }, galleryLabel, recordLabel, galleryInput, recordInput),
      h(
        'p',
        { class: 'small muted' },
        'Dica: celular apoiado e parado, corpo inteiro no quadro, 10 a 60 segundos de exercício.',
      ),
    ),
    errorBox,
    playerCard,
    toolsBox,
    card({ title: 'Avaliações anteriores' }, historyBox),
  );

  return {
    title: 'Vídeos',
    el,
    canLeave: async () =>
      !dirty ||
      ctx.confirm({
        title: 'Sair sem salvar a avaliação?',
        message: 'Marcações, quadros e notas desta análise serão perdidos.',
        confirmLabel: 'Sair',
        danger: true,
      }),
    destroy: () => {
      releaseVideo();
      detector?.close();
      detector = null;
      for (const u of historyUrls.splice(0)) URL.revokeObjectURL(u);
    },
  };
}
