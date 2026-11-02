import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  ITERACOES_MINIMAS,
  SEM_FALHAS,
  base64ParaBytes,
  esperaAposFalhas,
  esperaRestante,
  iguaisEmTempoConstante,
  lerEstado,
  registrarFalha,
  verificarSenha,
  type Credencial,
} from '../../src/admin/acesso.ts';
import { CREDENCIAL } from '../../src/admin/credencial.ts';
import {
  GestoQuatroCantos,
  cantoDoToque,
  tamanhoDoCanto,
  type Canto,
} from '../../src/ui/cantos.ts';

/** Credencial de teste (poucas iterações, para o teste ser rápido). */
function credencialDeTeste(senha: string): Credencial {
  const sal = randomBytes(16);
  return {
    algoritmo: 'PBKDF2-SHA-256',
    iteracoes: 1000,
    sal: sal.toString('base64'),
    hash: pbkdf2Sync(senha, sal, 1000, 32, 'sha256').toString('base64'),
    criadaEm: '2026-11-02',
  };
}

describe('painel de administração — senha', () => {
  test('confere a senha certa e recusa variações, vazia e espaços', async () => {
    const c = credencialDeTeste('Teste-Painel-2026');
    assert.equal(await verificarSenha('Teste-Painel-2026', c), true);
    assert.equal(await verificarSenha('  Teste-Painel-2026 ', c), true, 'espaços nas pontas');
    assert.equal(await verificarSenha('teste-painel-2026', c), false, 'maiúsculas importam');
    assert.equal(await verificarSenha('Teste-Painel-2027', c), false);
    assert.equal(await verificarSenha('', c), false);
    assert.equal(await verificarSenha('   ', c), false);
  });

  test('comparação em tempo constante e base64', () => {
    assert.equal(iguaisEmTempoConstante(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
    assert.equal(iguaisEmTempoConstante(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
    assert.equal(iguaisEmTempoConstante(new Uint8Array([1]), new Uint8Array([1, 0])), false);
    assert.deepEqual([...base64ParaBytes('AQID')], [1, 2, 3]);
  });

  test('a credencial real só guarda o hash forte (nada de senha no código)', async () => {
    assert.equal(CREDENCIAL.algoritmo, 'PBKDF2-SHA-256');
    assert.ok(CREDENCIAL.iteracoes >= ITERACOES_MINIMAS);
    assert.ok(base64ParaBytes(CREDENCIAL.sal).length >= 16, 'sal de 128 bits ou mais');
    assert.equal(base64ParaBytes(CREDENCIAL.hash).length, 32);
    for (const fraca of ['admin', 'senha', '123456', 'claudio']) {
      assert.equal(await verificarSenha(fraca, CREDENCIAL), false, `"${fraca}" não pode servir`);
    }
  });
});

describe('painel de administração — tentativas erradas', () => {
  test('4 erros livres; depois 1 min, dobrando até 1 h', () => {
    assert.equal(esperaAposFalhas(4), 0);
    assert.equal(esperaAposFalhas(5), 60_000);
    assert.equal(esperaAposFalhas(6), 120_000);
    assert.equal(esperaAposFalhas(30), 3_600_000);
    let estado = SEM_FALHAS;
    for (let i = 0; i < 5; i++) estado = registrarFalha(estado, 1000);
    assert.equal(estado.falhas, 5);
    assert.equal(esperaRestante(estado, 1000), 60_000);
    assert.equal(esperaRestante(estado, 61_000), 0);
  });

  test('estado salvo corrompido não quebra nem bloqueia para sempre', () => {
    const agora = 1_000_000;
    assert.deepEqual(lerEstado(null, agora), SEM_FALHAS);
    assert.deepEqual(lerEstado('{lixo', agora), SEM_FALHAS);
    assert.deepEqual(lerEstado('null', agora), SEM_FALHAS);
    assert.deepEqual(lerEstado('{"falhas":"5","bloqueadoAte":true}', agora), SEM_FALHAS);
    const futuro = lerEstado(JSON.stringify({ falhas: 7, bloqueadoAte: 9e15 }), agora);
    assert.equal(futuro.falhas, 7);
    assert.equal(futuro.bloqueadoAte, agora + 3_600_000);
  });
});

describe('painel de administração — gesto dos quatro cantos', () => {
  test('quadrado de cada canto proporcional à tela (44 a 72 px)', () => {
    assert.equal(tamanhoDoCanto(360, 740), 54);
    assert.equal(tamanhoDoCanto(200, 300), 44);
    assert.equal(tamanhoDoCanto(1920, 1080), 72);
    assert.equal(cantoDoToque(5, 5, 360, 740), 'superior-esquerdo');
    assert.equal(cantoDoToque(355, 10, 360, 740), 'superior-direito');
    assert.equal(cantoDoToque(10, 735, 360, 740), 'inferior-esquerdo');
    assert.equal(cantoDoToque(350, 730, 360, 740), 'inferior-direito');
    assert.equal(cantoDoToque(180, 5, 360, 740), null, 'meio da borda não é canto');
    assert.equal(cantoDoToque(180, 370, 360, 740), null);
  });

  test('os quatro cantos em até 3 s, em qualquer ordem, completam o gesto', () => {
    const gesto = new GestoQuatroCantos();
    const ordem: Canto[] = ['inferior-direito', 'superior-esquerdo', 'inferior-esquerdo'];
    ordem.forEach((c, i) => assert.equal(gesto.registrar(c, i * 500), false));
    assert.equal(gesto.registrar(null, 1600), false, 'toque fora dos cantos é ignorado');
    assert.equal(gesto.registrar('superior-direito', 2000), true);
    // Depois de completar, recomeça do zero.
    assert.equal(gesto.registrar('superior-direito', 2100), false);
  });

  test('devagar demais (mais de 3 s) ou repetindo o mesmo canto não abre', () => {
    const lento = new GestoQuatroCantos();
    lento.registrar('superior-esquerdo', 0);
    lento.registrar('superior-direito', 1000);
    lento.registrar('inferior-esquerdo', 2000);
    assert.equal(lento.registrar('inferior-direito', 3500), false, 'o primeiro toque já expirou');
    const repetido = new GestoQuatroCantos();
    for (let i = 0; i < 6; i++)
      assert.equal(repetido.registrar('superior-esquerdo', i * 100), false);
  });
});

describe('registro local de erros', () => {
  test('guarda os 20 mais recentes, corta textos longos e tolera lixo', async () => {
    const memoria = new Map<string, string>();
    const stub = {
      get length() {
        return memoria.size;
      },
      key: (i: number) => [...memoria.keys()][i] ?? null,
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, String(v)),
      removeItem: (k: string) => void memoria.delete(k),
      clear: () => memoria.clear(),
    };
    const g = globalThis as { localStorage?: unknown };
    const anterior = g.localStorage;
    g.localStorage = stub;
    try {
      const { listarErros, registrarErro, limparErros, MAX_ERROS } =
        await import('../../src/ui/errorLog.ts');
      for (let i = 0; i < 25; i++)
        registrarErro('erro', `falha ${i}`, new Date(2026, 10, 2, 10, i));
      const erros = listarErros();
      assert.equal(erros.length, MAX_ERROS);
      assert.equal(erros[0]?.mensagem, 'falha 5');
      assert.equal(erros[erros.length - 1]?.mensagem, 'falha 24');
      registrarErro('promessa', 'x'.repeat(1000));
      assert.equal(listarErros().at(-1)?.mensagem.length, 300);
      memoria.set(
        'cfa:erros',
        '[{"em":1},{"em":"2026-11-02T10:00:00.000Z","origem":"erro","mensagem":"ok"}]',
      );
      assert.deepEqual(
        listarErros().map((e) => e.mensagem),
        ['ok'],
        'registros malformados são descartados',
      );
      memoria.set('cfa:erros', 'não é json');
      assert.deepEqual(listarErros(), []);
      limparErros();
      assert.equal(memoria.has('cfa:erros'), false);
    } finally {
      g.localStorage = anterior;
    }
  });
});
