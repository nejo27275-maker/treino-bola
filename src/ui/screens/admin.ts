/**
 * Painel de administração (escondido). Abre pelo gesto dos quatro cantos (ui/cantos.ts) ou
 * pelo endereço #/admin, sempre atrás da senha. Mostra o estado do app e do aparelho, os
 * números do motor, os erros recentes e ferramentas de manutenção. Tudo local: nada é enviado.
 *
 * O desbloqueio vale até 15 minutos, até o app ir para segundo plano ou até recarregar.
 */
import {
  SEM_FALHAS,
  esperaRestante,
  lerEstado,
  registrarFalha,
  verificarSenha,
  type EstadoTentativas,
} from '../../admin/acesso.ts';
import { CREDENCIAL } from '../../admin/credencial.ts';
import { formatDateBR } from '../../core/dates.ts';
import { bytes, decimal, localTime, percent, plural } from '../../core/format.ts';
import { DEFAULT_SIM_LEVELS, SIM_MODES, SIM_MODE_ORDER } from '../../core/sim/index.ts';
import { SKILLS, SKILL_ORDER } from '../../core/skills.ts';
import { resumir } from '../../core/usageStats.ts';
import { checkPoseAvailability } from '../../media/pose.ts';
import { isAndroidApp } from '../../platform.ts';
import { getPref, removePref, setPref } from '../../storage/prefs.ts';
import type { AppContext, Snapshot } from '../app.ts';
import { button, card, dataTable, field, pageHeader, pill, setFieldError } from '../components.ts';
import { h, replaceChildren } from '../dom.ts';
import { baixarJson } from '../download.ts';
import { limparErros, listarErros } from '../errorLog.ts';
import type { Screen } from '../router.ts';
import { lerUso, limparUso } from '../usage.ts';

const CHAVE_TENTATIVAS = 'admin-tentativas';
const DURACAO_DESBLOQUEIO_MS = 15 * 60_000;

let desbloqueadoAte = 0;
let aoBloquearSozinho: (() => void) | null = null;

const desbloqueado = () => Date.now() < desbloqueadoAte;

function bloquear(): void {
  desbloqueadoAte = 0;
}

// Ao sair do app (outra tela do sistema, tela apagada), o painel se tranca.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !desbloqueado()) return;
  bloquear();
  aoBloquearSozinho?.();
});

const lerTentativas = (): EstadoTentativas => lerEstado(getPref(CHAVE_TENTATIVAS), Date.now());

function salvarTentativas(estado: EstadoTentativas): void {
  if (estado.falhas === 0) removePref(CHAVE_TENTATIVAS);
  else setPref(CHAVE_TENTATIVAS, JSON.stringify(estado));
}

export async function adminScreen(ctx: AppContext): Promise<Screen> {
  const conteudo = h('div', { class: 'stack' });
  const el = h(
    'div',
    { class: 'stack' },
    pageHeader(
      'Painel de administração',
      'Área restrita deste aparelho: estado do app, dados, motor e manutenção. Nada sai daqui.',
    ),
    conteudo,
  );
  const limpezas: (() => void)[] = [];
  let ativo = true;

  const mostrar = async (focar: boolean) => {
    for (const limpar of limpezas.splice(0)) limpar();
    if (!desbloqueado()) {
      replaceChildren(
        conteudo,
        telaDeEntrada(limpezas, () => void mostrar(true)),
      );
    } else {
      const partes = await painel(ctx, () => {
        bloquear();
        void mostrar(true);
      });
      if (!ativo) return;
      replaceChildren(conteudo, ...partes);
      // Passado o tempo do desbloqueio, a tela volta para a senha sozinha.
      const timer = window.setTimeout(() => void mostrar(true), desbloqueadoAte - Date.now());
      limpezas.push(() => window.clearTimeout(timer));
    }
    if (focar) conteudo.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  };

  const aoTrancar = () => void mostrar(false);
  aoBloquearSozinho = aoTrancar;
  await mostrar(false);
  return {
    title: 'Administração',
    el,
    destroy: () => {
      ativo = false;
      // Só desliga se ainda for a desta tela (outra tela do painel pode já ter assumido).
      if (aoBloquearSozinho === aoTrancar) aoBloquearSozinho = null;
      for (const limpar of limpezas.splice(0)) limpar();
    },
  };
}

// ——— Entrada (senha) ———

function telaDeEntrada(limpezas: (() => void)[], aoEntrar: () => void): HTMLElement {
  const senha = h('input', {
    type: 'password',
    id: 'admin-senha',
    autocomplete: 'current-password',
    autocapitalize: 'none',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'data-autofocus': '',
  });
  const mostrarSenha = h('input', { type: 'checkbox', id: 'admin-mostrar' });
  mostrarSenha.addEventListener('change', () => {
    senha.type = mostrarSenha.checked ? 'text' : 'password';
  });
  const entrar = h('button', { type: 'submit', class: 'btn primary' }, 'Entrar');
  const aviso = h('p', { class: 'small', role: 'status' });
  let verificando = false;

  const atualizarBloqueio = () => {
    const resto = esperaRestante(lerTentativas(), Date.now());
    entrar.disabled = verificando || resto > 0;
    if (resto > 0) {
      aviso.textContent = `Muitas tentativas erradas. Tente de novo em ${Math.ceil(resto / 1000)} s.`;
    } else if (!verificando && aviso.textContent?.startsWith('Muitas')) {
      aviso.textContent = '';
    }
  };
  const relogio = window.setInterval(atualizarBloqueio, 1000);
  limpezas.push(() => window.clearInterval(relogio));
  atualizarBloqueio();

  const enviar = async (e: Event) => {
    e.preventDefault();
    if (verificando || esperaRestante(lerTentativas(), Date.now()) > 0) return;
    if (!senha.value.trim()) {
      setFieldError(senha, 'Digite a senha.');
      senha.focus();
      return;
    }
    verificando = true;
    entrar.disabled = true;
    aviso.textContent = 'Verificando…';
    let certa = false;
    try {
      certa = await verificarSenha(senha.value, CREDENCIAL);
    } catch (error) {
      aviso.textContent = error instanceof Error ? error.message : String(error);
      verificando = false;
      atualizarBloqueio();
      return;
    }
    verificando = false;
    if (certa) {
      salvarTentativas(SEM_FALHAS);
      desbloqueadoAte = Date.now() + DURACAO_DESBLOQUEIO_MS;
      senha.value = '';
      aoEntrar();
      return;
    }
    const estado = registrarFalha(lerTentativas(), Date.now());
    salvarTentativas(estado);
    aviso.textContent = '';
    setFieldError(senha, 'Senha incorreta.');
    senha.select();
    atualizarBloqueio();
  };

  return card(
    { title: 'Área restrita', headingLevel: 2 },
    h(
      'form',
      { onsubmit: (e: Event) => void enviar(e), novalidate: true },
      field('Senha de administração', senha),
      h(
        'label',
        { class: 'choice', style: { marginBottom: '12px' } },
        mostrarSenha,
        h('span', null, 'Mostrar a senha'),
      ),
      entrar,
      aviso,
    ),
    h(
      'p',
      { class: 'small muted' },
      'Depois de 5 tentativas erradas, novas tentativas esperam alguns minutos.',
    ),
  );
}

// ——— Painel (desbloqueado) ———

interface Ambiente {
  versao: string;
  mode: string | null;
  assinatura: string | null;
  cache: string | null;
  uso?: number;
  cota?: number;
  pose: string;
}

async function lerAmbiente(): Promise<Ambiente> {
  const info = await fetch('build-info.json', { cache: 'no-store' })
    .then((r) =>
      r.ok ? (r.json() as Promise<{ versao?: string; mode?: string; assinatura?: string }>) : null,
    )
    .catch(() => null);
  const cache = await globalThis.caches
    ?.keys()
    .then((nomes) => nomes.find((n) => n.startsWith('cfa-app-'))?.slice('cfa-app-'.length) ?? null)
    .catch(() => null);
  const espaco = await navigator.storage?.estimate?.().catch(() => undefined);
  const pose = await checkPoseAvailability()
    .then((a) => (a.available ? `instalado (${a.detail})` : `não instalado (${a.detail})`))
    .catch(() => 'indisponível');
  return {
    versao: typeof info?.versao === 'string' ? info.versao : 'desconhecida',
    mode: typeof info?.mode === 'string' ? info.mode : null,
    assinatura: typeof info?.assinatura === 'string' ? info.assinatura : null,
    cache: cache ?? null,
    uso: espaco?.usage,
    cota: espaco?.quota,
    pose,
  };
}

/**
 * Sinal honesto de integridade (sem travar nada): aponta build de desenvolvimento e service
 * worker que não confere com esta versão. Não prova "build oficial" — isto é impossível num
 * app público e compilado em CI público; a assinatura serve para você comparar com a oficial.
 */
function integridade(amb: Ambiente): { texto: string; alerta: boolean } {
  if (amb.mode && amb.mode !== 'production') {
    return { texto: 'build de desenvolvimento (não é uma versão de produção)', alerta: true };
  }
  if (amb.assinatura && amb.cache && amb.cache !== amb.assinatura) {
    return {
      texto: 'o service worker ativo não confere com esta versão (cache antigo ou cópia alterada)',
      alerta: true,
    };
  }
  return {
    texto: isAndroidApp()
      ? 'build de produção (a integridade do APK é garantida pela assinatura do Android)'
      : 'build de produção; o service worker confere com esta versão',
    alerta: false,
  };
}

function plataforma(ctx: AppContext): string {
  if (isAndroidApp()) return 'aplicativo Android (APK)';
  return ctx.pwa.installed ? 'app instalado pelo navegador (PWA)' : 'navegador';
}

const OFFLINE: Record<AppContext['pwa']['swStatus'], string> = {
  'sem-suporte': 'sem suporte a service worker',
  inseguro: 'indisponível (página sem HTTPS)',
  registrando: 'preparando',
  ativo: 'pronto (service worker ativo)',
  erro: 'falhou ao ativar',
  desenvolvimento: 'desligado (build de desenvolvimento)',
  app: 'pronto (arquivos dentro do APK)',
};

function item(rotulo: string, valor: string): HTMLElement {
  return h('li', null, h('strong', null, `${rotulo}: `), valor);
}

async function painel(ctx: AppContext, aoBloquear: () => void): Promise<HTMLElement[]> {
  const [snap, contagem, ambiente] = await Promise.all([
    ctx.snapshot(),
    ctx.repo.counts(),
    lerAmbiente(),
  ]);
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'desconhecido';
  const agora = ctx.now();

  const topo = h(
    'div',
    { class: 'row spread' },
    h(
      'h2',
      { tabindex: '-1', 'data-autofocus': '', style: { fontSize: '1rem', margin: '0' } },
      `Desbloqueado até ${localTime(new Date(desbloqueadoAte).toISOString())}`,
    ),
    button('Bloquear agora', aoBloquear, { small: true }),
  );

  const aplicativo = card(
    { title: 'Aplicativo e aparelho', headingLevel: 2 },
    h(
      'ul',
      { class: 'small' },
      item(
        'Versão',
        `${ambiente.versao}${ambiente.assinatura ? ` · assinatura ${ambiente.assinatura}` : ''}`,
      ),
      (() => {
        const i = integridade(ambiente);
        return h(
          'li',
          null,
          h('strong', null, 'Integridade: '),
          i.alerta ? pill(i.texto, 'warn') : i.texto,
        );
      })(),
      item('Onde roda', plataforma(ctx)),
      item('Uso offline', OFFLINE[ctx.pwa.swStatus]),
      item(
        'Armazenamento',
        `${ctx.repo.backend.kind === 'indexeddb' ? 'IndexedDB' : 'memória temporária (não persiste)'}${
          ambiente.uso !== undefined
            ? ` · ${bytes(ambiente.uso)}${ambiente.cota ? ` de ${bytes(ambiente.cota)}` : ''}`
            : ''
        }`,
      ),
      item(
        'Data e hora do aparelho',
        `${formatDateBR(snap.today)} ${localTime(agora.toISOString())} (${fuso})`,
      ),
      item('Idioma', navigator.language || 'desconhecido'),
      item(
        'Tela',
        `${window.innerWidth} × ${window.innerHeight} px · densidade ${window.devicePixelRatio || 1}`,
      ),
      item('Detector de pose', ambiente.pose),
    ),
    h('p', { class: 'small muted', style: { overflowWrap: 'anywhere' } }, navigator.userAgent),
  );

  const dados = card(
    { title: 'Dados neste aparelho', headingLevel: 2 },
    h(
      'ul',
      { class: 'small' },
      item(
        'Registros',
        `${plural(contagem.sessions, 'sessão', 'sessões')}, ${plural(contagem.results, 'resultado', 'resultados')}, ${plural(contagem.analyses, 'análise', 'análises')} de vídeo, ${plural(contagem.frames, 'quadro', 'quadros')}`,
      ),
      item('Perfil', snap.profile ? 'preenchido' : 'não preenchido'),
      item('Competição', `${snap.competition.nome} em ${formatDateBR(snap.competition.data)}`),
      item('Período das sessões', periodo(snap)),
      item(
        'Níveis dos simuladores',
        SIM_MODE_ORDER.map((m) => `${SIM_MODES[m].letra} ${snap.simLevels[m]}`).join(' · '),
      ),
    ),
  );

  return [
    topo,
    aplicativo,
    dados,
    tempoDeUso(ctx),
    motor(snap),
    errosRecentes(ctx),
    manutencao(ctx, snap, ambiente),
    seguranca(),
  ];
}

/** "1 h 05 min", "12 min". */
function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}

function tempoDeUso(ctx: AppContext): HTMLElement {
  const r = resumir(lerUso(), ctx.today());
  return card(
    { title: 'Tempo de uso (só deste aparelho)', headingLevel: 2 },
    h(
      'ul',
      { class: 'small' },
      item('Total', duracao(r.totalMinutos)),
      item('Hoje', duracao(r.minutosHoje)),
      item('Dias ativos', String(r.diasAtivos)),
      item('Sequência atual', plural(r.sequenciaAtual, 'dia seguido', 'dias seguidos')),
      item('Média por dia ativo', duracao(r.mediaPorDiaAtivoMin)),
      item('Primeiro uso', r.primeiroDia ? formatDateBR(r.primeiroDia) : '—'),
      item(
        'Último uso',
        r.ultimoUso ? `${formatDateBR(r.ultimoUso.slice(0, 10))} ${localTime(r.ultimoUso)}` : '—',
      ),
    ),
    h(
      'p',
      { class: 'small muted' },
      'Tempo de uso ativo (app à vista e com interação recente). Fica só neste aparelho, não identifica ninguém e é apagado junto com os dados.',
    ),
  );
}

function periodo(snap: Snapshot): string {
  if (!snap.sessions.length) return 'nenhuma sessão';
  const datas = snap.sessions.map((s) => s.date).sort();
  const primeira = datas[0] ?? '';
  const ultima = datas[datas.length - 1] ?? '';
  return primeira === ultima
    ? formatDateBR(primeira)
    : `${formatDateBR(primeira)} a ${formatDateBR(ultima)}`;
}

const TENDENCIA: Record<string, string> = {
  melhorando: 'melhorando',
  estavel: 'estável',
  piorando: 'piorando',
  indefinido: '—',
};

function motor(snap: Snapshot): HTMLElement {
  const linhas = SKILL_ORDER.map((skill) => {
    const a = snap.engine.assessments[skill];
    const tentativas = `${a.real?.attempts ?? 0} / ${a.simulado?.attempts ?? 0}`;
    return h(
      'tr',
      null,
      h('td', null, SKILLS[skill].curto),
      h('td', null, a.status === 'avaliado' ? a.level : a.status),
      h('td', null, a.score === null ? '—' : percent(a.score)),
      h('td', null, percent(a.confidence)),
      h('td', null, tentativas),
      h('td', null, TENDENCIA[a.trend] ?? a.trend),
    );
  });
  const recomendacoes = snap.engine.ranked.slice(0, 5);
  const bem = snap.engine.wellbeing;
  return card(
    { title: 'Motor de avaliação', headingLevel: 2 },
    h(
      'p',
      { class: 'small muted' },
      'Os números por trás das telas: estimativa combinada, confiança e tentativas (execução real / simulação).',
    ),
    dataTable(
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, 'Fundamento'),
          h('th', { scope: 'col' }, 'Situação'),
          h('th', { scope: 'col' }, 'Estimativa'),
          h('th', { scope: 'col' }, 'Confiança'),
          h('th', { scope: 'col' }, 'Tentativas'),
          h('th', { scope: 'col' }, 'Tendência'),
        ),
      ),
      h('tbody', null, linhas),
    ),
    h('h3', { style: { fontSize: '1rem', marginTop: '12px' } }, 'Prioridades agora'),
    recomendacoes.length
      ? h(
          'ol',
          { class: 'small' },
          recomendacoes.map((r) =>
            h(
              'li',
              null,
              h('strong', null, r.title),
              ` (prioridade ${decimal(r.priority, 2)}, confiança ${r.confidence})`,
              r.reasons.length ? h('div', { class: 'muted' }, r.reasons.join(' ')) : null,
            ),
          ),
        )
      : h('p', { class: 'small' }, 'Nenhuma recomendação no momento.'),
    h(
      'p',
      { class: 'small' },
      h('strong', null, 'Bem-estar: '),
      bem.level === 'ok' ? 'ok' : bem.level,
      bem.reasons.length ? ` — ${bem.reasons.join(' ')}` : '',
    ),
  );
}

function errosRecentes(ctx: AppContext): HTMLElement {
  const lista = h('div', { class: 'stack' });
  const desenhar = () => {
    const erros = listarErros().reverse();
    replaceChildren(
      lista,
      erros.length
        ? h(
            'ul',
            { class: 'small' },
            erros.map((e) =>
              h(
                'li',
                null,
                h(
                  'strong',
                  null,
                  `${formatDateBR(e.em.slice(0, 10))} ${localTime(e.em)} · ${e.origem === 'promessa' ? 'promessa rejeitada' : 'erro'}: `,
                ),
                e.mensagem,
              ),
            ),
          )
        : h('p', { class: 'small muted' }, 'Nenhum erro registrado neste aparelho.'),
      erros.length
        ? h(
            'div',
            { class: 'row' },
            button(
              'Copiar',
              async () => {
                const texto = erros.map((e) => `${e.em} [${e.origem}] ${e.mensagem}`).join('\n');
                try {
                  await navigator.clipboard.writeText(texto);
                  ctx.toast('Erros copiados.', 'sucesso');
                } catch {
                  ctx.toast('Não foi possível copiar neste aparelho.', 'erro');
                }
              },
              { small: true },
            ),
            button(
              'Limpar',
              () => {
                limparErros();
                desenhar();
                ctx.toast('Registro de erros limpo.', 'info');
              },
              { small: true, variant: 'ghost' },
            ),
          )
        : null,
    );
  };
  desenhar();
  return card(
    { title: 'Erros recentes', headingLevel: 2 },
    h(
      'p',
      { class: 'small muted' },
      'Os últimos erros inesperados, guardados só neste aparelho (úteis no celular e no APK, onde não há console).',
    ),
    lista,
  );
}

function manutencao(ctx: AppContext, snap: Snapshot, ambiente: Ambiente): HTMLElement {
  return card(
    { title: 'Manutenção', headingLevel: 2 },
    h(
      'div',
      { class: 'stack' },
      button('Mostrar as boas-vindas de novo', async () => {
        await ctx.repo.clearOnboardingSeen();
        ctx.toast('As boas-vindas aparecem na próxima vez que abrir o Início.', 'sucesso');
      }),
      button('Voltar os simuladores ao nível 1', async () => {
        const ok = await ctx.confirm({
          title: 'Voltar os simuladores ao nível 1?',
          message:
            'O histórico das sessões continua; só a dificuldade inicial de cada modo volta a 1.',
          confirmLabel: 'Voltar ao nível 1',
        });
        if (!ok) return;
        await ctx.repo.saveSimLevels({ ...DEFAULT_SIM_LEVELS });
        ctx.toast('Níveis dos simuladores reiniciados.', 'sucesso');
      }),
      button('Zerar o tempo de uso', async () => {
        const ok = await ctx.confirm({
          title: 'Zerar o tempo de uso?',
          message:
            'Apaga só a contagem de tempo de uso deste aparelho. O histórico de treinos continua.',
          confirmLabel: 'Zerar',
        });
        if (!ok) return;
        limparUso();
        ctx.toast('Tempo de uso zerado.', 'sucesso');
        ctx.refresh();
      }),
      button('Exportar diagnóstico (JSON)', () => {
        const noApp = baixarJson(
          diagnostico(ctx, snap, ambiente),
          `claudio-futebol-ai-diagnostico-${snap.today}.json`,
        );
        if (noApp) ctx.toast('Escolha onde salvar o arquivo.', 'info');
      }),
    ),
    h(
      'p',
      { class: 'small muted' },
      'O diagnóstico traz versões, contagens, a avaliação do motor e os erros recentes — sem o perfil e sem as sessões detalhadas.',
    ),
  );
}

function diagnostico(ctx: AppContext, snap: Snapshot, ambiente: Ambiente): unknown {
  return {
    app: 'claudio-futebol-ai',
    tipo: 'diagnostico',
    geradoEm: ctx.now().toISOString(),
    versao: ambiente.versao,
    assinatura: ambiente.assinatura,
    mode: ambiente.mode,
    cache: ambiente.cache,
    integridade: integridade(ambiente),
    plataforma: plataforma(ctx),
    offline: ctx.pwa.swStatus,
    uso: resumir(lerUso(), ctx.today()),
    armazenamento: { tipo: ctx.repo.backend.kind, uso: ambiente.uso, cota: ambiente.cota },
    detectorDePose: ambiente.pose,
    tela: { largura: window.innerWidth, altura: window.innerHeight, dpr: window.devicePixelRatio },
    idioma: navigator.language,
    navegador: navigator.userAgent,
    sessoes: snap.sessions.length,
    resultados: snap.results.length,
    motor: Object.fromEntries(
      SKILL_ORDER.map((skill) => {
        const a = snap.engine.assessments[skill];
        return [
          skill,
          {
            situacao: a.status,
            nivel: a.level,
            estimativa: a.score,
            confianca: a.confidence,
            tentativasReais: a.real?.attempts ?? 0,
            tentativasSimuladas: a.simulado?.attempts ?? 0,
            tendencia: a.trend,
          },
        ];
      }),
    ),
    bemEstar: snap.engine.wellbeing.level,
    erros: listarErros(),
  };
}

function seguranca(): HTMLElement {
  return card(
    { title: 'Segurança do painel', headingLevel: 2 },
    h(
      'ul',
      { class: 'small' },
      item(
        'Senha',
        `aleatória, gerada em ${formatDateBR(CREDENCIAL.criadaEm)}; o app guarda só o resultado do PBKDF2-SHA-256 (${CREDENCIAL.iteracoes.toLocaleString('pt-BR')} iterações, sal aleatório)`,
      ),
      item(
        'Trocar a senha',
        'no computador, rode "npm run admin:senha" e gere o site e o APK de novo',
      ),
      item('Tranca sozinho', 'depois de 15 minutos, ao sair do app ou ao recarregar'),
    ),
    pill('Nada deste painel é enviado pela internet', 'accent'),
  );
}
