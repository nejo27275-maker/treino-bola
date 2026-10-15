import { expect, test } from 'playwright/test';
import { go, openApp, storedSessions, watchErrors } from './helpers.ts';

test('teste de linha de base: contar 10 tentativas, desfazer, salvar e alimentar o motor', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openApp(page, '#/avaliacao');
  const row = page.locator('li', {
    has: page.getByText('Domínio e primeiro toque', { exact: true }),
  });
  await expect(row.getByText('Pendente', { exact: true })).toBeVisible();
  await row.getByRole('link', { name: 'Fazer teste' }).click();
  await expect(page.locator('main h1')).toHaveText('Teste: primeiro toque na parede');
  await page.getByRole('link', { name: 'Iniciar teste (10 tentativas)' }).click();
  await page.getByRole('button', { name: 'Começar' }).click();
  const hit = page.getByRole('button', { name: '✓ Acerto' });
  const miss = page.getByRole('button', { name: '✗ Erro' });
  await hit.click();
  await miss.click();
  await page.getByRole('button', { name: 'Pé duro: a bola rebateu para longe' }).click();
  await expect(page.getByText(/Dica: Recue levemente o pé/)).toBeVisible();
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.locator('.big-number').first()).toHaveText('1 / 1');
  for (let i = 0; i < 2; i++) await miss.click();
  for (let i = 0; i < 7; i++) await hit.click();
  // A 10ª tentativa encerra o teste automaticamente.
  await expect(page.getByRole('heading', { name: 'Resumo da sessão' })).toBeVisible();
  await expect(page.getByText('80%')).toBeVisible();
  await page.getByRole('button', { name: 'Salvar sessão' }).click();
  await expect(page.getByRole('heading', { name: 'Sessão registrada ✓' })).toBeVisible();

  const sessions = await storedSessions(page);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.summary).toEqual({ attempts: 10, successes: 8 });

  await go(page, '#/avaliacao', 'Avaliação de habilidades');
  const updated = page.locator('li', {
    has: page.getByText('Domínio e primeiro toque', { exact: true }),
  });
  await expect(
    updated.getByText(/Execução real: 8\/10 acertos · estimativa 74% \(Contagem manual: 10\)/),
  ).toBeVisible();
  // 8/10 com peso de contagem manual e poucas tentativas → estimativa 74% (em desenvolvimento).
  await expect(updated.getByText('Em desenvolvimento · 74%')).toBeVisible();

  await go(page, '#/historico', 'Histórico e evolução');
  await page.getByRole('link', { name: 'Teste: primeiro toque na parede' }).click();
  await expect(page.getByText('Contagem manual')).toBeVisible();
  expect(errors).toEqual([]);
});

test('sair no meio de uma sessão com tentativas pede confirmação', async ({ page }) => {
  await openApp(page, '#/tecnico/passe-porta/sessao');
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.getByRole('button', { name: '✓ Acerto' }).click();
  await page.evaluate(() => (location.hash = '#/'));
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Sair sem salvar?');
  await dialog.getByRole('button', { name: 'Continuar a sessão' }).click();
  await expect(page.locator('main h1')).toHaveText('Passe na porta (alvo de um passo)');
  await expect(page.locator('.big-number').first()).toHaveText('1 / 1');
});

test('biblioteca filtra por fundamento e mostra os 10 itens do exercício', async ({ page }) => {
  await openApp(page, '#/tecnico');
  await page.getByLabel('Fundamento').selectOption('finalizacao');
  const cards = page.locator('main .card-link');
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allTextContents()) expect(text).toContain('Finalização');
  await cards.first().click();
  for (const heading of [
    '1. Objetivo',
    '2. Materiais',
    '3. Organização do espaço',
    '4. Instruções',
    '5. Duração e repetições',
    '6. Pausas',
    '7. Critério de sucesso',
    '8 e 9. Erros comuns e como corrigir',
    '10. Variações',
  ]) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('treino físico guiado: checagem de segurança, parar por desconforto e plano mais leve', async ({
  page,
}) => {
  await openApp(page, '#/fisico/core-estabilidade');
  await page.getByRole('button', { name: 'Começar treino guiado' }).click();
  await page.getByRole('button', { name: 'Tudo certo, começar' }).click();
  await expect(page.getByText('Confirme os três itens')).toBeVisible();
  for (const label of [
    'Estou sem dor e me sentindo bem',
    'Bebi água',
    'O espaço está livre de obstáculos e o piso não escorrega',
  ]) {
    await page.getByRole('checkbox', { name: label }).check();
  }
  await page.getByRole('button', { name: 'Tudo certo, começar' }).click();
  await expect(page.getByRole('heading', { name: 'Prancha frontal' })).toBeVisible();
  await page.getByRole('button', { name: 'Pular' }).click();
  await page.getByRole('button', { name: 'Parar: não estou bem' }).click();
  await expect(page.getByRole('heading', { name: 'Treino interrompido' })).toBeVisible();
  await page.getByRole('radio', { name: 'Forte' }).check();
  await page.getByLabel('Onde? (se houve desconforto)').fill('joelho direito');
  await page.getByRole('button', { name: 'Salvar registro' }).click();
  await expect(page.getByText(/Desconforto forte: pare os treinos físicos/)).toBeVisible();

  await go(page, '#/', /Olá/);
  await expect(page.getByRole('heading', { name: 'Hoje é dia de descanso' })).toBeVisible();
  await go(page, '#/plano', 'Plano de preparação');
  const today = page.getByRole('list', { name: 'Dias do plano' }).locator(':scope > li').first();
  await expect(today).toContainText('Descanso');
  await expect(today).toContainText('Intensidade descanso');
});

test('leitura de jogo: explica todas as opções e registra o resultado', async ({ page }) => {
  await openApp(page, '#/leitura?semente=42');
  await page.getByRole('button', { name: 'Começar' }).click();
  for (let i = 0; i < 8; i++) {
    await expect(page.getByText(`Situação ${i + 1} de 8`)).toBeVisible();
    await page.getByRole('group', { name: 'Respostas' }).getByRole('button').first().click();
    // Todas as opções ganham explicação, certas e erradas.
    await expect(page.locator('main .card li')).toHaveCount(4);
    await page.getByRole('button', { name: i < 7 ? 'Próxima situação' : 'Ver resultado' }).click();
  }
  await expect(page.getByText('Resultado salvo no histórico.')).toBeVisible();
  await expect(page.getByText('Semente desta rodada: 42.')).toBeVisible();
  const sessions = await storedSessions(page);
  expect(sessions[0]?.kind).toBe('leitura');
  expect(sessions[0]?.summary?.attempts).toBe(8);
});

test('preparação mental: rotina editável persiste e atividade é registrada', async ({ page }) => {
  await openApp(page, '#/mental/rotina-pre-jogo');
  await page.getByRole('button', { name: 'Adicionar passo' }).click();
  await page.getByLabel('Passo 8', { exact: true }).fill('Amarrar bem a chuteira');
  await page.getByRole('button', { name: 'Salvar rotina' }).click();
  await page.reload();
  await expect(page.getByLabel('Passo 8', { exact: true })).toHaveValue('Amarrar bem a chuteira');
  await page.getByRole('button', { name: 'Concluir e registrar' }).click();
  await expect(page.getByText('Atividade registrada no histórico.')).toBeVisible();
});
