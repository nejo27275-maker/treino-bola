/**
 * Tempo de uso DESTE aparelho, para o painel de administração. Fica só no aparelho (nunca é
 * enviado) e não identifica ninguém: é a soma do tempo com o app aberto e à vista, por dia.
 *
 * Lógica pura (sem DOM nem armazenamento), para ser testável; a gravação fica em ui/usage.ts.
 */

export interface UsageStats {
  /** Tempo ativo total, em milissegundos. */
  totalMs: number;
  /** Tempo ativo por dia (AAAA-MM-DD → ms). Mantém só os últimos dias. */
  dias: Record<string, number>;
  /** Primeiro dia com uso registrado. */
  primeiroDia: string | null;
  /** Último instante ativo (ISO). */
  ultimoUso: string | null;
}

export const USO_VAZIO: UsageStats = { totalMs: 0, dias: {}, primeiroDia: null, ultimoUso: null };

/** Quantos dias de detalhe guardar (o total continua somando todos). ~6 meses. */
export const DIAS_GUARDADOS = 180;
/**
 * Maior incremento aceito de uma vez. O rastreamento soma em batidas curtas; um salto maior
 * que isto quase sempre é tempo com o app em segundo plano ou o relógio do aparelho mudando —
 * não conta como uso.
 */
export const MAX_INCREMENTO_MS = 60_000;
/**
 * Sem interação (toque, tecla, rolagem) por mais que isto, o tempo não conta como uso: mede o
 * uso ativo, não um app deixado aberto e esquecido.
 */
export const JANELA_OCIOSO_MS = 120_000;

/** Conta como uso ativo quando o app está à vista e houve interação recente. */
export function estaAtivo(
  visivel: boolean,
  msDesdeInteracao: number,
  idleMs = JANELA_OCIOSO_MS,
): boolean {
  return (
    visivel &&
    Number.isFinite(msDesdeInteracao) &&
    msDesdeInteracao >= 0 &&
    msDesdeInteracao <= idleMs
  );
}

function dataValida(dia: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia);
}

/** Lê o estado salvo tolerando lixo (é dado do armazenamento local, não confiável). */
export function normalizar(bruto: unknown): UsageStats {
  const o = bruto as Partial<UsageStats> | null;
  if (!o || typeof o !== 'object') return { ...USO_VAZIO };
  const dias: Record<string, number> = {};
  if (o.dias && typeof o.dias === 'object') {
    for (const [dia, ms] of Object.entries(o.dias)) {
      if (dataValida(dia) && typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
        dias[dia] = Math.min(ms, 24 * 3_600_000);
      }
    }
  }
  const total =
    typeof o.totalMs === 'number' && Number.isFinite(o.totalMs) && o.totalMs >= 0
      ? o.totalMs
      : Object.values(dias).reduce((a, b) => a + b, 0);
  const chaves = Object.keys(dias).sort();
  return {
    totalMs: total,
    dias,
    primeiroDia:
      typeof o.primeiroDia === 'string' && dataValida(o.primeiroDia)
        ? o.primeiroDia
        : (chaves[0] ?? null),
    ultimoUso: typeof o.ultimoUso === 'string' ? o.ultimoUso : null,
  };
}

/** Soma um intervalo de uso ao dia informado (descarta saltos grandes e valores inválidos). */
export function somarUso(stats: UsageStats, dia: string, ms: number, agoraIso: string): UsageStats {
  if (!dataValida(dia) || !Number.isFinite(ms) || ms <= 0) return stats;
  const incremento = Math.min(ms, MAX_INCREMENTO_MS);
  const dias = { ...stats.dias, [dia]: (stats.dias[dia] ?? 0) + incremento };
  const podados = podar(dias);
  const primeiroDia = Object.keys(podados).sort()[0] ?? dia;
  return {
    totalMs: stats.totalMs + incremento,
    dias: podados,
    primeiroDia:
      stats.primeiroDia && stats.primeiroDia <= primeiroDia ? stats.primeiroDia : primeiroDia,
    ultimoUso: agoraIso,
  };
}

/** Mantém só os dias mais recentes (o total já acumulou os antigos). */
function podar(dias: Record<string, number>): Record<string, number> {
  const chaves = Object.keys(dias).sort();
  if (chaves.length <= DIAS_GUARDADOS) return dias;
  const manter = chaves.slice(chaves.length - DIAS_GUARDADOS);
  const out: Record<string, number> = {};
  for (const dia of manter) out[dia] = dias[dia] as number;
  return out;
}

function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface ResumoUso {
  totalMinutos: number;
  minutosHoje: number;
  diasAtivos: number;
  sequenciaAtual: number;
  mediaPorDiaAtivoMin: number;
  primeiroDia: string | null;
  ultimoUso: string | null;
}

/** Números prontos para exibir. `sequenciaAtual` = dias seguidos com uso terminando hoje. */
export function resumir(stats: UsageStats, hoje: string): ResumoUso {
  const diasComUso = Object.entries(stats.dias).filter(([, ms]) => ms > 0);
  const diasAtivos = diasComUso.length;
  let sequencia = 0;
  let cursor = hoje;
  for (let ms = stats.dias[cursor]; ms && ms > 0; ms = stats.dias[cursor]) {
    sequencia++;
    cursor = diaAnterior(cursor);
  }
  const minuto = (ms: number) => Math.round(ms / 60_000);
  return {
    totalMinutos: minuto(stats.totalMs),
    minutosHoje: minuto(stats.dias[hoje] ?? 0),
    diasAtivos,
    sequenciaAtual: sequencia,
    mediaPorDiaAtivoMin: diasAtivos ? minuto(stats.totalMs / diasAtivos) : 0,
    primeiroDia: stats.primeiroDia,
    ultimoUso: stats.ultimoUso,
  };
}

/** Últimos `n` dias (hoje por último), com os minutos de cada um — para o painel. */
export function ultimosDias(
  stats: UsageStats,
  hoje: string,
  n: number,
): { dia: string; minutos: number }[] {
  const out: { dia: string; minutos: number }[] = [];
  let cursor = hoje;
  for (let i = 0; i < Math.max(0, n); i++) {
    out.unshift({ dia: cursor, minutos: Math.round((stats.dias[cursor] ?? 0) / 60_000) });
    cursor = diaAnterior(cursor);
  }
  return out;
}
