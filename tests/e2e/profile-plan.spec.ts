import { expect, test } from 'playwright/test';
import { go, openApp, watchErrors } from './helpers.ts';

test('perfil opcional: salvar, persistir após recarregar, editar e apagar', async ({ page }) => {
  const errors = watchErrors(page);
  await openApp(page);
  await expect(
    page.getByRole('heading', { name: 'Bem-vindo ao Cláudio Futebol AI' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Configurar perfil' }).click();
  await page.getByLabel('Como quer ser chamado? (opcional)').fill('Cláudio');
  await page.getByRole('radio', { name: 'Meio-campo' }).check();
  await page.getByRole('radio', { name: 'Quadra (futsal)' }).check();
  await page.getByRole('checkbox', { name: 'Passe', exact: true }).check();
  await page.getByRole('radio', { name: '30 min' }).check();
  await page.getByRole('checkbox', { name: /Parede lisa/ }).check();
  await page.getByRole('button', { name: 'Salvar perfil' }).click();
  await expect(page.locator('main h1')).toHaveText('Avaliação de habilidades');

  await page.reload();
  await go(page, '#/', /Olá, Cláudio!/);
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Cláudio Futebol AI' })).toHaveCount(
    0,
  );
  // O foco escolhido aparece como motivo nas prioridades.
  await expect(page.getByText('Você marcou este fundamento como foco.').first()).toBeAttached();

  await go(page, '#/perfil', 'Editar perfil');
  await expect(page.getByLabel('Como quer ser chamado? (opcional)')).toHaveValue('Cláudio');
  await expect(page.getByRole('radio', { name: 'Meio-campo' })).toBeChecked();

  await go(page, '#/config', 'Configurações');
  await page.getByRole('button', { name: 'Apagar perfil' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Apagar perfil' }).click();
  await expect(page.getByText('Nenhum perfil salvo')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pular a configuração esconde as boas-vindas', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Agora não' }).click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Cláudio Futebol AI' })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator('main h1')).toHaveText('Olá!');
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Cláudio Futebol AI' })).toHaveCount(
    0,
  );
});

test('plano de 14/10/2026: sete dias até o interclasse de terça, 20/10', async ({ page }) => {
  await openApp(page, '#/plano');
  const days = page.getByRole('list', { name: 'Dias do plano' }).locator(':scope > li');
  await expect(days).toHaveCount(7);
  await expect(days.first()).toContainText('Hoje (14/10)');
  await expect(days.first()).toContainText('Avaliação inicial');
  await expect(days.nth(5)).toContainText('Véspera: familiarização leve');
  await expect(days.nth(6)).toContainText('terça-feira, 20/10');
  await expect(days.nth(6)).toContainText('Dia da competição');
  await expect(days.nth(6)).toContainText('não há treino extra');
  await expect(days.nth(6)).toContainText('Aquecimento pré-jogo12 min');
  await go(page, '#/', /Olá/);
  await expect(page.getByText('Faltam 6 dias')).toBeVisible();
});

test('aberto na véspera e no dia do evento, o plano se ajusta à data real', async ({ page }) => {
  await openApp(page, '#/plano', new Date('2026-10-19T08:00:00-03:00'));
  await expect(
    page.getByRole('list', { name: 'Dias do plano' }).locator(':scope > li'),
  ).toHaveCount(2);
  await page.clock.setFixedTime(new Date('2026-10-20T07:00:00-03:00'));
  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Dias do plano' }).locator(':scope > li'),
  ).toHaveCount(1);
  await go(page, '#/', /Olá/);
  await expect(page.getByText('É hoje!')).toBeVisible();
});

test('depois do evento: avisa que passou e permite configurar a próxima competição', async ({
  page,
}) => {
  await openApp(page, '#/plano', new Date('2026-10-22T10:00:00-03:00'));
  await expect(page.getByRole('heading', { name: 'A competição já passou' })).toBeVisible();
  await expect(page.getByText('foi em 20/10/2026').first()).toBeVisible();
  const firstDay = page.getByRole('list', { name: 'Dias do plano' }).locator(':scope > li').first();
  await expect(firstDay).toContainText('Hoje (22/10)');
  await page.getByLabel('Nome da competição').fill('Copa da escola');
  await page.getByLabel('Data').fill('2026-11-05');
  await page.getByRole('button', { name: 'Salvar e recalcular' }).click();
  await expect(page.getByRole('heading', { name: 'Copa da escola' })).toBeVisible();
  await expect(page.getByText('Faltam 14 dia(s).')).toBeVisible();
  // De 22/10 a 05/11, inclusive: 15 dias.
  await expect(
    page.getByRole('list', { name: 'Dias do plano' }).locator(':scope > li'),
  ).toHaveCount(15);
});

test('data inválida da competição é recusada com mensagem clara', async ({ page }) => {
  await openApp(page, '#/plano', new Date('2026-10-22T10:00:00-03:00'));
  await page.getByLabel('Nome da competição').fill('');
  await page.getByRole('button', { name: 'Salvar e recalcular' }).click();
  await expect(page.getByText('Informe o nome da competição.')).toBeVisible();
});
