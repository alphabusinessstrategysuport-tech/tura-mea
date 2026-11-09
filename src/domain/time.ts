// Time helpers, always in Europe/Bucharest (handles DST).
import type { DayKey, WeekId, Weekday } from './types';

export const TZ = 'Europe/Bucharest';
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY_MIN = 1440;

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const pad = (n: number) => String(n).padStart(2, '0');

export function zonedParts(ts: number) {
  const parts = fmt.formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute'), s: get('second') };
}

export function dayKeyOf(ts: number): DayKey {
  const p = zonedParts(ts);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Minutes since local midnight of the calendar day of ts. */
export function minuteOfDay(ts: number): number {
  const p = zonedParts(ts);
  return p.h * 60 + p.min;
}

function offsetMs(ts: number): number {
  const p = zonedParts(ts);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

function parseKey(day: DayKey): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number);
  return [y, m, d];
}

/** Timestamp of a Bucharest wall-clock time given as day + day minutes (may exceed 1440). */
export function zonedToTs(day: DayKey, minutes: number): number {
  const [y, m, d] = parseKey(day);
  const guess = Date.UTC(y, m - 1, d) + minutes * MIN;
  let ts = guess - offsetMs(guess);
  const off2 = offsetMs(ts);
  if (guess - off2 !== ts) ts = guess - off2;
  return ts;
}

export function addDays(day: DayKey, n: number): DayKey {
  const [y, m, d] = parseKey(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diffDays(a: DayKey, b: DayKey): number {
  const [y1, m1, d1] = parseKey(a);
  const [y2, m2, d2] = parseKey(b);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
}

export function weekdayOf(day: DayKey): Weekday {
  const [y, m, d] = parseKey(day);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) as Weekday;
}

export function mondayOf(day: DayKey): DayKey {
  return addDays(day, -weekdayOf(day));
}

export function weekIdOf(day: DayKey): WeekId {
  const monday = mondayOf(day);
  const thursday = addDays(monday, 3);
  const year = Number(thursday.slice(0, 4));
  const firstMonday = mondayOf(`${year}-01-04`);
  const week = diffDays(monday, firstMonday) / 7 + 1;
  return `${year}-W${pad(week)}`;
}

export function weekStartOf(id: WeekId): DayKey {
  const [y, w] = id.split('-W').map(Number);
  return addDays(mondayOf(`${y}-01-04`), (w - 1) * 7);
}

export function weekDays(weekStart: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function monthKeyOf(day: DayKey): string {
  return day.slice(0, 7);
}

export function daysInMonth(monthKey: string): DayKey[] {
  const [y, m] = monthKey.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${monthKey}-${pad(i + 1)}`);
}

/**
 * Work day a timestamp belongs to when it is not inside a shift:
 * before the cutoff hour (e.g. 05:00) it still counts for the previous day,
 * so Saturday night rides at 02:00 belong to Saturday.
 */
export function workDayOf(ts: number, cutoffHour: number): DayKey {
  const day = dayKeyOf(ts);
  return minuteOfDay(ts) < cutoffHour * 60 ? addDays(day, -1) : day;
}

/** Day minutes of ts relative to a given work day (may exceed 1440 after midnight). */
export function dayMinutesOf(ts: number, workDay: DayKey): number {
  return Math.round((ts - zonedToTs(workDay, 0)) / MIN);
}

/** 'HH:mm' for day minutes; values ≥ 1440 wrap around (caller can show "+1"). */
export function fmtHM(minutes: number): string {
  const m = ((Math.round(minutes) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function parseHM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** '2h 10m', '45m' */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${pad(r)}m`;
}

export function fmtHours(hours: number): string {
  return fmtDuration(hours * 60);
}
