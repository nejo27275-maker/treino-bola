import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DIAS_GUARDADOS,
  MAX_INCREMENTO_MS,
  USO_VAZIO,
  normalizar,
  resumir,
  somarUso,
} from '../../src/core/usageStats.ts';

const iso = (dia: string) => `${dia}T10:00:00.000Z`;

describe('tempo de uso (só deste aparelho)', () => {
  test('soma por dia e no total; marca primeiro dia e último uso', () => {
    let u = USO_VAZIO;
    // Batidas curtas (cada ≤ MAX_INCREMENTO_MS), como o rastreamento real gera.
    u = somarUso(u, '2026-10-12', 30_000, iso('2026-10-12'));
    u = somarUso(u, '2026-10-12', 30_000, iso('2026-10-12'));
    u = somarUso(u, '2026-10-14', 45_000, iso('2026-10-14'));
    assert.equal(u.dias['2026-10-12'], 60_000);
    assert.equal(u.dias['2026-10-14'], 45_000);
    assert.equal(u.totalMs, 105_000);
    assert.equal(u.primeiroDia, '2026-10-12');
    assert.equal(u.ultimoUso, iso('2026-10-14'));
  });

  test('descarta saltos grandes (app em segundo plano / relógio mudou) e valores inválidos', () => {
    let u = somarUso(USO_VAZIO, '2026-10-14', 10 * 60_000, iso('2026-10-14'));
    assert.equal(u.dias['2026-10-14'], MAX_INCREMENTO_MS, 'o salto é limitado');
    u = somarUso(u, '2026-10-14', -5, iso('2026-10-14'));
    u = somarUso(u, '2026-10-14', Number.NaN, iso('2026-10-14'));
    u = somarUso(u, 'ontem', 1000, iso('2026-10-14'));
    assert.equal(u.dias['2026-10-14'], MAX_INCREMENTO_MS, 'nada inválido foi somado');
    assert.equal(Object.keys(u.dias).length, 1);
  });

  test('mantém só os últimos dias de detalhe; o total continua somando os antigos', () => {
    let u = USO_VAZIO;
    const base = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < DIAS_GUARDADOS + 40; i++) {
      const dia = new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      u = somarUso(u, dia, 60_000, iso(dia));
    }
    assert.equal(Object.keys(u.dias).length, DIAS_GUARDADOS);
    assert.equal(u.totalMs, (DIAS_GUARDADOS + 40) * 60_000, 'o total não perde os dias podados');
  });

  test('resumo: total, hoje, dias ativos, sequência e média', () => {
    let u = USO_VAZIO;
    u = somarUso(u, '2026-10-12', 60_000, iso('2026-10-12'));
    // Dois minutos no dia 13 (duas batidas de 60 s, pois cada uma é limitada a 60 s).
    u = somarUso(u, '2026-10-13', 60_000, iso('2026-10-13'));
    u = somarUso(u, '2026-10-13', 60_000, iso('2026-10-13'));
    u = somarUso(u, '2026-10-14', 60_000, iso('2026-10-14'));
    const r = resumir(u, '2026-10-14');
    assert.equal(r.totalMinutos, 4);
    assert.equal(r.minutosHoje, 1);
    assert.equal(r.diasAtivos, 3);
    assert.equal(r.sequenciaAtual, 3, 'três dias seguidos terminando hoje');
    assert.equal(r.mediaPorDiaAtivoMin, 1);
    // Um buraco quebra a sequência: só hoje conta.
    const comBuraco = resumir(
      somarUso(USO_VAZIO, '2026-10-14', 60_000, iso('2026-10-14')),
      '2026-10-14',
    );
    assert.equal(comBuraco.sequenciaAtual, 1);
    // Sem uso hoje, a sequência é zero.
    assert.equal(resumir(u, '2026-10-20').sequenciaAtual, 0);
  });

  test('normalizar tolera lixo e reconstrói o total a partir dos dias', () => {
    assert.deepEqual(normalizar(null), USO_VAZIO);
    assert.deepEqual(normalizar('nada'), USO_VAZIO);
    const limpo = normalizar({
      dias: { '2026-10-14': 60_000, xx: 5, '2026-10-15': -3, '2026-10-16': 120_000 },
    });
    assert.deepEqual(Object.keys(limpo.dias).sort(), ['2026-10-14', '2026-10-16']);
    assert.equal(limpo.totalMs, 180_000, 'total reconstruído dos dias válidos');
    assert.equal(limpo.primeiroDia, '2026-10-14');
  });
});
