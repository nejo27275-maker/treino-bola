/**
 * Desenho do campo dos simuladores em SVG. As coordenadas do SVG são as mesmas do motor
 * (metros), então o que se vê é exatamente o que as regras avaliam.
 */
import type { Vec } from '../../core/geometry.ts';
import { FIELD } from '../../core/sim/common.ts';
import { prefersReducedMotion, s } from '../dom.ts';

export type ActorKind = 'voce' | 'colega' | 'adversario' | 'cone';

const COLORS: Record<ActorKind, string> = {
  voce: '#ffd166',
  colega: '#4fb3ff',
  adversario: '#ff5a5a',
  cone: '#ff9f1c',
};

export class FieldView {
  readonly svg: SVGSVGElement;
  readonly layers: Record<'base' | 'zones' | 'lines' | 'actors' | 'ball' | 'overlay', SVGGElement>;

  constructor(ariaLabel: string) {
    this.svg = s('svg', {
      viewBox: `-0.5 -0.5 ${FIELD.width + 1} ${FIELD.length + 1}`,
      class: 'field-svg',
      role: 'img',
      'aria-label': ariaLabel,
    });
    this.layers = {
      base: s('g'),
      zones: s('g'),
      lines: s('g'),
      actors: s('g'),
      ball: s('g'),
      overlay: s('g'),
    };
    for (const layer of Object.values(this.layers)) this.svg.appendChild(layer);
    this.drawPitch();
  }

  private drawPitch(): void {
    const W = FIELD.width;
    const L = FIELD.length;
    const line = { fill: 'none', stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 0.12 };
    const stripes = Array.from({ length: 8 }, (_, i) =>
      s('rect', {
        x: 0,
        y: (i * L) / 8,
        width: W,
        height: L / 8,
        fill: i % 2 === 0 ? '#237a49' : '#1f6b3f',
      }),
    );
    this.layers.base.append(
      ...stripes,
      s('rect', { x: 0, y: 0, width: W, height: L, ...line }),
      s('rect', { x: W / 2 - 6, y: 0, width: 12, height: 6, ...line }),
      s('rect', { x: W / 2 - 2.5, y: -0.4, width: 5, height: 0.4, fill: '#ffffff' }),
      s(
        'text',
        {
          x: W / 2,
          y: 7.4,
          'text-anchor': 'middle',
          'font-size': 0.9,
          fill: 'rgba(255,255,255,0.7)',
        },
        'ataque ↑',
      ),
      // Régua de 5 em 5 metros na lateral, para estimar distâncias.
      ...Array.from({ length: 7 }, (_, i) =>
        s(
          'g',
          null,
          s('line', {
            x1: 0,
            x2: 0.6,
            y1: L - i * 5,
            y2: L - i * 5,
            stroke: 'rgba(255,255,255,0.8)',
            'stroke-width': 0.1,
          }),
          s(
            'text',
            { x: 0.75, y: L - i * 5 + 0.3, 'font-size': 0.7, fill: 'rgba(255,255,255,0.7)' },
            `${i * 5}m`,
          ),
        ),
      ),
    );
  }

  clear(...layers: (keyof FieldView['layers'])[]): void {
    for (const name of layers) this.layers[name].replaceChildren();
  }

  actor(pos: Vec, kind: ActorKind, label?: string, title?: string): SVGGElement {
    const g = s('g', { class: `actor ${kind}` });
    if (kind === 'cone') {
      g.append(
        s('polygon', {
          points: `${pos.x},${pos.y - 0.45} ${pos.x - 0.4},${pos.y + 0.35} ${pos.x + 0.4},${pos.y + 0.35}`,
          fill: COLORS.cone,
          stroke: '#000',
          'stroke-width': 0.05,
        }),
      );
    } else {
      g.append(
        s('circle', {
          cx: pos.x,
          cy: pos.y,
          r: kind === 'voce' ? 0.75 : 0.65,
          fill: COLORS[kind],
          stroke: '#0b1712',
          'stroke-width': 0.12,
        }),
      );
      if (label) {
        g.append(
          s(
            'text',
            {
              x: pos.x,
              y: pos.y + 0.3,
              'text-anchor': 'middle',
              'font-size': 0.8,
              'font-weight': 700,
              fill: '#0b1712',
            },
            label,
          ),
        );
      }
    }
    if (title) g.append(s('title', null, title));
    this.layers.actors.append(g);
    return g;
  }

  zone(
    center: Vec,
    r: number,
    kind: 'recepcao' | 'alcance' | 'alvo' | 'destaque',
  ): SVGCircleElement {
    const style: Record<string, Record<string, string | number>> = {
      recepcao: { fill: 'rgba(61,220,132,0.18)', stroke: '#3ddc84', 'stroke-dasharray': '0.4 0.3' },
      alcance: { fill: 'rgba(255,90,90,0.12)', stroke: '#ff5a5a', 'stroke-dasharray': '0.3 0.3' },
      alvo: { fill: 'none', stroke: '#ffd166', 'stroke-dasharray': '0.3 0.2' },
      destaque: { fill: 'none', stroke: '#ffffff', 'stroke-width': 0.2 },
    };
    const c = s('circle', { cx: center.x, cy: center.y, r, 'stroke-width': 0.1, ...style[kind] });
    this.layers.zones.append(c);
    return c;
  }

  line(
    a: Vec,
    b: Vec,
    opts: { color?: string; dashed?: boolean; width?: number; arrow?: boolean } = {},
  ): SVGLineElement {
    const l = s('line', {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      stroke: opts.color ?? '#ffffff',
      'stroke-width': opts.width ?? 0.15,
      'stroke-dasharray': opts.dashed ? '0.4 0.3' : undefined,
      'stroke-linecap': 'round',
    });
    this.layers.lines.append(l);
    if (opts.arrow) {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const size = 0.7;
      const p1 = { x: b.x - size * Math.cos(angle - 0.45), y: b.y - size * Math.sin(angle - 0.45) };
      const p2 = { x: b.x - size * Math.cos(angle + 0.45), y: b.y - size * Math.sin(angle + 0.45) };
      this.layers.lines.append(
        s('polygon', {
          points: `${b.x},${b.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`,
          fill: opts.color ?? '#ffffff',
        }),
      );
    }
    return l;
  }

  ball(pos: Vec): SVGCircleElement {
    this.clear('ball');
    const c = s('circle', {
      cx: pos.x,
      cy: pos.y,
      r: 0.35,
      fill: '#ffffff',
      stroke: '#111',
      'stroke-width': 0.08,
    });
    this.layers.ball.append(c);
    return c;
  }

  fog(fromY: number, text: string): void {
    this.layers.overlay.append(
      s('rect', {
        x: -0.5,
        y: -0.5,
        width: FIELD.width + 1,
        height: Math.max(0, fromY + 0.5),
        fill: 'rgba(5,12,9,0.92)',
      }),
      s(
        'text',
        {
          x: FIELD.width / 2,
          y: Math.max(1.5, fromY / 2),
          'text-anchor': 'middle',
          'font-size': 1.1,
          fill: 'rgba(255,255,255,0.85)',
        },
        text,
      ),
    );
  }

  label(pos: Vec, text: string, color = '#ffffff'): void {
    this.layers.overlay.append(
      s(
        'text',
        {
          x: pos.x,
          y: pos.y,
          'text-anchor': 'middle',
          'font-size': 0.9,
          'font-weight': 700,
          fill: color,
          stroke: '#0b1712',
          'stroke-width': 0.05,
        },
        text,
      ),
    );
  }

  /** Converte um toque/clique na tela para coordenadas do campo (metros). */
  toField(clientX: number, clientY: number): Vec | null {
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  /** Anima a bola de A até B. Com "reduzir animações", vai direto ao destino. */
  animateBall(from: Vec, to: Vec, ms: number, signal?: AbortSignal): Promise<void> {
    const ball = this.ball(from);
    if (prefersReducedMotion() || ms <= 0) {
      ball.setAttribute('cx', String(to.x));
      ball.setAttribute('cy', String(to.y));
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        if (signal?.aborted) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - start) / ms);
        const eased = 1 - (1 - t) * (1 - t);
        ball.setAttribute('cx', String(from.x + (to.x - from.x) * eased));
        ball.setAttribute('cy', String(from.y + (to.y - from.y) * eased));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
}
