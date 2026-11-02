/**
 * Rastreio do tempo de uso DESTE aparelho (ui/usage.ts): conta o tempo com o app aberto e à
 * vista, em batidas curtas, e guarda só no localStorage (chave cfa:uso). Nunca é enviado e não
 * identifica ninguém; é apagado junto com os dados. A lógica pura está em core/usageStats.ts.
 */
import { localDate } from '../core/dates.ts';
import { estaAtivo, normalizar, somarUso, type UsageStats } from '../core/usageStats.ts';
import { getPref, removePref, setPref } from '../storage/prefs.ts';

const CHAVE = 'uso';
/** Batida do rastreio: cada intervalo soma, no máximo, este tempo (fica abaixo do limite de 60 s). */
const BATIDA_MS = 30_000;

export function lerUso(): UsageStats {
  try {
    return normalizar(JSON.parse(getPref(CHAVE) ?? 'null'));
  } catch {
    return normalizar(null);
  }
}

function salvarUso(stats: UsageStats): void {
  try {
    setPref(CHAVE, JSON.stringify(stats));
  } catch {
    // Armazenamento cheio/bloqueado: o tempo deste intervalo simplesmente não persiste.
  }
}

export function limparUso(): void {
  removePref(CHAVE);
}

/**
 * Começa a contar o tempo de uso. Retorna uma função que para de contar (registrando o que
 * faltava). Conta só enquanto a aba/app está visível.
 */
export function iniciarRastreioDeUso(agora: () => number = () => performance.now()): () => void {
  let marca = agora();
  let ultimaInteracao = agora();
  let timer = 0;

  const registrar = () => {
    const t = agora();
    const delta = t - marca;
    marca = t;
    const visivel = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (delta <= 0 || !estaAtivo(visivel, t - ultimaInteracao)) return;
    salvarUso(somarUso(lerUso(), localDate(new Date()), delta, new Date().toISOString()));
  };

  const parar = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };
  const retomar = () => {
    marca = agora();
    parar();
    timer = window.setInterval(registrar, BATIDA_MS);
  };

  const aoInteragir = () => {
    ultimaInteracao = agora();
  };
  const aoMudarVisibilidade = () => {
    if (document.visibilityState === 'visible') {
      ultimaInteracao = agora();
      retomar();
    } else {
      registrar(); // guarda o trecho visível que acabou
      parar();
    }
  };
  const aoSair = () => registrar();

  const EVENTOS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
  for (const ev of EVENTOS) window.addEventListener(ev, aoInteragir, { passive: true });
  document.addEventListener('visibilitychange', aoMudarVisibilidade);
  window.addEventListener('pagehide', aoSair);
  if (typeof document === 'undefined' || document.visibilityState === 'visible') retomar();

  return () => {
    for (const ev of EVENTOS) window.removeEventListener(ev, aoInteragir);
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    window.removeEventListener('pagehide', aoSair);
    registrar();
    parar();
  };
}
