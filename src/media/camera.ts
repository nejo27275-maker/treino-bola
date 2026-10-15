/**
 * Controle da câmera: pede permissão só quando o jogador toca em "Ligar câmera",
 * evita sessões duplicadas e libera todas as faixas ao parar. Nada é gravado.
 */
import { cameraSupport, describeCameraError, type MediaProblem } from './mediaErrors.ts';

export type Facing = 'user' | 'environment';
export type Resolution = 'baixa' | 'media';
export type CameraState = 'parada' | 'solicitando' | 'ativa' | 'erro';

const SIZES: Record<Resolution, { width: number; height: number }> = {
  baixa: { width: 640, height: 480 },
  media: { width: 1280, height: 720 },
};

export class CameraController {
  state: CameraState = 'parada';
  problem: MediaProblem | null = null;
  stream: MediaStream | null = null;
  facing: Facing = 'environment';
  private video: HTMLVideoElement | null = null;
  private listeners = new Set<() => void>();
  private startToken = 0;

  static support(): MediaProblem | null {
    const hasApi =
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function';
    return cameraSupport(typeof window !== 'undefined' && window.isSecureContext === true, hasApi);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  async start(
    video: HTMLVideoElement,
    opts: { facing: Facing; resolution: Resolution },
  ): Promise<boolean> {
    if (this.state === 'solicitando') return false; // evita pedidos duplicados
    if (this.state === 'ativa') this.stop();
    const unsupported = CameraController.support();
    if (unsupported) {
      this.state = 'erro';
      this.problem = unsupported;
      this.emit();
      return false;
    }
    const token = ++this.startToken;
    this.state = 'solicitando';
    this.problem = null;
    this.facing = opts.facing;
    this.emit();
    const size = SIZES[opts.resolution];
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: opts.facing },
          width: { ideal: size.width },
          height: { ideal: size.height },
          frameRate: { ideal: 30, max: 30 },
        },
      });
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } catch (retryError) {
          return this.fail(token, retryError);
        }
      } else {
        return this.fail(token, error);
      }
    }
    if (token !== this.startToken) {
      // O pedido foi cancelado (o jogador saiu da tela ou desligou) enquanto aguardava a permissão.
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    this.video = video;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (this.stream === stream) {
          this.stop();
          this.problem = {
            code: 'encerrada',
            title: 'A câmera foi desligada',
            message: 'O sistema ou outro aplicativo encerrou o acesso à câmera.',
            steps: ['Toque em "Ligar câmera" para tentar de novo.'],
          };
          this.emit();
        }
      });
    }
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // Alguns navegadores exigem novo toque para reproduzir; a imagem aparece no próximo toque.
    }
    this.state = 'ativa';
    this.emit();
    return true;
  }

  private fail(token: number, error: unknown): false {
    if (token !== this.startToken) return false;
    this.state = 'erro';
    this.problem = describeCameraError(error);
    this.stream = null;
    this.emit();
    return false;
  }

  /** Desliga a câmera e libera todas as faixas (a luz/indicador do aparelho deve apagar). */
  stop(): void {
    this.startToken++;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.stream = null;
    this.video = null;
    if (this.state !== 'erro') this.state = 'parada';
    this.emit();
  }

  get active(): boolean {
    return this.state === 'ativa' && this.stream !== null;
  }

  settings(): MediaTrackSettings | null {
    return this.stream?.getVideoTracks()[0]?.getSettings() ?? null;
  }
}
