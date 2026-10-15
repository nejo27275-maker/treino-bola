/** Ponto de entrada do Cláudio Futebol AI. */
import { openBackend } from './storage/backend.ts';
import { getPref } from './storage/prefs.ts';
import { Repository } from './storage/repo.ts';
import { AppContext, applyTheme } from './ui/app.ts';
import { button, pill } from './ui/components.ts';
import { h } from './ui/dom.ts';
import { icon, type IconName } from './ui/icons.ts';
import { RouteNotFound, Router } from './ui/router.ts';
import { homeScreen } from './ui/screens/home.ts';
import { loadingView } from './ui/screens/shared.ts';

const TABS: { id: string; href: string; label: string; icon: IconName }[] = [
  { id: 'inicio', href: '#/', label: 'Início', icon: 'home' },
  { id: 'treinar', href: '#/treinar', label: 'Treinar', icon: 'train' },
  { id: 'simular', href: '#/simuladores', label: 'Simular', icon: 'sim' },
  { id: 'plano', href: '#/plano', label: 'Plano', icon: 'plan' },
  { id: 'mais', href: '#/mais', label: 'Mais', icon: 'more' },
];

function earlyTheme(): void {
  const tema = getPref('tema');
  if (tema === 'claro') document.documentElement.dataset.theme = 'light';
  else if (tema === 'escuro') document.documentElement.dataset.theme = 'dark';
  if (getPref('movimento') === 'reduzir') document.documentElement.dataset.motion = 'reduce';
}

function buildTabbar(): (active: string) => void {
  const nav = document.getElementById('tabbar');
  if (!nav) return () => {};
  const links = TABS.map((t) => {
    const a = h(
      'a',
      { href: t.href, dataset: { tab: t.id } },
      icon(t.icon),
      h('span', null, t.label),
    );
    return a;
  });
  nav.replaceChildren(...links);
  return (active: string) => {
    for (const a of links) {
      if (a.dataset.tab === active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  };
}

function showBanner(id: string, ...content: (Node | string)[]): HTMLElement | null {
  const area = document.getElementById('banner-area');
  if (!area) return null;
  document.getElementById(id)?.remove();
  const el = h('div', { class: 'banner', id, role: 'status' }, ...content);
  area.appendChild(el);
  return el;
}

function errorView(error: unknown, retry: () => void): HTMLElement {
  const notFound = error instanceof RouteNotFound;
  const message = error instanceof Error ? error.message : String(error);
  return h(
    'section',
    { class: 'card tone-danger' },
    h(
      'h1',
      { tabindex: '-1' },
      notFound ? 'Página não encontrada' : 'Não foi possível abrir esta tela',
    ),
    h('p', null, notFound ? 'O endereço não corresponde a nenhuma tela do aplicativo.' : message),
    h(
      'div',
      { class: 'row' },
      notFound ? null : button('Tentar novamente', retry, { variant: 'primary' }),
      h('a', { class: 'btn', href: '#/' }, 'Ir para o início'),
    ),
  );
}

async function setupServiceWorker(
  ctx: AppContext,
  confirmLeave: () => Promise<boolean>,
): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    ctx.pwa.swStatus = 'sem-suporte';
    ctx.notifyPwa();
    return;
  }
  if (!window.isSecureContext) {
    ctx.pwa.swStatus = 'inseguro';
    ctx.notifyPwa();
    return;
  }
  try {
    const info = await fetch('build-info.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (info?.mode === 'development') {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      ctx.pwa.swStatus = 'desenvolvimento';
      ctx.notifyPwa();
      return;
    }
    let userRequestedUpdate = false;
    const registration = await navigator.serviceWorker.register('sw.js', { scope: './' });
    const markUpdate = (worker: ServiceWorker) => {
      ctx.pwa.updateReady = true;
      ctx.pwa.applyUpdate = async () => {
        // Atualizar recarrega a página: antes, a tela atual confirma (treino não salvo).
        if (!(await confirmLeave())) return;
        userRequestedUpdate = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      };
      ctx.notifyPwa();
      showBanner(
        'banner-update',
        h('span', null, 'Nova versão do aplicativo disponível.'),
        button('Atualizar agora', () => ctx.pwa.applyUpdate?.(), {
          variant: 'primary',
          small: true,
        }),
      );
    };
    if (registration.waiting && navigator.serviceWorker.controller)
      markUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) markUpdate(worker);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (userRequestedUpdate) location.reload();
    });
    await navigator.serviceWorker.ready;
    ctx.pwa.swStatus = 'ativo';
    ctx.notifyPwa();
  } catch (error) {
    ctx.pwa.swStatus = 'erro';
    ctx.pwa.swError = error instanceof Error ? error.message : String(error);
    ctx.notifyPwa();
  }
}

function setupConnectivity(ctx: AppContext): void {
  const update = () =>
    ctx.setHeaderStatus('offline', navigator.onLine ? null : pill('Offline', 'warn'));
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function setupInstallPrompt(ctx: AppContext): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    ctx.pwa.installPrompt = event as unknown as PwaPromptEvent;
    ctx.notifyPwa();
  });
  window.addEventListener('appinstalled', () => {
    ctx.pwa.installed = true;
    ctx.pwa.installPrompt = null;
    ctx.notifyPwa();
  });
  if (matchMedia('(display-mode: standalone)').matches) ctx.pwa.installed = true;
}

interface PwaPromptEvent {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
}

function setupGlobalErrors(ctx: AppContext): void {
  let last = 0;
  const report = (message: string) => {
    const now = Date.now();
    if (now - last < 4000) return;
    last = now;
    ctx.toast(`Algo deu errado: ${message}`, 'erro', 6000);
  };
  window.addEventListener('error', (e) => report(e.message || 'erro inesperado'));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string } | undefined;
    report(reason?.message ?? String(e.reason));
  });
}

async function main(): Promise<void> {
  earlyTheme();
  const outlet = document.getElementById('conteudo');
  if (!outlet) return;
  const { backend, warning } = await openBackend();
  const repo = new Repository(backend);
  const settings = await repo.getSettings().catch(() => null);
  const ctx = new AppContext(
    repo,
    settings ?? { som: true, vibracao: true, tema: 'sistema', reduzirAnimacoes: false },
    warning,
  );
  applyTheme(ctx.settings);
  setupGlobalErrors(ctx);
  if (warning) showBanner('banner-storage', h('span', null, warning));
  const setActiveTab = buildTabbar();
  const router = new Router({
    outlet,
    loading: loadingView,
    onError: errorView,
    onChange: (tab) => setActiveTab(tab),
  });
  ctx.navigate = (path) => router.navigate(path);
  ctx.refresh = () => router.refresh();
  // Desbloqueia o áudio no primeiro toque (política dos navegadores).
  document.addEventListener('pointerdown', () => ctx.feedback.unlock(), { once: true });

  // Só a tela inicial vem no primeiro carregamento; as demais são baixadas quando abertas
  // (o service worker já guarda todas para uso offline).
  const screens = {
    avaliacao: () => import('./ui/screens/avaliacao.ts'),
    camera: () => import('./ui/screens/camera.ts'),
    config: () => import('./ui/screens/config.ts'),
    fisico: () => import('./ui/screens/fisico.ts'),
    historico: () => import('./ui/screens/historico.ts'),
    leitura: () => import('./ui/screens/leitura.ts'),
    mental: () => import('./ui/screens/mental.ts'),
    menus: () => import('./ui/screens/menus.ts'),
    perfil: () => import('./ui/screens/perfil.ts'),
    plano: () => import('./ui/screens/plano.ts'),
    simuladores: () => import('./ui/screens/simuladores.ts'),
    tecnico: () => import('./ui/screens/tecnico.ts'),
    video: () => import('./ui/screens/video.ts'),
  };
  const id = (p: Record<string, string>, key: string) => p[key] ?? '';

  router
    .add('/', 'inicio', () => homeScreen(ctx))
    .add('/perfil', 'mais', async () => (await screens.perfil()).perfilScreen(ctx))
    .add('/treinar', 'treinar', async () => (await screens.menus()).treinarScreen(ctx))
    .add('/avaliacao', 'treinar', async () => (await screens.avaliacao()).avaliacaoScreen(ctx))
    .add('/tecnico', 'treinar', async (_p, q) => (await screens.tecnico()).tecnicoScreen(ctx, q))
    .add('/tecnico/:id', 'treinar', async (p) =>
      (await screens.tecnico()).exerciseDetailScreen(ctx, id(p, 'id')),
    )
    .add('/tecnico/:id/sessao', 'treinar', async (p) =>
      (await screens.tecnico()).exerciseSessionScreen(ctx, id(p, 'id')),
    )
    .add('/fisico', 'treinar', async () => (await screens.fisico()).fisicoListScreen(ctx))
    .add('/fisico/:id', 'treinar', async (p) =>
      (await screens.fisico()).workoutScreen(ctx, id(p, 'id')),
    )
    .add('/leitura', 'treinar', async (_p, q) => (await screens.leitura()).leituraScreen(ctx, q))
    .add('/mental', 'treinar', async () => (await screens.mental()).mentalListScreen(ctx))
    .add('/mental/:id', 'treinar', async (p) =>
      (await screens.mental()).mentalActivityScreen(ctx, id(p, 'id')),
    )
    .add('/simuladores', 'simular', async () =>
      (await screens.simuladores()).simulatorListScreen(ctx),
    )
    .add('/simuladores/:mode', 'simular', async (p, q) =>
      (await screens.simuladores()).simulatorScreen(ctx, id(p, 'mode'), q),
    )
    .add('/plano', 'plano', async () => (await screens.plano()).planoScreen(ctx))
    .add('/historico', 'mais', async (_p, q) => (await screens.historico()).historicoScreen(ctx, q))
    .add('/historico/:id', 'mais', async (p) =>
      (await screens.historico()).sessionDetailScreen(ctx, id(p, 'id')),
    )
    .add('/video', 'mais', async () => (await screens.video()).videoScreen(ctx))
    .add('/camera', 'mais', async (_p, q) => (await screens.camera()).cameraScreen(ctx, q))
    .add('/config', 'mais', async () => (await screens.config()).configScreen(ctx))
    .add('/mais', 'mais', async () => (await screens.menus()).maisScreen(ctx))
    .add('/sobre', 'mais', async () => (await screens.menus()).sobreScreen(ctx));

  setupConnectivity(ctx);
  setupInstallPrompt(ctx);
  // "Pular para o conteúdo" leva o foco à área principal sem criar uma entrada no histórico.
  document
    .querySelector<HTMLAnchorElement>('a[href="#conteudo"]')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      outlet.focus();
    });

  router.start();
  void setupServiceWorker(ctx, () => router.confirmLeave());
  prefetchWhenIdle(Object.values(screens));
}

/**
 * Depois que a primeira tela aparece, baixa as demais telas em segundo plano (quando o
 * navegador estiver ocioso), para a primeira visita a cada uma não esperar pela rede.
 * Respeita o "economia de dados" do aparelho.
 */
function prefetchWhenIdle(loaders: (() => Promise<unknown>)[]): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const run = () => {
    for (const load of loaders) void load().catch(() => {});
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: object) => void })
    .requestIdleCallback;
  window.addEventListener(
    'load',
    () => (idle ? idle(run, { timeout: 4000 }) : window.setTimeout(run, 1500)),
    { once: true },
  );
}

void main().catch((error) => {
  const outlet = document.getElementById('conteudo');
  if (outlet) {
    outlet.replaceChildren(
      h(
        'section',
        { class: 'card tone-danger' },
        h('h1', null, 'Não foi possível iniciar o aplicativo'),
        h('p', null, error instanceof Error ? error.message : String(error)),
        h(
          'p',
          null,
          'Recarregue a página. Se o problema continuar, verifique se o navegador está atualizado.',
        ),
      ),
    );
  }
});
