import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import {
  addDays,
  dateRange,
  diffDays,
  formatDateBR,
  formatLong,
  isValidDate,
  localDate,
  relativeDayLabel,
  weekdayName,
} from '../../src/core/dates.ts';

describe('datas de calendário', () => {
  test('valida datas reais e rejeita inválidas', () => {
    assert.equal(isValidDate('2026-10-20'), true);
    assert.equal(isValidDate('2028-02-29'), true, '2028 é bissexto');
    assert.equal(isValidDate('2026-02-29'), false, '2026 não é bissexto');
    assert.equal(isValidDate('2026-13-01'), false);
    assert.equal(isValidDate('2026-10-32'), false);
    assert.equal(isValidDate('20/10/2026'), false);
    assert.equal(isValidDate(20261020), false);
  });

  test('14/10/2026 é quarta-feira e o interclasse (20/10/2026) é terça-feira', () => {
    assert.equal(weekdayName('2026-10-14'), 'quarta-feira');
    assert.equal(weekdayName('2026-10-20'), 'terça-feira');
    assert.equal(diffDays('2026-10-14', '2026-10-20'), 6);
    assert.equal(formatLong('2026-10-20'), 'terça-feira, 20 de outubro de 2026');
    assert.equal(formatDateBR('2026-10-20'), '20/10/2026');
  });

  test('aritmética atravessa meses, anos e anos bissextos', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(diffDays('2026-10-21', '2026-10-20'), -1);
    assert.deepEqual(dateRange('2026-10-18', '2026-10-20'), ['2026-10-18', '2026-10-19', '2026-10-20']);
  });

  test('rótulos relativos', () => {
    assert.equal(relativeDayLabel('2026-10-20', '2026-10-20'), 'hoje');
    assert.equal(relativeDayLabel('2026-10-19', '2026-10-20'), 'amanhã');
    assert.equal(relativeDayLabel('2026-10-14', '2026-10-20'), 'em 6 dias');
    assert.equal(relativeDayLabel('2026-10-23', '2026-10-20'), 'há 3 dias');
  });

  test('data local usa o fuso do aparelho, não UTC', () => {
    // 23h30 em São Paulo de 19/10 já é 20/10 em UTC: a data local deve continuar 19/10.
    const script =
      "import('./src/core/dates.ts').then(m => console.log(m.localDate(new Date('2026-10-20T02:30:00Z'))))";
    const run = (tz: string) =>
      spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      }).stdout.trim();
    assert.equal(run('America/Sao_Paulo'), '2026-10-19');
    assert.equal(run('UTC'), '2026-10-20');
    assert.equal(run('Asia/Tokyo'), '2026-10-20');
  });

  test('aritmética não é afetada por horário de verão', () => {
    // Nos EUA o horário de verão termina em 01/11/2026; a diferença continua sendo de dias inteiros.
    const script =
      "import('./src/core/dates.ts').then(m => console.log(m.diffDays('2026-10-31','2026-11-02'), m.addDays('2026-11-01', 1)))";
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: 'America/New_York' },
      encoding: 'utf8',
    }).stdout.trim();
    assert.equal(out, '2 2026-11-02');
  });

  test('localDate formata com zeros à esquerda', () => {
    assert.equal(localDate(new Date(2026, 0, 5, 12)), '2026-01-05');
  });
});
