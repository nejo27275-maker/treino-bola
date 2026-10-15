/**
 * Detecção de movimento por diferença entre quadros (visão computacional clássica).
 *
 * O que faz: compara quadros consecutivos em escala de cinza e mede a fração de pixels
 * que mudaram, separadamente nas metades esquerda e direita da imagem.
 * O que NÃO faz: não reconhece pessoas, bola, adversários ou espaços livres — qualquer
 * coisa que se mexa (inclusive a própria câmera ou mudanças de luz) gera "movimento".
 * Por isso exige câmera parada e uma calibração com o jogador imóvel.
 */

export interface GrayFrame {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface MotionSample {
  /** Fração de pixels que mudaram na imagem inteira (0 a 1). */
  ratio: number;
  /** Fração de pixels alterados na metade esquerda da imagem (do ponto de vista do jogador, se espelhado). */
  leftRatio: number;
  rightRatio: number;
  /** Centroide horizontal dos pixels alterados (0 = esquerda, 1 = direita) ou NaN. */
  cx: number;
  cy: number;
  changed: number;
}

export const DEFAULT_PIXEL_THRESHOLD = 25;

/** Converte RGBA (ImageData) em luminância de 8 bits. */
export function rgbaToGray(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  out?: Uint8Array,
): GrayFrame {
  const size = width * height;
  if (rgba.length < size * 4) throw new Error('Buffer RGBA menor que o tamanho informado');
  const data = out && out.length === size ? out : new Uint8Array(size);
  for (let i = 0, j = 0; i < size; i++, j += 4) {
    data[i] = ((rgba[j] as number) * 77 + (rgba[j + 1] as number) * 150 + (rgba[j + 2] as number) * 29) >> 8;
  }
  return { width, height, data };
}

/**
 * Compara dois quadros. Com `mirror`, a esquerda/direita é calculada do ponto de vista
 * de quem está de frente para a câmera (a imagem crua tem os lados trocados).
 */
export function frameDiff(
  prev: GrayFrame,
  curr: GrayFrame,
  pixelThreshold = DEFAULT_PIXEL_THRESHOLD,
  mirror = false,
): MotionSample {
  if (prev.width !== curr.width || prev.height !== curr.height) {
    throw new Error('Quadros com tamanhos diferentes');
  }
  const { width, height } = curr;
  const half = width / 2;
  let changed = 0;
  let left = 0;
  let right = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const d = (curr.data[i] as number) - (prev.data[i] as number);
      if (d > pixelThreshold || d < -pixelThreshold) {
        changed++;
        const vx = mirror ? width - 1 - x : x;
        if (vx < half) left++;
        else right++;
        sumX += vx;
        sumY += y;
      }
    }
  }
  const total = width * height;
  const halfTotal = total / 2;
  return {
    ratio: changed / total,
    leftRatio: left / halfTotal,
    rightRatio: right / halfTotal,
    cx: changed > 0 ? sumX / changed / Math.max(1, width - 1) : Number.NaN,
    cy: changed > 0 ? sumY / changed / Math.max(1, height - 1) : Number.NaN,
    changed,
  };
}

export interface Baseline {
  mean: number;
  std: number;
  threshold: number;
  samples: number;
}

export const MIN_MOTION_THRESHOLD = 0.012;

/** Calcula o limiar de movimento a partir de amostras com o jogador parado. */
export function computeBaseline(ratios: number[], k = 4): Baseline {
  const valid = ratios.filter((r) => Number.isFinite(r));
  if (valid.length === 0) {
    return { mean: 0, std: 0, threshold: MIN_MOTION_THRESHOLD, samples: 0 };
  }
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length;
  const std = Math.sqrt(variance);
  const threshold = Math.max(mean + k * std, mean + 0.008, MIN_MOTION_THRESHOLD);
  return { mean, std, threshold, samples: valid.length };
}

/** A calibração é ruim se a cena já tem muito movimento com o jogador parado. */
export function baselineIsNoisy(b: Baseline): boolean {
  return b.mean > 0.08 || b.threshold > 0.15;
}

export type MotionSide = 'esquerda' | 'direita' | 'indefinido';

export interface Onset {
  /** Momento (ms) do primeiro quadro acima do limiar. */
  time: number;
  side: MotionSide;
  leftRatio: number;
  rightRatio: number;
}

/**
 * Detecta o início de um movimento: `consecutive` quadros seguidos acima do limiar.
 * O lado é o que concentrou mais pixels alterados (precisa ser 30% maior que o outro).
 */
export class OnsetDetector {
  private run: { time: number; sample: MotionSample }[] = [];
  private readonly threshold: number;
  private readonly consecutive: number;
  private readonly dominance: number;

  constructor(opts: { threshold: number; consecutive?: number; dominance?: number }) {
    this.threshold = opts.threshold;
    this.consecutive = Math.max(1, opts.consecutive ?? 2);
    this.dominance = opts.dominance ?? 1.3;
  }

  reset(): void {
    this.run = [];
  }

  push(sample: MotionSample, time: number): Onset | null {
    if (sample.ratio >= this.threshold) {
      this.run.push({ time, sample });
    } else {
      this.run = [];
      return null;
    }
    if (this.run.length < this.consecutive) return null;
    const first = this.run[0] as { time: number; sample: MotionSample };
    let left = 0;
    let right = 0;
    for (const entry of this.run) {
      left += entry.sample.leftRatio;
      right += entry.sample.rightRatio;
    }
    let side: MotionSide = 'indefinido';
    if (left >= right * this.dominance && left > 0) side = 'esquerda';
    else if (right >= left * this.dominance && right > 0) side = 'direita';
    const onset: Onset = {
      time: first.time,
      side,
      leftRatio: left / this.run.length,
      rightRatio: right / this.run.length,
    };
    this.run = [];
    return onset;
  }
}

export interface Peak {
  time: number;
  value: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}

/**
 * Encontra os momentos de maior movimento em uma série (mapa de atividade de um vídeo).
 * Um pico é um máximo local acima de mediana + 2×MAD (desvio absoluto mediano).
 */
export function findPeaks(
  values: number[],
  times: number[],
  opts: { minSeparation: number; maxPeaks: number; minValue?: number },
): Peak[] {
  if (values.length !== times.length) throw new Error('Séries com tamanhos diferentes');
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  const threshold = Math.max(med + 2 * mad, opts.minValue ?? 0.005);
  const candidates: Peak[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    const prev = i > 0 ? (values[i - 1] as number) : -Infinity;
    const next = i < values.length - 1 ? (values[i + 1] as number) : -Infinity;
    if (v >= threshold && v >= prev && v >= next) {
      candidates.push({ time: times[i] as number, value: v });
    }
  }
  candidates.sort((a, b) => b.value - a.value || a.time - b.time);
  const chosen: Peak[] = [];
  for (const c of candidates) {
    if (chosen.length >= opts.maxPeaks) break;
    if (chosen.every((p) => Math.abs(p.time - c.time) >= opts.minSeparation)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.time - b.time);
}
