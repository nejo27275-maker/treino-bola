/**
 * Controle da câmera: pede permissão só quando o jogador toca em "Ligar câmera",
 * evita sessões duplicadas e libera todas as faixas ao parar. Nada é gravado.
 */
import { isAndroidApp } from '../platform.ts';
import { cameraSupport, describeCameraError, type MediaProblem } from './mediaErrors.ts';

export type Facing = 'user' | 'environment';
export type Resolution = 'baixa' | 'media';
export type CameraState = 'parada' | 'solicitando' | 'ativa' | 'erro';

const SIZES: Record<Resolution, { width: number; height: number }> = {
  baixa: { width: 640, height: 480 },
  media: { width: 1280, height: 720 },
};

/**
 * Ordem das tentativas de abrir a câmera: a exata pedida (faz o alternar frontal/traseira
 * funcionar de verdade), depois a preferida e, por fim, qualquer câmera.
 */
export function constraintAttempts(
  facing: Facing,
  size: { width: number; height: number },
): MediaStreamConstraints[] {
  const base: MediaTrackConstraints = {
    width: { ideal: size.width },
    height: { ideal: size.height },
    frameRate: { ideal: 30, max: 30 },
  };
  return [
    { audio: false, video: { ...base, facingMode: { exact: facing } } },
    { audio: false, video: { ...base, facingMode: { ideal: facing } } },
    { audio: false, video: true },
  ];
}

/**
 * Só a restrição (a câmera daquele lado não existe) justifica tentar a próxima combinação;
 * permissão negada, câmera ocupada etc. param na hora (não adianta insistir).
 */
export function retryOnConstraintError(name: string | undefined): boolean {
  return (
    name === 'OverconstrainedError' ||
    name === 'ConstraintNotSatisfiedError' ||
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError'
  );
}

/** Resolve true quando o vídeo passa a ter dimensões (há imagem), ou false ao esgotar o tempo. */
function waitForVideoFrame(video: HTMLVideoElement, timeoutMs: number): Promise<boolean> {
  if (video.videoWidth > 0) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let pronto = false;
    const terminar = (valor: boolean) => {
      if (pronto) return;
      pronto = true;
      video.removeEventListener('loadeddata', verificar);
      video.removeEventListener('resize', verificar);
      window.clearInterval(poll);
      window.clearTimeout(limite);
      resolve(valor);
    };
    const verificar = () => {
      if (video.videoWidth > 0) terminar(true);
    };
    video.addEventListener('loadeddata', verificar);
    video.addEventListener('resize', verificar);
    const rvfc = (
      video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
    ).requestVideoFrameCallback;
    if (typeof rvfc === 'function') rvfc.call(video, () => terminar(true));
    const poll = window.setInterval(verificar, 100);
    const limite = window.setTimeout(() => terminar(video.videoWidth > 0), timeoutMs);
  });
}

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
    const stream = await this.abrirFluxo(token, opts.facing, size);
    if (!stream) return false;
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
    // Espera a câmera realmente enviar imagem: começar a análise com quadros em branco
    // (dimensões 0) estragaria a calibração e dispararia "movimento" falso no primeiro quadro.
    const temImagem = await waitForVideoFrame(video, 4000);
    if (token !== this.startToken) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    if (!temImagem) {
      stream.getTracks().forEach((t) => t.stop());
      this.video = null;
      this.stream = null;
      this.state = 'erro';
      this.problem = {
        code: 'sem_imagem',
        title: 'A câmera ligou, mas não há imagem',
        message:
          'A permissão foi dada, mas nenhum quadro chegou. Isso acontece com a câmera tapada, uma câmera virtual sem fonte ou alguns navegadores embutidos de outros aplicativos.',
        steps: [
          'Verifique se a câmera não está coberta.',
          'Tente a outra câmera (frontal/traseira) ou abra o aplicativo no Google Chrome.',
        ],
      };
      this.emit();
      return false;
    }
    this.state = 'ativa';
    this.emit();
    return true;
  }

  /**
   * Abre o fluxo tentando, em ordem: a câmera exata pedida (faz o alternar frontal/traseira
   * funcionar de verdade), depois a preferida e, por fim, qualquer câmera. Só continua para a
   * próxima tentativa quando o problema é a restrição (câmera daquele lado não existe); erros
   * como permissão negada param na hora.
   */
  private async abrirFluxo(
    token: number,
    facing: Facing,
    size: { width: number; height: number },
  ): Promise<MediaStream | null> {
    let ultimoErro: unknown = new Error('Câmera indisponível.');
    for (const constraints of constraintAttempts(facing, size)) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        ultimoErro = error;
        if (!retryOnConstraintError((error as { name?: string }).name)) break;
      }
    }
    this.fail(token, ultimoErro);
    return null;
  }

  private fail(token: number, error: unknown): false {
    if (token !== this.startToken) return false;
    this.state = 'erro';
    this.problem = describeCameraError(error, isAndroidApp() ? 'app' : 'navegador');
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
