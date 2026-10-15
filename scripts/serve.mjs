#!/usr/bin/env node
/**
 * Servidor estático mínimo (sem dependências) para desenvolvimento, testes e pré-visualização.
 *
 * Uso: node scripts/serve.mjs [--dir dist] [--port 4173] [--host 127.0.0.1] [--base /]
 *   --base  serve o site sob um subcaminho (ex.: /treino-bola/), como no GitHub Pages.
 *
 * Arquivos de texto são enviados com gzip quando o navegador aceita (como faz o GitHub Pages),
 * para que medições locais de carregamento sejam realistas.
 */
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const dir = path.resolve(root, arg('dir', 'dist'));
const port = Number(arg('port', '4173'));
const host = arg('host', '127.0.0.1');
let base = arg('base', '/');
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base = `${base}/`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.y4m': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const COMPRESSIBLE = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.webmanifest',
  '.svg',
  '.txt',
  '.md',
]);
/** Cache do gzip por arquivo e data de modificação. */
const gzipCache = new Map();

async function gzipped(filePath, info) {
  const key = `${filePath}:${info.mtimeMs}:${info.size}`;
  let body = gzipCache.get(key);
  if (!body) {
    body = gzipSync(await readFile(filePath), { level: 9 });
    gzipCache.set(key, body);
  }
  return body;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (base !== '/' && pathname === base.slice(0, -1)) {
      res.writeHead(301, { Location: base });
      res.end();
      return;
    }
    if (!pathname.startsWith(base)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    pathname = pathname.slice(base.length - 1);
    let filePath = path.resolve(dir, `.${pathname}`);
    if (filePath !== dir && !filePath.startsWith(dir + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Acesso negado');
      return;
    }
    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado');
      return;
    }
    // Links simbólicos não podem levar a arquivos de fora da pasta servida.
    const [realFile, realDir] = await Promise.all([realpath(filePath), realpath(dir)]);
    if (!realFile.startsWith(realDir + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Acesso negado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    if (COMPRESSIBLE.has(ext)) headers.Vary = 'Accept-Encoding';
    if (acceptsGzip && COMPRESSIBLE.has(ext)) {
      const body = await gzipped(filePath, info);
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Erro interno: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(port, host, () => {
  console.log(`Servindo ${path.relative(root, dir) || '.'} em http://${host}:${port}${base}`);
});
