/*
 * Service worker do Cláudio Futebol AI (gerado por scripts/build.mjs — não edite dist/sw.js).
 *
 * Estratégia:
 * - Na instalação, guarda todos os arquivos do aplicativo em um cache versionado.
 * - Requisições do próprio site são atendidas primeiro pelo cache (funciona offline).
 * - Navegações retornam o index.html armazenado (aplicativo de página única).
 * - Arquivos opcionais do detector de pose (vendor/ e models/) só são guardados quando
 *   o próprio aplicativo pede, em um cache separado cujo nome muda com a versão desses
 *   arquivos (a versão antiga é apagada na ativação).
 * - Nada de outros domínios é interceptado, armazenado ou enviado.
 */
const VERSION = 'sem-build'; // @build:version
const DEV_MODE = true; // @build:dev
const PRECACHE = []; // @build:precache
const APP_CACHE = `cfa-app-${VERSION}`;
const OPTIONAL_CACHE = 'cfa-opcional-sem-pose'; // @build:optional-cache

self.addEventListener('install', (event) => {
  if (DEV_MODE) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      const requests = PRECACHE.map(
        (entry) => new Request(new URL(entry.url, self.registration.scope), { cache: 'reload' }),
      );
      await cache.addAll(requests);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (DEV_MODE) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.startsWith('cfa-app-')).map((k) => caches.delete(k)),
        );
        await self.registration.unregister();
        return;
      }
      // Remove versões antigas do aplicativo e dos arquivos opcionais do detector de pose.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith('cfa-app-') && key !== APP_CACHE) ||
              (key.startsWith('cfa-opcional-') && key !== OPTIONAL_CACHE),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION, precached: PRECACHE.length });
  }
});

function isOptionalAsset(url) {
  const scope = new URL(self.registration.scope);
  const relative = url.pathname.startsWith(scope.pathname)
    ? url.pathname.slice(scope.pathname.length)
    : url.pathname;
  return relative.startsWith('vendor/') || relative.startsWith('models/');
}

async function fromAppCache(request) {
  const cache = await caches.open(APP_CACHE);
  return cache.match(request, { ignoreSearch: true });
}

async function handleNavigation(request) {
  const cached = await fromAppCache(new URL('index.html', self.registration.scope).href);
  if (cached) return cached;
  return fetch(request);
}

async function handleOptional(request) {
  const cache = await caches.open(OPTIONAL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  return fetch(request);
}

async function handleAsset(request) {
  const cached = await fromAppCache(request);
  if (cached) return cached;
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  if (DEV_MODE) return;
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isOptionalAsset(url)) {
    event.respondWith(handleOptional(request));
    return;
  }
  event.respondWith(handleAsset(request));
});
