/** Configurações: perfil, preferências, dados (exportar/importar/apagar), offline e instalação. */
import { localDate } from '../../core/dates.ts';
import { bytes } from '../../core/format.ts';
import { MAX_IMPORT_BYTES, parseImportText, type ExportData } from '../../core/validation.ts';
import type { Settings } from '../../core/types.ts';
import {
  cachePoseFiles,
  checkPoseAvailability,
  isPoseCached,
  type PoseAvailability,
} from '../../media/pose.ts';
import type { AppContext } from '../app.ts';
import { button, card, field, linkButton, pageHeader, pill, select } from '../components.ts';
import { h, replaceChildren } from '../dom.ts';
import type { Screen } from '../router.ts';

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Libera a URL temporária depois que o navegador inicia o download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function storageInfo(): Promise<{ usage?: number; quota?: number; persisted?: boolean }> {
  const out: { usage?: number; quota?: number; persisted?: boolean } = {};
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) {
      out.usage = est.usage;
      out.quota = est.quota;
    }
    out.persisted = await navigator.storage?.persisted?.();
  } catch {
    // API indisponível
  }
  return out;
}

async function clearAppCaches(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const keys = (await caches.keys()).filter((k) => k.startsWith('cfa-'));
  await Promise.all(keys.map((k) => caches.delete(k)));
  return keys.length;
}

const SW_TEXT: Record<AppContext['pwa']['swStatus'], string> = {
  'sem-suporte': 'Este navegador não suporta uso offline (service worker).',
  inseguro: 'Uso offline indisponível: a página não está em HTTPS (nem em localhost).',
  registrando: 'Preparando o uso offline…',
  ativo: 'Pronto para uso offline: os arquivos do aplicativo estão guardados neste aparelho.',
  erro: 'Não foi possível ativar o uso offline.',
  desenvolvimento: 'Modo de desenvolvimento: o cache offline está desligado de propósito.',
};

export async function configScreen(ctx: AppContext): Promise<Screen> {
  const [profile, counts, info] = await Promise.all([
    ctx.repo.getProfile(),
    ctx.repo.counts(),
    storageInfo(),
  ]);
  const settings: Settings = { ...ctx.settings };
  const cleanups: (() => void)[] = [];

  // ——— Preferências ———
  const som = h('input', { type: 'checkbox', checked: settings.som });
  const vibracao = h('input', { type: 'checkbox', checked: settings.vibracao });
  const movimento = h('input', { type: 'checkbox', checked: settings.reduzirAnimacoes });
  const tema = select<Settings['tema']>(
    [
      { value: 'sistema', label: 'Igual ao sistema' },
      { value: 'escuro', label: 'Escuro' },
      { value: 'claro', label: 'Claro' },
    ],
    settings.tema,
    'tema',
  );
  const savePrefs = async () => {
    await ctx.saveSettings({
      som: som.checked,
      vibracao: vibracao.checked,
      reduzirAnimacoes: movimento.checked,
      tema: tema.value as Settings['tema'],
    });
    ctx.toast('Preferências salvas.', 'sucesso', 2000);
  };
  for (const c of [som, vibracao, movimento, tema])
    c.addEventListener('change', () => void savePrefs());

  // ——— Dados ———
  const dataStatus = h('div', { role: 'status', 'aria-live': 'polite', class: 'small' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'visually-hidden',
    id: 'import-file',
    'aria-label': 'Arquivo de backup para importar',
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      replaceChildren(dataStatus, 'Arquivo grande demais para importar (máximo 15 MB).');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      replaceChildren(dataStatus, 'Não foi possível ler o arquivo.');
      return;
    }
    const parsed = parseImportText(text);
    if (!parsed.ok) {
      replaceChildren(
        dataStatus,
        h('strong', null, 'Importação recusada: '),
        parsed.errors.join(' '),
      );
      return;
    }
    await confirmImport(parsed.data, parsed.warnings);
  });
  const confirmImport = async (data: ExportData, warnings: string[]) => {
    const choice = h(
      'fieldset',
      null,
      h('legend', null, 'Como importar?'),
      h(
        'label',
        { class: 'choice' },
        h('input', { type: 'radio', name: 'modo-import', value: 'mesclar', checked: true }),
        h('span', null, 'Mesclar: manter o que já existe e acrescentar o que é novo'),
      ),
      h(
        'label',
        { class: 'choice', style: { marginTop: '6px' } },
        h('input', { type: 'radio', name: 'modo-import', value: 'substituir' }),
        h('span', null, 'Substituir: apagar os dados atuais e usar os do arquivo'),
      ),
    );
    const ok = await ctx.confirm({
      title: 'Importar dados?',
      message: h(
        'div',
        null,
        h(
          'p',
          null,
          `O arquivo tem ${data.sessions.length} sessão(ões), ${data.results.length} resultado(s) e ${data.videoAnalyses.length} análise(s) de vídeo.`,
        ),
        warnings.length
          ? h(
              'ul',
              { class: 'small' },
              warnings.map((w) => h('li', null, w)),
            )
          : null,
        choice,
      ),
      confirmLabel: 'Importar',
    });
    if (!ok) return;
    const mode =
      (choice.querySelector('input:checked') as HTMLInputElement | null)?.value === 'substituir'
        ? 'substituir'
        : 'mesclar';
    try {
      const summary = await ctx.repo.importData(data, mode);
      if (data.settings && mode === 'substituir') await ctx.saveSettings(data.settings);
      ctx.toast(
        `Importado: ${summary.sessions} sessão(ões), ${summary.results} resultado(s), ${summary.videoAnalyses} análise(s). Ignorados (já existiam): ${summary.skipped}.`,
        'sucesso',
        6000,
      );
      ctx.refresh();
    } catch (error) {
      replaceChildren(
        dataStatus,
        `Falha ao importar: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const exportBtn = button(
    'Exportar meus dados (JSON)',
    async () => {
      try {
        const data = await ctx.repo.exportAll(ctx.now());
        downloadJson(data, `claudio-futebol-ai-backup-${localDate(ctx.now())}.json`);
        replaceChildren(
          dataStatus,
          'Arquivo gerado. Ele contém seu perfil e seu histórico; imagens capturadas de vídeos não são incluídas.',
        );
      } catch (error) {
        replaceChildren(
          dataStatus,
          `Falha ao exportar: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    { variant: 'primary' },
  );

  const deleteBtn = button(
    'Apagar todos os dados',
    async () => {
      const ok = await ctx.confirm({
        title: 'Apagar todos os dados do aplicativo?',
        message:
          'Perfil, histórico, avaliações, níveis dos simuladores e preferências deste aplicativo serão apagados deste aparelho. Arquivos de outros aplicativos não são afetados. Esta ação não pode ser desfeita — se quiser, exporte antes.',
        confirmLabel: 'Apagar tudo',
        danger: true,
      });
      if (!ok) return;
      try {
        await ctx.eraseEverything();
        ctx.toast('Todos os dados do aplicativo foram apagados.', 'sucesso');
        ctx.navigate('/');
      } catch (error) {
        replaceChildren(
          dataStatus,
          `Falha ao apagar: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    { variant: 'danger' },
  );

  const persistStatus = h(
    'span',
    null,
    info.persisted === undefined
      ? 'indisponível neste navegador'
      : info.persisted
        ? 'protegido contra limpeza automática'
        : 'pode ser limpo pelo navegador se faltar espaço',
  );
  const persistBtn =
    info.persisted === false
      ? button(
          'Proteger meus dados',
          async () => {
            try {
              const granted = await navigator.storage.persist();
              persistStatus.textContent = granted
                ? 'protegido contra limpeza automática'
                : 'o navegador não concedeu a proteção (ele decide com base no uso do site; instalar o app ajuda)';
            } catch {
              persistStatus.textContent = 'não foi possível pedir a proteção';
            }
          },
          { small: true },
        )
      : null;

  // ——— Offline e instalação ———
  const pwaBox = h('div', { class: 'stack', 'aria-live': 'polite' });
  const drawPwa = () => {
    const p = ctx.pwa;
    replaceChildren(
      pwaBox,
      h(
        'p',
        null,
        pill(
          p.swStatus === 'ativo' ? 'Offline: pronto' : 'Offline: indisponível',
          p.swStatus === 'ativo' ? 'accent' : 'warn',
        ),
        ' ',
        SW_TEXT[p.swStatus],
        p.swError ? ` (${p.swError})` : '',
      ),
      p.updateReady
        ? button('Atualizar para a nova versão', () => p.applyUpdate?.(), {
            variant: 'primary',
            small: true,
          })
        : null,
      p.installed
        ? h('p', null, 'O aplicativo já está instalado neste aparelho.')
        : p.installPrompt
          ? button(
              'Instalar o aplicativo',
              async () => {
                try {
                  await p.installPrompt?.prompt();
                  const choice = await p.installPrompt?.userChoice;
                  if (choice?.outcome === 'accepted') ctx.toast('Instalação iniciada.', 'sucesso');
                } catch {
                  ctx.toast(
                    'O navegador não abriu a instalação. Use o menu ⋮ → "Instalar app".',
                    'erro',
                  );
                }
                p.installPrompt = null;
                drawPwa();
              },
              { variant: 'primary' },
            )
          : h(
              'p',
              { class: 'small' },
              'Para instalar no Android (Chrome): toque no menu ⋮ e escolha "Instalar app" ou "Adicionar à tela inicial". O site precisa estar em HTTPS.',
            ),
      button(
        'Remover arquivos offline',
        async () => {
          const n = await clearAppCaches();
          ctx.toast(
            n
              ? 'Arquivos offline removidos. Eles serão baixados de novo na próxima visita com internet.'
              : 'Não havia arquivos offline guardados.',
            'info',
            5000,
          );
        },
        { small: true, variant: 'ghost' },
      ),
    );
  };
  drawPwa();
  cleanups.push(ctx.onPwaChange(drawPwa));

  // ——— Visão computacional ———
  const poseBox = h('div', { class: 'stack', 'aria-live': 'polite' }, 'Verificando…');
  const drawPoseBox = async (a: PoseAvailability) => {
    if (!a.available) {
      replaceChildren(
        poseBox,
        h(
          'p',
          { class: 'small' },
          `Detector de pose não instalado neste servidor: ${a.detail}. O restante do aplicativo funciona normalmente; veja docs/VISAO_COMPUTACIONAL.md.`,
        ),
      );
      return;
    }
    const files = a.files ?? [];
    const cached = await isPoseCached(files);
    replaceChildren(
      poseBox,
      h('p', { class: 'small' }, `Detector de pose instalado (experimental): ${a.detail}.`),
      h(
        'p',
        { class: 'small' },
        cached
          ? 'Arquivos do detector guardados neste aparelho: a pose também funciona offline.'
          : 'Os arquivos do detector (alguns megabytes) ainda não estão guardados neste aparelho: sem internet, a pose não funciona.',
      ),
      cached
        ? null
        : button(
            'Guardar o detector para uso offline',
            async () => {
              try {
                const n = await cachePoseFiles(files);
                ctx.toast(`Detector guardado (${n} arquivos).`, 'sucesso');
              } catch (error) {
                ctx.toast(
                  `Não foi possível guardar: ${error instanceof Error ? error.message : String(error)}`,
                  'erro',
                  6000,
                );
              }
              await drawPoseBox(a);
            },
            { small: true },
          ),
    );
  };
  void checkPoseAvailability().then(drawPoseBox);

  const el = h(
    'div',
    { class: 'stack' },
    pageHeader('Configurações', 'Privacidade, dados, uso offline e preferências.', {
      href: '#/mais',
      label: 'Mais',
    }),
    ctx.storageWarning
      ? card(
          { tone: 'danger', title: 'Armazenamento indisponível' },
          h('p', null, ctx.storageWarning),
        )
      : null,
    card(
      { title: 'Perfil' },
      h(
        'p',
        null,
        profile
          ? `Perfil configurado${profile.apelido ? ` (${profile.apelido})` : ''}.`
          : 'Nenhum perfil salvo: as recomendações usam valores conservadores.',
      ),
      h(
        'div',
        { class: 'row' },
        linkButton('#/perfil', profile ? 'Editar perfil' : 'Configurar perfil', {
          variant: 'primary',
        }),
        profile
          ? button(
              'Apagar perfil',
              async () => {
                if (
                  await ctx.confirm({
                    title: 'Apagar o perfil?',
                    message:
                      'O histórico de treinos é mantido; só as informações do perfil são apagadas.',
                    confirmLabel: 'Apagar perfil',
                    danger: true,
                  })
                ) {
                  await ctx.repo.deleteProfile();
                  ctx.toast('Perfil apagado.', 'sucesso');
                  ctx.refresh();
                }
              },
              { variant: 'danger' },
            )
          : null,
      ),
    ),
    card(
      { title: 'Preferências' },
      h(
        'label',
        { class: 'choice' },
        som,
        h('span', null, 'Sons de feedback (bipes nos simuladores e sinais)'),
      ),
      h(
        'label',
        { class: 'choice', style: { marginTop: '8px' } },
        vibracao,
        h('span', null, 'Vibração (quando o aparelho permite)'),
      ),
      h(
        'label',
        { class: 'choice', style: { marginTop: '8px' } },
        movimento,
        h('span', null, 'Reduzir animações'),
      ),
      h('div', { style: { marginTop: '12px' } }, field('Tema', tema)),
    ),
    card(
      { title: 'Seus dados' },
      h(
        'ul',
        { class: 'small' },
        h(
          'li',
          null,
          `${counts.sessions} sessão(ões), ${counts.results} resultado(s), ${counts.analyses} análise(s) de vídeo e ${counts.frames} quadro(s) capturado(s).`,
        ),
        h(
          'li',
          null,
          `Armazenamento: ${ctx.repo.backend.kind === 'indexeddb' ? 'IndexedDB (permanece ao recarregar)' : 'memória temporária (será perdido ao fechar)'}.`,
        ),
        info.usage !== undefined
          ? h(
              'li',
              null,
              `Espaço usado pelo site: ${bytes(info.usage)}${info.quota ? ` de ${bytes(info.quota)} disponíveis` : ''}.`,
            )
          : null,
        h('li', null, 'Situação: ', persistStatus, ' ', persistBtn),
      ),
      h(
        'div',
        { class: 'row' },
        exportBtn,
        h('label', { for: 'import-file', class: 'btn' }, 'Importar backup'),
        fileInput,
      ),
      h('div', { class: 'row', style: { marginTop: '10px' } }, deleteBtn),
      dataStatus,
    ),
    card({ title: 'Uso offline e instalação' }, pwaBox),
    card(
      { title: 'Visão computacional local' },
      poseBox,
      h(
        'p',
        { class: 'small muted' },
        'A detecção de movimento da câmera e o mapa de movimento dos vídeos não dependem de modelo e funcionam sempre.',
      ),
    ),
    card(
      { title: 'Privacidade' },
      h(
        'ul',
        { class: 'small' },
        h('li', null, 'Sem conta, sem anúncios, sem rastreamento e sem envio automático de dados.'),
        h('li', null, 'A política de segurança da página bloqueia conexões com outros sites.'),
        h(
          'li',
          null,
          'Câmera e vídeos são processados no próprio aparelho e não são gravados nem enviados.',
        ),
      ),
      linkButton('#/sobre', 'Sobre e limitações', { small: true, variant: 'ghost' }),
    ),
  );
  return { title: 'Configurações', el, destroy: () => cleanups.forEach((c) => c()) };
}
