/**
 * O nome visível do app precisa bater entre o manifesto (PWA), o <title>/metatags do HTML e o
 * app_name do Android. Este teste evita que mudem num lugar e esqueçam no outro.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const NOME = 'Craque AI';
const CURTO = 'Craque';
const SLUG = 'claudio-futebol-ai'; // identificador interno (banco, backups): NÃO muda com o nome.

const ler = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

describe('nome do app (consistência de marca)', () => {
  test('manifesto PWA usa o nome e o nome curto', () => {
    const m = JSON.parse(ler('public/manifest.webmanifest'));
    assert.equal(m.name, NOME);
    assert.equal(m.short_name, CURTO);
  });

  test('HTML: título, metatag do iOS e marca do cabeçalho', () => {
    const html = ler('public/index.html');
    assert.ok(html.includes(`<title>${NOME}</title>`), 'título');
    assert.ok(
      html.includes(`name="apple-mobile-web-app-title" content="${NOME}"`),
      'metatag do iPhone',
    );
    assert.ok(html.includes(`<span>Craque <strong>AI</strong></span>`), 'marca do cabeçalho');
  });

  test('Android: app_name do launcher', () => {
    assert.ok(
      ler('android/app/src/main/res/values/strings.xml').includes(
        `<string name="app_name">${NOME}</string>`,
      ),
    );
  });

  test('o nome antigo não ficou para trás; o identificador interno continua', () => {
    for (const p of [
      'public/manifest.webmanifest',
      'public/index.html',
      'android/app/src/main/res/values/strings.xml',
    ]) {
      assert.ok(!ler(p).includes('Cláudio Futebol AI'), `${p} ainda tem o nome antigo`);
    }
    // O slug interno (backups/banco) segue igual, para não quebrar dados já salvos.
    const val = ler('src/core/validation.ts');
    assert.ok(val.includes(SLUG), 'o identificador interno foi preservado');
  });
});
