/** Ícones SVG desenhados em código (sem arquivos externos). */
import { s } from './dom.ts';

export type IconName =
  | 'home'
  | 'train'
  | 'sim'
  | 'plan'
  | 'more'
  | 'video'
  | 'camera'
  | 'history'
  | 'settings'
  | 'brain'
  | 'run'
  | 'check'
  | 'target'
  | 'info';

/** Cada parte é um caminho (string) ou um círculo [cx, cy, r]. */
type Part = string | [number, number, number];

const PARTS: Record<IconName, Part[]> = {
  home: ['M3 11l9-7 9 7', 'M5 10v10h5v-6h4v6h5V10'],
  train: [[12, 12, 9], 'M12 7l3 2-1 4h-4l-1-4z', 'M12 3v4', 'M21 12h-4', 'M3 12h4', 'M7 19l3-6', 'M17 19l-3-6'],
  sim: ['M4 5h16v14H4z', 'M12 5v14', [12, 12, 2.5]],
  plan: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v5', 'M16 3v5', 'M8 14h3', 'M13 14h3', 'M8 17h3'],
  more: [[5, 12, 1.2], [12, 12, 1.2], [19, 12, 1.2]],
  video: ['M3 6h13v12H3z', 'M16 10l5-3v10l-5-3z'],
  camera: ['M4 8h4l2-2h4l2 2h4v11H4z', [12, 13, 3.2]],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v4h4', 'M12 8v5l3 2'],
  settings: [[12, 12, 3], 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9l2.1 2.1', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
  brain: ['M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4z', 'M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z'],
  run: [[13, 4.5, 2], 'M7 21l3-6 3 2v4', 'M10 15l1-5 4 3 3-1', 'M6 11l3-3 3 1'],
  check: ['M5 12l5 5 9-10'],
  target: [[12, 12, 9], [12, 12, 5], [12, 12, 1]],
  info: [[12, 12, 9], 'M12 11v6', 'M12 7.5v0.5'],
};

export function icon(name: IconName, size = 24): SVGSVGElement {
  return s(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    PARTS[name].map((p) =>
      typeof p === 'string' ? s('path', { d: p }) : s('circle', { cx: p[0], cy: p[1], r: p[2] }),
    ),
  );
}
