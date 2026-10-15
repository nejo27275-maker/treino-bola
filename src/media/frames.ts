/** Amostragem de quadros (vídeo ou câmera) em baixa resolução, em escala de cinza. */
import { rgbaToGray, type GrayFrame } from '../core/motion.ts';

export class FrameSampler {
  readonly width: number;
  readonly height: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gray: Uint8Array;

  constructor(width = 96, height = 72) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.');
    this.ctx = ctx;
    this.gray = new Uint8Array(width * height);
  }

  /** Captura o quadro atual. Retorna uma cópia (os quadros anteriores não são sobrescritos). */
  grab(source: CanvasImageSource): GrayFrame | null {
    try {
      this.ctx.drawImage(source, 0, 0, this.width, this.height);
      const image = this.ctx.getImageData(0, 0, this.width, this.height);
      rgbaToGray(image.data, this.width, this.height, this.gray);
      return { width: this.width, height: this.height, data: this.gray.slice() };
    } catch {
      return null;
    }
  }
}

/**
 * Chama `onFrame` a cada novo quadro do vídeo, limitado a `fps`. Usa
 * requestVideoFrameCallback quando existe (Chrome/Android) e requestAnimationFrame como
 * alternativa. Retorna uma função para parar.
 */
export function frameLoop(
  video: HTMLVideoElement,
  fps: number,
  onFrame: (now: number) => void,
): () => void {
  const interval = 1000 / Math.max(1, fps);
  let last = -Infinity;
  let stopped = false;
  let handle = 0;
  const rvfc = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number) => void) => number;
    cancelVideoFrameCallback?: (h: number) => void;
  };
  const tick = (now: number) => {
    if (stopped) return;
    if (now - last >= interval - 2) {
      last = now;
      onFrame(now);
    }
    schedule();
  };
  const schedule = () => {
    if (stopped) return;
    if (typeof rvfc.requestVideoFrameCallback === 'function')
      handle = rvfc.requestVideoFrameCallback(tick);
    else handle = requestAnimationFrame(tick);
  };
  schedule();
  return () => {
    stopped = true;
    if (typeof rvfc.cancelVideoFrameCallback === 'function') rvfc.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
  };
}
