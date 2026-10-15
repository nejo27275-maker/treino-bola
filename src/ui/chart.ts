/**
 * Gráfico de evolução (linha, valores de 0 a 1) com legenda, rótulo direto no último
 * ponto, mira que segue o toque/ponteiro, navegação por teclado e tabela acessível.
 * Cores das séries vêm de --series-1/--series-2 (validadas para os temas claro e escuro).
 */
import { h, s } from './dom.ts';

export interface ChartPoint {
  /** Posição no eixo X (ordem cronológica). */
  x: number;
  series: number;
  value: number;
  /** Rótulo da data/sessão, mostrado na tooltip e na tabela. */
  label: string;
  /** Detalhe extra (ex.: "12 tentativas"). */
  detail?: string;
}

const W = 320;
const H = 170;
const PAD = { l: 34, r: 40, t: 12, b: 24 };

export function trendChart(opts: {
  points: ChartPoint[];
  seriesNames: string[];
  title: string;
  valueFormat: (v: number) => string;
}): HTMLElement {
  const { points, seriesNames, valueFormat } = opts;
  const xs = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const minX = xs[0] ?? 0;
  const maxX = xs[xs.length - 1] ?? 1;
  const sx = (x: number) =>
    maxX === minX
      ? (PAD.l + W - PAD.r) / 2
      : PAD.l + ((x - minX) / (maxX - minX)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => PAD.t + (1 - Math.max(0, Math.min(1, y))) * (H - PAD.t - PAD.b);
  const color = (i: number) => `var(--series-${(i % 2) + 1})`;

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': `${opts.title}. Use a tabela abaixo para ver todos os valores.`,
  });
  for (const v of [0, 0.5, 1]) {
    svg.append(
      s('line', {
        x1: PAD.l,
        x2: W - PAD.r,
        y1: sy(v),
        y2: sy(v),
        class: v === 0 ? 'chart-axis' : 'chart-grid',
      }),
      s('text', { x: PAD.l - 6, y: sy(v) + 3, 'text-anchor': 'end' }, `${Math.round(v * 100)}%`),
    );
  }
  const bySeries = seriesNames.map((_, i) =>
    points.filter((p) => p.series === i).sort((a, b) => a.x - b.x),
  );
  const usedLabelY: number[] = [];
  bySeries.forEach((list, i) => {
    if (list.length > 1) {
      const d = list
        .map((p, j) => `${j === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)} ${sy(p.value).toFixed(1)}`)
        .join(' ');
      svg.append(
        s('path', {
          d,
          fill: 'none',
          stroke: color(i),
          'stroke-width': 2,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        }),
      );
    }
    for (const p of list) {
      svg.append(
        s('circle', { cx: sx(p.x), cy: sy(p.value), r: 4, fill: color(i), class: 'chart-dot' }),
      );
    }
    const last = list[list.length - 1];
    if (last) {
      // Rótulo direto só no último ponto de cada série (texto em tinta de texto, não na cor da série).
      let y = sy(last.value) + 3;
      while (usedLabelY.some((u) => Math.abs(u - y) < 11)) y += 11;
      usedLabelY.push(y);
      svg.append(
        s('text', { x: sx(last.x) + 7, y, class: 'chart-label' }, valueFormat(last.value)),
      );
    }
  });
  if (xs.length > 0) {
    svg.append(
      s(
        'text',
        { x: sx(minX), y: H - 6, 'text-anchor': 'start' },
        points.find((p) => p.x === minX)?.label ?? '',
      ),
    );
    if (maxX !== minX) {
      svg.append(
        s(
          'text',
          { x: sx(maxX), y: H - 6, 'text-anchor': 'end' },
          points.find((p) => p.x === maxX)?.label ?? '',
        ),
      );
    }
  }

  // Camada de mira + tooltip.
  const crosshair = s('line', {
    x1: 0,
    x2: 0,
    y1: PAD.t,
    y2: H - PAD.b,
    class: 'chart-crosshair',
    visibility: 'hidden',
  });
  svg.append(crosshair);
  const tooltip = h('div', {
    class: 'chart-tooltip',
    role: 'status',
    'aria-live': 'polite',
    hidden: true,
  });
  const wrap = h(
    'div',
    {
      class: 'chart-wrap',
      tabindex: '0',
      'aria-label': `${opts.title}: use as setas para percorrer os pontos`,
    },
    svg,
    tooltip,
  );
  let index = -1;
  const show = (i: number) => {
    if (xs.length === 0) return;
    index = Math.max(0, Math.min(xs.length - 1, i));
    const x = xs[index] as number;
    crosshair.setAttribute('x1', String(sx(x)));
    crosshair.setAttribute('x2', String(sx(x)));
    crosshair.setAttribute('visibility', 'visible');
    const rows = seriesNames.map((name, si) => {
      const atX = bySeries[si]?.find((p) => p.x === x);
      const before = [...(bySeries[si] ?? [])].reverse().find((p) => p.x <= x);
      const p = atX ?? before;
      return h(
        'div',
        { class: 'chart-tip-row' },
        h('span', { class: 'chart-key', style: { background: color(si) } }),
        h('strong', null, p ? valueFormat(p.value) : '—'),
        h(
          'span',
          { class: 'muted' },
          ` ${name}${p && !atX ? ' (anterior)' : ''}${p?.detail ? ` · ${p.detail}` : ''}`,
        ),
      );
    });
    const label = points.find((p) => p.x === x)?.label ?? '';
    tooltip.replaceChildren(h('div', { class: 'small muted' }, label), ...rows);
    tooltip.hidden = false;
    const rect = svg.getBoundingClientRect();
    const px = (sx(x) / W) * rect.width;
    tooltip.style.left = `${Math.min(Math.max(0, px - 80), Math.max(0, rect.width - 170))}px`;
  };
  const hide = () => {
    crosshair.setAttribute('visibility', 'hidden');
    tooltip.hidden = true;
  };
  const nearest = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    xs.forEach((x, i) => {
      const d = Math.abs(sx(x) - vx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };
  wrap.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  wrap.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  wrap.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hide();
  });
  wrap.addEventListener('focus', () => show(index < 0 ? xs.length - 1 : index));
  wrap.addEventListener('blur', hide);
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      show(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      show(index + 1);
    } else if (e.key === 'Escape') hide();
  });

  const legend =
    seriesNames.length >= 2
      ? h(
          'div',
          { class: 'chart-legend' },
          seriesNames.map((name, i) =>
            h(
              'span',
              { class: 'chart-legend-item' },
              h('span', { class: 'chart-key', style: { background: color(i) } }),
              name,
            ),
          ),
        )
      : null;

  const table = h(
    'details',
    null,
    h('summary', null, 'Ver tabela'),
    h(
      'table',
      { class: 'data-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, 'Sessão'),
          h('th', { scope: 'col' }, 'Série'),
          h('th', { scope: 'col' }, 'Valor'),
          h('th', { scope: 'col' }, 'Detalhe'),
        ),
      ),
      h(
        'tbody',
        null,
        [...points]
          .sort((a, b) => a.x - b.x)
          .map((p) =>
            h(
              'tr',
              null,
              h('td', null, p.label),
              h('td', null, seriesNames[p.series] ?? ''),
              h('td', null, valueFormat(p.value)),
              h('td', null, p.detail ?? ''),
            ),
          ),
      ),
    ),
  );

  return h(
    'figure',
    { class: 'chart-figure' },
    h('figcaption', { class: 'small' }, h('strong', null, opts.title)),
    legend,
    wrap,
    table,
  );
}
