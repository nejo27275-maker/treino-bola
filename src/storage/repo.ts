/** Repositório de dados do aplicativo (perfil, sessões, resultados, análises de vídeo). */
import { DEFAULT_SIM_LEVELS } from '../core/sim/index.ts';
import type {
  Competition,
  FrameCapture,
  Profile,
  ResultRecord,
  Settings,
  SimLevels,
  TrainingSession,
  VideoAnalysis,
} from '../core/types.ts';
import { EXPORT_APP_ID, EXPORT_SCHEMA_VERSION, type ExportData } from '../core/validation.ts';
import type { Backend, BatchOp } from './backend.ts';

export const DEFAULT_COMPETITION: Competition = { nome: 'Interclasse', data: '2026-10-20' };
export const DEFAULT_SETTINGS: Settings = {
  som: true,
  vibracao: true,
  tema: 'sistema',
  reduzirAnimacoes: false,
};

type KvKey = 'profile' | 'settings' | 'competition' | 'simLevels' | 'routine' | 'onboarding';

interface KvRecord<T> {
  key: KvKey;
  value: T;
}

export interface ImportSummary {
  sessions: number;
  results: number;
  videoAnalyses: number;
  skipped: number;
}

export class Repository {
  readonly backend: Backend;

  constructor(backend: Backend) {
    this.backend = backend;
  }

  private async kv<T>(key: KvKey): Promise<T | undefined> {
    const record = await this.backend.get<KvRecord<T>>('kv', key);
    return record?.value;
  }

  private async setKv<T>(key: KvKey, value: T): Promise<void> {
    await this.backend.batch([{ type: 'put', store: 'kv', value: { key, value } }]);
  }

  async getProfile(): Promise<Profile | null> {
    return (await this.kv<Profile>('profile')) ?? null;
  }

  async saveProfile(profile: Profile): Promise<void> {
    await this.setKv('profile', profile);
  }

  async deleteProfile(): Promise<void> {
    await this.backend.batch([
      { type: 'delete', store: 'kv', key: 'profile' },
      { type: 'delete', store: 'kv', key: 'onboarding' },
    ]);
  }

  async getSettings(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...((await this.kv<Settings>('settings')) ?? {}) };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.setKv('settings', settings);
  }

  async getCompetition(): Promise<Competition> {
    return (await this.kv<Competition>('competition')) ?? DEFAULT_COMPETITION;
  }

  async saveCompetition(competition: Competition): Promise<void> {
    await this.setKv('competition', competition);
  }

  async getSimLevels(): Promise<SimLevels> {
    return { ...DEFAULT_SIM_LEVELS, ...((await this.kv<SimLevels>('simLevels')) ?? {}) };
  }

  async saveSimLevels(levels: SimLevels): Promise<void> {
    await this.setKv('simLevels', levels);
  }

  async getRoutine(): Promise<string[] | null> {
    return (await this.kv<string[]>('routine')) ?? null;
  }

  async saveRoutine(items: string[]): Promise<void> {
    await this.setKv('routine', items);
  }

  /** Marca que a tela de boas-vindas já foi vista (mesmo se o perfil foi pulado). */
  async getOnboardingSeen(): Promise<boolean> {
    return (await this.kv<boolean>('onboarding')) === true;
  }

  async setOnboardingSeen(): Promise<void> {
    await this.setKv('onboarding', true);
  }

  async listSessions(): Promise<TrainingSession[]> {
    const sessions = await this.backend.getAll<TrainingSession>('sessions');
    return sessions.sort((a, b) =>
      a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0,
    );
  }

  async listResults(): Promise<ResultRecord[]> {
    return this.backend.getAll<ResultRecord>('results');
  }

  async listAnalyses(): Promise<VideoAnalysis[]> {
    const list = await this.backend.getAll<VideoAnalysis>('videoAnalyses');
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getFrame(id: string): Promise<FrameCapture | undefined> {
    return this.backend.get<FrameCapture>('frames', id);
  }

  /** Salva a sessão e seus resultados juntos (tudo ou nada). */
  async saveSession(session: TrainingSession, results: ResultRecord[] = []): Promise<void> {
    for (const r of results) {
      if (r.sessionId !== session.id) throw new Error('Resultado de outra sessão');
      if (r.successes > r.attempts) throw new Error('Mais acertos que tentativas');
    }
    await this.backend.batch([
      { type: 'put', store: 'sessions', value: session },
      ...results.map((value): BatchOp => ({ type: 'put', store: 'results', value })),
    ]);
  }

  async deleteSession(id: string): Promise<void> {
    const results = (await this.listResults()).filter((r) => r.sessionId === id);
    const analyses = (await this.listAnalyses()).filter((a) => a.sessionId === id);
    const ops: BatchOp[] = [
      { type: 'delete', store: 'sessions', key: id },
      ...results.map((r): BatchOp => ({ type: 'delete', store: 'results', key: r.id })),
    ];
    for (const a of analyses) {
      ops.push({ type: 'delete', store: 'videoAnalyses', key: a.id });
      for (const f of a.frameIds) ops.push({ type: 'delete', store: 'frames', key: f });
    }
    await this.backend.batch(ops);
  }

  async saveAnalysis(
    analysis: VideoAnalysis,
    session: TrainingSession,
    results: ResultRecord[],
    frames: FrameCapture[],
  ): Promise<void> {
    await this.backend.batch([
      { type: 'put', store: 'sessions', value: session },
      ...results.map((value): BatchOp => ({ type: 'put', store: 'results', value })),
      ...frames.map((value): BatchOp => ({ type: 'put', store: 'frames', value })),
      { type: 'put', store: 'videoAnalyses', value: analysis },
    ]);
  }

  async exportAll(now = new Date()): Promise<ExportData> {
    const analyses = await this.listAnalyses();
    return {
      app: EXPORT_APP_ID,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      profile: await this.getProfile(),
      settings: await this.getSettings(),
      competition: await this.getCompetition(),
      simLevels: await this.getSimLevels(),
      preGameRoutine: await this.getRoutine(),
      sessions: await this.listSessions(),
      results: await this.listResults(),
      // As imagens capturadas não entram no arquivo (privacidade e tamanho).
      videoAnalyses: analyses.map((a) => ({ ...a, frameIds: [] })),
    };
  }

  /**
   * Importa dados já validados.
   * - "substituir": apaga tudo e grava o conteúdo do arquivo.
   * - "mesclar": mantém o que existe e acrescenta registros com identificadores novos.
   */
  async importData(data: ExportData, mode: 'mesclar' | 'substituir'): Promise<ImportSummary> {
    const ops: BatchOp[] = [];
    let existingSessions = new Set<string>();
    let existingResults = new Set<string>();
    let existingAnalyses = new Set<string>();
    if (mode === 'substituir') {
      for (const store of ['kv', 'sessions', 'results', 'videoAnalyses', 'frames'] as const) {
        ops.push({ type: 'clear', store });
      }
    } else {
      existingSessions = new Set((await this.listSessions()).map((s) => s.id));
      existingResults = new Set((await this.listResults()).map((r) => r.id));
      existingAnalyses = new Set((await this.listAnalyses()).map((a) => a.id));
    }
    const kvEntries: [KvKey, unknown][] = [
      ['profile', data.profile],
      ['settings', data.settings],
      ['competition', data.competition],
      ['simLevels', data.simLevels],
      ['routine', data.preGameRoutine],
    ];
    for (const [key, value] of kvEntries) {
      if (value === null || value === undefined) continue;
      if (mode === 'mesclar' && (await this.backend.get('kv', key))) continue;
      ops.push({ type: 'put', store: 'kv', value: { key, value } });
    }
    if (data.profile)
      ops.push({ type: 'put', store: 'kv', value: { key: 'onboarding', value: true } });
    const summary: ImportSummary = { sessions: 0, results: 0, videoAnalyses: 0, skipped: 0 };
    for (const s of data.sessions) {
      if (existingSessions.has(s.id)) summary.skipped++;
      else {
        ops.push({ type: 'put', store: 'sessions', value: s });
        summary.sessions++;
      }
    }
    for (const r of data.results) {
      if (existingResults.has(r.id)) summary.skipped++;
      else {
        ops.push({ type: 'put', store: 'results', value: r });
        summary.results++;
      }
    }
    for (const a of data.videoAnalyses) {
      if (existingAnalyses.has(a.id)) summary.skipped++;
      else {
        ops.push({ type: 'put', store: 'videoAnalyses', value: { ...a, frameIds: [] } });
        summary.videoAnalyses++;
      }
    }
    await this.backend.batch(ops);
    return summary;
  }

  /** Apaga todos os registros do aplicativo (somente os dele). */
  async clearAll(): Promise<void> {
    await this.backend.batch(
      (['kv', 'sessions', 'results', 'videoAnalyses', 'frames'] as const).map(
        (store): BatchOp => ({ type: 'clear', store }),
      ),
    );
  }

  async counts(): Promise<{ sessions: number; results: number; analyses: number; frames: number }> {
    return {
      sessions: (await this.backend.getAll('sessions')).length,
      results: (await this.backend.getAll('results')).length,
      analyses: (await this.backend.getAll('videoAnalyses')).length,
      frames: (await this.backend.getAll('frames')).length,
    };
  }
}
