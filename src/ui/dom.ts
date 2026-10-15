/**
 * Criação de elementos sem innerHTML: textos entram sempre como nós de texto, então
 * nada vindo de dados (perfil, importação, nomes de arquivo) é interpretado como HTML.
 */

export type Child = Node | string | number | false | null | undefined | Child[];
export type Props = Record<string, unknown>;

const BOOLEAN_PROPS = new Set([
  'disabled',
  'checked',
  'hidden',
  'required',
  'selected',
  'open',
  'multiple',
  'autoplay',
  'muted',
  'playsInline',
  'controls',
  'readOnly',
  'defaultChecked',
]);

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(parent, c);
    return;
  }
  parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
}

function applyProps(el: Element, props: Props | null | undefined): void {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) {
      if (BOOLEAN_PROPS.has(key)) (el as unknown as Record<string, unknown>)[key] = false;
      continue;
    }
    if (key === 'class') {
      el.setAttribute('class', String(value));
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign((el as HTMLElement).style, value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign((el as HTMLElement).dataset, value);
    } else if (key === 'ref' && typeof value === 'function') {
      (value as (e: Element) => void)(el);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (BOOLEAN_PROPS.has(key)) {
      (el as unknown as Record<string, unknown>)[key] = Boolean(value);
    } else if (key === 'value' && 'value' in el) {
      (el as HTMLInputElement).value = String(value);
    } else if (key === 'for') {
      el.setAttribute('for', String(value));
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | undefined | null | ((e: Event) => void)> | null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replaceChildren(el: Element, ...children: Child[]): void {
  clear(el);
  append(el, children);
}

/**
 * Substitui o conteúdo sem jogar o foco do teclado/leitor de tela para o topo da página: se o
 * foco estava dentro do contêiner, volta para o controle equivalente (mesmo `data-focus-key`),
 * senão para o marcado com `data-autofocus`, senão para o primeiro título do novo conteúdo.
 */
export function replaceKeepingFocus(container: Element, ...children: Child[]): void {
  const active = document.activeElement as HTMLElement | null;
  const hadFocus = !!active && active !== document.body && container.contains(active);
  const key = hadFocus ? active?.dataset.focusKey : undefined;
  replaceChildren(container, ...children);
  if (!hadFocus) return;
  if (active?.isConnected && container.contains(active)) {
    active.focus({ preventScroll: true });
    return;
  }
  const usable = ':not([disabled]):not([aria-disabled="true"])';
  const target =
    (key
      ? container.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]${usable}`)
      : null) ??
    container.querySelector<HTMLElement>(`[data-autofocus]${usable}`) ??
    container.querySelector<HTMLElement>('h2, h3');
  if (!target) return;
  if (target.matches('h2, h3') && !target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

let uidCounter = 0;
export function uid(prefix = 'el'): string {
  uidCounter++;
  return `${prefix}-${uidCounter}`;
}

export function prefersReducedMotion(): boolean {
  return (
    document.documentElement.dataset.motion === 'reduce' ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}
