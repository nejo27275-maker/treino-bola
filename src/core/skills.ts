import type { EvidenceChannel, Position, ResultSource, SimModeId, SkillId } from './types.ts';
import { SKILL_IDS } from './types.ts';

export type SkillGroup = 'tecnica' | 'leitura' | 'fisico' | 'mental';

export interface SkillInfo {
  id: SkillId;
  nome: string;
  curto: string;
  grupo: SkillGroup;
  descricao: string;
  /** Fundamentos medidos por taxa de acerto. Físicos são acompanhados por volume e bem-estar. */
  medidoPorAcerto: boolean;
  simulador?: SimModeId;
}

export const SKILLS: Record<SkillId, SkillInfo> = {
  primeiro_toque: {
    id: 'primeiro_toque',
    nome: 'Domínio e primeiro toque',
    curto: 'Primeiro toque',
    grupo: 'tecnica',
    descricao: 'Controlar a bola no primeiro contato, deixando-a perto e pronta para a próxima ação.',
    medidoPorAcerto: true,
    simulador: 'dominio_orientado',
  },
  dominio_orientado: {
    id: 'dominio_orientado',
    nome: 'Domínio orientado',
    curto: 'Domínio orientado',
    grupo: 'tecnica',
    descricao: 'Usar o primeiro toque para levar a bola para o lado livre, longe da pressão.',
    medidoPorAcerto: true,
    simulador: 'dominio_orientado',
  },
  conducao: {
    id: 'conducao',
    nome: 'Condução de bola',
    curto: 'Condução',
    grupo: 'tecnica',
    descricao: 'Avançar com a bola controlada, com toques curtos e olhando o jogo.',
    medidoPorAcerto: true,
  },
  passe: {
    id: 'passe',
    nome: 'Passe',
    curto: 'Passe',
    grupo: 'tecnica',
    descricao: 'Escolher o corredor certo e dosar a força para o colega receber bem.',
    medidoPorAcerto: true,
    simulador: 'passe_brecha',
  },
  drible: {
    id: 'drible',
    nome: 'Drible e mudança de direção',
    curto: 'Drible',
    grupo: 'tecnica',
    descricao: 'Mudar de direção com controle para passar pelo marcador ou criar espaço.',
    medidoPorAcerto: true,
  },
  protecao: {
    id: 'protecao',
    nome: 'Proteção de bola',
    curto: 'Proteção',
    grupo: 'tecnica',
    descricao: 'Colocar o corpo entre o adversário e a bola para mantê-la sob controle.',
    medidoPorAcerto: true,
    simulador: 'decisao_rapida',
  },
  finalizacao: {
    id: 'finalizacao',
    nome: 'Finalização',
    curto: 'Finalização',
    grupo: 'tecnica',
    descricao: 'Escolher o canto e chutar com precisão, longe do goleiro.',
    medidoPorAcerto: true,
    simulador: 'finalizacao',
  },
  percepcao: {
    id: 'percepcao',
    nome: 'Percepção espacial (olhar antes de receber)',
    curto: 'Percepção',
    grupo: 'leitura',
    descricao: 'Observar o espaço, colegas e adversários antes de a bola chegar.',
    medidoPorAcerto: true,
    simulador: 'olhe_antes',
  },
  decisao: {
    id: 'decisao',
    nome: 'Tomada de decisão',
    curto: 'Decisão',
    grupo: 'leitura',
    descricao: 'Escolher entre passar, conduzir ou proteger de acordo com a situação.',
    medidoPorAcerto: true,
    simulador: 'decisao_rapida',
  },
  reacao: {
    id: 'reacao',
    nome: 'Reação sob pressão',
    curto: 'Reação',
    grupo: 'leitura',
    descricao: 'Responder rápido e corretamente a um estímulo, como a chegada de um marcador.',
    medidoPorAcerto: true,
    simulador: 'reacao_pressao',
  },
  agilidade: {
    id: 'agilidade',
    nome: 'Agilidade e coordenação',
    curto: 'Agilidade',
    grupo: 'fisico',
    descricao: 'Mudar de direção, frear e acelerar com equilíbrio e coordenação.',
    medidoPorAcerto: false,
  },
  forca: {
    id: 'forca',
    nome: 'Força funcional e equilíbrio',
    curto: 'Força funcional',
    grupo: 'fisico',
    descricao: 'Estabilidade do tronco e força com o peso do corpo, com progressão segura.',
    medidoPorAcerto: false,
  },
  concentracao: {
    id: 'concentracao',
    nome: 'Concentração e confiança',
    curto: 'Concentração',
    grupo: 'mental',
    descricao: 'Manter o foco, recuperar-se de erros e seguir uma rotina antes do jogo.',
    medidoPorAcerto: true,
  },
};

export const SKILL_ORDER: readonly SkillId[] = SKILL_IDS;

export function skillName(id: SkillId): string {
  return SKILLS[id].nome;
}

export function isSkillId(value: unknown): value is SkillId {
  return typeof value === 'string' && (SKILL_IDS as readonly string[]).includes(value);
}

export const SOURCE_INFO: Record<
  ResultSource,
  { canal: EvidenceChannel; peso: number; rotulo: string; tipo: string }
> = {
  simulador: {
    canal: 'simulado',
    peso: 1,
    rotulo: 'Simulador',
    tipo: 'Métrica calculada (cenário virtual)',
  },
  quiz: {
    canal: 'simulado',
    peso: 0.8,
    rotulo: 'Cenários de leitura',
    tipo: 'Métrica calculada (respostas a situações)',
  },
  contagem_manual: {
    canal: 'real',
    peso: 0.85,
    rotulo: 'Contagem manual',
    tipo: 'Avaliação manual (você contou os acertos)',
  },
  observacao_video: {
    canal: 'real',
    peso: 0.6,
    rotulo: 'Observação de vídeo',
    tipo: 'Avaliação manual (observação guiada)',
  },
  camera_movimento: {
    canal: 'real',
    peso: 0.9,
    rotulo: 'Câmera (movimento)',
    tipo: 'Métrica calculada (detecção de movimento)',
  },
  pose_automatica: {
    canal: 'real',
    peso: 0.4,
    rotulo: 'Pose (experimental)',
    tipo: 'Inferência automática experimental',
  },
  autoavaliacao: {
    canal: 'autoavaliacao',
    peso: 1,
    rotulo: 'Autoavaliação',
    tipo: 'Avaliação manual (sua opinião)',
  },
};

/** Fundamentos mais relevantes por posição (influência pequena e explicada na prioridade). */
export const POSITION_EMPHASIS: Record<Position, SkillId[]> = {
  goleiro: ['passe', 'reacao', 'decisao', 'percepcao'],
  defensor: ['passe', 'dominio_orientado', 'percepcao', 'decisao', 'protecao'],
  lateral: ['conducao', 'passe', 'agilidade', 'reacao'],
  meio: ['percepcao', 'decisao', 'passe', 'dominio_orientado', 'primeiro_toque'],
  atacante: ['finalizacao', 'drible', 'protecao', 'primeiro_toque'],
  nao_sei: [],
};

export const POSITION_LABEL: Record<Position, string> = {
  goleiro: 'Goleiro',
  defensor: 'Defensor (zagueiro/fixo)',
  lateral: 'Lateral/ala',
  meio: 'Meio-campo',
  atacante: 'Atacante (ponta/pivô)',
  nao_sei: 'Ainda não sei',
};
