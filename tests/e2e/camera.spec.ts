/**
 * Testes de câmera com dispositivos FALSOS do Chromium. Validam o fluxo do aplicativo
 * (permissões, ligar/desligar, liberar a câmera, quadros reais passando pelo detector),
 * mas não substituem o teste em um celular com câmera física.
 */
import { expect, test, type Page } from 'playwright/test';
import { go, openApp, storedSessions } from './helpers.ts';

/** Guarda as transmissões criadas para verificar se todas as faixas foram encerradas. */
async function trackStreams(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[] };
    w.__streams = [];
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!original) return;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      w.__streams.push(stream);
      return stream;
    };
  });
}

async function liveTracks(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __streams: MediaStream[] }).__streams
        .flatMap((s) => s.getTracks())
        .filter((t) => t.readyState === 'live').length,
  );
}

test('@parada ligar e desligar libera todas as faixas e mostra o indicador', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['camera']);
  await trackStreams(page);
  await openApp(page, '#/camera');
  await page.getByRole('button', { name: 'Ligar câmera' }).click();
  const indicator = page.locator('#header-status').getByText('Câmera ligada');
  await expect(indicator).toBeVisible();
  await expect(page.getByText(/nada é gravado ou enviado/)).toBeVisible();
  expect(await liveTracks(page)).toBe(1);
  await page.getByRole('button', { name: 'Desligar câmera' }).click();
  await expect(indicator).toHaveCount(0);
  expect(await liveTracks(page)).toBe(0);
  await expect(page.locator('main video')).toHaveJSProperty('srcObject', null);
});

test('@parada sair da tela com a câmera ligada encerra a câmera', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await trackStreams(page);
  await openApp(page, '#/camera');
  await page.getByRole('button', { name: 'Ligar câmera' }).click();
  await expect(page.locator('#header-status').getByText('Câmera ligada')).toBeVisible();
  await go(page, '#/', /Olá/);
  expect(await liveTracks(page)).toBe(0);
  await expect(page.locator('#header-status').getByText('Câmera ligada')).toHaveCount(0);
});

test('@parada cena parada: calibra, mede tentativas sem movimento e salva a série', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['camera']);
  await openApp(page, '#/camera?tentativas=2');
  await page.getByRole('button', { name: 'Ligar câmera' }).click();
  await page.getByRole('tab', { name: 'Reação com movimento' }).click();
  await page.getByRole('button', { name: 'Começar série' }).click();
  await expect(page.getByText(/Calibração: ruído de 0,0% dos pixels/)).toBeVisible({
    timeout: 6000,
  });
  await expect(page.locator('.stimulus.go')).toBeVisible({ timeout: 6000 });
  await expect(page.getByText('Fim da série')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/0\/2 reações no lado certo/)).toBeVisible();
  const sessions = await storedSessions(page);
  expect(sessions[0]?.kind).toBe('camera');
  expect(sessions[0]?.summary).toMatchObject({ attempts: 2, successes: 0 });
});

test('@parada treino livre: a câmera é só espelho e a contagem manual é salva', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['camera']);
  await openApp(page, '#/camera');
  await page.getByRole('button', { name: 'Ligar câmera' }).click();
  await expect(page.getByText(/Nenhuma análise automática é feita neste modo/)).toBeVisible();
  await page.getByRole('button', { name: '✓ Acerto' }).click();
  await page.getByRole('button', { name: '✗ Erro' }).click();
  await page.getByRole('button', { name: 'Salvar sessão' }).click();
  await expect(page.getByText('Sessão salva no histórico.')).toBeVisible();
  expect((await storedSessions(page))[0]?.summary).toEqual({ attempts: 2, successes: 1 });
});

/** Maior largura de cada barra (esquerda/direita) observada durante `ms` milissegundos. */
async function meterPeaks(page: Page, ms: number): Promise<{ left: number; right: number }> {
  return page.evaluate(async (duration) => {
    const bars = [...document.querySelectorAll<HTMLElement>('.meter .bar > span')];
    const peak = { left: 0, right: 0 };
    const end = performance.now() + duration;
    while (performance.now() < end) {
      peak.left = Math.max(peak.left, parseFloat(bars[0]?.style.width || '0'));
      peak.right = Math.max(peak.right, parseFloat(bars[1]?.style.width || '0'));
      await new Promise((r) => setTimeout(r, 30));
    }
    return peak;
  }, ms);
}

test('@movimento o lado do movimento vem dos quadros reais e respeita o espelhamento', async ({
  page,
  context,
}) => {
  // Câmera falsa: um bloco claro pisca só na metade ESQUERDA da imagem bruta.
  await context.grantPermissions(['camera']);
  await openApp(page, '#/camera');
  await page.getByRole('button', { name: 'Ligar câmera' }).click();
  await page.getByRole('tab', { name: 'Reação com movimento' }).click();
  await page.getByRole('button', { name: 'Começar série' }).click();
  // O pisca-pisca contínuo é recusado na calibração (seria uma "largada falsa" eterna).
  await expect(page.getByText(/Muito movimento com você parado/)).toBeVisible({ timeout: 8000 });

  // De frente para a câmera, a imagem é espelhada: o lado esquerdo da imagem bruta é a
  // DIREITA do jogador.
  const facing = page.getByRole('checkbox', { name: /Estou de frente para a câmera/ });
  await expect(facing).toBeChecked();
  const mirrored = await meterPeaks(page, 1500);
  expect(mirrored.right).toBeGreaterThan(5);
  expect(mirrored.left).toBe(0);

  // Sem espelhamento, o mesmo movimento aparece à esquerda.
  await facing.uncheck();
  const raw = await meterPeaks(page, 1500);
  expect(raw.left).toBeGreaterThan(5);
  expect(raw.right).toBe(0);
});

test('@padrao quadros reais da câmera passam pelo detector; cena agitada é recusada na calibração', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['camera']);
  await openApp(page, '#/camera?tentativas=2');
  await page.getByRole('button', { name: 'Ligar câmera' }).click();
  await page.getByRole('tab', { name: 'Reação com movimento' }).click();
  await page.getByRole('button', { name: 'Começar série' }).click();
  // A câmera falsa padrão do Chromium mostra uma animação contínua.
  await expect(page.getByText(/Muito movimento com você parado/)).toBeVisible({ timeout: 8000 });
  const widths = await page
    .locator('.meter .bar > span')
    .evaluateAll((els) => els.map((e) => parseFloat((e as HTMLElement).style.width)));
  expect(Math.max(...widths)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Calibrar de novo' })).toBeVisible();
});

test('@negada permissão negada mostra como liberar a câmera', async ({ page }) => {
  await openApp(page, '#/camera');
  await page.getByRole('button', { name: 'Ligar câmera' }).click();
  await expect(page.getByRole('heading', { name: 'Permissão da câmera negada' })).toBeVisible();
  await expect(page.getByText(/mude "Câmera" para "Permitir"/)).toBeVisible();
  await expect(page.locator('#header-status').getByText('Câmera ligada')).toHaveCount(0);
});

test('@negada sem HTTPS a tela explica o requisito (contexto inseguro simulado)', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'isSecureContext', { value: false }),
  );
  await openApp(page, '#/camera');
  await expect(page.getByRole('heading', { name: 'A câmera precisa de HTTPS' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ligar câmera' })).toHaveCount(0);
});
