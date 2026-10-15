/**
 * Preparação física para o futebol, com progressão conservadora.
 * Não há esforço máximo em nenhum bloco: a intensidade de referência é "forte, mas
 * controlada" (no máximo 7 de 10). Antes da competição, a prioridade é técnica,
 * coordenação, confiança e recuperação — não ganhar força em poucos dias.
 */
import type { WorkoutKind } from '../core/planner.ts';
import type { Workout } from './types.ts';

export const SAFETY_RULES: string[] = [
  'Pare imediatamente se sentir dor, tontura, falta de ar fora do normal, enjoo ou mal-estar, e avise um adulto responsável.',
  'Beba água antes, durante e depois do treino.',
  'Treine em um espaço livre de obstáculos, com calçado adequado e piso que não escorregue.',
  'Se você tem alguma condição de saúde ou lesão recente, converse com um profissional de saúde antes de treinar.',
  'Cansaço extremo não é sinal de bom treino: a melhora acontece durante o descanso.',
];

export const RPE_SCALE: { value: number; label: string }[] = [
  { value: 0, label: '0 — repouso' },
  { value: 1, label: '1 — muito, muito leve' },
  { value: 2, label: '2 — muito leve' },
  { value: 3, label: '3 — leve' },
  { value: 4, label: '4 — moderado' },
  { value: 5, label: '5 — um pouco forte' },
  { value: 6, label: '6 — forte' },
  { value: 7, label: '7 — bem forte' },
  { value: 8, label: '8 — muito forte' },
  { value: 9, label: '9 — quase no limite' },
  { value: 10, label: '10 — máximo' },
];

export const DISCOMFORT_LABELS = ['Nenhum', 'Leve', 'Moderado', 'Forte'] as const;

export const WORKOUTS: Workout[] = [
  {
    id: 'aquecimento-dinamico',
    kind: 'aquecimento',
    nome: 'Aquecimento dinâmico',
    skills: ['agilidade'],
    objetivo: 'Elevar a temperatura do corpo e preparar articulações para treinar com bola.',
    intensidade: 'leve',
    espaco: 'Espaço de 6 a 10 passos.',
    alternativasEspaco: 'Em espaço pequeno, faça os deslocamentos no lugar.',
    recuperacao: 'Siga direto para o treino técnico.',
    blocos: [
      {
        nome: 'Trote leve',
        instrucoes: 'Trote leve, ida e volta (ou no lugar), respirando pelo nariz.',
        duracaoSeg: 60,
        descansoSeg: 0,
      },
      {
        nome: 'Polichinelos',
        instrucoes: 'Ritmo confortável, aterrissando com os joelhos levemente dobrados.',
        duracaoSeg: 30,
        descansoSeg: 10,
      },
      {
        nome: 'Skipping baixo',
        instrucoes: 'Passos curtos e rápidos, joelhos na altura do quadril ou abaixo.',
        duracaoSeg: 30,
        descansoSeg: 10,
      },
      {
        nome: 'Abrir e fechar o quadril',
        instrucoes:
          'Em pé, eleve o joelho e gire a perna para fora (abrir) e depois para dentro (fechar). Alterne as pernas.',
        duracaoSeg: 45,
        descansoSeg: 10,
      },
      {
        nome: 'Avanço com rotação',
        instrucoes:
          'Passo à frente (avanço) e gire o tronco para o lado da perna da frente. 6 de cada lado, devagar.',
        duracaoSeg: 50,
        descansoSeg: 10,
      },
      {
        nome: 'Deslocamento lateral',
        instrucoes: 'Passos laterais sem cruzar os pés, corpo baixo, ida e volta.',
        duracaoSeg: 30,
        descansoSeg: 10,
      },
      {
        nome: 'Acelerações progressivas',
        instrucoes:
          '3 corridas de 8 a 10 passos, começando devagar e terminando a 60–70% da velocidade. Volte andando.',
        duracaoSeg: 60,
        descansoSeg: 0,
      },
    ],
  },
  {
    id: 'coordenacao-escada',
    kind: 'coordenacao',
    nome: 'Coordenação e ritmo (escada imaginária)',
    skills: ['agilidade'],
    objetivo: 'Melhorar o controle dos pés, o ritmo e a coordenação para mexer o corpo com a bola.',
    intensidade: 'moderada',
    espaco: 'Uma "escada" no chão com 8 quadrados (linhas de giz, fita ou chinelos).',
    alternativasEspaco:
      'Sem espaço para a escada: faça os mesmos padrões no lugar, sobre uma linha.',
    recuperacao: 'Caminhe 1 minuto e respire fundo ao final.',
    blocos: [
      {
        nome: 'Um pé em cada quadrado',
        instrucoes: 'Passe pela escada colocando um pé em cada quadrado, olhando para a frente.',
        duracaoSeg: 40,
        descansoSeg: 20,
      },
      {
        nome: 'Dois pés em cada quadrado',
        instrucoes: 'Os dois pés entram em cada quadrado, com passos curtos e rápidos.',
        duracaoSeg: 40,
        descansoSeg: 20,
      },
      {
        nome: 'Lateral',
        instrucoes:
          'De lado para a escada, os dois pés entram em cada quadrado. Volte do outro lado.',
        duracaoSeg: 40,
        descansoSeg: 20,
      },
      {
        nome: 'Entra-entra-sai-sai',
        instrucoes:
          'De frente: pé direito e esquerdo dentro, direito e esquerdo fora, avançando um quadrado.',
        duracaoSeg: 40,
        descansoSeg: 20,
      },
      {
        nome: 'Saltitos alternados',
        instrucoes: 'Saltitos baixos alternando um pé dentro e outro fora, aterrissando suave.',
        duracaoSeg: 40,
        descansoSeg: 30,
      },
    ],
  },
  {
    id: 'agilidade-frenagem',
    kind: 'agilidade',
    nome: 'Agilidade: frear e mudar de direção',
    skills: ['agilidade'],
    objetivo: 'Frear com controle e mudar de direção rapidamente, protegendo os joelhos.',
    intensidade: 'moderada',
    espaco: 'Corredor de 5 a 8 passos.',
    alternativasEspaco: 'Em espaço curto, reduza a distância para 3 passos.',
    recuperacao: 'Descanso completo entre as repetições: a qualidade importa mais que o cansaço.',
    avisos: [
      'Joelhos sempre alinhados com a ponta dos pés ao frear (não deixe o joelho "cair" para dentro).',
    ],
    blocos: [
      {
        nome: 'Frenagem em 3 passos',
        instrucoes:
          'Corra 5 passos a 60% e pare em 3 passos curtos, com joelhos dobrados. 4 repetições.',
        duracaoSeg: 50,
        descansoSeg: 40,
      },
      {
        nome: 'Vai-e-volta',
        instrucoes:
          'Corra até uma marca a 5 passos, toque o chão com a mão, volte. 4 repetições, 70% da velocidade.',
        duracaoSeg: 50,
        descansoSeg: 45,
      },
      {
        nome: 'Reação a sinal',
        instrucoes:
          'Ative os sinais do aplicativo: saia para o lado da seta por 3 passos e volte ao centro. Fique baixo, pronto.',
        duracaoSeg: 45,
        descansoSeg: 45,
      },
      {
        nome: 'Deslocamento em T',
        instrucoes:
          'Corra 4 passos à frente, desloque-se 2 passos para a esquerda, 4 para a direita, volte ao centro e de costas para o início.',
        duracaoSeg: 50,
        descansoSeg: 60,
      },
    ],
  },
  {
    id: 'equilibrio-propriocepcao',
    kind: 'equilibrio',
    nome: 'Equilíbrio e estabilidade dos tornozelos',
    skills: ['forca', 'agilidade'],
    objetivo: 'Melhorar o equilíbrio em um pé só, fundamental para passes, chutes e dribles.',
    intensidade: 'leve',
    espaco: 'Espaço pequeno, perto de uma parede para apoio se necessário.',
    alternativasEspaco: 'Funciona em qualquer espaço.',
    recuperacao: 'Sem cansaço acumulado: pode ser feito em dias leves.',
    blocos: [
      {
        nome: 'Apoio em um pé',
        instrucoes: '30 segundos em cada pé, joelho levemente dobrado, olhando para a frente.',
        duracaoSeg: 60,
        descansoSeg: 15,
      },
      {
        nome: 'Um pé com toques na bola',
        instrucoes:
          'Em um pé só, toque a sola do outro pé na bola alternando frente e lado. Troque de perna na metade.',
        duracaoSeg: 60,
        descansoSeg: 15,
      },
      {
        nome: 'Avião',
        instrucoes:
          'Em um pé, incline o tronco à frente estendendo a outra perna para trás, braços abertos. 5 de cada lado, devagar.',
        duracaoSeg: 60,
        descansoSeg: 15,
      },
      {
        nome: 'Saltito e equilíbrio',
        instrucoes:
          'Saltito baixo para a frente e aterrisse em um pé, segurando 2 segundos. 5 de cada lado.',
        duracaoSeg: 50,
        descansoSeg: 20,
      },
    ],
  },
  {
    id: 'aceleracao-curta',
    kind: 'aceleracao',
    nome: 'Aceleração curta (forte, mas controlada)',
    skills: ['agilidade'],
    objetivo: 'Melhorar a saída rápida nos primeiros passos, com técnica e descanso completo.',
    intensidade: 'moderada',
    espaco: 'Corredor livre de 10 passos, piso que não escorregue.',
    alternativasEspaco: 'Sem 10 passos livres: faça saídas de 3 a 5 passos.',
    recuperacao: 'Volte caminhando e respire: o descanso completo evita lesões.',
    avisos: [
      'Intensidade de referência: forte, mas controlada (7 de 10). Nada de tiro no limite.',
      'Faça sempre depois do aquecimento.',
    ],
    blocos: [
      {
        nome: 'Saída em pé',
        instrucoes:
          'Pés afastados, corpo levemente inclinado. Saia com passos curtos e rápidos por 5 passos. 3 repetições.',
        duracaoSeg: 45,
        descansoSeg: 60,
      },
      {
        nome: 'Saída lateral',
        instrucoes: 'De lado, gire o quadril e saia correndo por 5 passos. 2 para cada lado.',
        duracaoSeg: 45,
        descansoSeg: 60,
      },
      {
        nome: 'Saída com bola',
        instrucoes: 'Toque a bola à frente e acelere 5 passos conduzindo. 3 repetições.',
        duracaoSeg: 45,
        descansoSeg: 60,
      },
    ],
  },
  {
    id: 'core-estabilidade',
    kind: 'core',
    nome: 'Estabilidade do tronco (core)',
    skills: ['forca'],
    objetivo: 'Fortalecer o tronco para equilíbrio, proteção da bola e disputas.',
    intensidade: 'moderada',
    espaco: 'Espaço para deitar (tapete, colchonete ou toalha).',
    alternativasEspaco: 'Funciona em qualquer espaço.',
    recuperacao: 'Alongue levemente as costas no final (posição da criança por 30 segundos).',
    avisos: ['Pare se sentir dor nas costas. Mantenha a respiração: não prenda o ar.'],
    blocos: [
      {
        nome: 'Prancha frontal',
        instrucoes:
          'Antebraços no chão, corpo reto da cabeça aos pés. Iniciantes: joelhos no chão.',
        duracaoSeg: 25,
        descansoSeg: 30,
      },
      {
        nome: 'Ponte de glúteo',
        instrucoes:
          'Deitado, joelhos dobrados: eleve o quadril e desça devagar. 10 a 12 repetições.',
        duracaoSeg: 40,
        descansoSeg: 30,
      },
      {
        nome: 'Prancha lateral (direita)',
        instrucoes:
          'Apoio no antebraço direito, corpo alinhado. Iniciantes: joelho de baixo no chão.',
        duracaoSeg: 20,
        descansoSeg: 20,
      },
      {
        nome: 'Prancha lateral (esquerda)',
        instrucoes: 'Apoio no antebraço esquerdo, corpo alinhado.',
        duracaoSeg: 20,
        descansoSeg: 30,
      },
      {
        nome: 'Perdigueiro',
        instrucoes:
          'Em quatro apoios, estenda braço e perna opostos, segure 2 segundos e troque. 8 de cada lado.',
        duracaoSeg: 50,
        descansoSeg: 30,
      },
      {
        nome: 'Inseto morto (dead bug)',
        instrucoes:
          'Deitado de costas, braços para cima e joelhos a 90°: estenda braço e perna opostos devagar, costas apoiadas no chão. 8 de cada lado.',
        duracaoSeg: 50,
        descansoSeg: 0,
      },
    ],
  },
  {
    id: 'forca-peso-corporal',
    kind: 'forca',
    nome: 'Força funcional com o peso do corpo',
    skills: ['forca'],
    objetivo: 'Fortalecer pernas e tronco com movimentos básicos, priorizando a técnica.',
    intensidade: 'moderada',
    espaco: 'Espaço pequeno e uma superfície firme para apoiar as mãos (mesa, banco ou parede).',
    alternativasEspaco: 'Funciona em qualquer espaço.',
    recuperacao: 'Pelo menos 48 horas antes de repetir este treino. Não faça na véspera do jogo.',
    avisos: [
      'Movimentos lentos e controlados. Se a técnica piorar, pare a série.',
      'Não acrescente peso sem orientação de um profissional.',
    ],
    blocos: [
      {
        nome: 'Agachamento',
        instrucoes:
          'Pés na largura dos ombros, desça como quem vai sentar, joelhos alinhados com os pés. 10 a 12 repetições.',
        duracaoSeg: 45,
        descansoSeg: 45,
      },
      {
        nome: 'Avanço alternado',
        instrucoes:
          'Passo à frente, desça até o joelho de trás quase tocar o chão, volte. 8 de cada perna.',
        duracaoSeg: 60,
        descansoSeg: 45,
      },
      {
        nome: 'Ponte com uma perna',
        instrucoes: 'Como a ponte de glúteo, mas com uma perna estendida. 8 de cada lado.',
        duracaoSeg: 50,
        descansoSeg: 45,
      },
      {
        nome: 'Flexão inclinada',
        instrucoes: 'Mãos apoiadas numa mesa firme ou na parede, corpo reto. 6 a 10 repetições.',
        duracaoSeg: 40,
        descansoSeg: 45,
      },
      {
        nome: 'Panturrilha',
        instrucoes: 'Suba na ponta dos pés e desça devagar. 15 repetições.',
        duracaoSeg: 40,
        descansoSeg: 0,
      },
    ],
  },
  {
    id: 'mobilidade-recuperacao',
    kind: 'mobilidade',
    nome: 'Mobilidade e recuperação',
    skills: ['forca'],
    objetivo:
      'Soltar a musculatura e recuperar sem impacto. Ideal para dias leves e depois do jogo.',
    intensidade: 'leve',
    espaco: 'Espaço para deitar.',
    alternativasEspaco: 'Funciona em qualquer espaço.',
    recuperacao: 'Termine com 1 minuto de respiração calma.',
    blocos: [
      {
        nome: 'Círculos de tornozelo',
        instrucoes: '10 círculos para cada lado com cada pé.',
        duracaoSeg: 40,
        descansoSeg: 5,
      },
      {
        nome: 'Quadril 90/90',
        instrucoes:
          'Sentado, pernas dobradas a 90° para o mesmo lado; troque o lado devagar, sem forçar.',
        duracaoSeg: 60,
        descansoSeg: 5,
      },
      {
        nome: 'Posterior da coxa',
        instrucoes:
          'Deitado, eleve uma perna estendida até sentir um alongamento leve. 20 segundos cada.',
        duracaoSeg: 45,
        descansoSeg: 5,
      },
      {
        nome: 'Quadríceps em pé',
        instrucoes:
          'Segure o pé atrás com a mão, joelhos juntos, apoio na parede. 20 segundos cada.',
        duracaoSeg: 45,
        descansoSeg: 5,
      },
      {
        nome: 'Gato e camelo',
        instrucoes:
          'Em quatro apoios, arredonde e estenda as costas devagar, acompanhando a respiração.',
        duracaoSeg: 40,
        descansoSeg: 5,
      },
      {
        nome: 'Respiração calma',
        instrucoes: 'Deitado, inspire em 4 segundos e solte o ar em 6 segundos.',
        duracaoSeg: 60,
        descansoSeg: 0,
      },
    ],
  },
  {
    id: 'aquecimento-pre-jogo',
    kind: 'aquecimento_jogo',
    nome: 'Aquecimento pré-jogo',
    skills: ['agilidade'],
    objetivo: 'Chegar ao jogo aquecido e confiante, sem gastar energia.',
    intensidade: 'leve',
    espaco: 'Canto da quadra ou do campo.',
    alternativasEspaco: 'Em espaço apertado, faça os movimentos no lugar.',
    recuperacao: 'Beba alguns goles de água e entre no jogo.',
    blocos: [
      {
        nome: 'Trote e mobilidade',
        instrucoes: 'Trote leve com movimentos de braços e quadril.',
        duracaoSeg: 120,
        descansoSeg: 0,
      },
      {
        nome: 'Toques na bola',
        instrucoes: 'Toques de sola, interna e externa; passes curtos com um colega.',
        duracaoSeg: 180,
        descansoSeg: 0,
      },
      {
        nome: 'Deslocamentos',
        instrucoes: 'Lateral, de costas e mudanças de direção suaves.',
        duracaoSeg: 90,
        descansoSeg: 30,
      },
      {
        nome: 'Acelerações curtas',
        instrucoes: '2 ou 3 saídas de 5 passos a 80%, voltando andando.',
        duracaoSeg: 60,
        descansoSeg: 60,
      },
      {
        nome: 'Respiração e palavra-chave',
        instrucoes: '3 respirações calmas e repita sua palavra-chave (ex.: "próxima!").',
        duracaoSeg: 30,
        descansoSeg: 0,
      },
    ],
  },
  {
    id: 'tecnica-chute',
    kind: 'chute',
    nome: 'Técnica de chute (precisão antes da força)',
    skills: ['finalizacao'],
    objetivo: 'Organizar o movimento do chute: aproximação, pé de apoio, contato e finalização.',
    intensidade: 'moderada',
    espaco: 'Espaço com gol, parede ou alvo e 8 passos de distância.',
    alternativasEspaco:
      'Sem espaço para chutar: faça o movimento sem bola, devagar, diante do espelho.',
    recuperacao: 'Não aumente a força antes de a técnica ficar consistente.',
    avisos: ['Chute com no máximo 70% da força. Não é um teste de potência.'],
    blocos: [
      {
        nome: 'Movimento sem bola',
        instrucoes:
          'Aproximação em diagonal, pé de apoio ao lado da bola imaginária, perna balançando a partir do quadril. 8 repetições lentas.',
        duracaoSeg: 60,
        descansoSeg: 20,
      },
      {
        nome: 'Contato com o peito do pé',
        instrucoes:
          'Bola parada: tornozelo travado, ponta do pé para baixo, corpo por cima da bola. 6 chutes a 50%.',
        duracaoSeg: 90,
        descansoSeg: 45,
      },
      {
        nome: 'Chute com a parte interna',
        instrucoes: '6 chutes colocados num alvo, a 60%.',
        duracaoSeg: 90,
        descansoSeg: 45,
      },
      {
        nome: 'Pé mais fraco',
        instrucoes: '6 chutes com o pé mais fraco, devagar, focando o contato.',
        duracaoSeg: 90,
        descansoSeg: 0,
      },
    ],
  },
];

export function workoutById(id: string): Workout | undefined {
  return WORKOUTS.find((w) => w.id === id);
}

export function workoutByKind(kind: WorkoutKind): Workout | undefined {
  return WORKOUTS.find((w) => w.kind === kind);
}

export function workoutMinutes(w: Workout): number {
  const seconds = w.blocos.reduce((sum, b) => sum + b.duracaoSeg + b.descansoSeg, 0);
  return Math.max(1, Math.round(seconds / 60));
}
