/**
 * Datas de calendário no formato AAAA-MM-DD, sem horário e sem fuso.
 *
 * Toda a aritmética é feita com dias UTC (Date.UTC), que não sofrem horário de verão,
 * e a data "de hoje" é obtida dos campos locais do relógio do aparelho.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

export const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
}

function parts(date: string): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m || !isValidDate(date)) throw new Error(`Data inválida: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Número do dia (dias desde 1970-01-01) de uma data de calendário. */
export function dayNumber(date: string): number {
  const [y, m, d] = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): string {
  const dt = new Date(n * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Data local (AAAA-MM-DD) do instante informado, segundo o fuso do aparelho. */
export function localDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(dayNumber(date) + days);
}

/** Dias de `from` até `to` (positivo se `to` for depois). */
export function diffDays(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function weekdayIndex(date: string): number {
  return new Date(dayNumber(date) * DAY_MS).getUTCDay();
}

export function weekdayName(date: string): string {
  return WEEKDAYS[weekdayIndex(date)] ?? '';
}

/** "20/10/2026" */
export function formatDateBR(date: string): string {
  const [y, m, d] = parts(date);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** "20/10" */
export function formatDayMonth(date: string): string {
  const [, m, d] = parts(date);
  return `${pad(d)}/${pad(m)}`;
}

/** "terça-feira, 20 de outubro de 2026" */
export function formatLong(date: string): string {
  const [y, m, d] = parts(date);
  return `${weekdayName(date)}, ${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** Texto amigável da distância até a data do evento. */
export function relativeDayLabel(today: string, target: string): string {
  const diff = diffDays(today, target);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  if (diff > 1) return `em ${diff} dias`;
  return `há ${-diff} dias`;
}

/** Lista de datas de `start` a `end`, inclusive. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const a = dayNumber(start);
  const b = dayNumber(end);
  for (let n = a; n <= b; n++) out.push(fromDayNumber(n));
  return out;
}

/** Data local (AAAA-MM-DD) a partir de um ISO com horário. */
export function localDateFromIso(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) throw new Error(`Data/hora inválida: ${iso}`);
  return localDate(dt);
}
