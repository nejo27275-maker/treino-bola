/** Componentes de interface reutilizáveis. */
import type { SkillAssessment } from '../core/engine.ts';
import { percent } from '../core/format.ts';
import { SOURCE_INFO } from '../core/skills.ts';
import type { ResultSource } from '../core/types.ts';
import { h, uid, type Child } from './dom.ts';

export function card(
  props: {
    title?: string;
    tone?: 'warn' | 'danger' | 'accent';
    class?: string;
    headingLevel?: 2 | 3;
  } | null,
  ...children: Child[]
): HTMLElement {
  const classes = ['card', props?.tone ? `tone-${props.tone}` : '', props?.class ?? '']
    .filter(Boolean)
    .join(' ');
  const heading = props?.title
    ? h(props.headingLevel === 3 ? 'h3' : 'h2', null, props.title)
    : null;
  return h('section', { class: classes }, heading, ...children);
}

export function button(
  label: Child,
  onClick: (e: MouseEvent) => void,
  opts: {
    variant?: 'primary' | 'danger' | 'ghost' | 'success' | 'fail';
    block?: boolean;
    big?: boolean;
    small?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    type?: 'button' | 'submit';
    id?: string;
    /** Identifica o "mesmo" botão entre re-renderizações, para devolver o foco a ele. */
    focusKey?: string;
    /** Recebe o foco quando a tela muda de fase e o botão que tinha foco sumiu. */
    autofocus?: boolean;
  } = {},
): HTMLButtonElement {
  const classes = [
    'btn',
    opts.variant ?? '',
    opts.block ? 'block' : '',
    opts.big ? 'big' : '',
    opts.small ? 'small' : '',
  ]
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
      dataset: {
        ...(opts.focusKey ? { focusKey: opts.focusKey } : {}),
        ...(opts.autofocus ? { autofocus: '' } : {}),
      },
    },
    label,
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

/**
 * Abas acessíveis: só a aba ativa entra na ordem do Tab; setas ←/→, Home e End trocam de aba;
 * a seleção é atualizada no lugar (o foco não se perde) e o painel é ligado à aba ativa.
 */
export function tabList<T extends string>(opts: {
  label: string;
  idPrefix: string;
  panel: HTMLElement;
  tabs: TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
}): {
  el: HTMLElement;
  select: (id: T, focus?: boolean) => void;
  setTabs: (tabs: TabItem<T>[]) => void;
} {
  const el = h('div', { class: 'tabs', role: 'tablist', 'aria-label': opts.label });
  let items = opts.tabs;
  let current = opts.selected;
  let buttons: HTMLButtonElement[] = [];
  const panel = opts.panel;
  panel.setAttribute('role', 'tabpanel');
  if (!panel.id) panel.id = `${opts.idPrefix}-painel`;
  const tabId = (id: T) => `${opts.idPrefix}-aba-${id}`;
  const sync = () => {
    buttons.forEach((b, i) => {
      const on = items[i]?.id === current;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tabId(current));
  };
  const select = (id: T, focus = false) => {
    current = id;
    sync();
    if (focus) buttons[items.findIndex((t) => t.id === id)]?.focus();
    opts.onSelect(id);
  };
  const render = () => {
    buttons = items.map((t) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'btn small',
          id: tabId(t.id),
          'aria-controls': panel.id,
          onclick: () => select(t.id),
        },
        t.label,
      ),
    );
    el.replaceChildren(...buttons);
    sync();
  };
  el.addEventListener('keydown', (e) => {
    const i = items.findIndex((t) => t.id === current);
    const last = items.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % items.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + items.length) % items.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    const target = items[next];
    if (!target) return;
    e.preventDefault();
    select(target.id, true);
  });
  render();
  return {
    el,
    select,
    setTabs: (tabs) => {
      const hadFocus = el.contains(document.activeElement);
      items = tabs;
      if (!items.some((t) => t.id === current) && items[0]) current = items[0].id;
      render();
      if (hadFocus) buttons[items.findIndex((t) => t.id === current)]?.focus();
    },
  };
}

/**
 * Um campo de arquivo escondido é aberto pelo seu rótulo com aparência de botão: quando o
 * campo recebe foco pelo teclado, o rótulo mostra o anel de foco.
 */
export function showFocusOnLabel(input: HTMLInputElement, label: HTMLElement): void {
  input.addEventListener('focus', () => {
    if (input.matches(':focus-visible')) label.classList.add('focus-ring');
  });
  input.addEventListener('blur', () => label.classList.remove('focus-ring'));
}

/** Tabela de dados; em telas estreitas ela rola para o lado na própria caixa (a página não). */
export function dataTable(...children: Child[]): HTMLElement {
  return h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' }, ...children));
}

export function linkButton(
  href: string,
  label: Child,
  opts: { variant?: 'primary' | 'ghost'; block?: boolean; small?: boolean } = {},
): HTMLAnchorElement {
  const classes = ['btn', opts.variant ?? '', opts.block ? 'block' : '', opts.small ? 'small' : '']
    .filter(Boolean)
    .join(' ');
  return h('a', { class: classes, href }, label);
}

export function pill(
  text: string,
  tone?: 'accent' | 'warn' | 'danger' | 'info' | 'live',
): HTMLSpanElement {
  return h('span', { class: tone ? `pill ${tone}` : 'pill' }, text);
}

export function stat(label: string, value: Child, hint?: string): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'value' }, value),
    h('span', { class: 'label' }, label),
    hint ? h('span', { class: 'label' }, hint) : null,
  );
}

export function progress(value: number, label: string): HTMLElement {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return h(
    'div',
    {
      class: 'progress',
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': pct,
      'aria-label': label,
    },
    h('span', { style: { width: `${pct}%` } }),
  );
}

export function emptyState(title: string, text: string, ...actions: Child[]): HTMLElement {
  return h(
    'div',
    { class: 'empty' },
    h('h2', null, title),
    h('p', null, text),
    actions.length
      ? h('div', { class: 'row', style: { justifyContent: 'center' } }, ...actions)
      : null,
  );
}

export function pageHeader(
  title: string,
  subtitle?: Child,
  back?: { href: string; label: string },
): HTMLElement {
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

/**
 * Mostra (ou limpa, com `null`) um erro ligado ao campo: texto logo abaixo dele, anunciado
 * na hora, `aria-invalid` e `aria-describedby` apontando para a mensagem.
 */
export function setFieldError(control: HTMLElement, message: string | null): void {
  const id = control.id || uid('f');
  control.id = id;
  const errorId = `${id}-erro`;
  let errorEl = document.getElementById(errorId);
  const described = (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((x) => x && x !== errorId);
  if (!message) {
    errorEl?.remove();
    control.removeAttribute('aria-invalid');
    if (described.length) control.setAttribute('aria-describedby', described.join(' '));
    else control.removeAttribute('aria-describedby');
    return;
  }
  if (!errorEl) {
    errorEl = h('p', { class: 'field-error', id: errorId, role: 'alert' });
    control.insertAdjacentElement('afterend', errorEl);
  }
  errorEl.textContent = message;
  control.setAttribute('aria-invalid', 'true');
  control.setAttribute('aria-describedby', [...described, errorId].join(' '));
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
        const input = h('input', {
          type: multiple ? 'checkbox' : 'radio',
          name,
          value: o.value,
          checked: selectedSet.has(o.value),
        });
        inputs.push(input);
        return h('label', { class: 'choice' }, input, h('span', null, o.label));
      }),
    ),
  );
  return { el, values: () => inputs.filter((i) => i.checked).map((i) => i.value as T) };
}

export function select<T extends string>(
  options: { value: T; label: string }[],
  selected: T,
  id?: string,
): HTMLSelectElement {
  return h(
    'select',
    { id },
    options.map((o) => h('option', { value: o.value, selected: o.value === selected }, o.label)),
  );
}
