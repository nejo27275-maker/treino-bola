/** Cronômetro com pausa e gerador de sinais visuais/sonoros para exercícios reais. */
import type { SignalKind } from '../content/types.ts';
import { createRng, freshSeed, type Rng } from '../core/rng.ts';

export class Stopwatch {
  private startedAt: number | null = null;
  private accumulated = 0;

  get running(): boolean {
    return this.startedAt !== null;
  }

  start(): void {
    if (this.startedAt === null) this.startedAt = performance.now();
  }

  pause(): void {
    if (this.startedAt !== null) {
      this.accumulated += performance.now() - this.startedAt;
      this.startedAt = null;
    }
  }

  reset(): void {
    this.startedAt = null;
    this.accumulated = 0;
  }

  elapsedMs(): number {
    return this.accumulated + (this.startedAt === null ? 0 : performance.now() - this.startedAt);
  }
}

export interface Signal {
  text: string;
  label: string;
}

const SIGNALS: Record<SignalKind, Signal[]> = {
  direcao: [
    { text: '←', label: 'Esquerda' },
    { text: '→', label: 'Direita' },
  ],
  direcao_pare: [
    { text: '←', label: 'Esquerda' },
    { text: '→', label: 'Direita' },
    { text: '←', label: 'Esquerda' },
    { text: '→', label: 'Direita' },
    { text: 'PARE', label: 'Pare a bola com a sola' },
  ],
  numeros: [
    { text: '1', label: 'Alvo 1 (perto)' },
    { text: '2', label: 'Alvo 2 (médio)' },
    { text: '3', label: 'Alvo 3 (longe)' },
  ],
  portas: [
    { text: '✕ ESQ', label: 'Porta da esquerda fechada' },
    { text: '✕ CENTRO', label: 'Porta do centro fechada' },
    { text: '✕ DIR', label: 'Porta da direita fechada' },
  ],
  pressao: [
    { text: '⇢ ●', label: 'Marcador vindo da esquerda: saia pela direita' },
    { text: '● ⇠', label: 'Marcador vindo da direita: saia pela esquerda' },
  ],
};

/**
 * Mostra sinais em intervalos aleatórios (2,5 a 5 s), como um parceiro que aponta
 * direções. É uma ferramenta de estímulo: não mede nada sozinha.
 */
export class SignalGenerator {
  private timer: number | null = null;
  private rng: Rng;
  private readonly kind: SignalKind;
  private readonly onSignal: (signal: Signal) => void;

  constructor(kind: SignalKind, onSignal: (signal: Signal) => void, seed = freshSeed()) {
    this.kind = kind;
    this.onSignal = onSignal;
    this.rng = createRng(seed);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer !== null) return;
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const delay = Math.round(this.rng.range(2500, 5000));
    this.timer = window.setTimeout(() => {
      this.onSignal(this.rng.pick(SIGNALS[this.kind]));
      this.schedule();
    }, delay);
  }
}
