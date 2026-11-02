/**
 * Registro local dos últimos erros inesperados, para o painel de administração (no celular e
 * no APK não há console à vista). Fica só neste aparelho (localStorage, chave cfa:erros), é
 * apagado junto com os dados e nunca é enviado.
 */
import { getPref, removePref, setPref } from '../storage/prefs.ts';

export interface ErroRegistrado {
  /** Instante ISO. */
  em: string;
  origem: 'erro' | 'promessa';
  mensagem: string;
}

const CHAVE = 'erros';
export const MAX_ERROS = 20;
const MAX_TEXTO = 300;

function valido(x: unknown): x is ErroRegistrado {
  const e = x as Partial<ErroRegistrado> | null;
  return (
    !!e &&
    typeof e.em === 'string' &&
    (e.origem === 'erro' || e.origem === 'promessa') &&
    typeof e.mensagem === 'string'
  );
}

export function listarErros(): ErroRegistrado[] {
  try {
    const bruto: unknown = JSON.parse(getPref(CHAVE) ?? '[]');
    return Array.isArray(bruto) ? bruto.filter(valido).slice(-MAX_ERROS) : [];
  } catch {
    return [];
  }
}

export function registrarErro(
  origem: ErroRegistrado['origem'],
  mensagem: string,
  quando: Date = new Date(),
): void {
  const texto = (mensagem || 'erro sem mensagem').slice(0, MAX_TEXTO);
  const lista = [...listarErros(), { em: quando.toISOString(), origem, mensagem: texto }];
  setPref(CHAVE, JSON.stringify(lista.slice(-MAX_ERROS)));
}

export function limparErros(): void {
  removePref(CHAVE);
}
