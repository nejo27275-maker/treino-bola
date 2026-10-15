import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { angleOf, dist, sub, vec } from '../../src/core/geometry.ts';
import { FIELD } from '../../src/core/sim/common.ts';
import {
  analyzeDecision,
  evaluateDecision,
  generateDecision,
  type DecisionScenario,
} from '../../src/core/sim/decisao.ts';
import {
  analyzeControl,
  evaluateControl,
  generateControl,
  type ControlScenario,
} from '../../src/core/sim/dominio.ts';
import {
  evaluateShot,
  generateShot,
  keeperReachCenter,
  type ShotScenario,
} from '../../src/core/sim/finalizacao.ts';
import { roundSeed } from '../../src/core/sim/index.ts';
import {
  analyzeScan,
  evaluateScan,
  generateScan,
  isBehindPlayer,
  type ScanScenario,
} from '../../src/core/sim/olhe.ts';
import {
  evaluatePass,
  generatePass,
  openTeammates,
  PASS_MAX_DISTANCE,
  type PassScenario,
} from '../../src/core/sim/passe.ts';
import { correctResponse, evaluateReaction, generateReaction } from '../../src/core/sim/reacao.ts';

const SEEDS = Array.from({ length: 150 }, (_, i) => roundSeed(12345, 'passe_brecha', i));

function passScenario(): PassScenario {
  return {
    mode: 'passe_brecha',
    seed: 1,
    difficulty: 2,
    passer: vec(12, 28),
    teammates: [
      { id: 'c1', label: '1', pos: vec(12, 8) },
      { id: 'c2', label: '2', pos: vec(4, 10) },
    ],
    defenders: [{ id: 'a1', pos: vec(12, 18) }],
    cones: [],
    interceptRadius: 1.2,
    coneRadius: 0.35,
    receiveRadius: 1.8,
    maxDistance: PASS_MAX_DISTANCE,
  };
}

function aim(s: PassScenario, target: { x: number; y: number }, extra = 0) {
  const d = dist(s.passer, target) + extra;
  return { angle: angleOf(sub(target, s.passer)), force: d / s.maxDistance };
}

describe('Modo A — passe pela brecha', () => {
  test('passe pelo corredor bloqueado é interceptado', () => {
    const s = passScenario();
    const r = evaluatePass(s, aim(s, s.teammates[0]!.pos));
    assert.equal(r.success, false);
    assert.equal(r.outcome, 'interceptado');
    assert.equal(r.blockerId, 'a1');
    assert.ok(r.stop.y > 18, 'a bola para no ponto da interceptação');
  });

  test('passe pelo corredor livre com força certa é acerto', () => {
    const s = passScenario();
    const r = evaluatePass(s, aim(s, s.teammates[1]!.pos));
    assert.equal(r.success, true);
    assert.equal(r.outcome, 'acerto');
    assert.equal(r.receiverId, 'c2');
    assert.ok(r.points >= 6 && r.points <= 10);
  });

  test('força insuficiente, força demais e direção errada são diferenciadas', () => {
    const s = passScenario();
    assert.equal(evaluatePass(s, aim(s, s.teammates[1]!.pos, -6)).outcome, 'curto');
    assert.equal(evaluatePass(s, aim(s, s.teammates[1]!.pos, 5)).outcome, 'longo');
    const wrong = evaluatePass(s, { angle: angleOf(vec(1, -0.3)), force: 0.3 });
    assert.ok(['desviado', 'fora'].includes(wrong.outcome));
    assert.equal(wrong.success, false);
  });

  test('bola que sai do campo é "fora"', () => {
    const s = passScenario();
    const r = evaluatePass(s, { angle: angleOf(vec(-1, 0)), force: 1 });
    assert.equal(r.outcome, 'fora');
  });

  test('cenários gerados são determinísticos e sempre têm um corredor livre', () => {
    for (const seed of SEEDS) {
      for (const difficulty of [1, 3, 5]) {
        const a = generatePass(seed, difficulty);
        const b = generatePass(seed, difficulty);
        assert.deepEqual(a, b);
        const open = openTeammates(a);
        assert.ok(open.length >= 1, `semente ${seed}: sem corredor livre`);
        // Mirar exatamente no colega livre deve ser acerto (o cenário é solucionável).
        const mate = a.teammates.find((t) => t.id === open[0])!;
        assert.equal(evaluatePass(a, aim(a, mate.pos)).success, true, `semente ${seed}`);
      }
    }
  });

  test('a partir do nível 2 há pelo menos um colega com corredor bloqueado', () => {
    let blockedCount = 0;
    for (const seed of SEEDS) {
      const s = generatePass(seed, 3);
      if (openTeammates(s).length < s.teammates.length) blockedCount++;
    }
    assert.ok(blockedCount / SEEDS.length > 0.95);
  });
});

describe('Modo B — domínio orientado', () => {
  const base: ControlScenario = {
    mode: 'dominio_orientado',
    seed: 1,
    difficulty: 1,
    player: vec(12, 16),
    passer: vec(12, 24),
    defenders: [{ id: 'a1', pos: vec(7, 16) }],
    defenderSpeed: 5,
    actionTime: 0.9,
    touchDistance: 2.2,
    timeLimitMs: 4000,
  };

  test('com pressão pela esquerda, orientar para a direita é o melhor', () => {
    const a = analyzeControl(base);
    assert.equal(a.best, 'direita');
    const ok = evaluateControl(base, 'direita', 1000);
    assert.equal(ok.success, true);
    assert.equal(ok.outcome, 'acerto');
    const bad = evaluateControl(base, 'esquerda', 1000);
    assert.equal(bad.success, false);
    assert.equal(bad.outcome, 'pressionado');
  });

  test('sem resposta é tempo esgotado (incompleto)', () => {
    const r = evaluateControl(base, null);
    assert.equal(r.incomplete, true);
    assert.equal(r.outcome, 'tempo_esgotado');
  });

  test('perto da lateral, a opção que sai do campo é inválida', () => {
    const s: ControlScenario = {
      ...base,
      player: vec(1.5, 16),
      defenders: [{ id: 'a1', pos: vec(6, 16) }],
    };
    const a = analyzeControl(s);
    assert.equal(a.options.find((o) => o.option === 'esquerda')!.valid, false);
    assert.equal(evaluateControl(s, 'esquerda', 500).outcome, 'fora');
  });

  test('responder mais rápido dá mais pontos', () => {
    const fast = evaluateControl(base, 'direita', 300).points;
    const slow = evaluateControl(base, 'direita', 3900).points;
    assert.ok(fast > slow);
  });

  test('cenários gerados têm melhor opção clara e são reproduzíveis', () => {
    for (const seed of SEEDS) {
      const s = generateControl(seed, 3);
      assert.deepEqual(s, generateControl(seed, 3));
      const a = analyzeControl(s);
      assert.ok(a.accepted.includes(a.best));
      assert.equal(evaluateControl(s, a.best, 1000).success, true);
    }
  });
});

describe('Modo C — olhe antes de receber', () => {
  const base: ScanScenario = {
    mode: 'olhe_antes',
    seed: 1,
    difficulty: 1,
    archetype: 'livre',
    player: vec(12, 16),
    passer: vec(12, 25),
    teammates: [{ id: 'c1', label: '1', pos: vec(20, 16.5) }],
    defenders: [{ id: 'a1', pos: vec(10, 7) }],
    scanMs: 3000,
    timeLimitMs: 5000,
  };

  test('sem adversário perto às costas, girar é o melhor', () => {
    const a = analyzeScan(base);
    assert.equal(a.best, 'girar');
    assert.equal(evaluateScan(base, 'girar', 800).success, true);
    assert.equal(evaluateScan(base, 'proteger', 800).success, false);
  });

  test('com marcador colado e colega livre ao lado, tocar para o lado é o melhor', () => {
    const s: ScanScenario = {
      ...base,
      archetype: 'pressao_com_opcao',
      defenders: [{ id: 'a1', pos: vec(12, 14.5) }],
    };
    const a = analyzeScan(s);
    assert.equal(a.facts.turnConeFree, false);
    assert.equal(a.best, 'tocar_lado');
    assert.equal(evaluateScan(s, 'girar', 800).success, false);
  });

  test('com marcador colado e sem colega livre, proteger ou devolver são aceitos', () => {
    const s: ScanScenario = {
      ...base,
      archetype: 'pressao_sem_opcao',
      defenders: [
        { id: 'a1', pos: vec(12, 14.5) },
        { id: 'a2', pos: vec(20, 15.6) },
      ],
    };
    const a = analyzeScan(s);
    assert.equal(a.facts.openTeammate, null);
    assert.ok(a.accepted.includes('proteger'));
    assert.ok(a.accepted.includes('devolver'));
    assert.equal(evaluateScan(s, 'girar', 900).success, false);
  });

  test('o que está às costas é escondido na fase de decisão', () => {
    assert.equal(isBehindPlayer(base, vec(10, 7)), true);
    assert.equal(isBehindPlayer(base, vec(12, 25)), false);
  });

  test('cenários gerados: resposta calculada coerente com o tipo e variedade de respostas', () => {
    const bests = new Set<string>();
    for (const seed of SEEDS) {
      const s = generateScan(seed, 2);
      const a = analyzeScan(s);
      bests.add(a.best);
      const expected: Record<string, string[]> = {
        livre: ['girar'],
        pressao_com_opcao: ['tocar_lado'],
        pressao_sem_opcao: ['proteger', 'devolver'],
        pressao_media: ['tocar_lado', 'devolver'],
      };
      assert.ok(
        expected[s.archetype]!.includes(a.best),
        `semente ${seed}: ${s.archetype} → ${a.best}`,
      );
    }
    assert.ok(bests.size >= 3, 'as rodadas não podem ter sempre a mesma resposta');
  });
});

describe('Modo D — decisão rápida', () => {
  test('espaço à frente → conduzir; colega livre e frente fechada → passar; pressão → proteger', () => {
    const espaco: DecisionScenario = {
      mode: 'decisao_rapida',
      seed: 1,
      difficulty: 1,
      archetype: 'espaco',
      player: vec(12, 20),
      teammates: [{ id: 'c1', label: '1', pos: vec(5, 16) }],
      defenders: [
        { id: 'a1', pos: vec(5.3, 15.2) },
        { id: 'a2', pos: vec(12, 9) },
      ],
      timeLimitMs: 5000,
    };
    assert.equal(analyzeDecision(espaco).best, 'conduzir');

    const passe: DecisionScenario = {
      ...espaco,
      archetype: 'passe',
      teammates: [{ id: 'c1', label: '1', pos: vec(18, 14) }],
      defenders: [{ id: 'a1', pos: vec(12, 17) }],
    };
    const ap = analyzeDecision(passe);
    assert.equal(ap.best, 'passar');
    assert.equal(ap.bestTeammate, 'c1');

    const pressao: DecisionScenario = {
      ...espaco,
      archetype: 'pressao',
      teammates: [{ id: 'c1', label: '1', pos: vec(6, 15) }],
      defenders: [
        { id: 'a1', pos: vec(12, 21.5) },
        { id: 'a2', pos: vec(12, 17) },
        { id: 'a3', pos: vec(6.3, 14.2) },
      ],
    };
    assert.equal(analyzeDecision(pressao).best, 'proteger');
    assert.equal(evaluateDecision(pressao, 'conduzir', 1000).success, false);
    assert.equal(evaluateDecision(pressao, null).incomplete, true);
  });

  test('gerador produz as três respostas e uma única opção aceita', () => {
    const bests = new Map<string, number>();
    for (const seed of SEEDS) {
      const s = generateDecision(seed, 2);
      const a = analyzeDecision(s);
      bests.set(a.best, (bests.get(a.best) ?? 0) + 1);
      assert.equal(evaluateDecision(s, a.best, 900).success, true);
    }
    assert.equal(bests.size, 3, `respostas: ${[...bests.keys()].join(', ')}`);
  });
});

describe('Modo E — reação à pressão', () => {
  test('regra: fugir para o lado oposto; dupla → proteger', () => {
    assert.equal(correctResponse('esquerda'), 'direita');
    assert.equal(correctResponse('direita'), 'esquerda');
    assert.equal(correctResponse('dupla'), 'proteger');
  });

  test('classifica acerto, erro, tempo esgotado e antecipação', () => {
    const s = { ...generateReaction(5, 1), stimulus: 'esquerda' as const, windowMs: 1500 };
    const hit = evaluateReaction(s, { response: 'direita', responseMs: 400 });
    assert.equal(hit.success, true);
    assert.ok(hit.points > evaluateReaction(s, { response: 'direita', responseMs: 1400 }).points);
    assert.equal(evaluateReaction(s, { response: 'esquerda', responseMs: 300 }).outcome, 'erro');
    const late = evaluateReaction(s, { response: 'direita', responseMs: 1600 });
    assert.equal(late.outcome, 'tempo_esgotado');
    assert.equal(late.incomplete, true);
    const early = evaluateReaction(s, { response: 'direita', responseMs: null, early: true });
    assert.equal(early.outcome, 'antecipado');
  });

  test('estímulo duplo só a partir do nível 3; espera entre 1 e 2,5 s', () => {
    for (const seed of SEEDS) {
      const easy = generateReaction(seed, 2);
      assert.notEqual(easy.stimulus, 'dupla');
      assert.ok(easy.foreperiodMs >= 1000 && easy.foreperiodMs <= 2500);
    }
    assert.ok(SEEDS.some((seed) => generateReaction(seed, 4).stimulus === 'dupla'));
  });
});

describe('Modo F — finalização', () => {
  const s: ShotScenario = {
    ...generateShot(3, 1, 'futsal'),
    keeper: { x: 1.5, y: 0.84, rx: 0.66, ry: 1.1, lean: 0 },
    blocker: { x: 0.5, w: 0.55, h: 1.4 },
  };

  test('fora, bloqueado, defendido e gol seguem as regras explícitas', () => {
    assert.equal(evaluateShot(s, vec(3.05, 0.5)).outcome, 'fora');
    assert.equal(
      evaluateShot(s, vec(1.5, 1.95)).outcome,
      'fora',
      'acima do travessão (com o raio da bola)',
    );
    assert.equal(evaluateShot(s, vec(0.5, 0.4)).outcome, 'bloqueado');
    assert.equal(evaluateShot(s, vec(1.5, 0.8)).outcome, 'defendido');
    const goal = evaluateShot(s, vec(2.75, 0.2));
    assert.equal(goal.outcome, 'gol');
    assert.equal(goal.success, true);
    assert.equal((goal as { targetId?: string }).targetId, 'inf-dir');
    assert.equal(evaluateShot(s, null).outcome, 'tempo_esgotado');
  });

  test('goleiro inclinado desloca o alcance para o lado da inclinação', () => {
    const leaning: ShotScenario = { ...s, keeper: { ...s.keeper, lean: 1 } };
    assert.ok(keeperReachCenter(leaning).x > keeperReachCenter(s).x);
  });

  test('tamanho da baliza depende da modalidade e sempre existe um canto livre', () => {
    for (const seed of SEEDS) {
      for (const modality of ['futsal', 'society', 'campo'] as const) {
        const sc = generateShot(seed, 5, modality);
        const corners = sc.targets.map((t) => vec(t.x + t.w / 2, t.y + t.h / 2));
        assert.ok(
          corners.some((c) => evaluateShot(sc, c).success),
          `semente ${seed} ${modality}: nenhum canto livre`,
        );
      }
    }
    assert.equal(generateShot(1, 1, 'campo').goal.width, 7.32);
    assert.equal(generateShot(1, 1, 'futsal').goal.width, 3);
  });
});

describe('coordenadas do campo', () => {
  test('atores gerados ficam dentro do campo', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const scenarios = [
        generatePass(seed, 4),
        generateControl(seed, 4),
        generateScan(seed, 4),
        generateDecision(seed, 4),
      ];
      for (const sc of scenarios) {
        const actors = [
          ...('teammates' in sc ? sc.teammates : []),
          ...('defenders' in sc ? sc.defenders : []),
        ];
        for (const a of actors) {
          assert.ok(
            a.pos.x >= 0 && a.pos.x <= FIELD.width && a.pos.y >= 0 && a.pos.y <= FIELD.length,
            `${sc.mode} semente ${seed}`,
          );
        }
      }
    }
  });
});

describe('descrição em texto da cena', () => {
  test('posição relativa como na tela (ataque para cima)', async () => {
    const { relativePosition } = await import('../../src/ui/sim/fieldView.ts');
    assert.equal(
      relativePosition({ x: 10, y: 20 }, { x: 13, y: 12 }),
      '8 m à frente e 3 m à direita (a 9 m)',
    );
    assert.equal(
      relativePosition({ x: 10, y: 20 }, { x: 6, y: 22 }),
      '2 m atrás e 4 m à esquerda (a 4 m)',
    );
    assert.equal(relativePosition({ x: 10, y: 20 }, { x: 10.2, y: 19.8 }), 'colado em você');
  });
});
