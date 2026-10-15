/** Formatação de números e tempos em português do Brasil. */

export function percent(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(decimals).replace('.', ',')}%`;
}

export function decimal(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(decimals).replace('.', ',');
}

/** "1:05" ou "12:30" (minutos:segundos). */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** "00:12,3" — tempo de vídeo com décimos. */
export function videoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00,0';
  const totalTenths = Math.floor(seconds * 10 + 1e-6);
  const tenths = totalTenths % 10;
  const totalSec = Math.floor(totalTenths / 10);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${tenths}`;
}

/** "350 ms" ou "1,25 s" */
export function millis(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${decimal(ms / 1000, 2)} s`;
}

export function minutesLabel(minutes: number): string {
  return minutes === 1 ? '1 minuto' : `${Math.round(minutes)} minutos`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function bytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${decimal(n / 1024, 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${decimal(n / (1024 * 1024), 1)} MB`;
  return `${decimal(n / (1024 * 1024 * 1024), 2)} GB`;
}
