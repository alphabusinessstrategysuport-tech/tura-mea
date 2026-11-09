// Learns real rates from logged data and blends them with the starting estimates.
// The more hours you log, the more the app trusts your real numbers.
import { dayActuals, shiftIntervals } from './actuals';
import { demandFactor, priorModel } from './model';
import { dayKeyOf, HOUR, weekdayOf, zonedParts } from './time';
import type { EarningModel, Heatmap, LoggedData, Settings } from './types';

const CELL_PRIOR_HOURS = 3; // a cell needs ~3 real hours to be trusted 50%

export interface CellStats {
  hours: number[][];
  gross: number[][];
  rides: number[][];
}

function grid(): number[][] {
  return Array.from({ length: 7 }, () => Array(24).fill(0));
}

/** Splits worked time and ride money into [weekday][hour] cells. */
export function cellStats(data: LoggedData, now: number, days?: Set<string>): CellStats {
  const hours = grid();
  const gross = grid();
  const rides = grid();
  for (const s of data.shifts) {
    if (days && !days.has(s.day)) continue;
    for (const [a, b] of shiftIntervals(s, now)) {
      let t = a;
      while (t < b) {
        const next = Math.min(b, Math.floor(t / HOUR) * HOUR + HOUR); // Bucharest offsets are whole hours
        const wd = weekdayOf(dayKeyOf(t));
        hours[wd][zonedParts(t).h] += (next - t) / HOUR;
        t = next;
      }
    }
  }
  for (const r of data.rides) {
    if (days && !days.has(r.day)) continue;
    const wd = weekdayOf(dayKeyOf(r.ts));
    const h = zonedParts(r.ts).h;
    gross[wd][h] += r.amount;
    rides[wd][h] += 1;
  }
  return { hours, gross, rides };
}

/** Fuel: money spent between the first and the last fill-up over hours driven in that span. */
export function learnFuel(s: Settings, data: LoggedData, now: number, priorPerHour: number): number {
  const fills = [...data.fuel].sort((a, b) => a.ts - b.ts);
  if (fills.length < 2) return priorPerHour;
  const from = fills[0].ts;
  const to = fills[fills.length - 1].ts;
  const spent = fills.slice(1).reduce((a, f) => a + f.total, 0);
  let hoursSpan = 0;
  for (const sh of data.shifts) {
    for (const [a, b] of shiftIntervals(sh, now)) {
      const s0 = Math.max(a, from);
      const e0 = Math.min(b, to);
      if (e0 > s0) hoursSpan += (e0 - s0) / HOUR;
    }
  }
  if (hoursSpan < 5) return priorPerHour;
  const actual = spent / hoursSpan;
  const wf = priorPerHour > 0 ? Math.min(1, hoursSpan / s.learning.fullTrustHours) : 1;
  return priorPerHour * (1 - wf) + actual * wf;
}

export function learnModel(s: Settings, heat: Heatmap, data: LoggedData, now: number): EarningModel {
  const prior = priorModel(s, heat);
  if (!s.learning.enabled) return prior;

  // --- Global rates, normalised by demand so peak-hour-only data does not inflate the base.
  const cells = cellStats(data, now);
  const days = new Set<string>([...data.shifts.map((x) => x.day), ...data.dailyTotals.map((x) => x.day), ...data.rides.map((x) => x.day)]);
  let totalHours = 0;
  let totalGross = 0;
  let totalRides = 0;
  let factorHours = 0;
  for (const day of days) {
    const a = dayActuals(day, data, now);
    if (a.hours <= 0 || a.rideGross <= 0) continue;
    totalHours += a.hours;
    totalGross += a.rideGross;
    totalRides += a.rideCount;
    const dayCells = cellStats({ ...data, shifts: data.shifts.filter((x) => x.day === day), rides: [] }, now);
    let fh = 0;
    let h = 0;
    for (let wd = 0; wd < 7; wd++) for (let hr = 0; hr < 24; hr++) {
      fh += dayCells.hours[wd][hr] * demandFactor(heat[wd][hr]);
      h += dayCells.hours[wd][hr];
    }
    factorHours += h > 0 ? fh : a.hours; // daily total without shifts: assume average demand
  }

  const fuelPerHour = learnFuel(s, data, now, prior.fuelPerHour);
  if (totalHours === 0) return { ...prior, fuelPerHour };

  const w =Math.min(1, totalHours / s.learning.fullTrustHours);
  const base = s.estimates.grossPerHour * (1 - w) + (totalGross / factorHours) * w;
  const priorRph = s.estimates.grossPerHour / s.estimates.avgFare;
  const rphBase = totalRides > 0 ? priorRph * (1 - w) + (totalRides / factorHours) * w : priorRph;

  const grossPerHour = heat.map((row, wd) =>
    row.map((v, hr) => {
      const p = base * demandFactor(v);
      const ch = cells.hours[wd][hr];
      if (ch <= 0.05) return p;
      const wc = ch / (ch + CELL_PRIOR_HOURS);
      return p * (1 - wc) + (cells.gross[wd][hr] / ch) * wc;
    }),
  );
  const ridesPerHour = heat.map((row, wd) =>
    row.map((v, hr) => {
      const p = rphBase * demandFactor(v);
      const ch = cells.hours[wd][hr];
      if (ch <= 0.05) return p;
      const wc = ch / (ch + CELL_PRIOR_HOURS);
      return p * (1 - wc) + (cells.rides[wd][hr] / ch) * wc;
    }),
  );

  return {
    grossPerHour,
    ridesPerHour,
    fuelPerHour,
    avgFare: rphBase > 0 ? base / rphBase : s.estimates.avgFare,
    baseGrossPerHour: base,
    learnedHours: totalHours,
  };
}
