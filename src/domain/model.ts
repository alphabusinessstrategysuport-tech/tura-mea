// Earning model: expected gross and rides per hour for each [weekday][hour].
import { clamp } from './money';
import { fuelPerHourEstimate } from './finance';
import type { EarningModel, Heatmap, Settings, Weekday } from './types';

/** Heatmap value → multiplier on the average hourly rate. 0 → ×0.5, 50 → ×1.0, 100 → ×1.5 */
export function demandFactor(v: number): number {
  return 0.5 + clamp(v, 0, 100) / 100;
}

/** Calendar cell for a day-minute of a work day (minutes ≥ 1440 roll into the next weekday). */
export function cellOf(weekday: number, minute: number): [Weekday, number] {
  const dayShift = Math.floor(minute / 1440);
  const wd = (((weekday + dayShift) % 7) + 7) % 7;
  const hour = Math.floor((((minute % 1440) + 1440) % 1440) / 60);
  return [wd as Weekday, hour];
}

export function demandAt(heat: Heatmap, weekday: number, minute: number): number {
  const [wd, h] = cellOf(weekday, minute);
  return heat[wd][h];
}

export function priorModel(s: Settings, heat: Heatmap): EarningModel {
  const base = s.estimates.grossPerHour;
  const rph = base / s.estimates.avgFare;
  return {
    grossPerHour: heat.map((row) => row.map((v) => base * demandFactor(v))),
    ridesPerHour: heat.map((row) => row.map((v) => rph * demandFactor(v))),
    fuelPerHour: fuelPerHourEstimate(s),
    avgFare: s.estimates.avgFare,
    baseGrossPerHour: base,
    learnedHours: 0,
  };
}

/** Integrates a per-hour table over [start, end) day minutes of a work day. */
export function integrate(table: number[][], weekday: number, start: number, end: number): number {
  let total = 0;
  let t = start;
  while (t < end) {
    const next = Math.min(end, (Math.floor(t / 60) + 1) * 60);
    const [wd, h] = cellOf(weekday, t);
    total += table[wd][h] * ((next - t) / 60);
    t = next;
  }
  return total;
}
