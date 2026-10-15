import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  baselineIsNoisy,
  computeBaseline,
  findPeaks,
  frameDiff,
  OnsetDetector,
  rgbaToGray,
  type GrayFrame,
} from '../../src/core/motion.ts';
import {
  computePoseMetrics,
  jointAngle,
  summarizePoseSeries,
  type Landmark,
} from '../../src/core/poseMetrics.ts';
import { createRng } from '../../src/core/rng.ts';

const W = 64;
const H = 48;

function frame(
  fill: number,
  block?: { x: number; y: number; w: number; h: number; value: number },
  noiseSeed?: number,
): GrayFrame {
  const data = new Uint8Array(W * H).fill(fill);
  if (noiseSeed !== undefined) {
    const rng = createRng(noiseSeed);
    for (let i = 0; i < data.length; i++)
      data[i] = Math.max(0, Math.min(255, fill + rng.int(-6, 6)));
  }
  if (block) {
    for (let y = block.y; y < block.y + block.h; y++) {
      for (let x = block.x; x < block.x + block.w; x++) data[y * W + x] = block.value;
    }
  }
  return { width: W, height: H, data };
}

describe('detecção de movimento (diferença de quadros)', () => {
  test('converte RGBA em cinza', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const g = rgbaToGray(rgba, 2, 1);
    assert.equal(g.data[0], 255);
    assert.equal(g.data[1], 0);
  });

  test('quadros iguais não têm movimento; bloco que muda é medido no lado certo', () => {
    const a = frame(100);
    assert.equal(frameDiff(a, frame(100)).ratio, 0);
    const b = frame(100, { x: 4, y: 10, w: 10, h: 10, value: 200 });
    const s = frameDiff(a, b);
    assert.ok(Math.abs(s.ratio - 100 / (W * H)) < 1e-9);
    assert.ok(s.leftRatio > 0 && s.rightRatio === 0);
    assert.ok(s.cx < 0.3);
  });

  test('espelhamento troca esquerda e direita (jogador de frente para a câmera)', () => {
    const a = frame(100);
    const b = frame(100, { x: 4, y: 10, w: 10, h: 10, value: 200 });
    const mirrored = frameDiff(a, b, 25, true);
    assert.ok(mirrored.rightRatio > 0 && mirrored.leftRatio === 0);
  });

  test('ruído de sensor fica abaixo do limiar de pixel', () => {
    assert.equal(frameDiff(frame(120, undefined, 1), frame(120, undefined, 2)).changed, 0);
  });

  test('calibração define limiar acima do ruído e detecta cena ruidosa', () => {
    const quiet = computeBaseline([0.001, 0.002, 0.0015, 0.001]);
    assert.ok(quiet.threshold >= 0.012);
    assert.equal(baselineIsNoisy(quiet), false);
    assert.equal(baselineIsNoisy(computeBaseline([0.2, 0.25, 0.3])), true);
  });

  test('início do movimento exige quadros consecutivos e identifica o lado', () => {
    const det = new OnsetDetector({ threshold: 0.02, consecutive: 2 });
    const still = {
      ratio: 0.001,
      leftRatio: 0.001,
      rightRatio: 0.001,
      cx: 0.5,
      cy: 0.5,
      changed: 3,
    };
    const left = { ratio: 0.05, leftRatio: 0.09, rightRatio: 0.01, cx: 0.2, cy: 0.5, changed: 150 };
    assert.equal(det.push(still, 0), null);
    assert.equal(det.push(left, 33), null, 'um quadro isolado não basta');
    const onset = det.push(left, 66);
    assert.ok(onset);
    assert.equal(onset.time, 33);
    assert.equal(onset.side, 'esquerda');
  });

  test('movimento dos dois lados é "indefinido"', () => {
    const det = new OnsetDetector({ threshold: 0.02, consecutive: 1 });
    const both = {
      ratio: 0.08,
      leftRatio: 0.08,
      rightRatio: 0.075,
      cx: 0.5,
      cy: 0.5,
      changed: 240,
    };
    assert.equal(det.push(both, 10)?.side, 'indefinido');
  });

  test('picos de movimento respeitam separação mínima', () => {
    const times = Array.from({ length: 40 }, (_, i) => i * 0.25);
    const values = times.map(() => 0.002);
    values[8] = 0.06;
    values[9] = 0.05;
    values[30] = 0.04;
    const peaks = findPeaks(values, times, { minSeparation: 1.5, maxPeaks: 5 });
    assert.deepEqual(
      peaks.map((p) => p.time),
      [2, 7.5],
    );
  });
});

/** Pose sintética de frente para a câmera (coordenadas normalizadas). */
function standingPose(leanX = 0, visibility = 0.9): Landmark[] {
  const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
  const set = (i: number, x: number, y: number) => {
    lms[i] = { x, y, visibility };
  };
  set(11, 0.42 + leanX, 0.3);
  set(12, 0.58 + leanX, 0.3);
  set(23, 0.45, 0.55);
  set(24, 0.55, 0.55);
  set(25, 0.45, 0.72);
  set(26, 0.55, 0.72);
  set(27, 0.45, 0.9);
  set(28, 0.55, 0.9);
  return lms;
}

describe('métricas de pose', () => {
  test('ângulo articular', () => {
    assert.ok(Math.abs(jointAngle({ X: 0, Y: 0 }, { X: 0, Y: 1 }, { X: 0, Y: 2 }) - 180) < 1e-9);
    assert.ok(Math.abs(jointAngle({ X: 1, Y: 0 }, { X: 0, Y: 0 }, { X: 0, Y: 1 }) - 90) < 1e-9);
  });

  test('tronco reto ≈ 0°, inclinado > 0°, pernas estendidas ≈ 0° de flexão', () => {
    const straight = computePoseMetrics(standingPose(0), 1);
    const lean = straight.find((m) => m.id === 'inclinacao_tronco')!;
    assert.equal(lean.reliable, true);
    assert.ok(Math.abs(lean.value ?? 99) < 1);
    assert.ok((straight.find((m) => m.id === 'flexao_joelho_esq')!.value ?? 99) < 1);
    const leaning = computePoseMetrics(standingPose(0.08), 1).find(
      (m) => m.id === 'inclinacao_tronco',
    )!;
    assert.ok((leaning.value ?? 0) > 10);
  });

  test('pontos pouco visíveis tornam a métrica não confiável', () => {
    const metrics = computePoseMetrics(standingPose(0, 0.3), 1);
    assert.ok(metrics.every((m) => !m.reliable));
  });

  test('resumo de série: estabilidade do tronco', () => {
    const stable = Array.from({ length: 8 }, () => computePoseMetrics(standingPose(0), 1));
    assert.equal(summarizePoseSeries(stable).stability, 'estavel');
    const variable = Array.from({ length: 8 }, (_, i) =>
      computePoseMetrics(standingPose(i % 2 === 0 ? 0.1 : -0.1), 1),
    );
    assert.equal(summarizePoseSeries(variable).stability, 'variavel');
    assert.equal(summarizePoseSeries([]).stability, 'indefinido');
  });
});

describe('mensagens de erro de câmera e vídeo', () => {
  test('erros conhecidos viram orientações em português', async () => {
    const { describeCameraError, describeVideoError, checkVideoFile, cameraSupport } =
      await import('../../src/media/mediaErrors.ts');
    assert.equal(describeCameraError({ name: 'NotAllowedError' }).code, 'permissao_negada');
    assert.equal(describeCameraError({ name: 'NotReadableError' }).code, 'camera_ocupada');
    assert.equal(describeCameraError({ name: 'NotSupportedError' }).code, 'nao_suportado');
    assert.equal(describeCameraError({ name: 'OverconstrainedError' }).code, 'configuracao');
    assert.equal(describeCameraError(new Error('x')).code, 'desconhecido');
    assert.equal(cameraSupport(false, true)?.code, 'inseguro');
    assert.equal(cameraSupport(true, false)?.code, 'sem_suporte');
    assert.equal(cameraSupport(true, true), null);
    assert.equal(describeVideoError(4).code, 'formato');
    assert.equal(describeVideoError(3).code, 'decodificacao');
    assert.equal(checkVideoFile({ name: 'a.txt', type: 'text/plain', size: 10 }).ok, false);
    assert.equal(checkVideoFile({ name: 'jogo.MOV', type: '', size: 10 }).ok, true);
    assert.equal(checkVideoFile({ name: 'v.mp4', type: 'video/mp4', size: 0 }).ok, false);
    assert.ok(
      checkVideoFile({ name: 'v.mp4', type: 'video/mp4', size: 600 * 1024 * 1024 }).warning,
    );
  });
});
