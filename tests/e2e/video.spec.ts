import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from 'playwright/test';
import { go, openApp, storedSessions, watchErrors } from './helpers.ts';

const WEBM = path.resolve('tests/fixtures/generated/movimento.webm');

async function loadVideo(page: Page): Promise<void> {
  await page.locator('#video-galeria').setInputFiles({
    name: 'treino.webm',
    mimeType: 'video/webm',
    buffer: readFileSync(WEBM),
  });
  await expect(page.getByText(/treino\.webm · 00:0[45],\d · 320×240/)).toBeVisible({
    timeout: 15_000,
  });
}

async function currentTime(page: Page): Promise<number> {
  return page.locator('main video').evaluate((v) => (v as HTMLVideoElement).currentTime);
}

test('vídeo: abrir, reproduzir, pausar, navegar quadro a quadro e pela linha do tempo', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openApp(page, '#/video');
  await loadVideo(page);
  await page.getByRole('button', { name: '▶ Reproduzir' }).click();
  await expect(page.getByRole('button', { name: '⏸ Pausar' })).toBeVisible();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '⏸ Pausar' }).click();
  expect(await currentTime(page)).toBeGreaterThan(0.2);

  await page.getByRole('button', { name: 'Ir para o início' }).click();
  await expect.poll(() => currentTime(page)).toBe(0);
  await page.getByRole('button', { name: 'Avançar 1 segundo' }).click();
  await expect.poll(() => currentTime(page)).toBeCloseTo(1, 1);
  await page.getByRole('button', { name: 'Avançar um quadro' }).click();
  await expect.poll(() => currentTime(page)).toBeCloseTo(1 + 1 / 30, 2);
  await page.getByRole('button', { name: 'Voltar 1 segundo' }).click();
  await expect.poll(() => currentTime(page)).toBeLessThan(0.1);

  await page.getByLabel('Linha do tempo do vídeo').evaluate((el) => {
    (el as HTMLInputElement).value = '3';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => currentTime(page)).toBeCloseTo(3, 1);
  await expect(page.locator('.timer').first()).toContainText('00:03,0');
  expect(errors).toEqual([]);
});

test('vídeo: marcar momentos, capturar quadro, mapa de movimento e avaliação guiada salva', async ({
  page,
}) => {
  await openApp(page, '#/video');
  await loadVideo(page);
  await page.getByLabel('Linha do tempo do vídeo').evaluate((el) => {
    (el as HTMLInputElement).value = '2';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByLabel('Tipo de momento').selectOption('Passe');
  await page.getByRole('button', { name: 'Marcar momento atual' }).click();
  await expect(page.getByText(/00:02,\d · Passe/)).toBeVisible();

  await page.getByRole('button', { name: 'Capturar o quadro atual' }).click();
  await expect(page.locator('.thumbs img')).toHaveCount(1);

  await page.getByRole('button', { name: 'Encontrar momentos com movimento' }).click();
  await expect(page.getByText('Momentos sugeridos:')).toBeVisible({ timeout: 30_000 });
  // A animação tem movimento por volta de 1,5–2,5 s e 3,5–4,2 s.
  const peaks = await page
    .locator('main .card', { hasText: 'Mapa de movimento' })
    .getByRole('button', { name: /^00:0\d,\d$/ })
    .allTextContents();
  const seconds = peaks.map((p) => Number(p.slice(3, 5)) + Number(p.slice(6)) / 10);
  expect(seconds.some((s) => s >= 1.4 && s <= 2.7)).toBe(true);
  expect(seconds.some((s) => s >= 3.4 && s <= 4.4)).toBe(true);

  await page
    .getByRole('group', { name: 'Domínio e primeiro toque' })
    .getByRole('radio', { name: 'Bom' })
    .check();
  await page
    .getByRole('group', { name: 'Preparação para o passe' })
    .getByRole('radio', { name: 'Parcial' })
    .check();
  await page
    .getByRole('group', { name: 'Proteção da bola' })
    .getByRole('radio', { name: 'Não dá para ver no vídeo' })
    .check();
  await page.getByLabel('Observações').fill('Primeiro toque bom; preparar o passe olhando antes.');
  await page.getByRole('checkbox', { name: /Salvar os quadros/ }).check();
  await page.getByRole('button', { name: 'Salvar avaliação' }).click();
  await expect(
    page.getByText(/Avaliação salva: 2 critério\(s\) com evidência, 1 quadro\(s\) guardado\(s\)/),
  ).toBeVisible();
  await expect(
    page.locator('main .card', { hasText: 'Avaliações anteriores' }).getByText('treino.webm'),
  ).toBeVisible();
  await expect(page.getByAltText(/Quadro salvo em/)).toBeVisible();

  const sessions = await storedSessions(page);
  expect(sessions[0]?.kind).toBe('video');
  await go(page, '#/historico', 'Histórico e evolução');
  await page.getByRole('link', { name: 'Vídeo: treino.webm' }).click();
  await expect(page.getByText('Observação de vídeo').first()).toBeVisible();
});

test('vídeo: arquivo que não é vídeo e vídeo corrompido mostram mensagens claras', async ({
  page,
}) => {
  await openApp(page, '#/video');
  await page
    .locator('#video-galeria')
    .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
  await expect(page.getByRole('heading', { name: 'Este arquivo não é um vídeo' })).toBeVisible();
  await page
    .locator('#video-galeria')
    .setInputFiles({
      name: 'quebrado.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from('isto não é um webm de verdade'),
    });
  await expect(
    page.getByRole('heading', { name: /Formato não suportado|Vídeo corrompido/ }),
  ).toBeVisible({ timeout: 15_000 });
});

test('vídeo: sair com avaliação não salva pede confirmação e libera o vídeo', async ({ page }) => {
  await openApp(page, '#/video');
  await loadVideo(page);
  await page.getByRole('button', { name: 'Marcar momento atual' }).click();
  await page.evaluate(() => (location.hash = '#/'));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sair' }).click();
  await expect(page.locator('main h1')).toHaveText(/Olá/);
  expect(await page.locator('video').count()).toBe(0);
});
