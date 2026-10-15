import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EXPORT_APP_ID, parseImportText, validateExport } from '../../src/core/validation.ts';
import { profile, result, session } from './helpers.ts';

function validExport() {
  const s = session('2026-10-14', {
    id: 's-1',
    kind: 'tecnico',
    summary: { attempts: 10, successes: 6 },
  });
  return {
    app: EXPORT_APP_ID,
    schemaVersion: 1,
    exportedAt: '2026-10-14T20:00:00.000Z',
    profile: profile(),
    settings: { som: true, vibracao: false, tema: 'sistema', reduzirAnimacoes: false },
    competition: { nome: 'Interclasse', data: '2026-10-20' },
    simLevels: { passe_brecha: 2, finalizacao: 1 },
    preGameRoutine: ['Beber água', 'Respirar fundo'],
    sessions: [s],
    results: [result('passe', 10, 6, { id: 'r-1', sessionId: 's-1' })],
    videoAnalyses: [
      {
        id: 'v-1',
        date: '2026-10-14',
        createdAt: '2026-10-14T20:00:00.000Z',
        videoName: 'treino.mp4',
        durationSec: 30,
        markers: [{ id: 'm-1', timeSec: 3.5, label: 'domínio' }],
        criteria: { primeiro_toque: 'bom' },
        notes: '',
        frameIds: ['f-1'],
        sessionId: 's-1',
      },
    ],
  };
}

describe('importação de dados', () => {
  test('aceita uma exportação válida e completa níveis ausentes', () => {
    const r = validateExport(validExport());
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.sessions.length, 1);
    assert.equal(r.data.results.length, 1);
    assert.equal(r.data.simLevels?.passe_brecha, 2);
    assert.equal(r.data.simLevels?.olhe_antes, 1);
    assert.deepEqual(r.data.videoAnalyses[0]?.frameIds, [], 'quadros não são importados');
    assert.equal(r.warnings.length, 0);
  });

  test('sessões longas do próprio app voltam na importação (duração limitada a 24 h)', () => {
    const data = validExport();
    (data.sessions[0] as unknown as Record<string, unknown>).durationSec = 90_000;
    const r = validateExport(data);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.sessions.length, 1);
    assert.equal(r.data.sessions[0]?.durationSec, 86_400);
    // Negativos e não numéricos continuam recusados.
    (data.sessions[0] as unknown as Record<string, unknown>).durationSec = -5;
    const bad = validateExport(data);
    assert.ok(bad.ok && bad.data.sessions.length === 0);
  });

  test('rejeita arquivos de outro aplicativo ou de versão futura', () => {
    assert.equal(validateExport({ app: 'outro', schemaVersion: 1 }).ok, false);
    assert.equal(validateExport({ ...validExport(), schemaVersion: 99 }).ok, false);
    assert.equal(validateExport([]).ok, false);
    assert.equal(parseImportText('{ isto não é json').ok, false);
  });

  test('ignora registros inválidos com aviso, sem derrubar o restante', () => {
    const data = validExport();
    (data.results as unknown[]).push({ ...data.results[0], id: 'r-2', successes: 50 });
    (data.results as unknown[]).push({ ...data.results[0], id: 'r-3', skill: 'voar' });
    (data.sessions as unknown[]).push({ ...data.sessions[0], id: 'x', date: '2026-02-30' });
    const r = validateExport(data);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.results.length, 1);
    assert.equal(r.data.sessions.length, 1);
    assert.ok(r.warnings.some((w) => w.includes('results')));
    assert.ok(r.warnings.some((w) => w.includes('sessions')));
  });

  test('conteúdo malicioso continua sendo apenas texto e campos extras são descartados', () => {
    const data = validExport();
    (data.profile as unknown as Record<string, unknown>).apelido = '<img src=x onerror=alert(1)>';
    (data.profile as unknown as Record<string, unknown>).__proto__injection = { polluted: true };
    (data.sessions[0] as unknown as Record<string, unknown>).extra = 'deve sumir';
    const r = validateExport(data);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.profile?.apelido, '<img src=x onerror=alert(1)>');
    assert.equal('extra' in (r.data.sessions[0] as object), false);
    assert.equal('__proto__injection' in (r.data.profile as object), false);
  });

  test('ids duplicados e identificadores com caracteres estranhos são rejeitados', () => {
    const data = validExport();
    (data.results as unknown[]).push({ ...data.results[0] });
    (data.results as unknown[]).push({ ...data.results[0], id: '../../etc' });
    const r = validateExport(data);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.results.length, 1);
  });

  test('perfil inválido é ignorado com aviso', () => {
    const data = validExport();
    (data.profile as unknown as Record<string, unknown>).posicao = 'capitão';
    const r = validateExport(data);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.data.profile, null);
    assert.ok(r.warnings.some((w) => w.startsWith('Perfil')));
  });
});
