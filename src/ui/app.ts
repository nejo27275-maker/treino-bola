/** Contexto compartilhado pelas telas: dados, navegação, avisos, diálogos e PWA. */
import { catalog } from '../content/catalog.ts';
import { ERROR_LABELS } from '../content/exercises.ts';
import { localDate } from '../core/dates.ts';
import { registerErrorLabels, runEngine, type EngineOutput } from '../core/engine.ts';
import { buildPlan, type Plan } from '../core/planner.ts';
import type {
  Competition,
  Profile,
  ResultRecord,
  Settings,
  SimLevels,
  TrainingSession,
} from '../core/types.ts';
import { Feedback } from '../media/sound.ts';
import { DEFAULT_SETTINGS, type Repository } from '../storage/repo.ts';
import { clearPrefs, setPref } from '../storage/prefs.ts';
import { h, type Child } from './dom.ts';

registerErrorLabels(ERROR_LABELS);

export interface Snapshot {
  today: string;
  profile: Profile | null;
  competition: Competition;
  sessions: TrainingSession[];
  results: ResultRecord[];
  engine: EngineOutput;
  plan: Plan;
  simLevels: SimLevels;
  onboardingSeen: boolean;
}

export interface PwaState {
  installPrompt: { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> } | null;
  swStatus: 'sem-suporte' | 'inseguro' | 'registrando' | 'ativo' | 'erro' | 'desenvolvimento';
  swError?: string;
  updateReady: boolean;
  applyUpdate?: () => void;
  installed: boolean;
}

export interface ConfirmOptions {
  title: string;
  message: Child;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export class AppContext {
  readonly repo: Repository;
  settings: Settings;
  readonly storageWarning?: string;
  readonly feedback: Feedback;
  readonly pwa: PwaState = {
    installPrompt: null,
    swStatus: 'registrando',
    updateReady: false,
    installed: false,
  };
  navigate: (path: string) => void = () => {};
  refresh: () => void = () => {};
  private headerStatus = new Map<string, HTMLElement>();
  private pwaListeners = new Set<() => void>();

  constructor(repo: Repository, settings: Settings, storageWarning?: string) {
    this.repo = repo;
    this.settings = settings;
    this.storageWarning = storageWarning;
    this.feedback = new Feedback(() => this.settings);
  }

  now(): Date {
    return new Date();
  }

  today(): string {
    return localDate(this.now());
  }

  async snapshot(): Promise<Snapshot> {
    const today = this.today();
    const [profile, competition, sessions, results, simLevels, onboardingSeen] = await Promise.all([
      this.repo.getProfile(),
      this.repo.getCompetition(),
      this.repo.listSessions(),
      this.repo.listResults(),
      this.repo.getSimLevels(),
      this.repo.getOnboardingSeen(),
    ]);
    const engine = runEngine({ today, results, sessions, profile });
    const plan = buildPlan({ today, competition, profile, engine, sessions, catalog });
    return {
      today,
      profile,
      competition,
      sessions,
      results,
      engine,
      plan,
      simLevels,
      onboardingSeen,
    };
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.settings = settings;
    await this.repo.saveSettings(settings);
    applyTheme(settings);
  }

  /** Apaga todos os dados do aplicativo (banco e preferências) e volta ao padrão. */
  async eraseEverything(): Promise<void> {
    await this.repo.clearAll();
    clearPrefs();
    this.settings = { ...DEFAULT_SETTINGS };
    applyTheme(this.settings, false);
  }

  toast(message: string, kind: 'info' | 'sucesso' | 'erro' = 'info', ms = 4000): void {
    const area = document.getElementById('toast-area');
    if (!area) return;
    const el = h('div', { class: `toast ${kind}` }, message);
    area.appendChild(el);
    while (area.children.length > 3) area.firstElementChild?.remove();
    window.setTimeout(() => el.remove(), ms);
  }

  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const root = document.getElementById('dialog-root');
      if (!root) {
        resolve(window.confirm(typeof opts.message === 'string' ? opts.message : opts.title));
        return;
      }
      const previous = document.activeElement as HTMLElement | null;
      const titleId = `dlg-title-${Date.now()}`;
      const close = (value: boolean) => {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        previous?.focus?.();
        resolve(value);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        } else if (e.key === 'Tab') {
          const focusables = [...dialog.querySelectorAll<HTMLElement>('button')];
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (!first || !last) return;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      const cancel = h(
        'button',
        { type: 'button', class: 'btn ghost', onclick: () => close(false) },
        opts.cancelLabel ?? 'Cancelar',
      );
      const ok = h(
        'button',
        {
          type: 'button',
          class: opts.danger ? 'btn danger' : 'btn primary',
          onclick: () => close(true),
        },
        opts.confirmLabel ?? 'Confirmar',
      );
      const dialog = h(
        'div',
        { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
        h('h2', { id: titleId }, opts.title),
        typeof opts.message === 'string' ? h('p', null, opts.message) : opts.message,
        h(
          'div',
          { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } },
          cancel,
          ok,
        ),
      );
      const backdrop = h(
        'div',
        { class: 'dialog-backdrop', onclick: (e: Event) => e.target === backdrop && close(false) },
        dialog,
      );
      root.appendChild(backdrop);
      document.addEventListener('keydown', onKey, true);
      (opts.danger ? cancel : ok).focus();
    });
  }

  /** Indicadores no cabeçalho (ex.: câmera ligada, sem conexão). */
  setHeaderStatus(key: string, el: HTMLElement | null): void {
    const container = document.getElementById('header-status');
    const old = this.headerStatus.get(key);
    old?.remove();
    this.headerStatus.delete(key);
    if (el && container) {
      container.appendChild(el);
      this.headerStatus.set(key, el);
    }
  }

  onPwaChange(listener: () => void): () => void {
    this.pwaListeners.add(listener);
    return () => this.pwaListeners.delete(listener);
  }

  notifyPwa(): void {
    for (const l of this.pwaListeners) l();
  }
}

/** Aplica tema e animações. Com `persist`, guarda a escolha para a próxima abertura. */
export function applyTheme(settings: Settings, persist = true): void {
  const root = document.documentElement;
  if (settings.tema === 'sistema') delete root.dataset.theme;
  else root.dataset.theme = settings.tema === 'claro' ? 'light' : 'dark';
  if (settings.reduzirAnimacoes) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
  if (persist) {
    setPref('tema', settings.tema);
    setPref('movimento', settings.reduzirAnimacoes ? 'reduzir' : 'normal');
  }
}
