import type { WorkoutKind } from '../core/planner.ts';
import type { Material, SkillId, Space } from '../core/types.ts';

export interface CommonError {
  tag: string;
  texto: string;
  correcao: string;
}

/** Tipos de sinais que o aplicativo pode mostrar durante um exercício real. */
export type SignalKind = 'direcao' | 'direcao_pare' | 'numeros' | 'portas' | 'pressao';

export interface Exercise {
  id: string;
  nome: string;
  /** Fundamentos trabalhados; o primeiro é o principal. */
  skills: SkillId[];
  /** Nível base: 1 iniciante, 2 intermediário, 3 avançado. */
  nivel: 1 | 2 | 3;
  duracaoMin: number;
  materiais: Material[];
  espacoMin: Space;
  objetivo: string;
  organizacao: string;
  instrucoes: string[];
  volume: string;
  series: number;
  repeticoes: number;
  pausaSeg: number;
  criterioSucesso: string;
  errosComuns: CommonError[];
  maisFacil: string;
  maisDificil: string;
  semMaterial?: string;
  /** Protocolo de teste de linha de base (10 tentativas, condições fixas). */
  teste?: boolean;
  sinais?: SignalKind;
}

export interface WorkoutBlock {
  nome: string;
  instrucoes: string;
  /** Duração do bloco em segundos (temporizador guiado). */
  duracaoSeg: number;
  /** Texto de repetições, quando o bloco é por repetições. */
  repeticoes?: string;
  descansoSeg: number;
}

export interface Workout {
  id: string;
  kind: WorkoutKind;
  nome: string;
  skills: SkillId[];
  objetivo: string;
  intensidade: 'leve' | 'moderada';
  espaco: string;
  alternativasEspaco: string;
  recuperacao: string;
  blocos: WorkoutBlock[];
  avisos?: string[];
}

export interface ScenarioOption {
  id: string;
  texto: string;
  correta: boolean;
  explicacao: string;
}

export interface ReadingScenario {
  id: string;
  skill: SkillId;
  tema: string;
  situacao: string;
  pergunta: string;
  opcoes: ScenarioOption[];
}

export interface MentalStep {
  titulo: string;
  texto: string;
  duracaoSeg?: number;
}

export interface MentalActivity {
  id: string;
  kind: 'respiracao' | 'rotina' | 'reset_erro' | 'visualizacao' | 'confianca';
  nome: string;
  objetivo: string;
  duracaoMin: number;
  passos: MentalStep[];
}

export interface VideoCriterion {
  id: string;
  nome: string;
  skill: SkillId;
  observar: string;
  bom: string;
  melhorar: string;
}
