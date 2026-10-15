/** Ferramentas para vídeos importados: busca de quadro, captura e mapa de movimento. */
import { findPeaks, frameDiff, type GrayFrame, type Peak } from '../core/motion.ts';
import { FrameSampler } from './frames.ts';

export class AbortedError extends Error {
  constructor() {
    super('Operação cancelada');
    this.name = 'AbortedError';
  }
}

/** Posiciona o vídeo em `time` e espera o quadro ficar disponível (com tempo limite). */
export function seekTo(
  video: HTMLVideoElement,
  time: number,
  signal?: AbortSignal,
  timeoutMs = 4000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const target = Math.max(
      0,
      Math.min(time, Number.isFinite(video.duration) ? video.duration : time),
    );
    if (Math.abs(video.currentTime - target) < 1e-3 && video.readyState >= 2) {
      resolve();
      return;
    }
    let timer = 0;
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      window.clearTimeout(timer);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Falha ao posicionar o vídeo.'));
    };
    const onAbort = () => {
      cleanup();
      reject(new AbortedError());
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort);
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('O vídeo demorou demais para mostrar o quadro.'));
    }, timeoutMs);
    video.currentTime = target;
  });
}

/** Captura o quadro atual como JPEG reduzido (largura máxima `maxWidth`). */
export function captureFrame(
  video: HTMLVideoElement,
  maxWidth = 640,
  quality = 0.82,
): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.reject(new Error('O vídeo ainda não tem imagem para capturar.'));
  const scale = Math.min(1, maxWidth / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas indisponível.'));
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))),
      'image/jpeg',
      quality,
    );
  });
}

export interface MotionMap {
  times: number[];
  values: number[];
  peaks: Peak[];
  step: number;
}

/**
 * Percorre o vídeo em passos de `step` segundos, compara quadros consecutivos e mede a
 * fração de pixels que mudaram. Cancelável e sem travar a interface (aguarda cada busca).
 */
export async function computeMotionMap(
  video: HTMLVideoElement,
  opts: { step?: number; signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<MotionMap> {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('Duração do vídeo desconhecida.');
  const maxSamples = 600;
  const step = Math.max(opts.step ?? 0.25, duration / maxSamples);
  const sampler = new FrameSampler(96, 54);
  const wasPaused = video.paused;
  const original = video.currentTime;
  video.pause();
  const times: number[] = [];
  const values: number[] = [];
  let previous: GrayFrame | null = null;
  try {
    for (let t = 0; t <= duration + 1e-6; t += step) {
      if (opts.signal?.aborted) throw new AbortedError();
      await seekTo(video, Math.min(t, duration - 0.001), opts.signal);
      const frame = sampler.grab(video);
      if (frame && previous) {
        times.push(t);
        values.push(frameDiff(previous, frame).ratio);
      }
      if (frame) previous = frame;
      opts.onProgress?.(Math.min(1, t / duration));
    }
  } finally {
    await seekTo(video, original).catch(() => {});
    if (!wasPaused) void video.play().catch(() => {});
  }
  const peaks = findPeaks(values, times, {
    minSeparation: Math.max(1.5, duration / 20),
    maxPeaks: 6,
    minValue: 0.01,
  });
  return { times, values, peaks, step };
}
