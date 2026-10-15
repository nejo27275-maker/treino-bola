/**
 * Prepara as mídias dos testes:
 * - vídeos Y4M para a câmera falsa (scripts/make-test-media.mjs);
 * - um vídeo WebM real, gravado pelo próprio Chromium com MediaRecorder a partir de uma
 *   animação em canvas (mudanças grandes de imagem por volta de 1,5–2,5 s à esquerda e 3,0–4,6 s à direita para amostragem determinística).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export const WEBM_FIXTURE = path.resolve('tests/fixtures/generated/movimento.webm');

export default async function globalSetup(): Promise<void> {
  execFileSync(process.execPath, ['scripts/make-test-media.mjs'], { stdio: 'inherit' });
  if (existsSync(WEBM_FIXTURE)) return;
  mkdirSync(path.dirname(WEBM_FIXTURE), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    document.body.appendChild(canvas);
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    const start = performance.now();
    recorder.start(250);
    await new Promise<void>((resolve) => {
      const draw = () => {
        const t = (performance.now() - start) / 1000;
        g.fillStyle = '#1f6b3f';
        g.fillRect(0, 0, 320, 240);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(160, 200, 10, 0, Math.PI * 2);
        g.fill();
        if (t > 1.5 && t < 2.5) {
          g.fillRect(20, 40, 60, 120);
        }
        if (t > 3.0 && t < 4.6) {
          g.fillRect(200, 60, 60, 120);
        }
        if (t < 5) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
    recorder.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  writeFileSync(WEBM_FIXTURE, Buffer.from(base64, 'base64'));
  await browser.close();
}
