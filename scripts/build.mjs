#!/usr/bin/env node
/**
 * Build de produção do Cláudio Futebol AI.
 *
 * 1. Compila o TypeScript de `src/` para `dist/js/` usando o compilador local.
 * 2. Copia os arquivos estáticos de `public/` para `dist/`.
 * 3. Gera `dist/sw.js` com a lista de arquivos pré-armazenados (com hash de conteúdo)
 *    para que o aplicativo abra offline depois do primeiro carregamento.
 *
 * Uso: node scripts/build.mjs [--dev]
 *   --dev  gera um service worker que se desinstala (evita cache durante o desenvolvimento).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const isDev = process.argv.includes('--dev');
const require = createRequire(import.meta.url);

/** Arquivos que não entram no pré-cache (opcionais e grandes, ou o próprio service worker). */
const PRECACHE_EXCLUDE = [/^sw\.js$/, /\.map$/, /^vendor\//, /^models\//];

/** Informa ao aplicativo se os arquivos opcionais do detector de pose foram instalados. */
async function poseInfo() {
  const bundle = path.join(root, 'public', 'vendor', 'mediapipe', 'vision_bundle.mjs');
  const model = path.join(root, 'public', 'models', 'pose_landmarker_lite.task');
  const has = async (p) => (await stat(p).catch(() => null))?.isFile() ?? false;
  if (!(await has(bundle)) || !(await has(model))) return { available: false };
  try {
    const manifest = JSON.parse(
      await readFile(path.join(root, 'public', 'vendor', 'mediapipe', 'manifest.json'), 'utf8'),
    );
    return {
      available: true,
      package: String(manifest.package ?? '@mediapipe/tasks-vision'),
      version: String(manifest.version ?? 'desconhecida'),
      files: Array.isArray(manifest.files) ? manifest.files.map(String) : [],
    };
  } catch {
    return {
      available: true,
      package: '@mediapipe/tasks-vision',
      version: 'desconhecida',
      files: [],
    };
  }
}

async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full, base)));
    else if (entry.isFile()) files.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return files.sort();
}

function compileTypeScript() {
  const tscPath = require.resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tscPath, '-p', path.join(root, 'tsconfig.json')], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('Falha na compilação do TypeScript.');
  }
}

async function buildServiceWorker() {
  // build-info.json é escrito antes da lista de pré-cache para também funcionar offline.
  await writeFile(
    path.join(dist, 'build-info.json'),
    JSON.stringify(
      {
        // Sem data/hora do build: um novo build sem mudanças gera a mesma versão (o aparelho
        // não baixa tudo de novo à toa).
        mode: isDev ? 'development' : 'production',
        pose: await poseInfo(),
      },
      null,
      2,
    ),
  );
  const template = await readFile(path.join(root, 'scripts', 'sw-template.js'), 'utf8');
  const files = (await listFiles(dist)).filter((f) => !PRECACHE_EXCLUDE.some((re) => re.test(f)));
  const precache = [];
  const versionHash = createHash('sha256');
  for (const file of files) {
    const content = await readFile(path.join(dist, file));
    const rev = createHash('sha256').update(content).digest('hex').slice(0, 12);
    versionHash.update(`${file}:${rev};`);
    precache.push({ url: file, rev });
  }
  const version = isDev ? `dev-${Date.now()}` : versionHash.digest('hex').slice(0, 16);
  const replaceMarker = (source, marker, line) => {
    const re = new RegExp(`^.*// @build:${marker}$`, 'm');
    if (!re.test(source)) throw new Error(`Marcador @build:${marker} ausente no template do SW.`);
    return source.replace(re, () => line);
  };
  let sw = replaceMarker(template, 'version', `const VERSION = ${JSON.stringify(version)};`);
  sw = replaceMarker(sw, 'dev', `const DEV_MODE = ${isDev};`);
  sw = replaceMarker(sw, 'precache', `const PRECACHE = ${JSON.stringify(isDev ? [] : precache)};`);
  await writeFile(path.join(dist, 'sw.js'), sw);
  const totalBytes = await files.reduce(async (accP, f) => {
    const acc = await accP;
    return acc + (await stat(path.join(dist, f))).size;
  }, Promise.resolve(0));
  return { version, count: precache.length, totalBytes };
}

async function main() {
  const started = Date.now();
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  compileTypeScript();
  await cp(path.join(root, 'public'), dist, { recursive: true });
  const { version, count, totalBytes } = await buildServiceWorker();
  const kb = (totalBytes / 1024).toFixed(0);
  console.log(
    `Build ${isDev ? 'de desenvolvimento' : 'de produção'} concluído em ${Date.now() - started} ms — ` +
      `versão ${version}, ${isDev ? 'sem pré-cache' : `${count} arquivos pré-armazenados (${kb} KB)`}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
