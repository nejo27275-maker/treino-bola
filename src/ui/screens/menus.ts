/** Telas de navegação (Treinar, Mais) e Sobre/Privacidade. */
import type { AppContext } from '../app.ts';
import { card, pageHeader } from '../components.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import type { Screen } from '../router.ts';

interface MenuItem {
  href: string;
  title: string;
  text: string;
  icon: IconName;
}

function menu(items: MenuItem[]): HTMLElement {
  return h(
    'ul',
    { class: 'list', style: { gap: '10px' } },
    items.map((i) =>
      h(
        'li',
        { style: { padding: '0', background: 'transparent' } },
        h(
          'a',
          { href: i.href, class: 'card-link' },
          h(
            'div',
            { class: 'card flat row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
            h('span', { style: { color: 'var(--accent)' } }, icon(i.icon, 28)),
            h(
              'div',
              null,
              h('h2', { style: { fontSize: '1.05rem' } }, i.title),
              h('p', { class: 'small muted', style: { margin: '0' } }, i.text),
            ),
          ),
        ),
      ),
    ),
  );
}

export function treinarScreen(_ctx: AppContext): Screen {
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Treinar',
      'Escolha o tipo de treino. O plano e as prioridades do Início indicam o que fazer primeiro.',
    ),
    menu([
      {
        href: '#/avaliacao',
        title: 'Avaliação de habilidades',
        text: 'Testes de linha de base, autoavaliação e situação de cada fundamento.',
        icon: 'target',
      },
      {
        href: '#/tecnico',
        title: 'Treinamento técnico',
        text: 'Biblioteca de exercícios com bola, com contagem de acertos.',
        icon: 'train',
      },
      {
        href: '#/fisico',
        title: 'Preparação física',
        text: 'Aquecimento, agilidade, equilíbrio, core e força com segurança.',
        icon: 'run',
      },
      {
        href: '#/leitura',
        title: 'Leitura de jogo',
        text: 'Situações de jogo com explicação de cada resposta.',
        icon: 'brain',
      },
      {
        href: '#/mental',
        title: 'Preparação mental',
        text: 'Respiração, rotina pré-jogo, foco depois do erro e confiança.',
        icon: 'brain',
      },
      {
        href: '#/simuladores',
        title: 'Simuladores',
        text: 'Seis jogos com regras reais: passe, domínio, percepção, decisão, reação e finalização.',
        icon: 'sim',
      },
    ]),
  );
  return { title: 'Treinar', el };
}

export function maisScreen(_ctx: AppContext): Screen {
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader('Mais'),
    menu([
      {
        href: '#/video',
        title: 'Vídeos',
        text: 'Importe um vídeo do seu treino, navegue quadro a quadro e faça a avaliação guiada.',
        icon: 'video',
      },
      {
        href: '#/camera',
        title: 'Câmera ao vivo',
        text: 'Treino de reação com detecção de movimento e treino livre com cronômetro.',
        icon: 'camera',
      },
      {
        href: '#/historico',
        title: 'Histórico e evolução',
        text: 'Sessões, gráficos por fundamento e comparação.',
        icon: 'history',
      },
      {
        href: '#/plano',
        title: 'Plano de preparação',
        text: 'Calendário até a competição.',
        icon: 'plan',
      },
      {
        href: '#/perfil',
        title: 'Perfil',
        text: 'Posição, objetivos, tempo, espaço e materiais.',
        icon: 'run',
      },
      {
        href: '#/config',
        title: 'Configurações e dados',
        text: 'Privacidade, exportar/importar, apagar dados, uso offline e instalação.',
        icon: 'settings',
      },
      {
        href: '#/sobre',
        title: 'Sobre e limitações',
        text: 'Como o aplicativo funciona e o que ele não faz.',
        icon: 'info',
      },
    ]),
  );
  return { title: 'Mais', el };
}

export function sobreScreen(_ctx: AppContext): Screen {
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Sobre e limitações',
      'Transparência sobre o que o aplicativo faz — e o que não faz.',
    ),
    card(
      { title: 'Privacidade' },
      h(
        'ul',
        null,
        h(
          'li',
          null,
          'Não há conta, anúncios, rastreamento nem envio automático de dados. Tudo fica no armazenamento do navegador deste aparelho.',
        ),
        h(
          'li',
          null,
          'Vídeos importados são abertos apenas na memória do aparelho e não são guardados. Quadros capturados só são salvos se você salvar a avaliação.',
        ),
        h(
          'li',
          null,
          'A câmera só liga quando você toca em "Ligar câmera" e nunca grava nem transmite imagens.',
        ),
        h('li', null, 'Você pode exportar ou apagar todos os dados em Configurações.'),
      ),
    ),
    card(
      { title: 'O que é medido e como' },
      h(
        'ul',
        null,
        h(
          'li',
          null,
          h('strong', null, 'Simuladores: '),
          'métricas calculadas por regras geométricas explícitas em cenários virtuais. Medem decisão e leitura, não a execução física.',
        ),
        h(
          'li',
          null,
          h('strong', null, 'Exercícios reais: '),
          'você conta os acertos (avaliação manual). O motor dá peso um pouco menor a isso do que a uma medição automática.',
        ),
        h(
          'li',
          null,
          h('strong', null, 'Vídeo: '),
          'avaliação guiada feita por você, com a opção "não dá para ver". O mapa de movimento mede mudança de pixels entre quadros — não reconhece bola nem jogadores.',
        ),
        h(
          'li',
          null,
          h('strong', null, 'Câmera: '),
          'o treino de reação detecta movimento (pixels que mudam) na metade esquerda ou direita da imagem. Detectar movimento não é reconhecer adversários ou espaços livres.',
        ),
        h(
          'li',
          null,
          h('strong', null, 'Pose corporal: '),
          'experimental e opcional; só funciona se os arquivos do modelo forem instalados no servidor. Desenhar pontos do corpo não significa reconhecer ações de futebol.',
        ),
        h(
          'li',
          null,
          h('strong', null, 'Autoavaliação: '),
          'sua opinião; conta pouco e nunca substitui uma medição.',
        ),
      ),
    ),
    card(
      { title: 'Limites honestos' },
      h(
        'ul',
        null,
        h(
          'li',
          null,
          'Nenhum aplicativo transforma um jogador em poucos dias. Antes da competição, o foco é técnica, confiança, leitura de jogo e recuperação.',
        ),
        h(
          'li',
          null,
          'A força de um chute não pode ser medida por uma câmera comum sem calibração e instrumentos.',
        ),
        h(
          'li',
          null,
          'Tempos de reação medidos pela câmera incluem o atraso da própria câmera (cerca de 0,1 s): compare apenas com você mesmo, no mesmo aparelho.',
        ),
        h(
          'li',
          null,
          'Os treinos físicos não substituem orientação profissional. Pare diante de dor, tontura ou falta de ar incomum.',
        ),
      ),
    ),
  );
  return { title: 'Sobre', el };
}
