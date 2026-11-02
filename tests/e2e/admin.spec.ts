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
    'Tempo de uso (só deste aparelho)',
    'Motor de avaliação',
    'Erros recentes',
    'Manutenção',
    'Segurança do painel',
  ]) {
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
  }
  await expect(page.getByText(/Onde roda: navegador/)).toBeVisible();
  await expect(page.getByText(/Versão: 1\.0\.0/)).toBeVisible();
  // Sinal de integridade: o build servido nos testes é de produção.
  await expect(page.getByText(/Integridade:/)).toBeVisible();
  await expect(page.getByText(/build de produção/)).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar diagnóstico (JSON)' }).click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe('claudio-futebol-ai-diagnostico-2026-10-14.json');
  const diagnostico = JSON.parse(readFileSync(await arquivo.path(), 'utf8'));
  expect(diagnostico.tipo).toBe('diagnostico');
  expect(diagnostico.profile).toBeUndefined();
  expect(Object.keys(diagnostico.motor)).toContain('passe');
  expect(typeof diagnostico.assinatura).toBe('string');
  expect(diagnostico.uso).toBeTruthy();

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

test('tempo de uso deste aparelho aparece no painel (só local, não identifica ninguém)', async ({
  page,
}) => {
  await usarCredencialDeTeste(page);
  // Semeia um tempo de uso já guardado neste aparelho (10 min no dia 13, 30 min no dia 14).
  await page.addInitScript(() => {
    localStorage.setItem(
      'cfa:uso',
      JSON.stringify({
        totalMs: 2_400_000,
        dias: { '2026-10-13': 600_000, '2026-10-14': 1_800_000 },
        primeiroDia: '2026-10-13',
        ultimoUso: '2026-10-14T09:30:00.000Z',
      }),
    );
  });
  await openApp(page, '#/admin');
  await entrar(page, SENHA_DE_TESTE);
  const uso = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Tempo de uso (só deste aparelho)' }) });
  await expect(uso.getByText('Total: 40 min')).toBeVisible();
  await expect(uso.getByText('Hoje: 30 min')).toBeVisible();
  await expect(uso.getByText('Dias ativos: 2')).toBeVisible();
  await expect(uso.getByText('Sequência atual: 2 dias seguidos')).toBeVisible();
  // Detalhamento dos últimos 7 dias (hoje = 30 min).
  await expect(uso.getByText('Últimos 7 dias')).toBeVisible();
  await expect(uso.locator('.usage-day')).toHaveCount(7);
  await expect(uso.locator('.usage-day').last()).toContainText('30 min');

  // No navegador: a seção de backup explica que não sobrevive sozinho ao desinstalar.
  const bk = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Backup e persistência' }) });
  await expect(bk.getByText(/use Exportar\/Importar/)).toBeVisible();
  await expect(bk.getByText(/servidores nossos/)).toBeVisible();

  // "Zerar o tempo de uso" apaga só essa contagem (pede confirmação) e não os treinos.
  await page.getByRole('button', { name: 'Zerar o tempo de uso' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Zerar' }).click();
  await expect(uso.getByText('Total: 0 min')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cfa:uso'))).toBeNull();
});

test('no APK, o painel mostra o backup automático do Android (restaura ao reinstalar)', async ({
  page,
}) => {
  await usarCredencialDeTeste(page);
  // Simula a ponte do APK Android.
  await page.addInitScript(() => {
    (window as unknown as { ClaudioAndroid: unknown }).ClaudioAndroid = { saveFile: () => {} };
  });
  await openApp(page, '#/admin');
  await entrar(page, SENHA_DE_TESTE);
  const bk = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Backup e persistência' }) });
  await expect(bk.getByText(/Backup automático do Android: ligado/)).toBeVisible();
  await expect(bk.getByText(/backup do Google DO USUÁRIO/)).toBeVisible();
  await expect(bk.locator('li', { hasText: 'Volta quando' })).toContainText('reinstalar');
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

test('integridade avisa quando não consegue ler o build-info (cópia sem o arquivo)', async ({
  page,
}) => {
  await usarCredencialDeTeste(page);
  // Simula uma cópia em que o build-info.json foi removido/corrompido.
  await page.route('**/build-info.json', (route) => route.fulfill({ status: 404, body: '' }));
  await openApp(page, '#/admin');
  await entrar(page, SENHA_DE_TESTE);
  await expect(page.getByText(/não foi possível verificar a integridade/)).toBeVisible();
  await expect(page.getByText(/build de produção; o service worker confere/)).toHaveCount(0);
});
