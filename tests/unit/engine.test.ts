import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  assessSkill,
  assessWellbeing,
  MIN_EFFECTIVE_ATTEMPTS,
  runEngine,
} from '../../src/core/engine.ts';
import { nextDifficulty, nextStoredLevel, summarizeRounds } from '../../src/core/scoring.ts';
import type { RoundLog } from '../../src/core/types.ts';
import { profile, result, session } from './helpers.ts';

const TODAY = '2026-10-14';

describe('motor adaptativo — avaliação de fundamentos', () => {
  test('sem nenhum dado o fundamento fica pendente (sem nota inventada)', () => {
    const a = assessSkill('passe', [], [], TODAY);
    assert.equal(a.status, 'pendente');
    assert.equal(a.score, null);
    assert.equal(a.level, 'indefinido');
  });

  test('poucas tentativas = dados insuficientes', () => {
    const a = assessSkill('passe', [result('passe', 4, 2)], [], TODAY);
    assert.equal(a.status, 'insuficiente');
    assert.ok((a.real?.effectiveAttempts ?? 0) < MIN_EFFECTIVE_ATTEMPTS);
  });

  test('taxa ponderada e nível a partir de dados reais', () => {
    const a = assessSkill('passe', [result('passe', 20, 6)], [], TODAY);
    assert.equal(a.status, 'avaliado');
    assert.equal(a.level, 'baixo');
    assert.ok(a.score !== null && a.score < 0.5);
  });

  test('várias sessões no mesmo dia: a tendência segue o horário, não o id', () => {
    const at = (h: string, id: string, ok: number) =>
      result('passe', 10, ok, {
        source: 'simulador',
        sessionId: id,
        createdAt: `2026-10-14T${h}:00:00.000Z`,
      });
    // Ids em ordem alfabética inversa ao horário: zzz (08h), mmm (09h), aaa (20h, a melhor).
    const a = assessSkill(
      'passe',
      [at('20', 'aaa', 9), at('08', 'zzz', 5), at('09', 'mmm', 5)],
      [],
      TODAY,
    );
    assert.deepEqual(
      a.sessionRates.map((r) => r.sessionId),
      ['zzz', 'mmm', 'aaa'],
    );
    assert.equal(a.trend, 'melhorando');
  });

  test('autoavaliação sozinha não vira medição', () => {
    const a = assessSkill(
      'drible',
      [
        result('drible', 0, 0, {
          source: 'autoavaliacao',
          rating: 5,
          activityKind: 'autoavaliacao',
        }),
      ],
      [],
      TODAY,
    );
    assert.equal(a.status, 'insuficiente');
    assert.equal(a.selfRating?.rating, 5);
  });

  test('origem pesa: observação de vídeo vale menos que contagem manual', () => {
    const manual = assessSkill(
      'passe',
      [result('passe', 10, 10, { source: 'contagem_manual' })],
      [],
      TODAY,
    );
    const video = assessSkill(
      'passe',
      [result('passe', 10, 10, { source: 'observacao_video' })],
      [],
      TODAY,
    );
    assert.ok((manual.real?.effectiveAttempts ?? 0) > (video.real?.effectiveAttempts ?? 0));
  });

  test('resultados antigos pesam menos (meia-vida de 14 dias)', () => {
    const oldBad = result('passe', 20, 2, { date: '2026-08-01' });
    const recentGood = result('passe', 20, 18, { date: TODAY });
    const a = assessSkill('passe', [oldBad, recentGood], [], TODAY);
    assert.ok(a.score !== null && a.score > 0.75, `score ${a.score}`);
  });

  test('detecta resultados inconsistentes entre sessões', () => {
    const a = assessSkill(
      'primeiro_toque',
      [
        result('primeiro_toque', 10, 2, { sessionId: 's1', date: '2026-10-12' }),
        result('primeiro_toque', 10, 9, { sessionId: 's2', date: '2026-10-13' }),
      ],
      [],
      TODAY,
    );
    assert.equal(a.inconsistent, true);
  });

  test('erro mais frequente é identificado', () => {
    const a = assessSkill(
      'primeiro_toque',
      [
        result('primeiro_toque', 10, 5, { errorTags: { pe_rigido: 3, corpo_desalinhado: 1 } }),
        result('primeiro_toque', 10, 6, { errorTags: { pe_rigido: 2 } }),
      ],
      [],
      TODAY,
    );
    assert.deepEqual(a.topError, { tag: 'pe_rigido', count: 5 });
  });
});

describe('motor adaptativo — recomendações explicáveis', () => {
  test('dificuldade recorrente no primeiro toque gera recomendação de treino com motivo', () => {
    const out = runEngine({
      today: TODAY,
      results: [
        result('primeiro_toque', 12, 3, { sessionId: 'a', date: '2026-10-13' }),
        result('primeiro_toque', 12, 4, { sessionId: 'b', date: TODAY }),
      ],
      sessions: [],
      profile: profile(),
    });
    const rec = out.ranked.find((r) => r.skill === 'primeiro_toque');
    assert.ok(rec);
    assert.equal(rec.type, 'treinar');
    assert.ok(rec.reasons.join(' ').includes('Precisa de atenção'));
    assert.equal(out.recommendations[0]?.skill, 'primeiro_toque', 'é a maior prioridade');
  });

  test('bom desempenho sustentado sugere progredir de nível', () => {
    const out = runEngine({
      today: TODAY,
      results: [
        result('passe', 12, 11, { sessionId: 'a', date: '2026-10-12' }),
        result('passe', 12, 11, { sessionId: 'b', date: '2026-10-13' }),
      ],
      sessions: [],
      profile: profile(),
    });
    const rec = out.ranked.find((r) => r.skill === 'passe');
    assert.equal(rec?.type, 'progredir');
    assert.ok((rec?.difficulty ?? 0) >= 2);
  });

  test('resultados inconsistentes pedem nova medição antes de concluir', () => {
    const out = runEngine({
      today: TODAY,
      results: [
        result('passe', 10, 1, { sessionId: 'a', date: '2026-10-12' }),
        result('passe', 10, 9, { sessionId: 'b', date: '2026-10-13' }),
      ],
      sessions: [],
      profile: null,
    });
    assert.equal(out.ranked.find((r) => r.skill === 'passe')?.type, 'reavaliar');
  });

  test('foco do perfil aumenta a prioridade e é explicado', () => {
    const base = runEngine({ today: TODAY, results: [], sessions: [], profile: profile() });
    const focused = runEngine({
      today: TODAY,
      results: [],
      sessions: [],
      profile: profile({ focos: ['finalizacao'] }),
    });
    const p0 = base.ranked.find((r) => r.skill === 'finalizacao')!.priority;
    const p1 = focused.ranked.find((r) => r.skill === 'finalizacao')!;
    assert.ok(p1.priority > p0);
    assert.ok(p1.reasons.some((r) => r.includes('foco')));
  });

  test('simulação boa e execução real fraca: prioriza técnica e explica a diferença', () => {
    const out = runEngine({
      today: TODAY,
      results: [
        result('passe', 20, 18, { source: 'simulador', activityKind: 'simulador' }),
        result('passe', 20, 8, { source: 'contagem_manual' }),
      ],
      sessions: [],
      profile: null,
    });
    const rec = out.ranked.find((r) => r.skill === 'passe')!;
    assert.ok(rec.reasons.some((r) => r.includes('execução real ainda está abaixo')));
  });

  test('recomendações são determinísticas', () => {
    const input = {
      today: TODAY,
      results: [result('passe', 10, 4), result('decisao', 10, 7, { source: 'simulador' as const })],
      sessions: [],
      profile: profile(),
    };
    assert.deepEqual(runEngine(input).ranked, runEngine(input).ranked);
  });
});

describe('bem-estar e fadiga', () => {
  test('desconforto forte recomenda descanso', () => {
    const w = assessWellbeing([session('2026-10-13', { discomfort: 3 })], TODAY);
    assert.equal(w.level, 'descanso');
    const out = runEngine({
      today: TODAY,
      results: [],
      sessions: [session('2026-10-13', { discomfort: 3 })],
      profile: null,
    });
    assert.equal(out.recommendations[0]?.type, 'descansar');
  });

  test('esforço muito alto ontem pede sessão leve', () => {
    assert.equal(assessWellbeing([session('2026-10-13', { rpe: 9 })], TODAY).level, 'atencao');
  });

  test('registros antigos não geram alerta', () => {
    assert.equal(
      assessWellbeing([session('2026-10-01', { rpe: 10, discomfort: 3 })], TODAY).level,
      'ok',
    );
  });
});

describe('pontuação e dificuldade progressiva', () => {
  const rounds = (n: number, ok: number): RoundLog[] =>
    Array.from({ length: n }, (_, i) => ({
      round: i,
      seed: i,
      outcome: i < ok ? 'acerto' : 'erro',
      success: i < ok,
      points: i < ok ? 8 : 0,
      responseMs: 500,
    }));

  test('resumo ignora rodadas antecipadas', () => {
    const r = [
      ...rounds(10, 7),
      { round: 99, seed: 1, outcome: 'antecipado', success: false, incomplete: true, points: 0 },
    ];
    const s = summarizeRounds(r);
    assert.equal(s.attempts, 10);
    assert.equal(s.successes, 7);
    assert.equal(s.score, 56);
    assert.equal(s.avgResponseMs, 500);
  });

  test('sobe com ≥80%, desce com <40%, mantém com poucas tentativas', () => {
    assert.equal(nextDifficulty(2, summarizeRounds(rounds(10, 9))).level, 3);
    assert.equal(nextDifficulty(2, summarizeRounds(rounds(10, 3))).level, 1);
    assert.equal(nextDifficulty(2, summarizeRounds(rounds(10, 6))).level, 2);
    assert.equal(nextDifficulty(5, summarizeRounds(rounds(10, 10))).level, 5);
    assert.equal(nextDifficulty(1, summarizeRounds(rounds(10, 0))).level, 1);
    const few = nextDifficulty(2, summarizeRounds(rounds(5, 5)));
    assert.equal(few.changed, false);
  });

  test('nível salvo só muda na direção que a sessão comprova', () => {
    const bad = summarizeRounds(rounds(10, 2));
    const good = summarizeRounds(rounds(10, 9));
    // No próprio nível: regra normal.
    assert.equal(nextStoredLevel(3, 3, good).level, 4);
    assert.equal(nextStoredLevel(3, 3, bad).level, 2);
    // Ir mal num nível escolhido ACIMA não sobe (nem mexe) o nível salvo.
    const failAbove = nextStoredLevel(1, 5, bad);
    assert.equal(failAbove.level, 1);
    assert.equal(failAbove.changed, false);
    assert.match(failAbove.reason, /nível salvo continua 1/);
    // Ir bem num nível ACIMA promove para um acima do jogado.
    const winAbove = nextStoredLevel(1, 3, good);
    assert.deepEqual([winAbove.level, winAbove.changed], [4, true]);
    // Ir bem num nível ABAIXO não muda; ir mal abaixo rebaixa para um abaixo do jogado.
    assert.equal(nextStoredLevel(4, 1, good).level, 4);
    assert.equal(nextStoredLevel(4, 3, bad).level, 2);
    // Poucas rodadas: nada muda.
    assert.equal(nextStoredLevel(2, 4, summarizeRounds(rounds(5, 5))).changed, false);
  });
});
