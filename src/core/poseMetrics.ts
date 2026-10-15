/**
 * Métricas corporais calculadas a partir de pontos de pose (formato BlazePose de 33 pontos,
 * coordenadas normalizadas: x e y entre 0 e 1 em relação à largura e à altura da imagem).
 *
 * São medidas 2D da imagem: dependem do ângulo da câmera e não identificam ações de
 * futebol, bola ou adversários. Cada métrica só é considerada confiável quando todos os
 * pontos usados têm visibilidade mínima.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export const POSE_INDEX = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** Conexões para desenhar o esqueleto simplificado. */
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32],
];

export const MIN_VISIBILITY = 0.5;

export type PoseMetricId =
  | 'inclinacao_tronco'
  | 'inclinacao_ombros'
  | 'flexao_joelho_esq'
  | 'flexao_joelho_dir'
  | 'base_apoio'
  | 'abertura_ombros';

export interface PoseMetric {
  id: PoseMetricId;
  label: string;
  value: number | null;
  unit: string;
  confidence: number;
  reliable: boolean;
  explanation: string;
}

interface P {
  X: number;
  Y: number;
  v: number;
}

function point(lms: Landmark[], index: number, aspect: number): P | null {
  const lm = lms[index];
  if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) return null;
  return { X: lm.x * aspect, Y: lm.y, v: lm.visibility ?? 0 };
}

function mid(a: P, b: P): P {
  return { X: (a.X + b.X) / 2, Y: (a.Y + b.Y) / 2, v: Math.min(a.v, b.v) };
}

const DEG = 180 / Math.PI;

/** Ângulo no vértice B (graus) formado por A-B-C. */
export function jointAngle(a: { X: number; Y: number }, b: { X: number; Y: number }, c: { X: number; Y: number }): number {
  const v1x = a.X - b.X;
  const v1y = a.Y - b.Y;
  const v2x = c.X - b.X;
  const v2y = c.Y - b.Y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return Number.NaN;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return Math.acos(cos) * DEG;
}

function metric(
  id: PoseMetricId,
  label: string,
  unit: string,
  explanation: string,
  pts: (P | null)[],
  compute: (pts: P[]) => number,
  minVisibility: number,
): PoseMetric {
  if (pts.some((p) => p === null)) {
    return { id, label, value: null, unit, confidence: 0, reliable: false, explanation };
  }
  const ps = pts as P[];
  const confidence = Math.min(...ps.map((p) => p.v));
  const value = compute(ps);
  const reliable = confidence >= minVisibility && Number.isFinite(value);
  return {
    id,
    label,
    value: Number.isFinite(value) ? Math.round(value * 10) / 10 : null,
    unit,
    confidence: Math.round(confidence * 100) / 100,
    reliable,
    explanation,
  };
}

/**
 * Calcula as métricas de um quadro. `aspect` = largura/altura da imagem, para que os
 * ângulos não fiquem distorcidos pelas coordenadas normalizadas.
 */
export function computePoseMetrics(
  landmarks: Landmark[],
  aspect: number,
  minVisibility = MIN_VISIBILITY,
): PoseMetric[] {
  const I = POSE_INDEX;
  const ls = point(landmarks, I.leftShoulder, aspect);
  const rs = point(landmarks, I.rightShoulder, aspect);
  const lh = point(landmarks, I.leftHip, aspect);
  const rh = point(landmarks, I.rightHip, aspect);
  const lk = point(landmarks, I.leftKnee, aspect);
  const rk = point(landmarks, I.rightKnee, aspect);
  const la = point(landmarks, I.leftAnkle, aspect);
  const ra = point(landmarks, I.rightAnkle, aspect);
  return [
    metric(
      'inclinacao_tronco',
      'Inclinação do tronco',
      '°',
      'Ângulo entre a linha quadril→ombros e a vertical da imagem: 0° = tronco reto; positivo = inclinado para a direita da imagem; negativo = para a esquerda.',
      [ls, rs, lh, rh],
      ([a, b, c, d]) => {
        const sh = mid(a as P, b as P);
        const hp = mid(c as P, d as P);
        return Math.atan2(sh.X - hp.X, hp.Y - sh.Y) * DEG;
      },
      minVisibility,
    ),
    metric(
      'inclinacao_ombros',
      'Inclinação dos ombros',
      '°',
      'Ângulo da linha entre os ombros em relação à horizontal da imagem.',
      [ls, rs],
      ([a, b]) => {
        const angle = Math.abs(Math.atan2((b as P).Y - (a as P).Y, (b as P).X - (a as P).X) * DEG);
        return angle > 90 ? 180 - angle : angle;
      },
      minVisibility,
    ),
    metric(
      'flexao_joelho_esq',
      'Flexão do joelho esquerdo',
      '°',
      '0° = perna estendida. Joelhos levemente flexionados ajudam no equilíbrio.',
      [lh, lk, la],
      ([h, k, a]) => 180 - jointAngle(h as P, k as P, a as P),
      minVisibility,
    ),
    metric(
      'flexao_joelho_dir',
      'Flexão do joelho direito',
      '°',
      '0° = perna estendida. Joelhos levemente flexionados ajudam no equilíbrio.',
      [rh, rk, ra],
      ([h, k, a]) => 180 - jointAngle(h as P, k as P, a as P),
      minVisibility,
    ),
    metric(
      'base_apoio',
      'Base de apoio (pés ÷ quadril)',
      '×',
      'Distância horizontal entre os tornozelos dividida pela largura do quadril (melhor de frente para a câmera).',
      [la, ra, lh, rh],
      ([a1, a2, h1, h2]) => {
        const hips = Math.abs((h1 as P).X - (h2 as P).X);
        return hips < 1e-3 ? Number.NaN : Math.abs((a1 as P).X - (a2 as P).X) / hips;
      },
      minVisibility,
    ),
    metric(
      'abertura_ombros',
      'Abertura dos ombros para a câmera',
      '×',
      'Largura dos ombros na imagem dividida pela altura do tronco: valores altos = de frente para a câmera; baixos = de lado.',
      [ls, rs, lh, rh],
      ([a, b, c, d]) => {
        const width = Math.hypot((a as P).X - (b as P).X, (a as P).Y - (b as P).Y);
        const torso = Math.hypot(mid(a as P, b as P).X - mid(c as P, d as P).X, mid(a as P, b as P).Y - mid(c as P, d as P).Y);
        return torso < 1e-3 ? Number.NaN : width / torso;
      },
      minVisibility,
    ),
  ];
}

export interface PoseSeriesSummary {
  frames: number;
  reliableFrames: number;
  trunkLeanMean: number | null;
  trunkLeanStd: number | null;
  stability: 'estavel' | 'variavel' | 'indefinido';
  kneeFlexMean: number | null;
}

/** Resume uma série de quadros (ex.: um trecho marcado do vídeo). */
export function summarizePoseSeries(series: PoseMetric[][]): PoseSeriesSummary {
  const lean: number[] = [];
  const knees: number[] = [];
  let reliableFrames = 0;
  for (const frame of series) {
    const t = frame.find((m) => m.id === 'inclinacao_tronco');
    if (t?.reliable && t.value !== null) {
      lean.push(t.value);
      reliableFrames++;
    }
    for (const id of ['flexao_joelho_esq', 'flexao_joelho_dir'] as const) {
      const k = frame.find((m) => m.id === id);
      if (k?.reliable && k.value !== null) knees.push(k.value);
    }
  }
  const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  // Inclinação média em módulo; a estabilidade usa o ângulo com sinal (balanço lateral).
  const leanMean = mean(lean.map(Math.abs));
  const signedMean = mean(lean);
  const leanStd =
    signedMean === null
      ? null
      : Math.sqrt(lean.reduce((a, b) => a + (b - signedMean) ** 2, 0) / lean.length);
  let stability: PoseSeriesSummary['stability'] = 'indefinido';
  if (lean.length >= 5 && leanStd !== null) stability = leanStd <= 6 ? 'estavel' : 'variavel';
  const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    frames: series.length,
    reliableFrames,
    trunkLeanMean: round(leanMean),
    trunkLeanStd: round(leanStd),
    stability,
    kneeFlexMean: round(mean(knees)),
  };
}
