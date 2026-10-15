import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { catalog } from '../../src/content/catalog.ts';
import { runEngine } from '../../src/core/engine.ts';
import { buildPlan } from '../../src/core/planner.ts';
import type { Profile, ResultRecord, TrainingSession } from '../../src/core/types.ts';
import { profile, result, session } from './helpers.ts';

const INTERCLASSE = { nome: 'Interclasse', data: '2026-10-20' };

function plan(
  today: string,
  opts: {
    results?: ResultRecord[];
    sessions?: TrainingSession[];
    profile?: Profile | null;
    competition?: { nome: string; data: string } | null;
  } = {},
) {
  const p = opts.profile === undefined ? profile() : opts.profile;
  const engine = runEngine({
    today,
    results: opts.results ?? [],
    sessions: opts.sessions ?? [],
    profile: p,
  });
  return buildPlan({
    today,
    competition: opts.competition === undefined ? INTERCLASSE : opts.competition,
    profile: p,
    engine,
    sessions: opts.sessions ?? [],
    catalog,
  });
}

/** Dados de base suficientes para não cair na fase de avaliação. */
function baselineResults(date = '2026-10-13'): ResultRecord[] {
  return (
    ['primeiro_toque', 'passe', 'conducao', 'finalizacao', 'percepcao', 'decisao'] as const
  ).map((s) =>
    result(s, 10, s === 'passe' ? 3 : 7, {
      date,
      source: s === 'percepcao' || s === 'decisao' ? 'simulador' : 'contagem_manual',
    }),
  );
}

describe('planejador até o interclasse', () => {
  test('de 14/10/2026 até 20/10/2026: 7 dias, terminando no dia do evento', () => {
    const p = plan('2026-10-14');
    assert.equal(p.mode, 'evento');
    assert.equal(p.daysToEvent, 6);
    assert.equal(p.days.length, 7);
    assert.equal(p.days[0]!.date, '2026-10-14');
    assert.equal(p.days[0]!.isToday, true);
    assert.equal(p.days[6]!.date, '2026-10-20');
    assert.equal(p.days[6]!.weekday, 'terça-feira');
  });

  test('sem dados, hoje é dia de avaliação inicial com testes', () => {
    const p = plan('2026-10-14');
    assert.equal(p.days[0]!.phase, 'avaliacao');
    assert.ok(p.days[0]!.blocks.some((b) => b.kind === 'teste'));
  });

  test('dia do evento: rotina, aquecimento e hidratação, sem treino técnico ou físico extra', () => {
    const day = plan('2026-10-14').days[6]!;
    assert.equal(day.phase, 'competicao');
    assert.ok(day.blocks.every((b) => b.kind === 'mental' || b.kind === 'aquecimento'));
    assert.ok(day.notes.some((n) => n.toLowerCase().includes('água')));
    assert.ok(
      day.notes.some((n) => n.includes('sem treino extra') || n.includes('não há treino extra')),
    );
  });

  test('véspera leve e recuperação dois dias antes', () => {
    const p = plan('2026-10-14', { results: baselineResults() });
    const eve = p.days.find((d) => d.date === '2026-10-19')!;
    assert.equal(eve.phase, 'vespera');
    assert.equal(eve.intensity, 'leve');
    assert.ok(!eve.blocks.some((b) => b.kind === 'fisico'));
    // Familiarização técnica curta e a revisão da rotina pré-jogo cabem no tempo padrão;
    // a visualização (opcional) fica para quem tem mais tempo.
    assert.deepEqual(
      eve.blocks.map((b) => b.activityId),
      ['aquecimento-dinamico', eve.blocks[1]!.activityId, 'rotina-pre-jogo'],
    );
    assert.equal(eve.blocks[1]!.kind, 'tecnico');
    assert.ok(eve.minutes <= 20, `${eve.minutes} min`);
    assert.equal(p.days.find((d) => d.date === '2026-10-18')!.phase, 'recuperacao');
  });

  test('com pouco tempo, a véspera corta a visualização e, se preciso, indica a rotina para a noite', () => {
    const eveWith = (minutes: number) =>
      plan('2026-10-14', {
        results: baselineResults(),
        profile: profile({ minutosDisponiveis: minutes }),
      }).days.find((d) => d.date === '2026-10-19')!;
    const fifteen = eveWith(15);
    assert.ok(fifteen.minutes <= 15, `${fifteen.minutes} min`);
    assert.deepEqual(
      fifteen.blocks.map((b) => b.kind),
      ['aquecimento', 'tecnico', 'mental'],
    );
    const ten = eveWith(10);
    assert.ok(!ten.blocks.some((b) => b.activityId === 'rotina-pre-jogo'));
    assert.ok(
      ten.notes.some((n) => n.includes('Minha rotina pré-jogo') && n.includes('antes de dormir')),
      ten.notes.join(' | '),
    );
  });

  test('atividades guiadas usam a duração real e nunca são encurtadas', () => {
    for (const minutes of [10, 15, 20, 30]) {
      const p = plan('2026-10-14', { profile: profile({ minutosDisponiveis: minutes }) });
      for (const d of p.days) {
        for (const b of d.blocks) {
          if (b.kind === 'aquecimento' && b.activityId === 'aquecimento-dinamico')
            assert.equal(b.minutes, 6, `${minutes}/${d.date}`);
          if (b.activityId === 'rotina-pre-jogo') assert.equal(b.minutes, 5);
          if (b.kind === 'simulador') assert.equal(b.minutes, 5);
        }
        // O dia passa do tempo disponível no máximo pela folga de 2 min (exceto o dia do jogo).
        if (d.phase !== 'competicao')
          assert.ok(d.minutes <= minutes + 2, `${d.date}: ${d.minutes}`);
      }
    }
  });

  test('dia de avaliação não repete o mesmo teste e prioriza os focos', () => {
    const p = plan('2026-10-14', {
      profile: profile({ focos: ['primeiro_toque', 'percepcao'], minutosDisponiveis: 30 }),
    });
    const today = p.days[0]!;
    const ids = today.blocks.map((b) => b.activityId);
    assert.equal(new Set(ids).size, ids.length, ids.join(', '));
    assert.equal(today.blocks.find((b) => b.kind === 'teste')?.skill, 'primeiro_toque');
    assert.equal(today.blocks.find((b) => b.kind === 'simulador')?.skill, 'percepcao');
  });

  test('não prescreve treino intenso todos os dias', () => {
    const p = plan('2026-10-14', { results: baselineResults() });
    const moderate = p.days.filter((d) => d.intensity === 'moderada').length;
    assert.ok(moderate <= 4, `dias moderados: ${moderate}`);
    assert.ok(p.days.every((d) => d.intensity !== ('alta' as never)));
  });

  test('respeita o tempo disponível do perfil', () => {
    const p = plan('2026-10-14', {
      results: baselineResults(),
      profile: profile({ minutosDisponiveis: 20, preferenciaSessao: 'curtas' }),
    });
    for (const d of p.days) assert.ok(d.minutes <= 20, `${d.date}: ${d.minutes} min`);
  });

  test('varia o exercício técnico após uma sessão recente do mesmo fundamento', () => {
    const p = plan('2026-10-15', {
      competition: null,
      results: baselineResults('2026-10-14'),
      sessions: [
        session('2026-10-14', {
          kind: 'tecnico',
          activityId: 'passe-porta',
          activityName: 'Passe na porta',
          skills: ['passe'],
        }),
      ],
      profile: profile({
        focos: ['passe'],
        minutosDisponiveis: 45,
        preferenciaSessao: 'longas',
      }),
    });
    const technical = p.days[0]?.blocks.find((block) => block.kind === 'tecnico');
    assert.equal(technical?.skill, 'passe');
    assert.equal(technical?.activityId, 'passe-tabela-parede');
  });

  test('alterna capacidades físicas para não limitar o plano a coordenação e core', () => {
    const p = plan('2026-10-12', {
      competition: null,
      results: baselineResults(),
      profile: profile({ minutosDisponiveis: 45, preferenciaSessao: 'longas' }),
    });
    const rotatedIds = new Set([
      'coordenacao-escada',
      'core-estabilidade',
      'equilibrio-propriocepcao',
      'forca-peso-corporal',
      'aceleracao-curta',
    ]);
    const physicalIds = p.days.flatMap((day) =>
      day.blocks
        .filter((block) => block.kind === 'fisico' && rotatedIds.has(block.activityId))
        .map((block) => block.activityId),
    );
    assert.deepEqual(physicalIds.slice(0, 5), [
      'coordenacao-escada',
      'core-estabilidade',
      'equilibrio-propriocepcao',
      'forca-peso-corporal',
      'aceleracao-curta',
    ]);
  });

  test('plano curto não pula capacidades quando o bloco físico opcional não cabe', () => {
    const p = plan('2026-10-12', {
      competition: { nome: 'Copa distante', data: '2026-12-01' },
      results: baselineResults('2026-10-11'),
      profile: profile({ minutosDisponiveis: 20, preferenciaSessao: 'longas' }),
    });
    const rotated = new Set([
      'coordenacao-escada',
      'core-estabilidade',
      'equilibrio-propriocepcao',
      'forca-peso-corporal',
      'aceleracao-curta',
    ]);
    const physicalIds = p.days.flatMap((day) =>
      day.blocks
        .filter((block) => block.kind === 'fisico' && rotated.has(block.activityId))
        .map((block) => block.activityId),
    );
    assert.deepEqual(physicalIds.slice(0, 5), [
      'coordenacao-escada',
      'core-estabilidade',
      'equilibrio-propriocepcao',
      'forca-peso-corporal',
      'aceleracao-curta',
    ]);
  });

  test('evento passado não mantém o treino preso ao modo de proximidade da competição', () => {
    const p = plan('2026-10-22', {
      results: baselineResults(),
      profile: profile({ minutosDisponiveis: 45, preferenciaSessao: 'longas' }),
    });
    const firstPhysical = p.days[0]?.blocks.find((block) => block.kind === 'fisico');
    assert.equal(firstPhysical?.activityId, 'coordenacao-escada');
    assert.notEqual(firstPhysical?.activityId, 'agilidade-frenagem');
  });

  test('prioriza o fundamento mais fraco nos dias de desenvolvimento', () => {
    const p = plan('2026-10-14', { results: baselineResults() });
    const dev = p.days.find((d) => d.phase === 'desenvolvimento')!;
    const tech = dev.blocks.find((b) => b.kind === 'tecnico');
    assert.equal(tech?.skill, 'passe');
    assert.ok(tech?.why.length);
  });

  test('o plano não muda de fase só porque o app foi aberto outro dia', () => {
    const a = plan('2026-10-14', { results: baselineResults() });
    const b = plan('2026-10-16', { results: baselineResults() });
    for (const day of b.days) {
      const same = a.days.find((d) => d.date === day.date)!;
      assert.equal(day.phase, same.phase, day.date);
    }
  });

  test('aberto na véspera: só véspera e evento', () => {
    const p = plan('2026-10-19');
    assert.deepEqual(
      p.days.map((d) => d.phase),
      ['vespera', 'competicao'],
    );
  });

  test('aberto no dia do evento: só o dia da competição', () => {
    const p = plan('2026-10-20');
    assert.equal(p.days.length, 1);
    assert.equal(p.days[0]!.phase, 'competicao');
  });

  test('evento já passou: datas antigas não aparecem como futuras', () => {
    const p = plan('2026-10-21');
    assert.equal(p.eventPassed, true);
    assert.equal(p.mode, 'manutencao');
    assert.ok(p.days.every((d) => d.date >= '2026-10-21'));
    assert.ok(p.notes[0]!.includes('já passou'));
    assert.equal(p.days.length, 7);
  });

  test('competição distante: mostra duas semanas', () => {
    const p = plan('2026-10-14', { competition: { nome: 'Copa', data: '2027-03-01' } });
    assert.equal(p.truncated, true);
    assert.equal(p.days.length, 14);
  });

  test('desconforto forte: hoje vira descanso; esforço alto: hoje fica leve', () => {
    const rest = plan('2026-10-15', {
      sessions: [session('2026-10-14', { discomfort: 3 })],
      results: baselineResults(),
    });
    assert.equal(rest.days[0]!.phase, 'descanso');
    assert.equal(rest.days[0]!.intensity, 'descanso');
    const light = plan('2026-10-15', {
      sessions: [session('2026-10-14', { rpe: 9 })],
      results: baselineResults(),
    });
    assert.equal(light.days[0]!.intensity, 'leve');
  });

  test('funciona sem perfil e sem competição', () => {
    const p = plan('2026-10-14', { profile: null, competition: null });
    assert.equal(p.mode, 'manutencao');
    assert.equal(p.days.length, 7);
    // 20 min padrão + até 2 min de folga para não cortar uma atividade guiada.
    assert.ok(p.days.every((d) => d.minutes <= 22));
  });

  test('marca sessões já registradas no dia', () => {
    const p = plan('2026-10-14', { sessions: [session('2026-10-14')] });
    assert.equal(p.days[0]!.completedSessions, 1);
  });
});

test('no dia da competição o aquecimento não é encurtado pelo limite de tempo', () => {
  const day = plan('2026-10-20', {
    profile: profile({ minutosDisponiveis: 10, preferenciaSessao: 'curtas' }),
  }).days[0]!;
  const warmup = day.blocks.find((b) => b.kind === 'aquecimento');
  // Duração real do aquecimento pré-jogo guiado, mesmo com só 10 min disponíveis.
  assert.equal(warmup?.activityId, 'aquecimento-pre-jogo');
  assert.equal(warmup?.minutes, 10);
  assert.ok(day.blocks.some((b) => b.activityId === 'rotina-pre-jogo'));
});
