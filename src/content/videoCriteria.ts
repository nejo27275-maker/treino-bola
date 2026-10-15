/**
 * Critérios da avaliação guiada de vídeo. São observações manuais: o jogador (ou quem o
 * ajuda) assiste ao vídeo e marca o que viu. "Não visível" evita conclusões sem evidência.
 */
import type { CriterionRating } from '../core/types.ts';
import type { VideoCriterion } from './types.ts';

export const VIDEO_CRITERIA: VideoCriterion[] = [
  {
    id: 'primeiro_toque',
    nome: 'Domínio e primeiro toque',
    skill: 'primeiro_toque',
    observar:
      'Depois do primeiro contato, a bola fica a até um passo? A superfície "cede" no contato?',
    bom: 'Bola parada perto do pé, pronta para a próxima ação.',
    melhorar: 'Bola rebate longe ou exige vários toques para ser controlada.',
  },
  {
    id: 'dominio_orientado',
    nome: 'Domínio orientado',
    skill: 'dominio_orientado',
    observar: 'O primeiro toque já leva a bola para um lado livre, preparando a próxima ação?',
    bom: 'Toque para o espaço livre, longe da pressão.',
    melhorar: 'Bola parada embaixo do pé ou levada para perto do adversário.',
  },
  {
    id: 'conducao',
    nome: 'Condução da bola',
    skill: 'conducao',
    observar: 'Toques curtos, bola a até um passo e cabeça erguida de tempos em tempos?',
    bom: 'Bola sempre perto, com olhadas para a frente.',
    melhorar: 'Toques longos ou olhar fixo na bola o tempo todo.',
  },
  {
    id: 'protecao',
    nome: 'Proteção da bola',
    skill: 'protecao',
    observar: 'O corpo fica entre o adversário e a bola, com a bola no pé mais distante dele?',
    bom: 'Corpo baixo e bola longe do marcador.',
    melhorar: 'Bola exposta ao marcador ou corpo muito ereto.',
  },
  {
    id: 'equilibrio',
    nome: 'Equilíbrio aparente',
    skill: 'forca',
    observar: 'Joelhos flexionados e base estável nas mudanças de direção, sem cambalear?',
    bom: 'Movimentos firmes, sem perder o equilíbrio.',
    melhorar: 'Desequilíbrios frequentes ou pernas muito esticadas.',
  },
  {
    id: 'orientacao_corporal',
    nome: 'Orientação corporal',
    skill: 'percepcao',
    observar: 'Ao receber, o corpo está aberto (de lado), permitindo ver o campo?',
    bom: 'Corpo aberto e olhadas antes de receber.',
    melhorar: 'Sempre de frente para quem passa, sem olhar ao redor.',
  },
  {
    id: 'preparacao_passe',
    nome: 'Preparação para o passe',
    skill: 'passe',
    observar: 'Pé de apoio apontado para o alvo, tornozelo firme e olhar antes de passar?',
    bom: 'Passe preparado, rasteiro e na direção certa.',
    melhorar: 'Pé de apoio desalinhado ou passe sem olhar.',
  },
  {
    id: 'finalizacao',
    nome: 'Movimentos de finalização',
    skill: 'finalizacao',
    observar: 'Aproximação, pé de apoio ao lado da bola, corpo por cima e acompanhamento do chute?',
    bom: 'Movimento organizado e chute na direção escolhida.',
    melhorar: 'Corpo para trás (bola sobe) ou pé de apoio longe da bola.',
  },
  {
    id: 'posicionamento',
    nome: 'Posicionamento durante o exercício',
    skill: 'decisao',
    observar: 'Ajusta a posição antes de a bola chegar e ocupa o espaço certo do exercício?',
    bom: 'Chega antes à posição e se ajusta com passos curtos.',
    melhorar: 'Fica parado esperando a bola ou chega atrasado.',
  },
];

export const RATING_LABEL: Record<CriterionRating, string> = {
  bom: 'Bom',
  parcial: 'Parcial',
  melhorar: 'Precisa melhorar',
  nao_visivel: 'Não dá para ver no vídeo',
};

/** Converte a observação em tentativas/acertos com peso baixo (2 "tentativas" por critério). */
export function ratingToEvidence(
  rating: CriterionRating,
): { attempts: number; successes: number } | null {
  switch (rating) {
    case 'bom':
      return { attempts: 2, successes: 2 };
    case 'parcial':
      return { attempts: 2, successes: 1 };
    case 'melhorar':
      return { attempts: 2, successes: 0 };
    default:
      return null;
  }
}
