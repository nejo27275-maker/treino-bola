/**
 * Preferências pequenas no localStorage (lidas antes do banco abrir, para evitar
 * "piscar" o tema). Todas as chaves usam o prefixo "cfa:" e são apagadas junto com os dados.
 */
const PREFIX = 'cfa:';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getPref(key: string): string | null {
  try {
    return storage()?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string): void {
  try {
    storage()?.setItem(PREFIX + key, value);
  } catch {
    // Armazenamento cheio ou bloqueado: a preferência simplesmente não persiste.
  }
}

export function clearPrefs(): void {
  const s = storage();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) s.removeItem(key);
  } catch {
    // ignora
  }
}
