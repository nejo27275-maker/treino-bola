#!/usr/bin/env node
/**
 * Prepara os arquivos OPCIONAIS do detector de pose (MediaPipe Tasks Vision) para serem
 * servidos pelo próprio site, sem CDN:
 *   public/vendor/mediapipe/vision_bundle.mjs
 *   public/vendor/mediapipe/wasm/*
 *   public/models/pose_landmarker_lite.task
 *   public/vendor/mediapipe/manifest.json   (versão, arquivos e SHA-256)
 *
 * Uso (com internet):
 *   node scripts/prepare-pose.mjs [--version latest]
 * Uso sem internet (arquivos já baixados):
 *   node scripts/prepare-pose.mjs --from-tarball caminho/mediapipe-tasks-vision-X.tgz --model-file caminho/pose_landmarker_lite.task
 *
 * Depois rode `npm run build`. Verifique a licença do modelo no "model card" oficial antes
 * de redistribuir publicamente (veja docs/VISAO_COMPUTACIONAL.md).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = path.join(root, 'public', 'vendor', 'mediapipe');
const modelsDir = path.join(root, 'public', 'models');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const PACKAGE = '@mediapipe/tasks-vision';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(
      `Falha ao executar ${cmd} ${args.join(' ')}:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

async function obtainTarball(tmp) {
  const local = arg('from-tarball');
  if (local) return path.resolve(local);
  const version = arg('version') ?? 'latest';
  console.log(`Baixando ${PACKAGE}@${version} do registro npm…`);
  const out = run(
    'npm',
    ['pack', `${PACKAGE}@${version}`, '--pack-destination', tmp, '--silent'],
    tmp,
  );
  const name = out.split(/\r?\n/).filter(Boolean).pop();
  if (!name) throw new Error('npm pack não informou o arquivo gerado.');
  return path.join(tmp, name);
}

async function obtainModel() {
  const local = arg('model-file');
  if (local) return readFile(path.resolve(local));
  console.log(`Baixando o modelo de ${MODEL_URL}…`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Falha ao baixar o modelo (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'cfa-pose-'));
  try {
    const tarball = await obtainTarball(tmp);
    const extractDir = path.join(tmp, 'x');
    await mkdir(extractDir, { recursive: true });
    run('tar', ['-xzf', tarball, '-C', extractDir]);
    const pkgDir = path.join(extractDir, 'package');
    const pkg = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
    if (pkg.name !== PACKAGE) throw new Error(`Pacote inesperado: ${pkg.name}`);
    const bundle = path.join(pkgDir, 'vision_bundle.mjs');
    if (!(await stat(bundle).catch(() => null))?.isFile())
      throw new Error('vision_bundle.mjs não encontrado no pacote.');
    const wasmSrc = path.join(pkgDir, 'wasm');
    const wasmFiles = (await readdir(wasmSrc)).filter((f) => /\.(js|wasm)$/.test(f)).sort();
    if (!wasmFiles.length) throw new Error('Pasta wasm vazia no pacote.');

    const model = await obtainModel();
    // O arquivo .task é um pacote zip: confere a assinatura "PK" e um tamanho mínimo.
    if (model.length < 100_000 || model[0] !== 0x50 || model[1] !== 0x4b) {
      throw new Error('O arquivo do modelo não parece um pacote .task válido.');
    }

    await rm(vendorDir, { recursive: true, force: true });
    await mkdir(path.join(vendorDir, 'wasm'), { recursive: true });
    await mkdir(modelsDir, { recursive: true });
    await cp(bundle, path.join(vendorDir, 'vision_bundle.mjs'));
    const hashes = { 'vision_bundle.mjs': sha256(await readFile(bundle)) };
    for (const f of wasmFiles) {
      await cp(path.join(wasmSrc, f), path.join(vendorDir, 'wasm', f));
      hashes[`wasm/${f}`] = sha256(await readFile(path.join(wasmSrc, f)));
    }
    for (const lic of ['LICENSE', 'LICENSE.md', 'NOTICE']) {
      const p = path.join(pkgDir, lic);
      if ((await stat(p).catch(() => null))?.isFile()) await cp(p, path.join(vendorDir, lic));
    }
    await writeFile(path.join(modelsDir, 'pose_landmarker_lite.task'), model);
    const manifest = {
      package: PACKAGE,
      version: pkg.version,
      license: pkg.license ?? 'ver LICENSE',
      files: wasmFiles,
      model: 'pose_landmarker_lite.task',
      modelSource: arg('model-file') ? 'arquivo local' : MODEL_URL,
      sha256: { ...hashes, 'pose_landmarker_lite.task': sha256(model) },
      preparedAt: new Date().toISOString(),
    };
    await writeFile(path.join(vendorDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(
      `Pronto: ${PACKAGE} ${pkg.version} (${wasmFiles.length} arquivos wasm) e modelo de ${(model.length / 1e6).toFixed(1)} MB.`,
    );
    console.log('Agora rode: npm run build');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
