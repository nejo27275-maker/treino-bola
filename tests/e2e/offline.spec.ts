/**
 * Uso offline e atualização com o service worker REAL do build de produção.
 * (Os demais testes bloqueiam o service worker para não depender de cache.)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from 'playwright/test';
import { go, openApp, storedSessions, watchErrors } from './helpers.ts';

test.use({ serviceWorkers: 'allow' });

async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 20_000,
  });
}

async function swVersion(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const controller = navigator.serviceWorker.controller;
        if (!controller) {
          reject(new Error('sem service worker controlando a página'));
          return;
        }
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve((e.data as { version: string }).version);
        controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
      }),
  );
}

test('offline: depois da primeira visita o app abre, navega e salva sem internet', async ({
  page,
  context,
}) => {
  const errors = watchErrors(page);
  await openApp(page, '#/config');
  await expect(page.getByText(/Pronto para uso offline/)).toBeVisible({ timeout: 20_000 });
  await waitForController(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Configurações');
  await expect(page.locator('#header-status').getByText('Offline')).toBeVisible();

  // Telas principais, um simulador completo e o salvamento local funcionam sem rede.
  await go(page, '#/plano', 'Plano de preparação');
  await go(page, '#/tecnico', 'Treinamento técnico');
  await go(page, '#/leitura?semente=7');
  await page.getByRole('button', { name: 'Começar' }).click();
  for (let i = 0; i < 8; i++) {
    await page.getByRole('group', { name: 'Respostas' }).getByRole('button').first().click();
    await page.getByRole('button', { name: i < 7 ? 'Próxima situação' : 'Ver resultado' }).click();
  }
  await expect(page.getByText('Resultado salvo no histórico.')).toBeVisible();
  expect((await storedSessions(page))[0]?.kind).toBe('leitura');

  // Uma tela aberta pela primeira vez já offline também carrega (tudo foi pré-armazenado).
  await go(page, '#/simuladores/passe_brecha', 'A. Passe pela brecha');
  await page.getByRole('button', { name: 'Começar sessão' }).click();
  await expect(page.locator('main svg').first()).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test.describe('atualização do aplicativo', () => {
  const PORT = 4391;
  const BASE = `http://127.0.0.1:${PORT}/treino-bola/`;
  let dir = '';
  let server: ChildProcess | null = null;

  test.beforeAll(async () => {
    // Cópia própria do build para poder publicar uma "nova versão" sem afetar os outros testes.
    dir = await mkdtemp(path.join(os.tmpdir(), 'cfa-update-'));
    await cp(path.resolve('dist'), dir, { recursive: true });
    server = spawn(
      process.execPath,
      ['scripts/serve.mjs', '--dir', dir, '--port', String(PORT), '--base', '/treino-bola/'],
      { stdio: 'ignore' },
    );
    await expect
      .poll(
        () =>
          fetch(BASE).then(
            (r) => r.status,
            () => 0,
          ),
        { timeout: 10_000 },
      )
      .toBe(200);
  });

  test.afterAll(async () => {
    server?.kill();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('nova versão publicada: aviso, atualização a pedido e cache antigo removido', async ({
    page,
  }) => {
    await page.goto(`${BASE}#/config`);
    await expect(page.getByText(/Pronto para uso offline/)).toBeVisible({ timeout: 20_000 });
    await waitForController(page);
    const before = await swVersion(page);

    // "Publica" a nova versão: o service worker muda de conteúdo, como em um novo build.
    const swPath = path.join(dir, 'sw.js');
    const sw = await readFile(swPath, 'utf8');
    await writeFile(
      swPath,
      sw.replace(`const VERSION = "${before}";`, `const VERSION = "${before}-b";`),
    );

    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    const banner = page.locator('#banner-update');
    await expect(banner).toContainText('Nova versão do aplicativo disponível.');
    // Nada muda sem o pedido da pessoa: a versão antiga continua no controle.
    expect(await swVersion(page)).toBe(before);

    await banner.getByRole('button', { name: 'Atualizar agora' }).click();
    await page.waitForEvent('load');
    await expect(page.locator('main h1')).toHaveText('Configurações');
    await expect.poll(() => swVersion(page)).toBe(`${before}-b`);
    const caches = await page.evaluate(() => window.caches.keys());
    expect(caches.filter((k) => k.startsWith('cfa-app-'))).toEqual([`cfa-app-${before}-b`]);
  });
});
