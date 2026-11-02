/**
 * Comportamento dentro do APK, simulado no Chromium: a ponte `ClaudioAndroid` (que o app
 * Android injeta no WebView) passa a existir antes de a página carregar.
 */
import { expect, test, type Page } from 'playwright/test';
import { openApp, watchErrors } from './helpers.ts';

interface Salvo {
  name: string;
  mime: string;
  content: string;
}

async function simularApk(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const salvos: { name: string; mime: string; content: string }[] = [];
    const w = window as unknown as { __salvos: typeof salvos; ClaudioAndroid: unknown };
    w.__salvos = salvos;
    w.ClaudioAndroid = {
      saveFile: (name: string, mime: string, content: string) =>
        salvos.push({ name, mime, content }),
    };
  });
}

test('APK: aparece como instalado e offline, sem service worker nem limpeza de cache', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await simularApk(page);
  await openApp(page, '#/config');
  await expect(
    page.getByText('Aplicativo Android: todos os arquivos estão dentro do app'),
  ).toBeVisible();
  await expect(page.getByText('Offline: pronto')).toBeVisible();
  await expect(page.getByText('O aplicativo já está instalado neste aparelho.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remover arquivos offline' })).toHaveCount(0);
  // Os dados ficam na pasta do app: nada de "o navegador pode limpar" nem botão de proteção.
  await expect(page.getByText(/guardado no próprio app/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Proteger meus dados' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('APK: exportar entrega o JSON ao "Salvar como" do Android (sem download de blob)', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await simularApk(page);
  await openApp(page, '#/config');
  let baixou = false;
  page.on('download', () => (baixou = true));
  await page.getByRole('button', { name: 'Exportar meus dados (JSON)' }).click();
  await expect(page.getByText('Escolha onde salvar o arquivo na janela do Android.')).toBeVisible();
  const salvos = await page.evaluate(() => (window as unknown as { __salvos: Salvo[] }).__salvos);
  expect(salvos).toHaveLength(1);
  expect(salvos[0]?.name).toBe('claudio-futebol-ai-backup-2026-10-14.json');
  expect(salvos[0]?.mime).toBe('application/json');
  const dados = JSON.parse(salvos[0]?.content ?? '{}');
  expect(dados.app).toBe('claudio-futebol-ai');
  expect(dados.schemaVersion).toBe(1);
  expect(baixou).toBe(false);
  expect(errors).toEqual([]);
});
