import path from 'node:path';
import { defineConfig } from 'playwright/test';

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}/treino-bola/`;
const fakeVideo = (name: string) => path.resolve('tests/fixtures/generated', name);

/**
 * O aplicativo é servido sob /treino-bola/ (como no GitHub Pages) para garantir que todos
 * os caminhos são relativos. O build é feito antes de subir o servidor.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    viewport: { width: 360, height: 740 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'app', testIgnore: /camera\.spec\.ts/ },
    {
      name: 'camera-parada',
      testMatch: /camera\.spec\.ts/,
      grep: /@parada/,
      use: {
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${fakeVideo('parado.y4m')}`,
          ],
        },
      },
    },
    {
      name: 'camera-movimento',
      testMatch: /camera\.spec\.ts/,
      grep: /@movimento/,
      use: {
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${fakeVideo('movimento-esquerda.y4m')}`,
          ],
        },
      },
    },
    {
      name: 'camera-padrao',
      testMatch: /camera\.spec\.ts/,
      grep: /@padrao/,
      use: {
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
    {
      name: 'camera-sem-permissao',
      testMatch: /camera\.spec\.ts/,
      grep: /@negada/,
      // A interface falsa do Chromium recusa o pedido: o getUserMedia real falha com
      // NotAllowedError, como quando a pessoa toca em "Bloquear".
      use: {
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream=deny', '--use-fake-device-for-media-stream'],
        },
      },
    },
  ],
  webServer: {
    command: `node scripts/build.mjs && node scripts/serve.mjs --dir dist --port ${PORT} --base /treino-bola/`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
