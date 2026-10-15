#!/usr/bin/env node
/**
 * Gera os ícones PNG do aplicativo (sem dependências): um rasterizador simples com
 * superamostragem 4x4 e um codificador PNG usando zlib.
 *
 * Uso: node scripts/make-icons.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'icons');

const GREEN = [16, 115, 74];
const DARK = [11, 43, 32];
const WHITE = [255, 255, 255];

function crc32(buffer) {
  return zlib.crc32(buffer) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pentagon(cx, cy, r, rotation = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a = rotation + (i * 2 * Math.PI) / 5;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function insidePolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideRoundedRect(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/** Retorna a cor (ou null = transparente) do ponto (x, y) do ícone. */
function shade(x, y, size, maskable) {
  const c = size / 2;
  const ballR = size * (maskable ? 0.29 : 0.34);
  const ring = size * 0.03;
  const pent = pentagon(c, c, ballR * 0.38);
  const background = maskable ? true : insideRoundedRect(x, y, size, size * 0.22);
  if (!background) return null;
  const d = Math.hypot(x - c, y - c);
  if (d > ballR) return GREEN;
  if (d > ballR - ring) return DARK;
  if (insidePolygon(x, y, pent)) return DARK;
  // Linhas das costuras: de cada vértice do pentágono até a borda.
  for (const [px, py] of pent) {
    const ang = Math.atan2(py - c, px - c);
    const ex = c + Math.cos(ang) * ballR;
    const ey = c + Math.sin(ang) * ballR;
    if (distToSegment(x, y, px, py, ex, ey) <= size * 0.018) return DARK;
  }
  // Pentágonos parciais junto à borda, entre as costuras.
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + Math.PI / 5 + (i * 2 * Math.PI) / 5;
    const pc = pentagon(
      c + Math.cos(ang) * ballR * 1.02,
      c + Math.sin(ang) * ballR * 1.02,
      ballR * 0.27,
      ang + Math.PI,
    );
    if (insidePolygon(x, y, pc)) return DARK;
  }
  return WHITE;
}

function render(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const color = shade(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples, size, maskable);
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 1;
          }
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / (samples * samples)) * 255);
    }
  }
  return encodePng(size, rgba);
}

const targets = [
  { name: 'icon-32.png', size: 32, maskable: false },
  { name: 'icon-180.png', size: 180, maskable: false },
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];

await mkdir(outDir, { recursive: true });
for (const target of targets) {
  await writeFile(path.join(outDir, target.name), render(target.size, target.maskable));
  console.log(`Gerado public/icons/${target.name}`);
}
