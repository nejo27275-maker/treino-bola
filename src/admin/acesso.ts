/**
 * Acesso ao painel de administração. O repositório é público, então a senha nunca aparece
 * no código: só o resultado do PBKDF2-SHA-256 (sal aleatório + hash, com muitas iterações).
 * Com uma senha aleatória longa, descobri-la a partir do hash é inviável.
 *
 * Funciona no navegador e no Node (Web Crypto), para poder ser testado.
 */

export interface Credencial {
  algoritmo: 'PBKDF2-SHA-256';
  iteracoes: number;
  /** Sal aleatório em base64. */
  sal: string;
  /** Resultado do PBKDF2 (32 bytes) em base64. */
  hash: string;
  /** Data em que a senha foi gerada (AAAA-MM-DD). */
  criadaEm: string;
}

/** Recomendação atual (OWASP) para PBKDF2-HMAC-SHA256. */
export const ITERACOES_MINIMAS = 600_000;

export function base64ParaBytes(texto: string): Uint8Array {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Compara sem sair no primeiro byte diferente (o tempo não revela onde a senha errou). */
export function iguaisEmTempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferenca === 0;
}

export async function derivar(
  senha: string,
  sal: Uint8Array,
  iteracoes: number,
): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Criptografia indisponível (o painel precisa de HTTPS).');
  const chave = await subtle.importKey(
    'raw',
    new TextEncoder().encode(senha.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteracoes },
    chave,
    256,
  );
  return new Uint8Array(bits);
}

/** Espaços nas pontas (ex.: ao colar) são ignorados; senha vazia nunca confere. */
export async function verificarSenha(senha: string, credencial: Credencial): Promise<boolean> {
  const limpa = senha.trim();
  if (!limpa || credencial.algoritmo !== 'PBKDF2-SHA-256') return false;
  const obtido = await derivar(limpa, base64ParaBytes(credencial.sal), credencial.iteracoes);
  return iguaisEmTempoConstante(obtido, base64ParaBytes(credencial.hash));
}

// ——— Bloqueio depois de tentativas erradas ———

export const TENTATIVAS_LIVRES = 5;
const ESPERA_INICIAL_MS = 60_000;
const ESPERA_MAXIMA_MS = 60 * 60_000;

export interface EstadoTentativas {
  falhas: number;
  /** Momento (ms) até quando novas tentativas ficam bloqueadas. */
  bloqueadoAte: number;
}

export const SEM_FALHAS: EstadoTentativas = { falhas: 0, bloqueadoAte: 0 };

/** Espera imposta depois da n-ésima falha: nada nas 4 primeiras, 1 min na 5ª, dobrando até 1 h. */
export function esperaAposFalhas(falhas: number): number {
  if (falhas < TENTATIVAS_LIVRES) return 0;
  return Math.min(ESPERA_MAXIMA_MS, ESPERA_INICIAL_MS * 2 ** (falhas - TENTATIVAS_LIVRES));
}

export function registrarFalha(estado: EstadoTentativas, agora: number): EstadoTentativas {
  const falhas = estado.falhas + 1;
  const espera = esperaAposFalhas(falhas);
  return { falhas, bloqueadoAte: espera ? agora + espera : 0 };
}

export function esperaRestante(estado: EstadoTentativas, agora: number): number {
  return Math.max(0, estado.bloqueadoAte - agora);
}

/**
 * Lê o estado salvo, tolerando lixo (é dado do armazenamento local, não confiável). Um valor
 * corrompido nunca bloqueia por mais que a espera máxima.
 */
export function lerEstado(texto: string | null, agora: number): EstadoTentativas {
  try {
    const bruto = JSON.parse(texto ?? '') as { falhas?: unknown; bloqueadoAte?: unknown };
    const falhas =
      typeof bruto.falhas === 'number' && Number.isInteger(bruto.falhas)
        ? Math.min(Math.max(bruto.falhas, 0), 1000)
        : 0;
    const ate =
      typeof bruto.bloqueadoAte === 'number' && Number.isFinite(bruto.bloqueadoAte)
        ? Math.min(Math.max(bruto.bloqueadoAte, 0), agora + ESPERA_MAXIMA_MS)
        : 0;
    return { falhas, bloqueadoAte: ate };
  } catch {
    return { ...SEM_FALHAS };
  }
}
