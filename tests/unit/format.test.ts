import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bytes, clock, decimal, millis, percent, videoTime } from '../../src/core/format.ts';

const NBSP = ' ';

describe('formatação em português', () => {
  test('vírgula decimal, porcentagem e valores inválidos', () => {
    assert.equal(decimal(1.25, 2), '1,25');
    assert.equal(percent(0.745), '75%');
    assert.equal(percent(0.745, 1), '74,5%');
    assert.equal(percent(Number.NaN), '—');
    assert.equal(decimal(Number.POSITIVE_INFINITY), '—');
  });

  test('número e unidade ficam juntos (espaço não separável)', () => {
    assert.equal(millis(350.4), `350${NBSP}ms`);
    assert.equal(millis(1640), `1,64${NBSP}s`);
    assert.equal(bytes(512), `512${NBSP}B`);
    assert.equal(bytes(2048), `2${NBSP}KB`);
    assert.equal(bytes(5 * 1024 * 1024), `5,0${NBSP}MB`);
    assert.equal(millis(Number.NaN), '—');
    assert.equal(bytes(-1), '—');
  });

  test('relógios de sessão e de vídeo', () => {
    assert.equal(clock(65), '1:05');
    assert.equal(clock(-3), '0:00');
    assert.equal(videoTime(12.34), '00:12,3');
    assert.equal(videoTime(61), '01:01,0');
    assert.equal(videoTime(Number.NaN), '00:00,0');
  });
});
