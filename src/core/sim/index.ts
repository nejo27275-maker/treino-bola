/** Registro dos modos de simulação: metadados, regras exibidas e geração de rodadas. */
import { hashSeed } from '../rng.ts';
import type { SimLevels, SimModeId, SkillId } from '../types.ts';

export interface ModeInfo {
  id: SimModeId;
  letra: string;
  nome: string;
  skill: SkillId;
  resumo: string;
  regras: string[];
  controles: string;
}

export const SIM_MODES: Record<SimModeId, ModeInfo> = {
  passe_brecha: {
    id: 'passe_brecha',
    letra: 'A',
    nome: 'Passe pela brecha',
    skill: 'passe',
    resumo: 'Escolha o corredor livre e dose a força para a bola parar no colega.',
    regras: [
      'A bola rola em linha reta e para depois de uma distância proporcional à força (100% ≈ 30 m).',
      'Se a trajetória passar ao alcance de um adversário (círculo vermelho tracejado) ou bater em um cone, o passe é interceptado.',
      'Acerto: a bola para dentro da zona de recepção (círculo verde) de um companheiro.',
      'Pontos: 6 a 10 por acerto, conforme a precisão.',
    ],
    controles:
      'Toque no campo para apontar a direção (ou use as setas), ajuste a força e toque em "Passar".',
  },
  dominio_orientado: {
    id: 'dominio_orientado',
    letra: 'B',
    nome: 'Domínio orientado',
    skill: 'dominio_orientado',
    resumo: 'A bola está chegando e há pressão. Para onde vai o seu primeiro toque?',
    regras: [
      'O toque leva a bola 2,2 m na direção escolhida; os marcadores avançam em sua direção por 0,9 s.',
      'O motor mede o espaço entre a bola e o marcador mais próximo; avançar ganha um pequeno bônus.',
      'Acerto: a melhor opção ou uma opção com no máximo 0,4 m a menos e ao menos 2 m de espaço.',
      'Decida antes de acabar o tempo. Pontos: 5 a 10 por acerto, com bônus de rapidez.',
    ],
    controles: 'Toque em uma das quatro direções antes do tempo acabar.',
  },
  olhe_antes: {
    id: 'olhe_antes',
    letra: 'C',
    nome: 'Olhe antes de receber',
    skill: 'percepcao',
    resumo: 'Observe o campo; quando a bola chegar, o que está às suas costas some.',
    regras: [
      'Fase 1: memorize a posição de colegas e adversários.',
      'Fase 2: o que está às suas costas (para o ataque) fica escondido — decida com o que viu.',
      'O motor considera a distância do adversário às suas costas, o espaço para girar e os colegas livres.',
      'Pontos: 5 a 10 por acerto, com bônus de rapidez.',
    ],
    controles: 'Depois que a bola chegar, escolha uma das quatro ações.',
  },
  decisao_rapida: {
    id: 'decisao_rapida',
    letra: 'D',
    nome: 'Decisão rápida',
    skill: 'decisao',
    resumo: 'Passar, conduzir ou proteger? Leia o espaço e decida rápido.',
    regras: [
      'Conduzir é bom com espaço livre à frente (cone de ±35°).',
      'Passar é bom com corredor livre até um colega pouco marcado; passes para a frente valem mais.',
      'Proteger é bom com marcador colado (menos de 2,2 m) e sem outra opção.',
      'Pontos: 5 a 10 por acerto, com bônus de rapidez.',
    ],
    controles: 'Toque em Passar, Conduzir ou Proteger antes do tempo acabar.',
  },
  reacao_pressao: {
    id: 'reacao_pressao',
    letra: 'E',
    nome: 'Reação à pressão',
    skill: 'reacao',
    resumo: 'Quando a pressão aparecer, saia para o lado oposto o mais rápido possível.',
    regras: [
      'Pressão pela esquerda → sair pela direita; pela direita → sair pela esquerda.',
      'A partir do nível 3, pressão dos dois lados → proteger.',
      'Responder antes do sinal não conta como erro: a rodada é repetida.',
      'O tempo de resposta é medido com o relógio de alta precisão do navegador.',
    ],
    controles: 'Use os três botões grandes na parte de baixo da tela.',
  },
  finalizacao: {
    id: 'finalizacao',
    letra: 'F',
    nome: 'Finalização',
    skill: 'finalizacao',
    resumo: 'Escolha onde chutar: longe do goleiro, fora do bloqueio, de preferência nos cantos.',
    regras: [
      'Fora: a bola precisa entrar inteira entre as traves e abaixo do travessão.',
      'Bloqueado: chute na faixa coberta pelo defensor.',
      'Defendido: chute dentro do alcance do goleiro (área tracejada).',
      'Gol: 6 a 10 pontos; alvos nos cantos dão bônus. É uma simulação — não mede a força de um chute real.',
    ],
    controles: 'Toque no ponto do gol onde quer chutar.',
  },
};

export const SIM_MODE_ORDER: SimModeId[] = [
  'passe_brecha',
  'dominio_orientado',
  'olhe_antes',
  'decisao_rapida',
  'reacao_pressao',
  'finalizacao',
];

export function isSimModeId(value: unknown): value is SimModeId {
  return typeof value === 'string' && (SIM_MODE_ORDER as string[]).includes(value);
}

export const DEFAULT_SIM_LEVELS: SimLevels = {
  passe_brecha: 1,
  dominio_orientado: 1,
  olhe_antes: 1,
  decisao_rapida: 1,
  reacao_pressao: 1,
  finalizacao: 1,
};

/** Semente da rodada `round` de uma sessão: reproduzível a partir da semente da sessão. */
export function roundSeed(sessionSeed: number, mode: SimModeId, round: number): number {
  return hashSeed(sessionSeed, mode, round);
}
