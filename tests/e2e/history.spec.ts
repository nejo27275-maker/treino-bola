/**
 * Histórico com dados: gráficos de evolução (legenda, título, dica) e abas em tela estreita.
 */
import { expect, test, type Page } from 'playwright/test';
import { go, openApp, watchErrors } from './helpers.ts';

/**
 * Grava sessões com os próprios módulos do app: passe com execução real e simulador;
 * primeiro toque só com execução real.
 */
async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { openBackend } = await import(String('./js/storage/backend.js'));
    const { Repository } = await import(String('./js/storage/repo.js'));
    const { logExercise, logSimulator } = await import(String('./js/core/sessionLog.js'));
    const { EXERCISES } = await import(String('./js/content/exercises.js'));
    const repo = new Repository((await openBackend()).backend);
    const day = (d: number, hour: number) =>
      new Date(`2026-10-${d}T${String(hour).padStart(2, '0')}:00:00-03:00`);
    const runs: [string, number, number][] = [
      ['teste-passe', 11, 6],
      ['passe-porta', 12, 13],
      ['parede-primeiro-toque', 12, 12],
      ['parede-primeiro-toque', 13, 15],
    ];
    for (const [id, d, successes] of runs) {
      const exercise = EXERCISES.find((e: { id: string }) => e.id === id);
      const logged = logExercise({
        exercise,
        startedAt: day(d, 9),
        endedAt: day(d, 10),
        counted: true,
        attempts: exercise.teste ? 10 : 20,
        successes,
        seriesDone: exercise.series,
        seriesTotal: exercise.series,
      });
      await repo.saveSession(logged.session, logged.results);
    }
    const rounds = Array.from({ length: 10 }, (_, i) => ({
      round: i,
      seed: i,
      outcome: i < 6 ? 'acerto' : 'erro',
      success: i < 6,
      points: i < 6 ? 8 : 0,
      responseMs: 1500,
    }));
    const logged = logSimulator({
      mode: 'passe_brecha',
      seed: 7,
      difficulty: 1,
      rounds,
      startedAt: day(13, 11),
      endedAt: day(13, 11),
    });
    await repo.saveSession(logged.session, logged.results);
  });
}

const chartCard = (page: Page, title: string) =>
  page.locator('.card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

test('evolução: a legenda só lista séries com pontos; com uma série, o título a nomeia', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openApp(page);
  await seed(page);
  await go(page, '#/historico?aba=evolucao', 'Histórico e evolução');

  const passe = chartCard(page, 'Passe');
  await expect(passe.locator('.chart-legend-item')).toHaveText([
    'Execução real',
    'Simulação/cenários',
  ]);
  await expect(passe.locator('figcaption')).toHaveText('Taxa de acerto por sessão — Passe');
  await passe.getByText('Ver tabela').click();
  await expect(passe.getByRole('columnheader')).toHaveText(['Sessão', 'Série', 'Valor', 'Detalhe']);

  // Só execução real: sem caixa de legenda (nem item "Simulação" vazio); o título diz a série.
  const toque = chartCard(page, 'Domínio e primeiro toque');
  await expect(toque.locator('.chart-legend')).toHaveCount(0);
  await expect(toque.locator('figcaption')).toHaveText(
    'Taxa de acerto por sessão — Primeiro toque · Execução real',
  );
  await expect(toque.locator('.chart-wrap')).toHaveAttribute(
    'aria-label',
    /Primeiro toque · Execução real: use as setas/,
  );
  await toque.getByText('Ver tabela').click();
  await expect(toque.getByRole('columnheader')).toHaveText(['Sessão', 'Valor', 'Detalhe']);
  expect(errors).toEqual([]);
});

test('dica do gráfico fica ao lado da mira (não cobre o ponto) e vai para baixo em tela estreita', async ({
  page,
}) => {
  await openApp(page);
  await seed(page);
  await go(page, '#/historico?aba=evolucao', 'Histórico e evolução');
  const chart = chartCard(page, 'Passe').locator('.chart-wrap');
  const tooltip = chart.locator('.chart-tooltip');
  const crosshair = chart.locator('.chart-crosshair');
  await chart.focus();
  // Último ponto (13/10, simulador), depois 12/10 e 11/10.
  for (const date of ['13/10', '12/10', '11/10']) {
    await expect(tooltip).toContainText(date);
    const tip = await tooltip.boundingBox();
    const line = await crosshair.boundingBox();
    if (!tip || !line) throw new Error('dica ou mira sem posição');
    const covers = tip.x < line.x && tip.x + tip.width > line.x;
    expect(covers, `dica cobre a mira em ${date}`).toBe(false);
    await page.keyboard.press('ArrowLeft');
  }
  // 12/10 não tem sessão de simulador: a dica diz que o valor da execução real é dessa data
  // e mostra "—" para a série que ainda não começou.
  await page.keyboard.press('ArrowRight');
  await expect(tooltip).toContainText('12/10');
  await expect(tooltip.locator('.chart-tip-row').nth(1)).toContainText('—');

  // Zoom de 200% (180 px): sem espaço ao lado da mira, a dica vai para baixo do gráfico.
  await page.setViewportSize({ width: 180, height: 370 });
  await chart.blur();
  await chart.focus();
  await expect(tooltip).toHaveClass(/below/);
  const svg = await chart.locator('svg').boundingBox();
  const tip = await tooltip.boundingBox();
  if (!svg || !tip) throw new Error('gráfico sem posição');
  expect(tip.y).toBeGreaterThanOrEqual(svg.y + svg.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('abas do histórico: todas visíveis na largura do celular (quebram linha, não somem)', async ({
  page,
}) => {
  await openApp(page, '#/historico');
  const tabs = page.getByRole('tablist', { name: 'Visões do histórico' }).getByRole('tab');
  await expect(tabs).toHaveCount(4);
  for (const tab of await tabs.all()) {
    const box = await tab.boundingBox();
    if (!box) throw new Error('aba sem posição');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }
});
