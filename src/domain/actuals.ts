// Aggregates what really happened (logged shifts, rides, fuel, bonuses).
import type { DayKey, LoggedData, Ride, Shift } from './types';

/** Working intervals of a shift (pauses removed). Open shift/pause end at `now`. */
export function shiftIntervals(shift: Shift, now: number): [number, number][] {
  const end = shift.end ?? now;
  const pauses = shift.pauses
    .map((p) => [p.start, p.end ?? now] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let t = shift.start;
  for (const [ps, pe] of pauses) {
    if (ps > t) out.push([t, Math.min(ps, end)]);
    t = Math.max(t, pe);
    if (t >= end) break;
  }
  if (t < end) out.push([t, end]);
  return out.filter(([a, b]) => b > a);
}

export function shiftMinutes(shift: Shift, now: number): number {
  return shiftIntervals(shift, now).reduce((a, [s, e]) => a + (e - s) / 60_000, 0);
}

export function activeShift(shifts: Shift[]): Shift | undefined {
  return shifts.find((s) => s.end === null);
}

export function isPaused(shift: Shift): boolean {
  return shift.pauses.some((p) => p.end === null);
}

export interface DayActuals {
  day: DayKey;
  rideGross: number;
  rideCount: number;
  bonusGross: number;
  gross: number; // rides + bonuses
  hours: number;
  fuel: number;
  usedDailyTotal: boolean;
}

export function dayActuals(day: DayKey, data: LoggedData, now: number): DayActuals {
  const rides = data.rides.filter((r) => r.day === day);
  const total = data.dailyTotals.find((t) => t.day === day);
  const rideGross = total ? total.gross : rides.reduce((a, r) => a + r.amount, 0);
  const rideCount = total ? total.rides : rides.length;
  const bonusGross = data.payouts.filter((p) => p.day === day).reduce((a, p) => a + p.amount, 0);
  let hours = data.shifts.filter((s) => s.day === day).reduce((a, s) => a + shiftMinutes(s, now) / 60, 0);
  if (hours === 0 && total?.hours) hours = total.hours;
  const fuel = data.fuel.filter((f) => f.day === day).reduce((a, f) => a + f.total, 0);
  return { day, rideGross, rideCount, bonusGross, gross: rideGross + bonusGross, hours, fuel, usedDailyTotal: !!total };
}

export function sumActuals(list: DayActuals[]) {
  return list.reduce(
    (a, d) => ({
      rideGross: a.rideGross + d.rideGross,
      rideCount: a.rideCount + d.rideCount,
      bonusGross: a.bonusGross + d.bonusGross,
      gross: a.gross + d.gross,
      hours: a.hours + d.hours,
      fuel: a.fuel + d.fuel,
    }),
    { rideGross: 0, rideCount: 0, bonusGross: 0, gross: 0, hours: 0, fuel: 0 },
  );
}

/**
 * Your most used ride amounts (last 60 days), for one-tap buttons.
 * Most frequent first; ties → most recent. Falls back to recent amounts when there is little data.
 */
export function frequentAmounts(rides: Ride[], now: number, n = 6): number[] {
  const since = now - 60 * 86_400_000;
  const stats = new Map<number, { count: number; last: number }>();
  for (const r of rides) {
    if (r.ts < since) continue;
    const s = stats.get(r.amount) ?? { count: 0, last: 0 };
    s.count += 1;
    s.last = Math.max(s.last, r.ts);
    stats.set(r.amount, s);
  }
  return [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .slice(0, n)
    .map(([amount]) => amount)
    .sort((a, b) => a - b);
}

export function ridesBetween(rides: Ride[], from: number, to: number): Ride[] {
  return rides.filter((r) => r.ts >= from && r.ts < to);
}
