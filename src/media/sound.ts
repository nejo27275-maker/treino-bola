/**
 * Feedback sonoro (tons gerados pelo Web Audio, sem arquivos) e vibração opcional.
 * Ambos respeitam as configurações e falham silenciosamente onde não há suporte.
 */
import type { Settings } from '../core/types.ts';

type AudioCtor = typeof AudioContext;

export class Feedback {
  private ctx: AudioContext | null = null;
  private readonly getSettings: () => Settings;

  constructor(getSettings: () => Settings) {
    this.getSettings = getSettings;
  }

  /** Deve ser chamado em resposta a um toque do usuário (política de áudio dos navegadores). */
  unlock(): void {
    if (!this.getSettings().som) return;
    try {
      if (!this.ctx) {
        const Ctor =
          (globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor })
            .AudioContext ?? (globalThis as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private tone(
    freq: number,
    ms: number,
    delayMs = 0,
    type: OscillatorType = 'sine',
    gain = 0.12,
  ): void {
    if (!this.getSettings().som) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const start = ctx.currentTime + delayMs / 1000;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(gain, start + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
      osc.connect(amp).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + ms / 1000 + 0.02);
    } catch {
      // sem áudio disponível
    }
  }

  private vibrate(pattern: number | number[]): void {
    if (!this.getSettings().vibracao) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // ignora
    }
  }

  success(): void {
    this.tone(660, 120);
    this.tone(880, 160, 110);
    this.vibrate(30);
  }

  error(): void {
    this.tone(220, 260, 0, 'triangle');
    this.vibrate([60, 40, 60]);
  }

  stimulus(): void {
    this.tone(1046, 180, 0, 'square', 0.08);
    this.vibrate(80);
  }

  /** Sinal sonoro com direção: grave = esquerda, agudo = direita. */
  directional(direction: 'esquerda' | 'direita'): void {
    this.tone(direction === 'esquerda' ? 440 : 1046, 260, 0, 'square', 0.1);
    this.vibrate(80);
  }

  tick(): void {
    this.tone(1320, 40, 0, 'sine', 0.05);
  }

  close(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
