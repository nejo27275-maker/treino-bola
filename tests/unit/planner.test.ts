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
    assert.equal(p.days.find((d) => d.date === '2026-10-18')!.phase, 'recuperacao');
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
    assert.ok(p.days.every((d) => d.minutes <= 20));
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
  assert.equal(warmup?.minutes, 12);
});
