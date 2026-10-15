import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { catalog, pickExercise, testFor } from '../../src/content/catalog.ts';
import { ERROR_LABELS, EXERCISES } from '../../src/content/exercises.ts';
import { MENTAL_ACTIVITIES, SCENARIOS } from '../../src/content/mental.ts';
import { SAFETY_RULES, WORKOUTS } from '../../src/content/physical.ts';
import { VIDEO_CRITERIA } from '../../src/content/videoCriteria.ts';
import type { MentalKind, WorkoutKind } from '../../src/core/planner.ts';
import { SKILLS, isSkillId } from '../../src/core/skills.ts';
import { MATERIALS } from '../../src/core/types.ts';

describe('biblioteca de exercícios técnicos', () => {
  test('identificadores únicos e fundamentos válidos', () => {
    const ids = EXERCISES.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const e of EXERCISES) {
      assert.ok(e.skills.length > 0 && e.skills.every(isSkillId), e.id);
      assert.ok(
        e.materiais.every((m) => (MATERIALS as readonly string[]).includes(m)),
        e.id,
      );
    }
  });

  test('cada exercício informa os 10 itens obrigatórios', () => {
    for (const e of EXERCISES) {
      assert.ok(e.objetivo.length > 20, `${e.id}: objetivo`);
      assert.ok(e.materiais.length > 0, `${e.id}: materiais`);
      assert.ok(e.organizacao.length > 20, `${e.id}: organização`);
      assert.ok(e.instrucoes.length >= 4, `${e.id}: instruções numeradas`);
      assert.ok(e.volume && e.series >= 1 && e.repeticoes >= 1, `${e.id}: volume`);
      assert.ok(e.pausaSeg >= 0, `${e.id}: pausa`);
      assert.ok(e.criterioSucesso.length > 20, `${e.id}: critério observável`);
      assert.ok(e.errosComuns.length >= 2, `${e.id}: erros comuns`);
      for (const c of e.errosComuns)
        assert.ok(c.texto && c.correcao, `${e.id}: correção de ${c.tag}`);
      assert.ok(e.maisFacil && e.maisDificil, `${e.id}: variações`);
    }
  });

  test('exercícios que exigem cones, parede ou parceiro oferecem alternativa', () => {
    for (const e of EXERCISES) {
      if (e.materiais.some((m) => m !== 'bola'))
        assert.ok(e.semMaterial, `${e.id} sem alternativa`);
    }
  });

  test('testes de linha de base: 10 tentativas, um por fundamento técnico medido', () => {
    for (const skill of [
      'primeiro_toque',
      'dominio_orientado',
      'conducao',
      'passe',
      'drible',
      'finalizacao',
    ] as const) {
      const t = testFor(skill);
      assert.ok(t, `sem teste de ${skill}`);
      assert.equal(t.series, 1);
      assert.equal(t.repeticoes, 10);
    }
  });

  test('cobre os temas pedidos (primeiro toque, pés alternados, corredores, pressão…)', () => {
    const text = EXERCISES.map((e) => `${e.nome} ${e.instrucoes.join(' ')}`)
      .join(' ')
      .toLowerCase();
    for (const term of [
      'primeiro toque',
      'alterne',
      'passe',
      'cones',
      'mude de direção',
      'proteja',
      'finta',
      'canto',
      'ombro',
      'porta',
      'pressão',
    ]) {
      assert.ok(text.includes(term), `faltando: ${term}`);
    }
  });

  test('todo fundamento técnico tem exercício e os rótulos de erro existem', () => {
    for (const [id, info] of Object.entries(SKILLS)) {
      if (info.grupo !== 'tecnica') continue;
      assert.ok(
        EXERCISES.some((e) => !e.teste && e.skills.includes(id as never)),
        id,
      );
    }
    for (const e of EXERCISES) for (const c of e.errosComuns) assert.ok(ERROR_LABELS[c.tag]);
  });

  test('a escolha respeita materiais e espaço disponíveis', () => {
    const noWall = pickExercise('primeiro_toque', {
      difficulty: 1,
      materials: ['bola'],
      space: 'pequeno',
    });
    assert.ok(noWall && noWall.materiais.every((m) => m === 'bola'), String(noWall?.id));
    const focus = pickExercise('passe', {
      difficulty: 2,
      materials: ['bola', 'cones', 'parede'],
      space: 'grande',
      focusError: 'pes_parados',
    });
    assert.equal(focus?.id, 'passe-tabela-parede');
  });
});

describe('treinos físicos', () => {
  test('todos os tipos usados pelo planejador existem', () => {
    const kinds: WorkoutKind[] = [
      'aquecimento',
      'coordenacao',
      'agilidade',
      'equilibrio',
      'aceleracao',
      'core',
      'forca',
      'mobilidade',
      'aquecimento_jogo',
      'chute',
    ];
    for (const k of kinds) assert.ok(catalog.workout(k), k);
  });

  test('sem esforço máximo e com orientações de recuperação', () => {
    for (const w of WORKOUTS) {
      assert.ok(['leve', 'moderada'].includes(w.intensidade), w.id);
      assert.ok(w.recuperacao && w.alternativasEspaco && w.objetivo, w.id);
      assert.ok(w.blocos.length >= 3 && w.blocos.every((b) => b.duracaoSeg > 0), w.id);
      const text = JSON.stringify(w).toLowerCase();
      assert.ok(!text.includes('até a exaustão') && !text.includes('esforço máximo'), w.id);
    }
    assert.ok(SAFETY_RULES.some((r) => r.includes('dor') && r.includes('tontura')));
  });
});

describe('leitura de jogo e preparação mental', () => {
  test('cada cenário tem uma única resposta certa e explicação para todas', () => {
    for (const s of SCENARIOS) {
      assert.ok(s.opcoes.length >= 3, s.id);
      assert.equal(s.opcoes.filter((o) => o.correta).length, 1, s.id);
      for (const o of s.opcoes) assert.ok(o.explicacao.length > 15, `${s.id}/${o.id}`);
      assert.ok(isSkillId(s.skill));
    }
    assert.ok(SCENARIOS.length >= 12);
  });

  test('atividades mentais de todos os tipos', () => {
    const kinds: MentalKind[] = ['respiracao', 'rotina', 'reset_erro', 'visualizacao', 'confianca'];
    for (const k of kinds)
      assert.ok(
        MENTAL_ACTIVITIES.some((m) => m.kind === k),
        k,
      );
  });

  test('critérios de vídeo cobrem a avaliação guiada', () => {
    assert.equal(VIDEO_CRITERIA.length, 9);
    for (const c of VIDEO_CRITERIA) assert.ok(isSkillId(c.skill) && c.observar);
  });
});
