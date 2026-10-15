/**
 * Integração do detector de pose com uma biblioteca SIMULADA.
 *
 * A biblioteca real (MediaPipe Tasks Vision) não pôde ser baixada neste ambiente. Aqui o
 * arquivo vendor/mediapipe/vision_bundle.mjs é substituído por um módulo que imita a API
 * documentada e devolve 33 pontos sintéticos conhecidos. Isso valida o caminho do
 * aplicativo (carregar, cair de GPU para CPU, desenhar, calcular e salvar métricas,
 * tratar falhas), NÃO a qualidade da detecção, que exige a biblioteca real e um aparelho.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from 'playwright/test';
import { openApp, watchErrors } from './helpers.ts';

const WEBM = path.resolve('tests/fixtures/generated/movimento.webm');

/**
 * Pessoa de frente (vídeo 4:3): tronco e ombros retos, joelho direito flexionado 30° e
 * tornozelo esquerdo pouco visível (0,3) para exercitar o caminho "insuficiente".
 */
const STUB = `
const L = [];
for (let i = 0; i < 33; i++) L.push({ x: 0.5, y: 0.2, z: 0, visibility: 0.9 });
const set = (i, x, y, v = 0.95) => (L[i] = { x, y, z: 0, visibility: v });
set(11, 0.55, 0.30); set(12, 0.45, 0.30);
set(23, 0.53, 0.55); set(24, 0.47, 0.55);
set(25, 0.53, 0.72); set(26, 0.47, 0.72);
set(27, 0.53, 0.90, 0.3);
set(28, 0.4025, 0.72 + 0.18 * Math.cos(Math.PI / 6));
globalThis.__pose = { delegates: [], calls: 0, closed: false };
export const FilesetResolver = {
  async forVisionTasks(wasmPath) { globalThis.__pose.wasmPath = wasmPath; return { wasmPath }; },
};
export const PoseLandmarker = {
  async createFromOptions(fileset, options) {
    globalThis.__pose.delegates.push(options.baseOptions.delegate);
    globalThis.__pose.options = options;
    if (options.baseOptions.delegate === 'GPU') throw new Error('GPU indisponível (simulado)');
    return {
      detectForVideo(frame, ts, callback) {
        globalThis.__pose.calls++;
        const result = { landmarks: [L.map((p) => ({ ...p }))] };
        if (callback) { callback(result); return undefined; }
        return result;
      },
      close() { globalThis.__pose.closed = true; },
    };
  },
};
`;

const WASM_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

async function withPoseInstalled(
  page: Page,
  bundle: string | null,
  opts: { missingWasm?: boolean } = {},
): Promise<void> {
  await page.route('**/build-info.json', (route) =>
    route.fulfill({
      json: {
        mode: 'production',
        builtAt: '2026-10-14T12:00:00.000Z',
        pose: {
          available: true,
          package: '@mediapipe/tasks-vision',
          version: 'SIMULADA',
          files: WASM_FILES,
        },
      },
    }),
  );
  await page.route('**/vendor/mediapipe/vision_bundle.mjs', (route) =>
    bundle === null
      ? route.fulfill({ status: 404, body: 'Não encontrado' })
      : route.fulfill({ body: bundle, contentType: 'text/javascript; charset=utf-8' }),
  );
  // Demais arquivos opcionais: conteúdo fictício, só para exercitar o cache offline.
  await page.route(/\/(vendor\/mediapipe\/(manifest\.json|wasm\/.+)|models\/.+\.task)$/, (route) =>
    opts.missingWasm && route.request().url().includes('/wasm/')
      ? route.fulfill({ status: 404, body: 'Não encontrado' })
      : route.fulfill({ body: 'arquivo fictício', contentType: 'application/octet-stream' }),
  );
}

async function loadVideo(page: Page): Promise<void> {
  await page.locator('#video-galeria').setInputFiles({
    name: 'treino.webm',
    mimeType: 'video/webm',
    buffer: readFileSync(WEBM),
  });
  await expect(page.getByText(/treino\.webm · 00:0[45],\d · 320×240/)).toBeVisible({
    timeout: 15_000,
  });
}

test('pose (biblioteca simulada): GPU→CPU, métricas com confiança, esqueleto e resumo salvo', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await withPoseInstalled(page, STUB);
  await openApp(page, '#/video');
  const poseCard = page.locator('main .card', { hasText: 'Pose corporal (experimental)' });
  await expect(
    poseCard.getByText(/Detector instalado \(@mediapipe\/tasks-vision SIMULADA\)/),
  ).toBeVisible();
  await loadVideo(page);

  await poseCard.getByRole('button', { name: 'Analisar pose neste quadro' }).click();
  await expect(
    poseCard.getByText(/Detector: CPU\. Inferência automática experimental/),
  ).toBeVisible();
  const setup = await page.evaluate(
    () =>
      (
        globalThis as unknown as {
          __pose: {
            delegates: string[];
            options: {
              runningMode: string;
              numPoses: number;
              baseOptions: { modelAssetPath: string };
            };
            wasmPath: string;
          };
        }
      ).__pose,
  );
  expect(setup.delegates).toEqual(['GPU', 'CPU']);
  expect(setup.options.runningMode).toBe('VIDEO');
  expect(setup.options.numPoses).toBe(1);
  expect(setup.options.baseOptions.modelAssetPath).toMatch(
    /\/treino-bola\/models\/pose_landmarker_lite\.task$/,
  );
  expect(setup.wasmPath).toMatch(/\/treino-bola\/vendor\/mediapipe\/wasm$/);

  const row = (label: string) => poseCard.getByRole('row', { name: new RegExp(`^${label}`) });
  await expect(row('Inclinação do tronco')).toContainText('0,0°');
  await expect(row('Inclinação do tronco')).toContainText('95%');
  await expect(row('Inclinação dos ombros')).toContainText('0,0°');
  await expect(row('Flexão do joelho direito')).toContainText('30,0°');
  // Tornozelo esquerdo com visibilidade 0,3: a métrica não é mostrada como confiável.
  await expect(row('Flexão do joelho esquerdo')).toContainText('—');
  await expect(row('Flexão do joelho esquerdo')).toContainText('insuficiente (30%)');
  await expect(row('Base de apoio')).toContainText('insuficiente');

  // O esqueleto foi desenhado sobre o vídeo.
  const painted = await page.locator('canvas.overlay').evaluate((c) => {
    const canvas = c as HTMLCanvasElement;
    const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 3; data && i < data.length; i += 4) if ((data[i] ?? 0) > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(200);

  await page.getByRole('button', { name: 'Ir para o início' }).click();
  await poseCard.getByRole('button', { name: 'Analisar 3 s a partir daqui' }).click();
  await expect(
    poseCard.getByText(
      /Trecho de 00:00,0 a 00:03,0: \d+ quadro\(s\) com pessoa detectada, \d+ confiável\(is\)/,
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    poseCard.getByText('Tronco estável: inclinação média 0,0°, variação 0,0°.'),
  ).toBeVisible();
  await expect(poseCard.getByText('Flexão média dos joelhos: 30,0°.')).toBeVisible();

  await page.getByRole('button', { name: 'Salvar avaliação' }).click();
  await expect(page.getByText(/Avaliação salva: 0 critério\(s\) com evidência/)).toBeVisible();
  const history = page.locator('main .card', { hasText: 'Avaliações anteriores' });
  await expect(
    history.getByText(
      /Pose \(automática, experimental\): \d+ quadro\(s\), \d+ confiável\(is\) · tronco 0,0° · variação 0,0° · joelhos 30,0°\./,
    ),
  ).toBeVisible();

  // Avaliação já salva: sair da tela não pede confirmação e fecha o detector.
  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.locator('main h1')).toHaveText(/Olá/);
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { __pose: { closed: boolean } }).__pose.closed,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('pose: biblioteca ausente ou quebrada mostra erro claro e a avaliação guiada continua', async ({
  page,
}) => {
  await withPoseInstalled(page, null);
  await openApp(page, '#/video');
  await loadVideo(page);
  const poseCard = page.locator('main .card', { hasText: 'Pose corporal (experimental)' });
  await poseCard.getByRole('button', { name: 'Analisar pose neste quadro' }).click();
  await expect(
    poseCard.getByRole('heading', { name: 'Detector de pose indisponível' }),
  ).toBeVisible();
  await expect(poseCard.getByText(/Não foi possível carregar a biblioteca de pose/)).toBeVisible();
  await expect(poseCard.getByText('A avaliação guiada abaixo continua disponível.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Domínio e primeiro toque' })).toBeVisible();
});

test('pose: sem os arquivos instalados, a tela informa e não oferece a análise', async ({
  page,
}) => {
  await openApp(page, '#/video');
  const poseCard = page.locator('main .card', { hasText: 'Pose corporal (experimental)' });
  await expect(poseCard.getByText(/Detector de pose não instalado neste servidor/)).toBeVisible();
  await expect(poseCard.getByRole('button', { name: 'Analisar pose neste quadro' })).toHaveCount(0);
});

test('pose: guardar o detector para uso offline só confirma quando todos os arquivos vieram', async ({
  page,
}) => {
  await withPoseInstalled(page, STUB, { missingWasm: true });
  await openApp(page, '#/config');
  const box = page.locator('main .card', { hasText: 'Visão computacional local' });
  await expect(box.getByText(/ainda não estão guardados neste aparelho/)).toBeVisible();
  await box.getByRole('button', { name: 'Guardar o detector para uso offline' }).click();
  await expect(
    page.getByText(/Não foi possível guardar: Falha ao baixar vendor\/mediapipe\/wasm/),
  ).toBeVisible();
  expect(await page.evaluate(() => caches.has('cfa-opcional-v1'))).toBe(false);

  await page.unroute(/\/(vendor\/mediapipe\/(manifest\.json|wasm\/.+)|models\/.+\.task)$/);
  await withPoseInstalled(page, STUB);
  await box.getByRole('button', { name: 'Guardar o detector para uso offline' }).click();
  await expect(page.getByText('Detector guardado (5 arquivos).')).toBeVisible();
  await expect(
    box.getByText(/guardados neste aparelho: a pose também funciona offline/),
  ).toBeVisible();
  const keys = await page.evaluate(async () =>
    (await (await caches.open('cfa-opcional-v1')).keys()).map((r) => new URL(r.url).pathname),
  );
  expect(keys.sort()).toEqual([
    '/treino-bola/models/pose_landmarker_lite.task',
    '/treino-bola/vendor/mediapipe/manifest.json',
    '/treino-bola/vendor/mediapipe/vision_bundle.mjs',
    '/treino-bola/vendor/mediapipe/wasm/vision_wasm_internal.js',
    '/treino-bola/vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  ]);
});
