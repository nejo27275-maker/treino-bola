#!/usr/bin/env node
/**
 * Ambiente de desenvolvimento: build de desenvolvimento (sem cache offline),
 * recompilação do TypeScript ao salvar, cópia de `public/` e servidor local.
 *
 * Uso: node scripts/dev.mjs [--port 5173] [--host 127.0.0.1]
 */
import { spawn, spawnSync } from 'node:child_process';
import { cp, watch } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const portIndex = process.argv.indexOf('--port');
const hostIndex = process.argv.indexOf('--host');
const port = portIndex >= 0 ? process.argv[portIndex + 1] : '5173';
const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : '127.0.0.1';

const first = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.mjs'), '--dev'], {
  stdio: 'inherit',
});
if (first.status !== 0) process.exit(first.status ?? 1);

const tsc = spawn(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    '-p',
    'tsconfig.json',
    '--watch',
    '--preserveWatchOutput',
  ],
  { cwd: root, stdio: 'inherit' },
);
const server = spawn(
  process.execPath,
  [path.join(root, 'scripts', 'serve.mjs'), '--dir', 'dist', '--port', port, '--host', host],
  { cwd: root, stdio: 'inherit' },
);

const stop = () => {
  tsc.kill();
  server.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Copia alterações de public/ para dist/ (HTML, CSS, ícones e manifesto).
for await (const event of watch(path.join(root, 'public'), { recursive: true })) {
  if (!event.filename) continue;
  await cp(path.join(root, 'public'), path.join(root, 'dist'), { recursive: true }).catch(() => {});
  console.log(`public/${event.filename} atualizado`);
}
