/**
 * Mensagens claras para falhas de câmera e de vídeo (sem dependência do navegador,
 * para poderem ser testadas em Node).
 */

export interface MediaProblem {
  code: string;
  title: string;
  message: string;
  /** O que o jogador pode fazer agora. */
  steps: string[];
}

export function describeCameraError(error: unknown): MediaProblem {
  const name = (error as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        code: 'permissao_negada',
        title: 'Permissão da câmera negada',
        message: 'O navegador não liberou a câmera para este site.',
        steps: [
          'No Chrome do Android, toque no ícone à esquerda do endereço (cadeado ou "i").',
          'Abra "Permissões" e mude "Câmera" para "Permitir".',
          'Recarregue a página e toque em "Ligar câmera" novamente.',
        ],
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        code: 'sem_camera',
        title: 'Nenhuma câmera encontrada',
        message: 'Este aparelho não tem câmera disponível ou ela está desativada.',
        steps: [
          'Verifique se a câmera funciona em outro aplicativo.',
          'Tente a outra câmera (frontal/traseira).',
        ],
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        code: 'camera_ocupada',
        title: 'A câmera está ocupada',
        message: 'Outro aplicativo ou aba pode estar usando a câmera.',
        steps: [
          'Feche outros aplicativos de câmera ou videochamada.',
          'Feche outras abas que usam a câmera e tente de novo.',
        ],
      };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        code: 'configuracao',
        title: 'Configuração não suportada',
        message: 'A câmera escolhida não aceita a resolução pedida.',
        steps: ['Escolha a resolução baixa ou a outra câmera e tente de novo.'],
      };
    case 'SecurityError':
      return {
        code: 'inseguro',
        title: 'Câmera bloqueada por segurança',
        message: 'O navegador só libera a câmera em páginas seguras (HTTPS) ou em localhost.',
        steps: ['Abra o aplicativo pelo endereço HTTPS (por exemplo, o do GitHub Pages).'],
      };
    case 'NotSupportedError':
      return {
        code: 'nao_suportado',
        title: 'Câmera indisponível neste navegador',
        message:
          'Este navegador não permite que sites usem a câmera. Isso é comum em navegadores embutidos de outros aplicativos (redes sociais, mensageiros).',
        steps: [
          'Abra o endereço do aplicativo diretamente no Google Chrome.',
          'Se já estiver no Chrome, atualize-o pela loja de aplicativos.',
        ],
      };
    case 'AbortError':
      return {
        code: 'interrompida',
        title: 'A câmera não iniciou',
        message: 'O pedido de acesso foi interrompido pelo navegador ou pelo sistema.',
        steps: ['Tente novamente em alguns segundos.'],
      };
    default:
      return {
        code: 'desconhecido',
        title: 'Não foi possível ligar a câmera',
        message: error instanceof Error && error.message ? error.message : 'Erro desconhecido.',
        steps: [
          'Recarregue a página e tente de novo.',
          'Verifique se o navegador está atualizado.',
        ],
      };
  }
}

/** Requisitos para usar a câmera. `secure` = isSecureContext; `hasApi` = getUserMedia existe. */
export function cameraSupport(secure: boolean, hasApi: boolean): MediaProblem | null {
  if (!secure) {
    return {
      code: 'inseguro',
      title: 'A câmera precisa de HTTPS',
      message:
        'Por segurança, os navegadores só liberam a câmera em endereços HTTPS ou em localhost.',
      steps: [
        'Use o endereço HTTPS do aplicativo (por exemplo, publicado no GitHub Pages).',
        'Em desenvolvimento, abra por http://localhost (no celular, use o encaminhamento de porta do Chrome).',
      ],
    };
  }
  if (!hasApi) {
    return {
      code: 'sem_suporte',
      title: 'Navegador sem acesso à câmera',
      message: 'Este navegador não oferece a função de câmera para sites.',
      steps: ['Atualize o Google Chrome ou use outro navegador moderno.'],
    };
  }
  return null;
}

/** MediaError.code → mensagem. 1 abortado, 2 rede, 3 decodificação, 4 formato não suportado. */
export function describeVideoError(code: number | undefined): MediaProblem {
  switch (code) {
    case 1:
      return {
        code: 'abortado',
        title: 'Carregamento interrompido',
        message: 'O carregamento do vídeo foi interrompido.',
        steps: ['Selecione o vídeo novamente.'],
      };
    case 2:
      return {
        code: 'leitura',
        title: 'Falha ao ler o arquivo',
        message: 'Não foi possível ler o vídeo do aparelho.',
        steps: ['Verifique se o arquivo não foi movido ou apagado e tente de novo.'],
      };
    case 3:
      return {
        code: 'decodificacao',
        title: 'Vídeo corrompido ou pesado demais',
        message:
          'O navegador não conseguiu decodificar o vídeo. Pode ser um arquivo danificado ou que exige mais memória do que o aparelho tem.',
        steps: [
          'Grave um trecho mais curto ou em resolução menor (720p).',
          'Feche outros aplicativos e tente de novo.',
        ],
      };
    case 4:
      return {
        code: 'formato',
        title: 'Formato não suportado',
        message: 'Este navegador não reproduz o formato/codec deste vídeo.',
        steps: [
          'Grave com a câmera padrão do celular (MP4/H.264 costuma funcionar no Chrome do Android).',
          'Ou converta o vídeo para MP4 ou WebM.',
        ],
      };
    default:
      return {
        code: 'desconhecido',
        title: 'Não foi possível abrir o vídeo',
        message: 'Ocorreu um erro inesperado ao abrir o vídeo.',
        steps: ['Tente outro arquivo.'],
      };
  }
}

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|3gp|3gpp|ogv|avi)$/i;

/** Validação inicial do arquivo escolhido (antes de tentar reproduzir). */
export function checkVideoFile(file: { name: string; type: string; size: number }): {
  ok: boolean;
  problem?: MediaProblem;
  warning?: string;
} {
  const looksVideo = file.type.startsWith('video/') || VIDEO_EXT.test(file.name);
  if (!looksVideo) {
    return {
      ok: false,
      problem: {
        code: 'nao_video',
        title: 'Este arquivo não é um vídeo',
        message: `"${file.name}" não parece ser um arquivo de vídeo.`,
        steps: ['Escolha um vídeo da galeria (MP4, WebM ou MOV).'],
      },
    };
  }
  if (file.size === 0) {
    return {
      ok: false,
      problem: {
        code: 'vazio',
        title: 'Arquivo vazio',
        message: 'O arquivo escolhido está vazio.',
        steps: ['Escolha outro vídeo.'],
      },
    };
  }
  const warning =
    file.size > 500 * 1024 * 1024
      ? 'Vídeo muito grande: em aparelhos modestos a navegação pode ficar lenta. Prefira trechos curtos (até 1 minuto).'
      : undefined;
  return warning ? { ok: true, warning } : { ok: true };
}
