/**
 * Painel de administração escondido: gesto dos quatro cantos, senha, bloqueio e conteúdo.
 * A senha real não está no repositório: aqui o módulo da credencial (js/admin/credencial.js)
 * é trocado por um de teste na rede, sem nenhuma "porta dos fundos" no código do app.
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { go, openApp, watchErrors } from './helpers.ts';

const SENHA_DE_TESTE = 'Teste-E2E-Painel-2026';

async function usarCredencialDeTeste(page: Page): Promise<void> {
  const sal = randomBytes(16);
  const credencial = {
    algoritmo: 'PBKDF2-SHA-256',
    iteracoes: 1000,
    sal: sal.toString('base64'),
    hash: pbkdf2Sync(SENHA_DE_TESTE, sal, 1000, 32, 'sha256').toString('base64'),
    criadaEm: '2026-11-02',
  };
  await page.route('**/js/admin/credencial.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const CREDENCIAL = ${JSON.stringify(credencial)};`,
    }),
  );
}

async function tocarOsQuatroCantos(page: Page): Promise<void> {
  const { width, height } = page.viewportSize() ?? { width: 360, height: 740 };
  const cantos: [number, number][] = [
    [4, 4],
    [width - 4, 4],
    [4, height - 4],
    [width - 4, height - 4],
  ];
  for (const [x, y] of cantos) await page.mouse.click(x, y);
}

async function entrar(page: Page, senha: string): Promise<void> {
  await page.getByLabel('Senha de administração').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('os quatro cantos em até 3 s abrem a área restrita; nenhum menu leva ao painel', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openApp(page, '#/mais');
  await expect(page.locator('a[href="#/admin"]')).toHaveCount(0);
  await tocarOsQuatroCantos(page);
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.getByRole('heading', { name: 'Área restrita' })).toBeVisible();
  await expect(page.getByLabel('Senha de administração')).toHaveAttribute('type', 'password');
  expect(errors).toEqual([]);
});

test('senha errada é recusada; a certa abre o painel, que exporta diagnóstico e tranca', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await usarCredencialDeTeste(page);
  await openApp(page, '#/admin');
  await entrar(page, 'chute-errado');
  await expect(page.getByText('Senha incorreta.')).toBeVisible();
  await expect(page.getByLabel('Senha de administração')).toHaveAttribute('aria-invalid', 'true');

  await entrar(page, SENHA_DE_TESTE);
  await expect(page.getByRole('heading', { name: /Desbloqueado até/ })).toBeFocused();
  for (const titulo of [
    'Aplicativo e aparelho',
    'Dados neste aparelho',
    'Motor de avaliação',
    'Erros recentes',
    'Manutenção',
    'Segurança do painel',
  ]) {
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
  }
  await expect(page.getByText(/Onde roda: navegador/)).toBeVisible();
  await expect(page.getByText(/Versão: 1\.0\.0/)).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar diagnóstico (JSON)' }).click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe('claudio-futebol-ai-diagnostico-2026-10-14.json');
  const diagnostico = JSON.parse(readFileSync(await arquivo.path(), 'utf8'));
  expect(diagnostico.tipo).toBe('diagnostico');
  expect(diagnostico.profile).toBeUndefined();
  expect(Object.keys(diagnostico.motor)).toContain('passe');

  // Sair e voltar mantém o desbloqueio; "Bloquear agora" tranca de novo.
  await go(page, '#/mais');
  await go(page, '#/admin');
  await expect(page.getByRole('heading', { name: 'Motor de avaliação' })).toBeVisible();
  await page.getByRole('button', { name: 'Bloquear agora' }).click();
  await expect(page.getByRole('heading', { name: 'Área restrita' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('cinco senhas erradas bloqueiam novas tentativas, mesmo recarregando', async ({ page }) => {
  await usarCredencialDeTeste(page);
  await openApp(page, '#/admin');
  const botao = page.getByRole('button', { name: 'Entrar' });
  for (let i = 1; i <= 4; i++) {
    await entrar(page, `errada-${i}`);
    await expect(page.getByText('Senha incorreta.')).toBeVisible();
    await expect(botao).toBeEnabled();
  }
  await entrar(page, 'errada-5');
  await expect(
    page.getByText(/Muitas tentativas erradas\. Tente de novo em \d+ s\./),
  ).toBeVisible();
  await expect(botao).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled();
});

test('erros inesperados ficam no registro local e aparecem no painel', async ({ page }) => {
  await usarCredencialDeTeste(page);
  await openApp(page, '#/');
  // Promessa rejeitada sem tratamento (não depende de timers, que o relógio de teste controla).
  await page.evaluate(() => {
    void Promise.reject(new Error('falha de teste do registro'));
  });
  await expect(page.getByText('Algo deu errado: falha de teste do registro')).toBeVisible();
  await go(page, '#/admin');
  await entrar(page, SENHA_DE_TESTE);
  await expect(
    page
      .locator('main li', { hasText: 'promessa rejeitada' })
      .getByText(/falha de teste do registro/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Limpar' }).click();
  await expect(page.getByText('Nenhum erro registrado neste aparelho.')).toBeVisible();
});
