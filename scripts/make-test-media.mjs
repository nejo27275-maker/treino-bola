#!/usr/bin/env node
/**
 * Gera vídeos Y4M (YUV 4:2:0 sem compressão) usados como "câmera falsa" do Chromium nos
 * testes (--use-file-for-fake-video-capture). Sem dependências.
 *
 * - parado.y4m: cena totalmente parada (calibração passa; nenhum movimento detectado).
 * - movimento-esquerda.y4m: cena parada com um bloco claro piscando no lado esquerdo da imagem.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tests', 'fixtures', 'generated');
const W = 320;
const H = 240;
const FPS = 15;

function frame(fill, block) {
  const y = Buffer.alloc(W * H, fill);
  if (block) {
    for (let r = block.y; r < block.y + block.h; r++) y.fill(block.value, r * W + block.x, r * W + block.x + block.w);
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  return Buffer.concat([Buffer.from('FRAME\n'), y, chroma]);
}

function y4m(frames) {
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`);
  return Buffer.concat([header, ...frames]);
}

await mkdir(outDir, { recursive: true });
const still = Array.from({ length: FPS * 2 }, () => frame(110));
await writeFile(path.join(outDir, 'parado.y4m'), y4m(still));
const blinking = Array.from({ length: FPS * 2 }, (_, i) =>
  frame(110, i % 6 < 3 ? { x: 20, y: 60, w: 100, h: 120, value: 235 } : undefined),
);
await writeFile(path.join(outDir, 'movimento-esquerda.y4m'), y4m(blinking));
console.log(`Vídeos Y4M gerados em ${path.relative(root, outDir)}`);
