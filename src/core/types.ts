/**
 * Tipos de domínio compartilhados por todo o aplicativo.
 * Este módulo não depende do navegador (pode ser usado nos testes em Node).
 */

export const SKILL_IDS = [
  'primeiro_toque',
  'dominio_orientado',
  'conducao',
  'passe',
  'drible',
  'protecao',
  'finalizacao',
  'percepcao',
  'decisao',
  'reacao',
  'agilidade',
  'forca',
  'concentracao',
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/**
 * Origem de um resultado. Determina o canal e o peso (confiabilidade) da evidência.
 * - simulador: medido automaticamente pelo motor de um simulador virtual.
 * - quiz: respostas em cenários de leitura de jogo/mental (conhecimento de princípios).
 * - contagem_manual: o próprio jogador contou acertos em um exercício real.
 * - observacao_video: avaliação guiada feita assistindo a um vídeo (manual).
 * - camera_movimento: medida automática por detecção de movimento na câmera.
 * - pose_automatica: métrica calculada por estimativa de pose (experimental).
 * - autoavaliacao: nota que o jogador deu a si mesmo.
 */
export const RESULT_SOURCES = [
  'simulador',
  'quiz',
  'contagem_manual',
  'observacao_video',
  'camera_movimento',
  'pose_automatica',
  'autoavaliacao',
] as const;
export type ResultSource = (typeof RESULT_SOURCES)[number];

export type EvidenceChannel = 'real' | 'simulado' | 'autoavaliacao';

export const ACTIVITY_KINDS = [
  'tecnico',
  'teste',
  'simulador',
  'fisico',
  'mental',
  'leitura',
  'video',
  'camera',
  'autoavaliacao',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Um resultado mensurável (ou declarado) de um fundamento, ligado a uma sessão. */
export interface ResultRecord {
  id: string;
  sessionId: string;
  createdAt: string; // ISO 8601 com horário
  date: string; // AAAA-MM-DD (data local do jogador)
  skill: SkillId;
  activityId: string;
  activityKind: ActivityKind;
  source: ResultSource;
  attempts: number;
  successes: number;
  difficulty: number; // 1 a 5
  responseTimesMs?: number[];
  incomplete?: number; // rodadas sem resposta a tempo
  errorTags?: Record<string, number>;
  rating?: number; // 1 a 5 (somente autoavaliação)
  notes?: string;
}

export const DISCOMFORT_LEVELS = [0, 1, 2, 3] as const; // nenhum, leve, moderado, forte
export type DiscomfortLevel = (typeof DISCOMFORT_LEVELS)[number];

export interface SessionSummary {
  attempts: number;
  successes: number;
  incomplete?: number;
  avgResponseMs?: number;
  score?: number;
}

export interface RoundLog {
  round: number;
  seed: number;
  outcome: string;
  success: boolean;
  incomplete?: boolean;
  responseMs?: number;
  points: number;
  choice?: string;
}

export interface TrainingSession {
  id: string;
  date: string; // AAAA-MM-DD
  startedAt: string;
  endedAt: string;
  durationSec: number;
  kind: ActivityKind;
  activityId: string;
  activityName: string;
  status: 'concluida' | 'interrompida';
  /** Fundamentos trabalhados na sessão (mesmo quando nada foi medido). */
  skills?: SkillId[];
  difficulty?: number;
  seed?: number;
  rpe?: number; // esforço percebido 0 a 10
  discomfort?: DiscomfortLevel;
  discomfortArea?: string;
  notes?: string;
  summary?: SessionSummary;
  rounds?: RoundLog[];
}

export const POSITIONS = ['goleiro', 'defensor', 'lateral', 'meio', 'atacante', 'nao_sei'] as const;
export type Position = (typeof POSITIONS)[number];

export const EXPERIENCE_LEVELS = ['iniciante', 'as_vezes', 'regular', 'competitivo'] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export const SPACES = ['pequeno', 'medio', 'grande'] as const;
export type Space = (typeof SPACES)[number];

export const MATERIALS = ['bola', 'cones', 'parede', 'parceiro', 'gol'] as const;
export type Material = (typeof MATERIALS)[number];

export const MODALITIES = ['futsal', 'society', 'campo', 'nao_sei'] as const;
export type Modality = (typeof MODALITIES)[number];

export const DIFFICULTY_PREFS = ['facil', 'medio', 'dificil'] as const;
export type DifficultyPref = (typeof DIFFICULTY_PREFS)[number];

export const SESSION_PREFS = ['curtas', 'longas'] as const;
export type SessionPref = (typeof SESSION_PREFS)[number];

export const MINUTE_OPTIONS = [10, 20, 30, 45, 60] as const;

export interface Profile {
  apelido: string;
  posicao: Position;
  experiencia: Experience;
  focos: SkillId[];
  minutosDisponiveis: number;
  espaco: Space;
  materiais: Material[];
  dificuldade: DifficultyPref;
  preferenciaSessao: SessionPref;
  modalidade: Modality;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Competition {
  nome: string;
  data: string; // AAAA-MM-DD
}

export interface Settings {
  som: boolean;
  vibracao: boolean;
  tema: 'sistema' | 'claro' | 'escuro';
  reduzirAnimacoes: boolean;
}

export type SimModeId =
  | 'passe_brecha'
  | 'dominio_orientado'
  | 'olhe_antes'
  | 'decisao_rapida'
  | 'reacao_pressao'
  | 'finalizacao';

export type SimLevels = Record<SimModeId, number>;

export type CriterionRating = 'bom' | 'parcial' | 'melhorar' | 'nao_visivel';

export interface VideoMarker {
  id: string;
  timeSec: number;
  label: string;
}

export interface VideoAnalysis {
  id: string;
  date: string;
  createdAt: string;
  videoName: string;
  durationSec: number;
  markers: VideoMarker[];
  criteria: Record<string, CriterionRating>;
  notes: string;
  frameIds: string[];
  motionPeaks?: number[];
  poseSummary?: Record<string, number>;
  sessionId: string;
}

export interface FrameCapture {
  id: string;
  analysisId: string;
  timeSec: number;
  createdAt: string;
  blob: Blob;
}
