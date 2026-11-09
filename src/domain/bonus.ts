// Bonus instances, expected rides inside bonus windows and live progress.
import { integrate } from './model';
import { addDays, weekdayOf, zonedToTs } from './time';
import type { Bonus, DayKey, EarningModel, PlanItem, Ride, Weekday } from './types';

export interface BonusWindow {
  day: DayKey;
  weekday: Weekday;
  start: number;
  end: number;
}

export interface BonusInstance {
  bonus: Bonus;
  key: string;
  windows: BonusWindow[];
}

/** Daily bonus → one instance per selected day. Weekly bonus → one instance across all its days. */
export function expandBonus(b: Bonus, weekStart: DayKey): BonusInstance[] {
  const windows = [...b.days]
    .sort((x, y) => x - y)
    .map((wd) => ({ day: addDays(weekStart, wd), weekday: wd, start: b.start, end: b.end }));
  if (b.kind === 'weekly') return [{ bonus: b, key: b.id, windows }];
  return windows.map((w) => ({ bonus: b, key: `${b.id}@${w.day}`, windows: [w] }));
}

function overlap(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const s = Math.max(a0, b0);
  const e = Math.min(a1, b1);
  return e > s ? [s, e] : null;
}

/** Expected rides inside the bonus windows given the work items per day. */
export function expectedRidesInWindows(
  windows: BonusWindow[],
  itemsByDay: Map<DayKey, PlanItem[]>,
  model: EarningModel,
): { total: number; byDay: Map<DayKey, number>; hours: number } {
  const byDay = new Map<DayKey, number>();
  let total = 0;
  let hours = 0;
  for (const w of windows) {
    const items = itemsByDay.get(w.day) ?? [];
    let r = 0;
    for (const it of items) {
      if (it.kind !== 'work') continue;
      const o = overlap(it.start, it.end, w.start, w.end);
      if (!o) continue;
      r += integrate(model.ridesPerHour, w.weekday, o[0], o[1]);
      hours += (o[1] - o[0]) / 60;
    }
    byDay.set(w.day, (byDay.get(w.day) ?? 0) + r);
    total += r;
  }
  return { total, byDay, hours };
}

export interface BonusProgress {
  key: string;
  bonus: Bonus;
  done: number;
  required: number;
  remaining: number;
  state: 'before' | 'active' | 'after';
  minutesLeft: number; // until the end of the current/last window
  startsInMin: number; // until the next window starts (if before)
  achieved: boolean;
  activeWindow?: BonusWindow;
}

/** Live progress of a bonus instance from logged rides. */
export function bonusProgress(inst: BonusInstance, rides: Ride[], now: number): BonusProgress {
  let done = 0;
  let state: BonusProgress['state'] = 'after';
  let minutesLeft = 0;
  let startsInMin = Infinity;
  let activeWindow: BonusWindow | undefined;
  for (const w of inst.windows) {
    const from = zonedToTs(w.day, w.start);
    const to = zonedToTs(w.day, w.end);
    done += rides.filter((r) => r.ts >= from && r.ts < to).length;
    if (now >= from && now < to) {
      state = 'active';
      activeWindow = w;
      minutesLeft = (to - now) / 60_000;
    } else if (now < from) {
      if (state !== 'active') state = 'before';
      startsInMin = Math.min(startsInMin, (from - now) / 60_000);
    }
  }
  const required = inst.bonus.ridesRequired;
  return {
    key: inst.key,
    bonus: inst.bonus,
    done,
    required,
    remaining: Math.max(0, required - done),
    state,
    minutesLeft,
    startsInMin: Number.isFinite(startsInMin) ? startsInMin : 0,
    achieved: done >= required,
    activeWindow,
  };
}

export function instancesForDay(bonuses: Bonus[], weekStart: DayKey, day: DayKey): BonusInstance[] {
  return bonuses.flatMap((b) => expandBonus(b, weekStart)).filter((i) => i.windows.some((w) => w.day === day));
}

export function weekdayOfDay(day: DayKey): Weekday {
  return weekdayOf(day);
}
