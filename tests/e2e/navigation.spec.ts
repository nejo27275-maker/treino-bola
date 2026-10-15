import { expect, test } from 'playwright/test';
import { openApp, watchErrors } from './helpers.ts';

const ROUTES: [string, RegExp][] = [
  ['#/', /^Olá/],
  ['#/perfil', /Configurar perfil/],
  ['#/treinar', /^Treinar$/],
  ['#/avaliacao', /Avaliação de habilidades/],
  ['#/tecnico', /Treinamento técnico/],
  ['#/tecnico/passe-porta', /Passe na porta/],
  ['#/tecnico/passe-porta/sessao', /Passe na porta/],
  ['#/fisico', /Preparação física/],
  ['#/fisico/mobilidade-recuperacao', /Mobilidade e recuperação/],
  ['#/leitura', /Leitura de jogo/],
  ['#/mental', /Preparação mental/],
  ['#/mental/visualizacao', /Visualização/],
  ['#/simuladores', /Simuladores/],
  ['#/simuladores/olhe_antes', /Olhe antes de receber/],
  ['#/plano', /Plano de preparação/],
  ['#/historico', /Histórico e evolução/],
  ['#/video', /Vídeos/],
  ['#/camera', /Câmera ao vivo/],
  ['#/config', /Configurações/],
  ['#/mais', /^Mais$/],
  ['#/sobre', /Sobre e limitações/],
];

test('todas as seções abrem, sem erros e sem rolagem horizontal em 360 px', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  for (const [hash, title] of ROUTES) {
    await page.evaluate((h) => (location.hash = h), hash);
    await expect(page.locator('main h1'), hash).toHaveText(title);
    expect(await page.locator('main h1').count(), `${hash}: um único h1`).toBe(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${hash}: rolagem horizontal`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test('barra de navegação inferior leva às seções principais e marca a atual', async ({ page }) => {
  await openApp(page);
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  for (const [label, title] of [
    ['Treinar', /^Treinar$/],
    ['Simular', /Simuladores/],
    ['Plano', /Plano/],
    ['Mais', /^Mais$/],
    ['Início', /^Olá/],
  ] as const) {
    await nav.getByRole('link', { name: label }).click();
    await expect(page.locator('main h1')).toHaveText(title);
    await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  }
});

test('endereço inexistente mostra página de erro com caminho de volta', async ({ page }) => {
  await openApp(page, '#/nao-existe');
  await expect(page.locator('main h1')).toHaveText('Página não encontrada');
  await page.getByRole('link', { name: 'Ir para o início' }).click();
  await expect(page.locator('main h1')).toHaveText(/^Olá/);
});

test('acessibilidade básica: rótulos, nomes acessíveis, idioma e link para pular', async ({
  page,
}) => {
  await openApp(page);
  expect(await page.getAttribute('html', 'lang')).toBe('pt-BR');
  for (const [hash] of ROUTES) {
    await page.evaluate((h) => (location.hash = h), hash);
    await expect(page.locator('main h1')).toBeVisible();
    const problems = await page.evaluate(() => {
      const out: string[] = [];
      const visible = (el: Element) => !(el as HTMLElement).closest('[hidden]');
      for (const el of document.querySelectorAll('button, a[href]')) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
        if (visible(el) && !name) out.push(`sem nome: ${el.outerHTML.slice(0, 80)}`);
      }
      for (const el of document.querySelectorAll('input, select, textarea')) {
        const input = el as HTMLInputElement;
        if (input.type === 'hidden') continue;
        const labelled =
          input.labels?.length ||
          input.getAttribute('aria-label') ||
          input.getAttribute('aria-labelledby') ||
          input.closest('label');
        if (!labelled) out.push(`campo sem rótulo: ${el.outerHTML.slice(0, 80)}`);
      }
      for (const img of document.querySelectorAll('img')) {
        if (!img.hasAttribute('alt')) out.push(`imagem sem alt: ${img.outerHTML.slice(0, 80)}`);
      }
      return out;
    });
    expect(problems, hash).toEqual([]);
  }
});

test('teclado: link para pular ao conteúdo e foco no título ao trocar de tela', async ({
  page,
}) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#conteudo')).toBeFocused();
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Plano' })
    .click();
  await expect(page.locator('main h1')).toBeFocused();
});

test('alvos de toque têm pelo menos 40 px de altura', async ({ page }) => {
  await openApp(page, '#/simuladores/reacao_pressao');
  await page.getByRole('button', { name: 'Começar sessão' }).click();
  const heights = await page
    .locator('main button:visible')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(40);
});
