import { readFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { go, openApp, storedSessions, watchErrors } from './helpers.ts';

/** Arquivo em memória (evita caminhos com acentos, que o Chromium não lê neste ambiente). */
function jsonFile(name: string, content: string) {
  return { name, mimeType: 'application/json', buffer: Buffer.from(content, 'utf8') };
}

async function recordQuickSession(page: Page): Promise<void> {
  await go(page, '#/tecnico/passe-porta/sessao', /Passe na porta/);
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByRole('button', { name: '✓ Acerto' }).click();
  await page.getByRole('button', { name: '✗ Erro' }).click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await page.getByRole('button', { name: 'Salvar sessão' }).click();
  await expect(page.getByRole('heading', { name: 'Sessão registrada ✓' })).toBeVisible();
}

test('dados persistem após recarregar; exportar, apagar e importar de volta', async ({
  page,
}, testInfo) => {
  const errors = watchErrors(page);
  await openApp(page, '#/perfil');
  await page.getByLabel('Como quer ser chamado? (opcional)').fill('Lia');
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  // A gravação é assíncrona e navega para a avaliação ao terminar; espera antes de mudar de rota.
  await expect(page.getByText('Perfil salvo. Suas recomendações foram atualizadas.')).toBeVisible();
  await recordQuickSession(page);

  await page.reload();
  await go(page, '#/', /Olá, Lia!/);
  expect(await storedSessions(page)).toHaveLength(1);

  await go(page, '#/config', 'Configurações');
  await expect(page.getByText('IndexedDB (permanece ao recarregar)')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados (JSON)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('claudio-futebol-ai-backup-2026-10-14.json');
  const file = testInfo.outputPath('backup.json');
  await download.saveAs(file);
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  expect(exported.app).toBe('claudio-futebol-ai');
  expect(exported.schemaVersion).toBe(1);
  expect(exported.profile.apelido).toBe('Lia');
  expect(exported.sessions).toHaveLength(1);
  expect(exported.results[0].source).toBe('contagem_manual');

  await page.getByRole('button', { name: 'Apagar todos os dados' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Arquivos de outros aplicativos não são afetados');
  await dialog.getByRole('button', { name: 'Apagar tudo' }).click();
  await expect(page.locator('main h1')).toHaveText('Olá!');
  expect(await storedSessions(page)).toHaveLength(0);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cfa:'))),
  ).toEqual([]);

  await go(page, '#/config', 'Configurações');
  await page
    .locator('#import-file')
    .setInputFiles(jsonFile('backup.json', readFileSync(file, 'utf8')));
  const importDialog = page.getByRole('alertdialog');
  await expect(importDialog).toContainText('1 sessão(ões), 1 resultado(s)');
  await importDialog.getByRole('radio', { name: /Substituir/ }).check();
  await importDialog.getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByText(/Importado: 1 sessão/)).toBeVisible();
  await go(page, '#/', /Olá, Lia!/);
  expect(await storedSessions(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('importar mesclando não duplica registros', async ({ page }, testInfo) => {
  await openApp(page);
  await recordQuickSession(page);
  await go(page, '#/config', 'Configurações');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados (JSON)' }).click();
  const file = testInfo.outputPath('backup.json');
  await (await downloadPromise).saveAs(file);
  await page
    .locator('#import-file')
    .setInputFiles(jsonFile('backup.json', readFileSync(file, 'utf8')));
  await page.getByRole('alertdialog').getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByText(/Ignorados \(já existiam\): 2/)).toBeVisible();
  expect(await storedSessions(page)).toHaveLength(1);
});

test('arquivos inválidos são recusados com mensagem clara e nada é executado', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page, '#/config');
  await page
    .locator('#import-file')
    .setInputFiles(jsonFile('qualquer.json', '<script>alert(1)</script>'));
  await expect(
    page.getByText('Importação recusada: O arquivo não é um JSON válido.'),
  ).toBeVisible();

  await page
    .locator('#import-file')
    .setInputFiles(jsonFile('outro.json', JSON.stringify({ app: 'outro-app', schemaVersion: 1 })));
  await expect(
    page.getByText('Este arquivo não é uma exportação do Cláudio Futebol AI.'),
  ).toBeVisible();

  const hostile = jsonFile(
    'hostil.json',
    JSON.stringify({
      app: 'claudio-futebol-ai',
      schemaVersion: 1,
      profile: {
        apelido: '<img src=x onerror=document.title=1>',
        posicao: 'meio',
        experiencia: 'regular',
        focos: [],
        minutosDisponiveis: 20,
        espaco: 'medio',
        materiais: ['bola'],
        dificuldade: 'facil',
        preferenciaSessao: 'curtas',
        modalidade: 'futsal',
        criadoEm: '2026-10-14T12:00:00.000Z',
        atualizadoEm: '2026-10-14T12:00:00.000Z',
      },
      sessions: [{ id: 'x', date: 'ontem' }],
      results: [],
      videoAnalyses: [],
    }),
  );
  await page.locator('#import-file').setInputFiles(hostile);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('registro(s) inválido(s) em "sessions" foram ignorados');
  await dialog.getByRole('button', { name: 'Importar' }).click();
  await go(page, '#/', /Olá, <img/);
  expect(await page.title()).not.toBe('1');
  expect(await page.locator('main img[src="x"]').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('armazenamento indisponível: o app avisa e continua funcionando em memória', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  await openApp(page);
  await expect(page.getByText(/seus dados não serão salvos/)).toBeVisible();
  await recordQuickSession(page);
  await go(page, '#/historico', 'Histórico e evolução');
  await expect(page.getByRole('link', { name: 'Passe na porta (alvo de um passo)' })).toBeVisible();
});
