/** Componentes de interface reutilizáveis. */
import type { SkillAssessment } from '../core/engine.ts';
import { percent } from '../core/format.ts';
import { SOURCE_INFO } from '../core/skills.ts';
import type { ResultSource } from '../core/types.ts';
import { h, s, uid, type Child } from './dom.ts';

export function card(props: { title?: string; tone?: 'warn' | 'danger' | 'accent'; class?: string; headingLevel?: 2 | 3 } | null, ...children: Child[]): HTMLElement {
  const classes = ['card', props?.tone ? `tone-${props.tone}` : '', props?.class ?? ''].filter(Boolean).join(' ');
  const heading = props?.title ? h(props.headingLevel === 3 ? 'h3' : 'h2', null, props.title) : null;
  return h('section', { class: classes }, heading, ...children);
}

export function button(
  label: Child,
  onClick: (e: MouseEvent) => void,
  opts: { variant?: 'primary' | 'danger' | 'ghost' | 'success' | 'fail'; block?: boolean; big?: boolean; small?: boolean; disabled?: boolean; ariaLabel?: string; type?: 'button' | 'submit'; id?: string } = {},
): HTMLButtonElement {
  const classes = ['btn', opts.variant ?? '', opts.block ? 'block' : '', opts.big ? 'big' : '', opts.small ? 'small' : '']
    .filter(Boolean)
    .join(' ');
  return h(
    'button',
    {
      type: opts.type ?? 'button',
      class: classes,
      onclick: onClick,
      disabled: opts.disabled,
      'aria-label': opts.ariaLabel,
      id: opts.id,
    },
    label,
  );
}

export function linkButton(href: string, label: Child, opts: { variant?: 'primary' | 'ghost'; block?: boolean; small?: boolean } = {}): HTMLAnchorElement {
  const classes = ['btn', opts.variant ?? '', opts.block ? 'block' : '', opts.small ? 'small' : ''].filter(Boolean).join(' ');
  return h('a', { class: classes, href }, label);
}

export function pill(text: string, tone?: 'accent' | 'warn' | 'danger' | 'info' | 'live'): HTMLSpanElement {
  return h('span', { class: tone ? `pill ${tone}` : 'pill' }, text);
}

export function stat(label: string, value: Child, hint?: string): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'value' }, value), h('span', { class: 'label' }, label), hint ? h('span', { class: 'label' }, hint) : null);
}

export function progress(value: number, label: string): HTMLElement {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return h(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': label },
    h('span', { style: { width: `${pct}%` } }),
  );
}

export function emptyState(title: string, text: string, ...actions: Child[]): HTMLElement {
  return h('div', { class: 'empty' }, h('h2', null, title), h('p', null, text), actions.length ? h('div', { class: 'row', style: { justifyContent: 'center' } }, ...actions) : null);
}

export function pageHeader(title: string, subtitle?: Child, back?: { href: string; label: string }): HTMLElement {
  return h(
    'header',
    { class: 'stack', style: { gap: '4px', marginBottom: '12px' } },
    back ? h('a', { href: back.href, class: 'small' }, `← ${back.label}`) : null,
    h('h1', { tabindex: '-1' }, title),
    subtitle ? h('p', { class: 'muted' }, subtitle) : null,
  );
}

export function sourceBadge(source: ResultSource): HTMLSpanElement {
  const info = SOURCE_INFO[source];
  const tone = info.canal === 'simulado' ? 'info' : info.canal === 'real' ? 'accent' : 'warn';
  const el = pill(info.rotulo, tone);
  el.title = info.tipo;
  return el;
}

export function statusPill(a: SkillAssessment): HTMLSpanElement {
  if (a.status === 'pendente') return pill('Pendente', 'warn');
  if (a.status === 'insuficiente') return pill('Dados insuficientes', 'info');
  if (a.inconsistent) return pill('Inconsistente', 'warn');
  if (a.level === 'baixo') return pill(`Atenção · ${percent(a.score ?? 0)}`, 'danger');
  if (a.level === 'medio') return pill(`Em desenvolvimento · ${percent(a.score ?? 0)}`, 'info');
  return pill(`Bom · ${percent(a.score ?? 0)}`, 'accent');
}

export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || uid('f');
  control.id = id;
  const hintEl = hint ? h('span', { class: 'small muted', id: `${id}-hint` }, hint) : null;
  if (hintEl) control.setAttribute('aria-describedby', `${id}-hint`);
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hintEl);
}

export function choiceGroup<T extends string>(
  legend: string,
  name: string,
  options: { value: T; label: string }[],
  selected: T[] | T,
  multiple: boolean,
): { el: HTMLFieldSetElement; values: () => T[] } {
  const inputs: HTMLInputElement[] = [];
  const selectedSet = new Set(Array.isArray(selected) ? selected : [selected]);
  const el = h(
    'fieldset',
    null,
    h('legend', null, legend),
    h(
      'div',
      { class: 'choice-grid' },
      options.map((o) => {
        const input = h('input', { type: multiple ? 'checkbox' : 'radio', name, value: o.value, checked: selectedSet.has(o.value) });
        inputs.push(input);
        return h('label', { class: 'choice' }, input, h('span', null, o.label));
      }),
    ),
  );
  return { el, values: () => inputs.filter((i) => i.checked).map((i) => i.value as T) };
}

export function select<T extends string>(options: { value: T; label: string }[], selected: T, id?: string): HTMLSelectElement {
  return h(
    'select',
    { id },
    options.map((o) => h('option', { value: o.value, selected: o.value === selected }, o.label)),
  );
}

/** Gráfico de linha simples em SVG (valores de 0 a 1). */
export function lineChart(
  series: { label: string; color: string; points: { x: number; y: number; title?: string }[] }[],
  opts: { height?: number; xLabels?: string[]; ariaLabel: string },
): SVGSVGElement {
  const W = 320;
  const H = opts.height ?? 160;
  const pad = { l: 30, r: 10, t: 10, b: 22 };
  const allX = series.flatMap((se) => se.points.map((p) => p.x));
  const minX = Math.min(...allX, 0);
  const maxX = Math.max(...allX, 1);
  const sx = (x: number) => pad.l + ((x - minX) / Math.max(1e-9, maxX - minX)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - y) * (H - pad.t - pad.b);
  const grid = [0, 0.5, 1].map((v) =>
    s('g', null,
      s('line', { x1: pad.l, x2: W - pad.r, y1: sy(v), y2: sy(v), stroke: 'currentColor', 'stroke-opacity': 0.15 }),
      s('text', { x: 2, y: sy(v) + 3 }, `${Math.round(v * 100)}%`),
    ),
  );
  const lines = series.map((se) => {
    const d = se.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
    return s('g', null,
      se.points.length > 1 ? s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': 2.5 }) : null,
      se.points.map((p) => s('circle', { cx: sx(p.x), cy: sy(p.y), r: 4, fill: se.color }, p.title ? s('title', null, p.title) : null)),
    );
  });
  const labels = (opts.xLabels ?? []).map((text, i, arr) =>
    s('text', { x: sx(minX + ((maxX - minX) * i) / Math.max(1, arr.length - 1)), y: H - 6, 'text-anchor': 'middle' }, text),
  );
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': opts.ariaLabel }, grid, lines, labels);
}
