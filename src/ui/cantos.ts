/**
 * Gesto escondido: tocar os quatro cantos da tela (em qualquer ordem) em até 3 segundos.
 * Os toques só são observados (o gesto não atrapalha o uso normal); quando o quarto canto
 * completa o gesto, o clique daquele toque é descartado para não acionar o botão embaixo.
 */

export type Canto =
  | 'superior-esquerdo'
  | 'superior-direito'
  | 'inferior-esquerdo'
  | 'inferior-direito';

export const JANELA_DO_GESTO_MS = 3000;

/** Lado do quadrado de cada canto: 15% do menor lado da tela, entre 44 e 72 px. */
export function tamanhoDoCanto(largura: number, altura: number): number {
  return Math.round(Math.min(72, Math.max(44, Math.min(largura, altura) * 0.15)));
}

export function cantoDoToque(x: number, y: number, largura: number, altura: number): Canto | null {
  const lado = tamanhoDoCanto(largura, altura);
  const esquerda = x <= lado;
  const direita = x >= largura - lado;
  const topo = y <= lado;
  const base = y >= altura - lado;
  if (topo && esquerda) return 'superior-esquerdo';
  if (topo && direita) return 'superior-direito';
  if (base && esquerda) return 'inferior-esquerdo';
  if (base && direita) return 'inferior-direito';
  return null;
}

/** Guarda o último toque em cada canto; completa quando os quatro cabem na janela de tempo. */
export class GestoQuatroCantos {
  private readonly toques = new Map<Canto, number>();
  private readonly janelaMs: number;

  constructor(janelaMs = JANELA_DO_GESTO_MS) {
    this.janelaMs = janelaMs;
  }

  registrar(canto: Canto | null, instante: number): boolean {
    if (!canto) return false;
    this.toques.set(canto, instante);
    for (const [outro, quando] of this.toques) {
      if (instante - quando > this.janelaMs) this.toques.delete(outro);
    }
    if (this.toques.size < 4) return false;
    this.toques.clear();
    return true;
  }
}

/** Liga o gesto na janela; devolve a função que o desliga. */
export function observarGestoQuatroCantos(aoCompletar: () => void): () => void {
  const gesto = new GestoQuatroCantos();
  const engolirClique = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const aoTocar = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const canto = cantoDoToque(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    if (!gesto.registrar(canto, e.timeStamp)) return;
    // O clique deste último toque não deve acionar o que estiver no canto (ex.: a aba "Mais").
    window.addEventListener('click', engolirClique, { capture: true, once: true });
    window.setTimeout(
      () => window.removeEventListener('click', engolirClique, { capture: true }),
      800,
    );
    aoCompletar();
  };
  window.addEventListener('pointerdown', aoTocar, { capture: true, passive: true });
  return () => window.removeEventListener('pointerdown', aoTocar, { capture: true });
}
