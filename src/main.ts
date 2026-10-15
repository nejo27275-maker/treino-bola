/** Ponto de entrada do Cláudio Futebol AI. */
import { openBackend } from './storage/backend.ts';
import { getPref } from './storage/prefs.ts';
import { Repository } from './storage/repo.ts';
import { AppContext, applyTheme } from './ui/app.ts';
import { button, pill } from './ui/components.ts';
import { h } from './ui/dom.ts';
import { icon, type IconName } from './ui/icons.ts';
import { RouteNotFound, Router } from './ui/router.ts';
import { avaliacaoScreen } from './ui/screens/avaliacao.ts';
import { cameraScreen } from './ui/screens/camera.ts';
import { configScreen } from './ui/screens/config.ts';
import { exerciseDetailScreen, exerciseSessionScreen, tecnicoScreen } from './ui/screens/tecnico.ts';
import { fisicoListScreen, workoutScreen } from './ui/screens/fisico.ts';
import { historicoScreen, sessionDetailScreen } from './ui/screens/historico.ts';
import { homeScreen } from './ui/screens/home.ts';
import { leituraScreen } from './ui/screens/leitura.ts';
import { maisScreen, sobreScreen, treinarScreen } from './ui/screens/menus.ts';
import { mentalListScreen, mentalActivityScreen } from './ui/screens/mental.ts';
import { perfilScreen } from './ui/screens/perfil.ts';
import { planoScreen } from './ui/screens/plano.ts';
import { loadingView } from './ui/screens/shared.ts';
import { simulatorListScreen, simulatorScreen } from './ui/screens/simuladores.ts';
import { videoScreen } from './ui/screens/video.ts';

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
    const a = h('a', { href: t.href, dataset: { tab: t.id } }, icon(t.icon), h('span', null, t.label));
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
    h('h1', { tabindex: '-1' }, notFound ? 'Página não encontrada' : 'Não foi possível abrir esta tela'),
    h('p', null, notFound ? 'O endereço não corresponde a nenhuma tela do aplicativo.' : message),
    h('div', { class: 'row' }, notFound ? null : button('Tentar novamente', retry, { variant: 'primary' }), h('a', { class: 'btn', href: '#/' }, 'Ir para o início')),
  );
}

async function setupServiceWorker(ctx: AppContext): Promise<void> {
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
      ctx.pwa.applyUpdate = () => {
        userRequestedUpdate = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      };
      ctx.notifyPwa();
      showBanner(
        'banner-update',
        h('span', null, 'Nova versão do aplicativo disponível.'),
        button('Atualizar agora', () => ctx.pwa.applyUpdate?.(), { variant: 'primary', small: true }),
      );
    };
    if (registration.waiting && navigator.serviceWorker.controller) markUpdate(registration.waiting);
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
  const update = () => ctx.setHeaderStatus('offline', navigator.onLine ? null : pill('Offline', 'warn'));
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
  const ctx = new AppContext(repo, settings ?? { som: true, vibracao: true, tema: 'sistema', reduzirAnimacoes: false }, warning);
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

  router
    .add('/', 'inicio', () => homeScreen(ctx))
    .add('/perfil', 'mais', () => perfilScreen(ctx))
    .add('/treinar', 'treinar', () => treinarScreen(ctx))
    .add('/avaliacao', 'treinar', () => avaliacaoScreen(ctx))
    .add('/tecnico', 'treinar', (_p, q) => tecnicoScreen(ctx, q))
    .add('/tecnico/:id', 'treinar', (p) => exerciseDetailScreen(ctx, p.id ?? ''))
    .add('/tecnico/:id/sessao', 'treinar', (p) => exerciseSessionScreen(ctx, p.id ?? ''))
    .add('/fisico', 'treinar', () => fisicoListScreen(ctx))
    .add('/fisico/:id', 'treinar', (p) => workoutScreen(ctx, p.id ?? ''))
    .add('/leitura', 'treinar', (_p, q) => leituraScreen(ctx, q))
    .add('/mental', 'treinar', () => mentalListScreen(ctx))
    .add('/mental/:id', 'treinar', (p) => mentalActivityScreen(ctx, p.id ?? ''))
    .add('/simuladores', 'simular', () => simulatorListScreen(ctx))
    .add('/simuladores/:mode', 'simular', (p, q) => simulatorScreen(ctx, p.mode ?? '', q))
    .add('/plano', 'plano', () => planoScreen(ctx))
    .add('/historico', 'mais', (_p, q) => historicoScreen(ctx, q))
    .add('/historico/:id', 'mais', (p) => sessionDetailScreen(ctx, p.id ?? ''))
    .add('/video', 'mais', () => videoScreen(ctx))
    .add('/camera', 'mais', () => cameraScreen(ctx))
    .add('/config', 'mais', () => configScreen(ctx))
    .add('/mais', 'mais', () => maisScreen(ctx))
    .add('/sobre', 'mais', () => sobreScreen(ctx));

  setupConnectivity(ctx);
  setupInstallPrompt(ctx);
  router.start();
  void setupServiceWorker(ctx);
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
        h('p', null, 'Recarregue a página. Se o problema continuar, verifique se o navegador está atualizado.'),
      ),
    );
  }
});
