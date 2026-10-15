/**
 * Acessibilidade de teclado, foco e contraste (complementa os testes de navegação).
 */
import { expect, test, type Page } from 'playwright/test';
import { openApp } from './helpers.ts';

const activeLabel = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el && el !== document.body
      ? (el.getAttribute('aria-label') ?? el.textContent ?? '')
      : 'BODY';
  });

test('sessão de exercício: o foco acompanha cada fase (não volta ao topo da página)', async ({
  page,
}) => {
  await openApp(page, '#/tecnico/passe-porta/sessao');
  await page.getByRole('button', { name: 'Começar' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '✓ Acerto' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Acerto registrado.')).toBeVisible();
  await page.getByRole('button', { name: 'Pausar' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Sessão pausada.' })).toBeAttached();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeFocused();
  await page.getByRole('button', { name: 'Desfazer' }).focus();
  await page.keyboard.press('Enter');
  // Sem marcações, "Desfazer" fica desativado: o foco vai para o "Acerto", não para o topo.
  await expect(page.getByRole('button', { name: '✓ Acerto' })).toBeFocused();
});

test('treino físico: pular um bloco mantém o foco no controle e anuncia o novo bloco', async ({
  page,
}) => {
  await openApp(page, '#/fisico/core-estabilidade');
  await page.getByRole('button', { name: 'Começar treino guiado' }).click();
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'Tudo certo, começar' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  const skip = page.getByRole('button', { name: 'Pular' });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Pular' })).toBeFocused();
  await expect(page.locator('p.visually-hidden[role="status"]')).toContainText(
    /Bloco 2 de \d+|Descanso/,
  );
});

test('abas do histórico: setas, Home e End trocam de aba sem perder o foco', async ({ page }) => {
  await openApp(page, '#/historico');
  const tabs = page.getByRole('tablist', { name: 'Visões do histórico' }).getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.first()).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'hist-aba-sessoes');
});

test('abas da câmera: ativar uma aba mantém o foco nela', async ({ page }) => {
  await openApp(page, '#/camera');
  const tab = page.getByRole('tab', { name: 'Reação com movimento' });
  await tab.focus();
  await page.keyboard.press('Enter');
  await expect(tab).toBeFocused();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Treino livre' })).toBeFocused();
});

test('diálogo: foco preso em todos os controles, fundo inerte, Esc fecha e devolve o foco', async ({
  page,
}) => {
  await openApp(page, '#/config');
  const erase = page.getByRole('button', { name: 'Apagar todos os dados' });
  await erase.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(/não pode ser desfeita/);
  expect(await page.locator('#conteudo').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[role="alertdialog"]')),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(erase).toBeFocused();
  expect(await page.locator('#conteudo').evaluate((el) => (el as HTMLElement).inert)).toBe(false);
});

test('rótulos que abrem seletores de arquivo mostram o foco do teclado', async ({ page }) => {
  await openApp(page, '#/video');
  await page.locator('#video-galeria').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('label[for="video-galeria"]')).toHaveClass(/focus-ring/);
  expect(await activeLabel(page)).not.toBe('BODY');
});

test('contraste: texto dos botões principais e da aba atual nos dois temas', async ({ page }) => {
  await openApp(page, '#/');
  for (const theme of ['light', 'dark']) {
    const ratios = await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const lum = (hex: string) => {
        const n = hex.replace('#', '');
        const [r, g, b] = [0, 2, 4].map((i) => {
          const c = parseInt(n.slice(i, i + 2), 16) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
      };
      return {
        botao: ratio(v('--on-accent'), v('--accent')),
        linkNoFundo: ratio(v('--accent'), v('--bg')),
        estimulo: ratio(v('--on-danger'), v('--opp')),
        textoSecundario: ratio(v('--muted'), v('--surface')),
        bordaDeCampo: ratio(v('--control-border'), v('--surface')),
      };
    }, theme);
    expect(ratios.botao, `${theme}: botão`).toBeGreaterThanOrEqual(4.5);
    expect(ratios.linkNoFundo, `${theme}: link`).toBeGreaterThanOrEqual(4.5);
    expect(ratios.estimulo, `${theme}: estímulo`).toBeGreaterThanOrEqual(4.5);
    expect(ratios.textoSecundario, `${theme}: texto secundário`).toBeGreaterThanOrEqual(4.5);
    expect(ratios.bordaDeCampo, `${theme}: borda de campo`).toBeGreaterThanOrEqual(3);
  }
});

test('zoom de 200% (180 px de largura): nada importante fica cortado no plano', async ({
  page,
}) => {
  await page.setViewportSize({ width: 180, height: 370 });
  await openApp(page, '#/plano');
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return [...document.querySelectorAll<HTMLElement>('main button, main a, main .pill')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .map((el) => el.textContent?.trim());
  });
  expect(overflow).toEqual([]);
});

test('simuladores: descrição da cena em texto, sem revelar o que está escondido', async ({
  page,
}) => {
  await openApp(page, '#/simuladores/passe_brecha?semente=123&nivel=1');
  await page.getByRole('button', { name: 'Começar sessão' }).click();
  await page.getByText('Descrição da cena em texto').click();
  const items = page.locator('.scene-description li');
  await expect(items.first()).toContainText(/Colega que passa|Você: a \d+ m da linha de ataque/);
  await expect(page.locator('.scene-description')).toContainText(/Colega \d: \d+ m à frente/);
  await expect(page.locator('.scene-description')).toContainText(/Adversário: /);

  await openApp(page, '#/simuladores/olhe_antes?semente=123&nivel=1');
  await page.getByRole('button', { name: 'Começar sessão' }).click();
  await page.getByText('Descrição da cena em texto').click();
  const before = await items.count();
  // Quando a bola chega, a parte de trás some do desenho e da descrição.
  await expect(page.locator('.scene-description')).toContainText('Parte do campo está escondida', {
    timeout: 15_000,
  });
  expect(await items.count()).toBeLessThan(before + 1);
});
