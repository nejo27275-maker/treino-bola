import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  angleDiff,
  clampForward,
  distPointSegment,
  insideEllipse,
  laneDistance,
  segmentCircleEntry,
  vec,
} from '../../src/core/geometry.ts';
import { createRng, hashSeed } from '../../src/core/rng.ts';

describe('gerador pseudoaleatório', () => {
  test('mesma semente gera a mesma sequência', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  });

  test('sementes diferentes geram sequências diferentes e valores em [0,1)', () => {
    const a = createRng(1);
    const b = createRng(2);
    let equal = 0;
    for (let i = 0; i < 100; i++) {
      const x = a.next();
      const y = b.next();
      assert.ok(x >= 0 && x < 1);
      if (x === y) equal++;
    }
    assert.ok(equal < 3);
  });

  test('int é inclusivo e shuffle preserva os elementos', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(1, 3));
    assert.deepEqual([...seen].sort(), [1, 2, 3]);
    const items = [1, 2, 3, 4, 5, 6];
    assert.deepEqual(rng.shuffle(items).sort(), items);
  });

  test('hashSeed é estável e sensível à ordem', () => {
    assert.equal(hashSeed(10, 'passe', 3), hashSeed(10, 'passe', 3));
    assert.notEqual(hashSeed(10, 'passe', 3), hashSeed(10, 'passe', 4));
    assert.notEqual(hashSeed('a', 'b'), hashSeed('b', 'a'));
  });
});

describe('geometria', () => {
  test('distância de ponto a segmento', () => {
    assert.equal(distPointSegment(vec(0, 1), vec(-1, 0), vec(1, 0)), 1);
    assert.equal(distPointSegment(vec(3, 0), vec(-1, 0), vec(1, 0)), 2);
  });

  test('entrada do segmento no círculo', () => {
    const t = segmentCircleEntry(vec(0, 0), vec(10, 0), vec(5, 0), 1);
    assert.ok(t !== null && Math.abs(t - 0.4) < 1e-9);
    assert.equal(segmentCircleEntry(vec(0, 0), vec(10, 0), vec(5, 2), 1), null);
    assert.equal(segmentCircleEntry(vec(0, 0), vec(3, 0), vec(5, 0), 1), null, 'termina antes');
    assert.equal(segmentCircleEntry(vec(5, 0), vec(10, 0), vec(5, 0), 1), 0, 'começa dentro');
  });

  test('adversário atrás da origem não bloqueia o corredor', () => {
    assert.equal(laneDistance(vec(0, -1), vec(0, 0), vec(0, 10)), Number.POSITIVE_INFINITY);
    assert.equal(laneDistance(vec(1, 5), vec(0, 0), vec(0, 10)), 1);
  });

  test('ângulos e elipse', () => {
    assert.ok(Math.abs(angleDiff(0.1, 2 * Math.PI - 0.1) - 0.2) < 1e-9);
    assert.equal(insideEllipse(vec(1, 0), vec(0, 0), 1, 2), true);
    assert.equal(insideEllipse(vec(1.01, 0), vec(0, 0), 1, 2), false);
  });
});

describe('mira do passe', () => {
  test('pontos atrás do passador vão para o lado mais próximo', () => {
    const deg = (a: number) => Math.round((a * 180) / Math.PI);
    assert.equal(deg(clampForward(-Math.PI / 2)), -90); // reto para o ataque
    assert.equal(deg(clampForward(Math.PI * 0.25)), deg(-0.05)); // abaixo e à direita → direita
    assert.equal(deg(clampForward(Math.PI * 0.75)), deg(-Math.PI + 0.05)); // abaixo e à esquerda → esquerda
    assert.equal(deg(clampForward(Math.PI)), deg(-Math.PI + 0.05));
    assert.equal(deg(clampForward(-Math.PI)), deg(-Math.PI + 0.05));
  });
});
