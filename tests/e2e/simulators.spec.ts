import { expect, test, type Page } from 'playwright/test';
import { openApp, storedSessions, watchErrors } from './helpers.ts';

/*
 * Os import() dentro de page.evaluate rodam no navegador e carregam os módulos do build
 * servido (dist/js); String(...) evita que o TypeScript tente resolvê-los localmente.
 */
const SEED = 123;

async function start(page: Page, mode: string, level = 1, seed = SEED): Promise<void> {
  await openApp(page, `#/simuladores/${mode}?semente=${seed}&nivel=${level}`);
  await page.getByRole('button', { name: 'Começar sessão' }).click();
}

/**
 * Converte coordenadas do SVG (metros) em coordenadas da tela, rolando a página para
 * que o ponto fique no meio da tela (longe do cabeçalho fixo).
 */
async function svgToScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const locate = () =>
    page.evaluate(
      ([fx, fy]) => {
        const svg = document.querySelector('main .field-svg') as SVGSVGElement;
        const pt = svg.createSVGPoint();
        pt.x = fx as number;
        pt.y = fy as number;
        const s = pt.matrixTransform(svg.getScreenCTM() as DOMMatrix);
        return { x: s.x, y: s.y };
      },
      [x, y],
    );
  const first = await locate();
  await page.evaluate((dy) => window.scrollBy(0, dy), first.y - 370);
  return locate();
}

test('A — passe pela brecha: mirar no colega livre com a força certa é acerto', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await start(page, 'passe_brecha');
  const target = await page.evaluate(async (seed) => {
    const { generatePass, openTeammates } = await import(String('./js/core/sim/passe.js'));
    const { roundSeed } = await import(String('./js/core/sim/index.js'));
    const sc = generatePass(roundSeed(seed, 'passe_brecha', 0), 1);
    const mate = sc.teammates.find((t: { id: string }) => t.id === openTeammates(sc)[0]);
    const d = Math.hypot(mate.pos.x - sc.passer.x, mate.pos.y - sc.passer.y);
    return { x: mate.pos.x, y: mate.pos.y, force: Math.round((d / sc.maxDistance) * 100) };
  }, SEED);
  const point = await svgToScreen(page, target.x, target.y);
  await page.mouse.click(point.x, point.y);
  await page.locator('#forca-passe').evaluate((el, v) => {
    (el as HTMLInputElement).value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, target.force);
  await expect(page.getByText(`Força: ${target.force}%`)).toBeVisible();
  await page.getByRole('button', { name: 'Passar' }).click();
  await expect(page.getByRole('heading', { name: 'Passe certo!' })).toBeVisible();
  await expect(page.getByText('Acertos 1/1')).toBeVisible();
  // Uma segunda rodada, de propósito com força máxima para o lado: erro explicado.
  await page.getByRole('button', { name: 'Próxima rodada' }).click();
  await page.locator('#forca-passe').evaluate((el) => {
    (el as HTMLInputElement).value = '100';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (let i = 0; i < 25; i++)
    await page.getByRole('button', { name: /Girar a mira 3 graus para a esquerda/ }).click();
  await page.getByRole('button', { name: 'Passar' }).click();
  await expect(page.locator('.sim-feedback h2')).not.toHaveText('Passe certo!');
  await expect(page.getByText('Acertos 1/2')).toBeVisible();
  expect(errors).toEqual([]);
});

test('B — domínio orientado: a melhor direção calculada é aceita pela interface', async ({
  page,
}) => {
  await start(page, 'dominio_orientado');
  const best = await page.evaluate(async (seed) => {
    const { generateControl, analyzeControl } = await import(String('./js/core/sim/dominio.js'));
    const { roundSeed } = await import(String('./js/core/sim/index.js'));
    return analyzeControl(generateControl(roundSeed(seed, 'dominio_orientado', 0), 1)).best;
  }, SEED);
  const label = {
    esquerda: 'Para a esquerda',
    direita: 'Para a direita',
    frente: 'Para a frente (ataque)',
    tras: 'Para trás (proteger)',
  }[best as string];
  await page.getByRole('button', { name: new RegExp(label as string) }).click();
  await expect(page.getByRole('heading', { name: 'Ótimo domínio orientado!' })).toBeVisible();
});

test('B — sem resposta a tempo, a rodada termina como incompleta', async ({ page }) => {
  await start(page, 'dominio_orientado', 5);
  await expect(page.getByRole('heading', { name: 'Tempo esgotado' })).toBeVisible({
    timeout: 8000,
  });
  await expect(page.getByText('0 pts')).toBeVisible();
});

test('C — olhe antes de receber: esconde o que está às costas e avalia a leitura', async ({
  page,
}) => {
  await start(page, 'olhe_antes');
  await expect(page.getByText('Observe o campo inteiro!')).toBeVisible();
  await expect(page.getByText('A bola chegou! O que você faz?')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('main .field-svg')).toContainText('às suas costas');
  const best = await page.evaluate(async (seed) => {
    const { generateScan, analyzeScan, SCAN_LABEL } = await import(String('./js/core/sim/olhe.js'));
    const { roundSeed } = await import(String('./js/core/sim/index.js'));
    const a = analyzeScan(generateScan(roundSeed(seed, 'olhe_antes', 0), 1));
    return SCAN_LABEL[a.best];
  }, SEED);
  await page.getByRole('button', { name: best }).click();
  await expect(page.getByRole('heading', { name: 'Leitura perfeita!' })).toBeVisible();
});

test('D — decisão rápida: sessão completa de 10 rodadas, salva e sobe de nível', async ({
  page,
}) => {
  await start(page, 'decisao_rapida');
  for (let round = 0; round < 10; round++) {
    const best = await page.evaluate(
      async ([seed, r]) => {
        const { generateDecision, analyzeDecision, DECISION_LABEL } = await import(
          String('./js/core/sim/decisao.js')
        );
        const { roundSeed } = await import(String('./js/core/sim/index.js'));
        return DECISION_LABEL[
          analyzeDecision(generateDecision(roundSeed(seed, 'decisao_rapida', r), 1)).best
        ];
      },
      [SEED, round],
    );
    await page.getByRole('button', { name: best, exact: true }).click();
    await expect(page.locator('.sim-feedback h2')).toContainText(/decisão certa/);
    await page
      .getByRole('button', { name: round < 9 ? 'Próxima rodada' : 'Ver resultado da sessão' })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'Resultado da sessão' })).toBeVisible();
  await expect(page.getByText('Acerto de 100%: nível aumentado para 2.')).toBeVisible();
  await expect(page.getByText('Sessão salva no histórico.')).toBeVisible();
  const sessions = await storedSessions(page);
  expect(sessions[0]?.kind).toBe('simulador');
  expect(sessions[0]?.summary).toMatchObject({ attempts: 10, successes: 10 });
  await page.evaluate(() => (location.hash = '#/simuladores'));
  await expect(page.getByText('Nível 2').first()).toBeVisible();
});

test('E — reação à pressão: responder certo após o sinal mede o tempo; antes do sinal é repetido', async ({
  page,
}) => {
  await start(page, 'reacao_pressao');
  // Resposta antecipada (antes do sinal).
  await page.getByRole('button', { name: /Proteger/ }).click();
  await expect(page.getByRole('heading', { name: 'Saiu antes do sinal' })).toBeVisible();
  await page.getByRole('button', { name: 'Repetir rodada' }).click();
  const stimulus = page.locator('.stimulus.go');
  await expect(stimulus).toBeVisible({ timeout: 5000 });
  const label = await stimulus.getAttribute('aria-label');
  const response = label?.includes('esquerda')
    ? /Sair pela direita/
    : label?.includes('direita')
      ? /Sair pela esquerda/
      : /Proteger/;
  await page.getByRole('button', { name: response }).click();
  await expect(page.getByRole('heading', { name: 'Reação certa!' })).toBeVisible();
  // Número e unidade vêm separados por espaço não separável (\s cobre os dois).
  await expect(page.getByText(/tempo de resposta \d+\sms/)).toBeVisible();
  await expect(page.getByText('Acertos 1/1')).toBeVisible();
});

test('E — teclado: setas respondem à reação', async ({ page }) => {
  await start(page, 'reacao_pressao');
  const stimulus = page.locator('.stimulus.go');
  await expect(stimulus).toBeVisible({ timeout: 5000 });
  const label = (await stimulus.getAttribute('aria-label')) ?? '';
  await page.keyboard.press(label.includes('esquerda') ? 'ArrowRight' : 'ArrowLeft');
  await expect(page.getByRole('heading', { name: 'Reação certa!' })).toBeVisible();
});

test('F — finalização: chute no canto livre é gol; fora da baliza é "Para fora"', async ({
  page,
}) => {
  await start(page, 'finalizacao');
  const region = await page.evaluate(async (seed) => {
    const { generateShot, evaluateShot } = await import(String('./js/core/sim/finalizacao.js'));
    const { roundSeed } = await import(String('./js/core/sim/index.js'));
    const sc = generateShot(roundSeed(seed, 'finalizacao', 0), 1, 'nao_sei');
    const rows: [string, number][] = [
      ['Alto', 0.82],
      ['Meio', 0.5],
      ['Rasteiro', 0.12],
    ];
    const cols: [string, number][] = [
      ['esquerda', 0.12],
      ['centro', 0.5],
      ['direita', 0.88],
    ];
    for (const [rl, ry] of rows)
      for (const [cl, cx] of cols) {
        if (evaluateShot(sc, { x: sc.goal.width * cx, y: sc.goal.height * ry }).success)
          return `${rl} ${cl}`;
      }
    return null;
  }, SEED);
  expect(region).not.toBeNull();
  await page.getByRole('button', { name: region as string, exact: true }).click();
  await expect(page.locator('.sim-feedback h2')).toHaveText(/Gol/);
  await page.getByRole('button', { name: 'Próxima rodada' }).click();
  // Ponto acima do travessão (no SVG, y negativo = acima da baliza).
  const goalWidth = await page.evaluate(async (seed) => {
    const { generateShot } = await import(String('./js/core/sim/finalizacao.js'));
    const { roundSeed } = await import(String('./js/core/sim/index.js'));
    return generateShot(roundSeed(seed, 'finalizacao', 1), 1, 'nao_sei').goal.width;
  }, SEED);
  const above = await svgToScreen(page, goalWidth / 2, -0.35);
  await page.mouse.click(above.x, above.y);
  await expect(page.getByRole('heading', { name: 'Para fora' })).toBeVisible();
});

test('teclado: Enter ativa o botão focado (não passa a bola) e os atalhos param no fim da rodada', async ({
  page,
}) => {
  await start(page, 'passe_brecha');
  const angle = () => page.getByText(/^Direção: -?\d+°/).textContent();
  const before = await angle();
  const rotateLeft = page.getByRole('button', { name: /Girar a mira 3 graus para a esquerda/ });
  await rotateLeft.focus();
  await page.keyboard.press('Enter');
  // Enter girou a mira (ação do botão focado) e não encerrou a rodada com um passe.
  await expect.poll(angle).not.toBe(before);
  await expect(page.locator('.sim-feedback')).toHaveCount(0);
  await page.getByRole('button', { name: 'Passar' }).click();
  const next = page.getByRole('button', { name: /Próxima rodada|Repetir rodada/ });
  await expect(next).toBeFocused();
  // Depois da rodada, Enter no botão focado vai para a próxima rodada (antes era engolido).
  await page.keyboard.press('Enter');
  await expect(page.locator('.sim-feedback')).toHaveCount(0);
  await expect(page.getByText(/Rodada 2 de 10/)).toBeVisible();
});

test('toque: arrastar o dedo sobre a baliza (rolar a página) não chuta; tocar chuta', async ({
  page,
}) => {
  await start(page, 'finalizacao');
  const goalWidth = await page.evaluate(async (seed) => {
    const { generateShot } = await import(String('./js/core/sim/finalizacao.js'));
    const { roundSeed } = await import(String('./js/core/sim/index.js'));
    return generateShot(roundSeed(seed, 'finalizacao', 0), 1, 'nao_sei').goal.width;
  }, SEED);
  const p = await svgToScreen(page, goalWidth * 0.12, 0.3);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.sim-feedback')).toHaveCount(0);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.sim-feedback h2')).toBeVisible();
});

test('mesma semente reproduz exatamente o mesmo cenário; outra semente muda', async ({ page }) => {
  const snapshot = async (seed: number) => {
    await page.goto('about:blank');
    await start(page, 'passe_brecha', 2, seed);
    return page
      .locator('main .field-svg g.actor')
      .evaluateAll((els) => els.map((e) => e.innerHTML).join('|'));
  };
  const a = await snapshot(777);
  const b = await snapshot(777);
  const c = await snapshot(778);
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test('encerrar a sessão antes do fim salva as rodadas jogadas', async ({ page }) => {
  await start(page, 'reacao_pressao');
  const stimulus = page.locator('.stimulus.go');
  await expect(stimulus).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: /Sair pela esquerda/ }).click();
  await page.getByRole('button', { name: 'Encerrar sessão' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Encerrar e salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado da sessão' })).toBeVisible();
  await expect(
    page.getByText('Nível mantido: são necessárias ao menos 8 tentativas'),
  ).toBeVisible();
  expect((await storedSessions(page))[0]?.summary?.attempts).toBe(1);
});
