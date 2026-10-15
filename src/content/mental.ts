/**
 * Leitura de jogo e preparação mental: cenários com explicação para cada resposta
 * (não apenas "certo/errado") e atividades guiadas. Nada aqui promete visão periférica
 * extraordinária: são técnicas práticas de atenção, posicionamento e antecipação.
 */
import type { MentalActivity, ReadingScenario } from './types.ts';

export const SCENARIOS: ReadingScenario[] = [
  {
    id: 'observar-antes',
    skill: 'percepcao',
    tema: 'Observar antes de receber',
    situacao: 'Você está prestes a receber a bola de um colega e percebe um adversário se aproximando.',
    pergunta: 'Que informações você precisa procurar antes do primeiro toque?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Onde está o adversário, de que lado ele vem e onde há espaço livre e colegas.', explicacao: 'Essas três informações decidem para onde vai o primeiro toque: longe da pressão e na direção de um colega ou de um espaço.' },
      { id: 'b', correta: false, texto: 'Só a bola, para não errar o domínio.', explicacao: 'Olhando só para a bola, você descobre a pressão tarde demais. Olhe rápido ao redor e volte os olhos para a bola antes do contato.' },
      { id: 'c', correta: false, texto: 'Nada: é melhor esperar a bola chegar e depois decidir.', explicacao: 'Decidir depois do domínio dá tempo para o adversário chegar. A decisão começa antes de a bola chegar.' },
      { id: 'd', correta: false, texto: 'O banco de reservas, para ver o que o técnico pede.', explicacao: 'A orientação do técnico ajuda, mas na hora da recepção o mais urgente é adversário, espaço e colegas.' },
    ],
  },
  {
    id: 'momento-olhar',
    skill: 'percepcao',
    tema: 'Olhar por cima do ombro',
    situacao: 'A bola vem do seu zagueiro e você está de costas para o gol adversário.',
    pergunta: 'Qual é o melhor momento para olhar por cima do ombro?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Logo depois que o passe sai, enquanto a bola viaja.', explicacao: 'Com a bola longe, há tempo para olhar e voltar os olhos para ela antes do contato.' },
      { id: 'b', correta: false, texto: 'No exato momento em que a bola chega ao pé.', explicacao: 'Nesse instante você precisa olhar para a bola; olhar agora atrapalha o domínio.' },
      { id: 'c', correta: false, texto: 'Só depois de dominar.', explicacao: 'Depois do domínio o adversário já pode estar em cima de você. A informação precisa vir antes.' },
      { id: 'd', correta: false, texto: 'Não precisa olhar: o colega avisa.', explicacao: 'A comunicação ajuda, mas nem sempre acontece. O hábito de olhar é seu.' },
    ],
  },
  {
    id: 'numero-olhadas',
    skill: 'percepcao',
    tema: 'Varredura visual',
    situacao: 'Você tem alguns segundos antes de a bola chegar até você.',
    pergunta: 'Como usar esse tempo para observar?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Duas ou mais olhadas rápidas, em momentos diferentes.', explicacao: 'O jogo muda em segundos: mais de uma olhada atualiza a informação.' },
      { id: 'b', correta: false, texto: 'Uma olhada longa, de vários segundos, para ver tudo.', explicacao: 'Olhar demoradamente faz você perder a bola de vista. Prefira olhadas curtas.' },
      { id: 'c', correta: false, texto: 'Nenhuma: concentrar-se só na bola.', explicacao: 'Sem olhar, você decide no escuro e geralmente tarde.' },
      { id: 'd', correta: false, texto: 'Só quando o técnico mandar.', explicacao: 'Observar precisa virar hábito em toda jogada, não só quando alguém lembra.' },
    ],
  },
  {
    id: 'alternativa-passe',
    skill: 'decisao',
    tema: 'Preparar uma alternativa',
    situacao: 'Você planejou passar para o colega da direita, mas um adversário fechou essa linha no último segundo.',
    pergunta: 'O que deveria ter feito antes de receber?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Ter visto uma segunda opção (outro colega ou espaço para conduzir).', explicacao: 'Bons jogadores observam mais de uma opção: se a primeira fecha, já sabem a próxima.' },
      { id: 'b', correta: false, texto: 'Nada: é só passar com mais força pela linha fechada.', explicacao: 'Força não abre uma linha fechada; o risco de interceptação continua alto.' },
      { id: 'c', correta: false, texto: 'Ficar parado com a bola até a linha abrir.', explicacao: 'Parado, você atrai pressão. Melhor ter outra opção ou proteger em movimento.' },
      { id: 'd', correta: false, texto: 'Chutar para a frente sem olhar.', explicacao: 'Entregar a bola ao adversário raramente é a melhor decisão.' },
    ],
  },
  {
    id: 'lado-menos-pressionado',
    skill: 'decisao',
    tema: 'Lado menos pressionado',
    situacao: 'Um adversário vem fechando pela sua esquerda quando a bola chega.',
    pergunta: 'Para onde orientar o primeiro toque?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Para a direita, longe da pressão.', explicacao: 'Orientar para o lado oposto ganha tempo e espaço — é o que o simulador de domínio orientado mede.' },
      { id: 'b', correta: false, texto: 'Para a esquerda, em direção ao adversário, para driblá-lo.', explicacao: 'É possível, mas arriscado: você leva a bola para onde está a pressão.' },
      { id: 'c', correta: false, texto: 'Parar a bola embaixo do pé e esperar.', explicacao: 'Parar deixa o adversário chegar. Prefira um toque já orientado.' },
      { id: 'd', correta: false, texto: 'Devolver de primeira sem olhar.', explicacao: 'Devolver pode ser uma boa opção, mas sem olhar você não sabe se o apoio está livre.' },
    ],
  },
  {
    id: 'passe-ou-conducao-espaco',
    skill: 'decisao',
    tema: 'Passe ou condução',
    situacao: 'Você recebe no meio da quadra, sem adversário à sua frente nos próximos 8 metros, e seus colegas estão marcados.',
    pergunta: 'O que fazer?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Conduzir para a frente, atraindo a marcação.', explicacao: 'Com espaço à frente, conduzir faz o time avançar e obriga um adversário a sair, liberando um colega.' },
      { id: 'b', correta: false, texto: 'Passar para um colega marcado.', explicacao: 'Passar para colega marcado aumenta a chance de perder a bola.' },
      { id: 'c', correta: false, texto: 'Recuar para o goleiro.', explicacao: 'Recuar sem necessidade desperdiça o espaço que você tem.' },
      { id: 'd', correta: false, texto: 'Chutar de longe imediatamente.', explicacao: 'Pode ser uma opção às vezes, mas com tanto espaço é melhor se aproximar.' },
    ],
  },
  {
    id: 'passe-ou-conducao-colega',
    skill: 'decisao',
    tema: 'Passe ou condução',
    situacao: 'Um adversário está a dois passos à sua frente, e um colega está livre na diagonal com o caminho aberto.',
    pergunta: 'O que fazer?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Passar para o colega livre.', explicacao: 'Corredor aberto e colega livre: passe. A bola corre mais rápido que qualquer jogador.' },
      { id: 'b', correta: false, texto: 'Tentar driblar o adversário.', explicacao: 'O drible tem seu momento, mas com um colega livre o passe é mais seguro e eficiente.' },
      { id: 'c', correta: false, texto: 'Proteger a bola e esperar.', explicacao: 'Esperar dá tempo para o adversário fechar a linha de passe.' },
      { id: 'd', correta: false, texto: 'Conduzir para trás.', explicacao: 'Recuar sem necessidade desperdiça a vantagem do colega livre.' },
    ],
  },
  {
    id: 'protecao-lateral',
    skill: 'decisao',
    tema: 'Proteção',
    situacao: 'Você recebeu perto da lateral com um adversário colado às suas costas e nenhum colega livre.',
    pergunta: 'Qual a melhor opção?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Proteger a bola com o corpo e esperar a aproximação de um colega.', explicacao: 'Sem passe e sem espaço, proteger mantém a posse até alguém chegar para ajudar.' },
      { id: 'b', correta: false, texto: 'Girar de qualquer jeito.', explicacao: 'Girar com o marcador colado costuma resultar em perda de bola.' },
      { id: 'c', correta: false, texto: 'Chutar a bola para longe.', explicacao: 'Pode ser o último recurso, mas entrega a posse ao adversário.' },
      { id: 'd', correta: false, texto: 'Passe de calcanhar sem olhar.', explicacao: 'Passe sem olhar quase sempre encontra o adversário.' },
    ],
  },
  {
    id: 'transicao',
    skill: 'decisao',
    tema: 'Depois de perder a bola',
    situacao: 'Seu time acabou de perder a bola no ataque.',
    pergunta: 'O que fazer nos primeiros segundos?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Pressionar quem está com a bola ou fechar a linha de passe mais próxima.', explicacao: 'Os primeiros segundos após a perda são a melhor hora para recuperar, antes de o adversário se organizar.' },
      { id: 'b', correta: false, texto: 'Reclamar com o colega que errou.', explicacao: 'Reclamar não recupera a bola e abala a confiança do time.' },
      { id: 'c', correta: false, texto: 'Voltar andando para a defesa.', explicacao: 'Andar dá tempo e espaço ao adversário.' },
      { id: 'd', correta: false, texto: 'Esperar o técnico mandar.', explicacao: 'Não há tempo para esperar: reagir rápido é parte do jogo.' },
    ],
  },
  {
    id: 'comunicacao',
    skill: 'percepcao',
    tema: 'Comunicação',
    situacao: 'Você vê um colega prestes a receber de costas, com um adversário chegando por trás dele.',
    pergunta: 'O que você faz?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Avisar em voz alta com uma palavra curta combinada (ex.: "Ladrão!" ou "Vem!").', explicacao: 'Uma palavra curta e clara dá ao colega a informação que ele não consegue ver.' },
      { id: 'b', correta: false, texto: 'Ficar em silêncio para não atrapalhar.', explicacao: 'O silêncio deixa o colega sem uma informação importante.' },
      { id: 'c', correta: false, texto: 'Explicar em detalhes o que ele deve fazer.', explicacao: 'Não há tempo em jogo: use palavras curtas combinadas com o time.' },
      { id: 'd', correta: false, texto: 'Reclamar depois, se ele perder a bola.', explicacao: 'Reclamar depois não ajuda; avisar antes, sim.' },
    ],
  },
  {
    id: 'antecipacao-defesa',
    skill: 'percepcao',
    tema: 'Antecipação',
    situacao: 'Você está marcando e o adversário com a bola olha e abre o corpo para a direita dele.',
    pergunta: 'O que essas pistas indicam?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Que ele provavelmente vai passar ou sair para aquele lado: ajuste sua posição para fechá-lo sem entregar o outro.', explicacao: 'Olhar e posição do corpo são pistas. Antecipar não é adivinhar: é ler pistas.' },
      { id: 'b', correta: false, texto: 'Nada: é impossível prever qualquer coisa.', explicacao: 'Nem sempre acertamos, mas as pistas aumentam muito a chance de chegar antes.' },
      { id: 'c', correta: false, texto: 'Que é hora de dar o bote imediatamente, sem pensar.', explicacao: 'Bote sem leitura costuma deixar você para trás.' },
      { id: 'd', correta: false, texto: 'Que ele vai chutar ao gol com certeza.', explicacao: 'Pistas indicam probabilidades, não certezas: posicione-se para reagir.' },
    ],
  },
  {
    id: 'goleiro-inclinado',
    skill: 'finalizacao',
    tema: 'Finalização',
    situacao: 'Você está de frente para o goleiro, que está com o peso do corpo para o lado esquerdo dele (a sua direita).',
    pergunta: 'Onde chutar?',
    opcoes: [
      { id: 'a', correta: true, texto: 'No canto oposto ao lado para o qual ele está inclinado, rasteiro.', explicacao: 'O goleiro inclinado demora mais para ir ao outro lado; a bola rasteira no canto é a mais difícil de alcançar.' },
      { id: 'b', correta: false, texto: 'No meio, com força.', explicacao: 'No meio, a bola fica ao alcance do goleiro.' },
      { id: 'c', correta: false, texto: 'No canto para onde ele está inclinado.', explicacao: 'Esse é exatamente o lado que ele está pronto para defender.' },
      { id: 'd', correta: false, texto: 'Sempre por cobertura.', explicacao: 'A cobertura serve quando o goleiro está muito adiantado, não em todas as situações.' },
    ],
  },
  {
    id: 'recuperar-erro',
    skill: 'concentracao',
    tema: 'Recuperar o foco depois de um erro',
    situacao: 'Você errou um passe fácil e o adversário quase marcou.',
    pergunta: 'O que fazer no lance seguinte?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Respirar, pensar na próxima ação e voltar à posição.', explicacao: 'O erro já passou. Reconhecer, respirar e reposicionar (3R) devolve o foco ao jogo.' },
      { id: 'b', correta: false, texto: 'Continuar pensando no erro para não repeti-lo.', explicacao: 'Ficar remoendo tira a atenção do lance atual e aumenta a chance de novos erros.' },
      { id: 'c', correta: false, texto: 'Tentar uma jogada espetacular para compensar.', explicacao: 'Querer compensar leva a decisões arriscadas. Volte para o simples.' },
      { id: 'd', correta: false, texto: 'Pedir para sair do jogo.', explicacao: 'Errar faz parte do futebol; com uma rotina de recuperação você volta rapidamente.' },
    ],
  },
  {
    id: 'respiracao-penalti',
    skill: 'concentracao',
    tema: 'Respiração antes de uma ação',
    situacao: 'Você vai cobrar um pênalti e seu coração está acelerado.',
    pergunta: 'O que ajuda?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Respirar devagar (inspirar em 4 segundos, soltar o ar em 6) e decidir o canto antes.', explicacao: 'Soltar o ar devagar acalma o corpo; decidir antes evita mudar de ideia no meio do movimento.' },
      { id: 'b', correta: false, texto: 'Chutar o mais rápido possível para acabar logo.', explicacao: 'Pressa aumenta a tensão e a chance de erro.' },
      { id: 'c', correta: false, texto: 'Pensar em tudo o que pode dar errado.', explicacao: 'Pensamentos negativos aumentam a ansiedade. Foque no que você controla.' },
      { id: 'd', correta: false, texto: 'Mudar de canto no último segundo.', explicacao: 'Mudar no último instante costuma tirar a precisão.' },
    ],
  },
  {
    id: 'rotina-pre-jogo',
    skill: 'concentracao',
    tema: 'Rotina pré-jogo',
    situacao: 'Amanhã é o interclasse.',
    pergunta: 'Qual destas é uma boa rotina para o dia do jogo?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Dormir bem, comer leve 2 a 3 horas antes, beber água, aquecer e fazer respirações calmas.', explicacao: 'Sono, alimentação leve, hidratação e aquecimento preparam corpo e mente sem gastar energia.' },
      { id: 'b', correta: false, texto: 'Treinar forte de manhã para "chegar no ritmo".', explicacao: 'Treino forte no dia do jogo cansa as pernas.' },
      { id: 'c', correta: false, texto: 'Ficar acordado até tarde jogando videogame.', explicacao: 'Sono é recuperação: dormir pouco piora atenção e reação.' },
      { id: 'd', correta: false, texto: 'Comer muito logo antes do jogo para ter energia.', explicacao: 'Uma refeição pesada perto do jogo causa desconforto. Coma leve e com antecedência.' },
    ],
  },
  {
    id: 'foco-distracao',
    skill: 'concentracao',
    tema: 'Concentração',
    situacao: 'Durante o jogo, a torcida grita e você se distrai.',
    pergunta: 'Como recuperar o foco?',
    opcoes: [
      { id: 'a', correta: true, texto: 'Usar uma palavra-chave curta (ex.: "próxima!") e voltar a olhar a bola e os adversários.', explicacao: 'Uma palavra-chave treinada traz a atenção de volta para o que importa agora.' },
      { id: 'b', correta: false, texto: 'Responder à torcida.', explicacao: 'Isso tira ainda mais a atenção do jogo.' },
      { id: 'c', correta: false, texto: 'Tentar não pensar em nada.', explicacao: 'É difícil "não pensar"; é mais fácil direcionar a atenção para algo concreto.' },
      { id: 'd', correta: false, texto: 'Olhar o placar a cada lance.', explicacao: 'O placar não muda o próximo lance; foque na jogada atual.' },
    ],
  },
];

export const MENTAL_ACTIVITIES: MentalActivity[] = [
  {
    id: 'respiracao-4-6',
    kind: 'respiracao',
    nome: 'Respiração calma (4–6)',
    objetivo: 'Acalmar o corpo antes de uma ação importante ou depois de um erro.',
    duracaoMin: 2,
    passos: [
      { titulo: 'Posição', texto: 'Sente-se ou fique em pé, ombros soltos. Se quiser, feche os olhos.' },
      { titulo: 'Inspire', texto: 'Inspire pelo nariz contando até 4.', duracaoSeg: 4 },
      { titulo: 'Solte o ar', texto: 'Solte o ar devagar pela boca contando até 6.', duracaoSeg: 6 },
      { titulo: 'Repita', texto: 'Faça 8 ciclos. Soltar o ar mais devagar do que inspira ajuda o corpo a desacelerar.' },
    ],
  },
  {
    id: 'rotina-pre-jogo',
    kind: 'rotina',
    nome: 'Minha rotina pré-jogo',
    objetivo: 'Seguir os mesmos passos antes de cada jogo para entrar concentrado e tranquilo.',
    duracaoMin: 5,
    passos: [
      { titulo: 'Na véspera', texto: 'Separe uniforme, calçado e garrafa de água. Durma cedo.' },
      { titulo: 'Refeição', texto: 'Coma algo leve 2 a 3 horas antes do jogo.' },
      { titulo: 'Água', texto: 'Beba água ao longo do dia, em pequenos goles.' },
      { titulo: 'Aquecimento', texto: 'Faça o aquecimento pré-jogo (cerca de 10 minutos).' },
      { titulo: 'Respiração', texto: '3 respirações calmas (4–6) antes de entrar.' },
      { titulo: 'Palavra-chave', texto: 'Escolha uma palavra curta para recuperar o foco (ex.: "próxima!").' },
      { titulo: 'Primeiras ações', texto: 'Planeje começar simples: primeiros passes curtos e seguros para ganhar confiança.' },
    ],
  },
  {
    id: 'reset-3r',
    kind: 'reset_erro',
    nome: 'Recuperar o foco depois de um erro (3R)',
    objetivo: 'Voltar ao jogo rapidamente depois de um erro, sem ficar remoendo.',
    duracaoMin: 3,
    passos: [
      { titulo: 'Reconhecer', texto: 'Diga para si mesmo: "Errei. Faz parte." (1 segundo).' },
      { titulo: 'Respirar', texto: 'Uma respiração: inspire em 4, solte o ar em 6.', duracaoSeg: 10 },
      { titulo: 'Reposicionar', texto: 'Use sua palavra-chave e pergunte: "Qual é a minha próxima ação?". Volte à posição e olhe o jogo.' },
      { titulo: 'Pratique', texto: 'Lembre de um erro recente e faça os 3R agora, como ensaio. Repita 3 vezes.' },
    ],
  },
  {
    id: 'visualizacao',
    kind: 'visualizacao',
    nome: 'Visualização de boas jogadas',
    objetivo: 'Ensaiar mentalmente ações bem-feitas para chegar ao jogo com confiança.',
    duracaoMin: 4,
    passos: [
      { titulo: 'Prepare-se', texto: 'Sente-se confortavelmente e faça duas respirações calmas.', duracaoSeg: 20 },
      { titulo: 'Recepção', texto: 'Imagine-se olhando por cima do ombro, vendo o espaço livre e dominando a bola para esse lado.', duracaoSeg: 45 },
      { titulo: 'Passe', texto: 'Imagine um passe firme e rasteiro para um colega livre, com o pé de apoio apontado para ele.', duracaoSeg: 45 },
      { titulo: 'Finalização', texto: 'Imagine-se escolhendo o canto antes e chutando rasteiro, longe do goleiro.', duracaoSeg: 45 },
      { titulo: 'Depois de um erro', texto: 'Imagine um erro e você aplicando os 3R e voltando ao jogo tranquilo.', duracaoSeg: 30 },
    ],
  },
  {
    id: 'diario-confianca',
    kind: 'confianca',
    nome: 'Diário de confiança',
    objetivo: 'Registrar o que deu certo para construir confiança com base em fatos.',
    duracaoMin: 3,
    passos: [
      { titulo: 'Três acertos', texto: 'Escreva 3 coisas que você fez bem hoje (no treino, no simulador ou na escola).' },
      { titulo: 'Um ajuste', texto: 'Escreva 1 coisa para melhorar e como vai treinar isso.' },
      { titulo: 'Releia', texto: 'Antes do jogo, releia o que escreveu nos últimos dias.' },
    ],
  },
];

export function scenarioById(id: string): ReadingScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function mentalById(id: string): MentalActivity | undefined {
  return MENTAL_ACTIVITIES.find((m) => m.id === id);
}

export const DEFAULT_ROUTINE: string[] =
  MENTAL_ACTIVITIES.find((m) => m.kind === 'rotina')?.passos.map((p) => `${p.titulo}: ${p.texto}`) ?? [];
