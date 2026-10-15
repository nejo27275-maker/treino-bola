/**
 * Roteador por hash (#/caminho). Funciona em hospedagem estática (ex.: GitHub Pages) e
 * offline. Ao trocar de tela, chama destroy() da tela anterior para liberar câmera,
 * vídeos, temporizadores e URLs temporárias.
 */

export interface Screen {
  title: string;
  el: HTMLElement;
  destroy?: () => void;
  /** Retorna false para impedir a saída (ex.: sessão em andamento não salva). */
  canLeave?: () => boolean | Promise<boolean>;
}

export type RouteParams = Record<string, string>;
export type ScreenFactory = (params: RouteParams, query: URLSearchParams) => Screen | Promise<Screen>;

interface Route {
  pattern: RegExp;
  keys: string[];
  factory: ScreenFactory;
  tab: string;
}

export function parseHash(hash: string): { path: string; query: URLSearchParams } {
  const raw = hash.replace(/^#/, '') || '/';
  const [path = '/', queryString = ''] = raw.split('?');
  return { path: path.startsWith('/') ? path : `/${path}`, query: new URLSearchParams(queryString) };
}

export class Router {
  private routes: Route[] = [];
  private current: Screen | null = null;
  private currentHash = '';
  private ignoreNext = false;
  private renderToken = 0;
  private readonly outlet: HTMLElement;
  private readonly onChange: (tab: string, title: string) => void;
  private readonly onError: (error: unknown, retry: () => void) => HTMLElement;
  private readonly loading: () => HTMLElement;

  constructor(opts: {
    outlet: HTMLElement;
    onChange: (tab: string, title: string) => void;
    onError: (error: unknown, retry: () => void) => HTMLElement;
    loading: () => HTMLElement;
  }) {
    this.outlet = opts.outlet;
    this.onChange = opts.onChange;
    this.onError = opts.onError;
    this.loading = opts.loading;
  }

  add(path: string, tab: string, factory: ScreenFactory): this {
    const keys: string[] = [];
    const pattern = new RegExp(
      `^${path.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, key: string) => {
        keys.push(key);
        return '([^/]+)';
      })}\\/?$`,
    );
    this.routes.push({ pattern, keys, factory, tab });
    return this;
  }

  start(): void {
    window.addEventListener('hashchange', () => void this.handle());
    void this.handle();
  }

  navigate(path: string): void {
    const target = path.startsWith('#') ? path : `#${path}`;
    if (location.hash === target) void this.handle(true);
    else location.hash = target;
  }

  /** Recarrega a tela atual (ex.: depois de importar dados). */
  refresh(): void {
    void this.handle(true);
  }

  /** Encerra a tela atual sem perguntar (usado ao apagar todos os dados). */
  destroyCurrent(): void {
    this.current?.destroy?.();
    this.current = null;
  }

  private async handle(force = false): Promise<void> {
    if (this.ignoreNext) {
      this.ignoreNext = false;
      return;
    }
    const hash = location.hash || '#/';
    if (!force && hash === this.currentHash && this.current) return;
    if (this.current?.canLeave && hash !== this.currentHash) {
      const ok = await this.current.canLeave();
      if (!ok) {
        this.ignoreNext = true;
        location.hash = this.currentHash;
        return;
      }
    }
    const token = ++this.renderToken;
    this.current?.destroy?.();
    this.current = null;
    this.currentHash = hash;
    const { path, query } = parseHash(hash);
    const route = this.routes.find((r) => r.pattern.test(path));
    this.outlet.replaceChildren(this.loading());
    const run = async () => {
      try {
        if (!route) throw new RouteNotFound(path);
        const match = route.pattern.exec(path) as RegExpExecArray;
        const params: RouteParams = {};
        route.keys.forEach((key, i) => {
          params[key] = decodeURIComponent(match[i + 1] ?? '');
        });
        const screen = await route.factory(params, query);
        if (token !== this.renderToken) {
          screen.destroy?.();
          return;
        }
        this.current = screen;
        this.outlet.replaceChildren(screen.el);
        document.title = `${screen.title} · Cláudio Futebol AI`;
        this.onChange(route.tab, screen.title);
        window.scrollTo(0, 0);
        const heading = this.outlet.querySelector<HTMLElement>('h1');
        (heading ?? this.outlet).focus({ preventScroll: true });
      } catch (error) {
        if (token !== this.renderToken) return;
        this.outlet.replaceChildren(this.onError(error, () => void this.handle(true)));
        this.onChange(route?.tab ?? '', 'Erro');
      }
    };
    await run();
  }
}

export class RouteNotFound extends Error {
  constructor(path: string) {
    super(`Página não encontrada: ${path}`);
    this.name = 'RouteNotFound';
  }
}
