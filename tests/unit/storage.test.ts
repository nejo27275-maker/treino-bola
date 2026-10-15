import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { VIDEO_CRITERIA, ratingToEvidence } from '../../src/content/videoCriteria.ts';
import { runEngine } from '../../src/core/engine.ts';
import {
  logCameraReaction,
  logExercise,
  logPhysical,
  logQuiz,
  logSelfAssessment,
  logSimulator,
  logVideoAnalysis,
} from '../../src/core/sessionLog.ts';
import { parseImportText, validateExport } from '../../src/core/validation.ts';
import { MemoryBackend } from '../../src/storage/backend.ts';
import { DEFAULT_COMPETITION, Repository } from '../../src/storage/repo.ts';
import { profile } from './helpers.ts';

const T0 = new Date('2026-10-14T18:00:00-03:00');
const T1 = new Date('2026-10-14T18:12:00-03:00');

function repo() {
  return new Repository(new MemoryBackend());
}

const EXERCISE = { id: 'passe-porta', nome: 'Passe na porta', skills: ['passe' as const], nivel: 1 };

describe('registro de sessões', () => {
  test('exercício contado gera sessão e resultado de contagem manual', () => {
    const { session, results } = logExercise({
      exercise: EXERCISE,
      startedAt: T0,
      endedAt: T1,
      activeSec: 600,
      counted: true,
      attempts: 30,
      successes: 21,
      errorTags: { tornozelo_solto: 4, bola_alta: 0 },
      seriesDone: 3,
      seriesTotal: 3,
    });
    assert.equal(session.kind, 'tecnico');
    assert.equal(session.status, 'concluida');
    assert.equal(session.durationSec, 600);
    assert.equal(results.length, 1);
    assert.equal(results[0]!.source, 'contagem_manual');
    assert.deepEqual(results[0]!.errorTags, { tornozelo_solto: 4 });
  });

  test('exercício concluído sem contagem não inventa desempenho', () => {
    const { session, results } = logExercise({
      exercise: EXERCISE,
      startedAt: T0,
      endedAt: T1,
      counted: false,
      attempts: 0,
      successes: 0,
      seriesDone: 1,
      seriesTotal: 3,
    });
    assert.equal(results.length, 0);
    assert.equal(session.status, 'interrompida');
    assert.equal(session.summary, undefined);
  });

  test('simulador registra semente, rodadas e tempos de resposta', () => {
    const { session, results } = logSimulator({
      mode: 'reacao_pressao',
      seed: 99,
      difficulty: 2,
      startedAt: T0,
      endedAt: T1,
      rounds: [
        { round: 0, seed: 1, outcome: 'acerto', success: true, points: 9, responseMs: 420 },
        { round: 1, seed: 2, outcome: 'erro', success: false, points: 0, responseMs: 300 },
        { round: 2, seed: 3, outcome: 'antecipado', success: false, incomplete: true, points: 0 },
        { round: 3, seed: 4, outcome: 'tempo_esgotado', success: false, incomplete: true, points: 0 },
      ],
    });
    assert.equal(session.seed, 99);
    assert.equal(session.summary?.attempts, 3);
    assert.equal(results[0]!.skill, 'reacao');
    assert.deepEqual(results[0]!.responseTimesMs, [420]);
    assert.equal(results[0]!.incomplete, 1);
  });

  test('cenários, físico, autoavaliação, câmera e vídeo', () => {
    const quiz = logQuiz({
      startedAt: T0,
      endedAt: T1,
      seed: 5,
      answers: [
        { scenarioId: 'a', skill: 'percepcao', correct: true },
        { scenarioId: 'b', skill: 'percepcao', correct: false },
        { scenarioId: 'c', skill: 'decisao', correct: true },
      ],
    });
    assert.equal(quiz.results.length, 2);
    assert.ok(quiz.results.every((r) => r.source === 'quiz'));

    const phys = logPhysical({ workout: { id: 'core', nome: 'Core', skills: ['forca'] }, startedAt: T0, endedAt: T1, blocksDone: 6, blocksTotal: 6, rpe: 6, discomfort: 0 });
    assert.equal(phys.session.rpe, 6);
    assert.equal(phys.results.length, 0, 'treino físico registra volume e bem-estar, não nota');

    const self = logSelfAssessment(T0, { passe: 4, drible: 2, finalizacao: 9 });
    assert.equal(self.results.length, 2, 'notas fora de 1–5 são descartadas');
    assert.ok(self.results.every((r) => r.attempts === 0 && r.source === 'autoavaliacao'));

    const cam = logCameraReaction({
      startedAt: T0,
      endedAt: T1,
      facing: 'frontal',
      trials: [
        { expected: 'esquerda', detected: 'esquerda', reactionMs: 520, falseStart: false },
        { expected: 'direita', detected: 'esquerda', reactionMs: 480, falseStart: false },
        { expected: 'direita', detected: null, reactionMs: null, falseStart: true },
        { expected: 'esquerda', detected: 'indefinido', reactionMs: 600, falseStart: false },
      ],
    });
    assert.equal(cam.results[0]!.attempts, 2);
    assert.equal(cam.results[0]!.successes, 1);
    assert.equal(cam.session.summary?.avgResponseMs, 520);

    const video = logVideoAnalysis(
      { startedAt: T0, endedAt: T1 },
      'treino.mp4',
      { primeiro_toque: 'bom', passe: 'nao_visivel', preparacao_passe: 'parcial' } as never,
      VIDEO_CRITERIA,
      ratingToEvidence,
    );
    assert.equal(video.results.length, 2);
    assert.ok(video.results.every((r) => r.source === 'observacao_video'));
  });
});

describe('repositório local', () => {
  test('perfil, competição padrão e configurações', async () => {
    const r = repo();
    assert.equal(await r.getProfile(), null);
    assert.deepEqual(await r.getCompetition(), DEFAULT_COMPETITION);
    await r.saveProfile(profile({ apelido: 'Cláudio' }));
    assert.equal((await r.getProfile())?.apelido, 'Cláudio');
    await r.deleteProfile();
    assert.equal(await r.getProfile(), null);
    assert.equal((await r.getSettings()).som, true);
  });

  test('sessões alimentam o histórico e o motor', async () => {
    const r = repo();
    const logged = logExercise({ exercise: EXERCISE, startedAt: T0, endedAt: T1, counted: true, attempts: 20, successes: 5, seriesDone: 2, seriesTotal: 2 });
    await r.saveSession(logged.session, logged.results);
    const sessions = await r.listSessions();
    const results = await r.listResults();
    assert.equal(sessions.length, 1);
    const out = runEngine({ today: '2026-10-14', results, sessions, profile: null });
    assert.equal(out.assessments.passe.status, 'avaliado');
    assert.equal(out.assessments.passe.level, 'baixo');
  });

  test('gravação é atômica: um registro inválido não grava nada', async () => {
    const r = repo();
    const logged = logExercise({ exercise: EXERCISE, startedAt: T0, endedAt: T1, counted: true, attempts: 10, successes: 5, seriesDone: 1, seriesTotal: 1 });
    await assert.rejects(r.backend.batch([
      { type: 'put', store: 'sessions', value: logged.session },
      { type: 'put', store: 'results', value: { semId: true } },
    ]));
    assert.equal((await r.listSessions()).length, 0);
  });

  test('excluir sessão remove os resultados ligados a ela', async () => {
    const r = repo();
    const logged = logExercise({ exercise: EXERCISE, startedAt: T0, endedAt: T1, counted: true, attempts: 10, successes: 5, seriesDone: 1, seriesTotal: 1 });
    await r.saveSession(logged.session, logged.results);
    await r.deleteSession(logged.session.id);
    assert.equal((await r.listResults()).length, 0);
  });

  test('exportar → validar → importar (substituir) preserva os dados', async () => {
    const a = repo();
    await a.saveProfile(profile());
    await a.saveCompetition({ nome: 'Copa', data: '2026-11-05' });
    const logged = logSimulator({ mode: 'passe_brecha', seed: 7, difficulty: 1, startedAt: T0, endedAt: T1, rounds: [{ round: 0, seed: 1, outcome: 'acerto', success: true, points: 8 }] });
    await a.saveSession(logged.session, logged.results);
    const exported = await a.exportAll(T1);
    const text = JSON.stringify(exported);
    const parsed = parseImportText(text);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.warnings, []);

    const b = repo();
    await b.saveSession(logExercise({ exercise: EXERCISE, startedAt: T0, endedAt: T1, counted: false, attempts: 0, successes: 0, seriesDone: 0, seriesTotal: 1 }).session);
    const summary = await b.importData(parsed.data, 'substituir');
    assert.equal(summary.sessions, 1);
    assert.equal((await b.listSessions()).length, 1, 'substituir apaga o que existia');
    assert.equal((await b.getCompetition()).nome, 'Copa');
    assert.deepEqual(await b.listResults(), await a.listResults());
  });

  test('importar mesclando não duplica registros', async () => {
    const a = repo();
    const logged = logSimulator({ mode: 'finalizacao', seed: 3, difficulty: 1, startedAt: T0, endedAt: T1, rounds: [{ round: 0, seed: 1, outcome: 'gol', success: true, points: 8 }] });
    await a.saveSession(logged.session, logged.results);
    const data = validateExport(await a.exportAll());
    assert.ok(data.ok);
    if (!data.ok) return;
    const first = await a.importData(data.data, 'mesclar');
    assert.equal(first.sessions, 0);
    assert.equal(first.skipped, 2);
    assert.equal((await a.listSessions()).length, 1);
  });

  test('apagar tudo deixa o aplicativo vazio', async () => {
    const r = repo();
    await r.saveProfile(profile());
    await r.saveSession(logExercise({ exercise: EXERCISE, startedAt: T0, endedAt: T1, counted: true, attempts: 3, successes: 1, seriesDone: 1, seriesTotal: 1 }).session);
    await r.clearAll();
    assert.deepEqual(await r.counts(), { sessions: 0, results: 0, analyses: 0, frames: 0 });
    assert.equal(await r.getProfile(), null);
  });
});
