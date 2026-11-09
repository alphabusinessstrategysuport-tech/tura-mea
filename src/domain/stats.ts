// Weekly / monthly summaries: target vs. actual, net profit, best hours and days.
import { dayActuals, sumActuals, type DayActuals } from './actuals';
import { breakdown, type Breakdown } from './finance';
import { cellStats } from './learning';
import type { DayKey, EarningModel, LoggedData, Settings, Weekday } from './types';
import { weekdayOf } from './time';

export interface PeriodSummary {
  days: DayActuals[];
  hours: number;
  rides: number;
  rideGross: number;
  bonusGross: number;
  fuelLogged: number;
  fuelEstimated: number;
  fuelUsed: number; // logged if any, else estimated
  fuelIsEstimate: boolean;
  money: Breakdown;
  netTarget: number;
  grossPerHour: number;
  netPerHour: number;
  bestDay?: { day: DayKey; gross: number; perHour: number };
  bestHours: { weekday: Weekday; hour: number; perHour: number; hours: number }[];
}

export function summarize(args: {
  days: DayKey[];
  data: LoggedData;
  settings: Settings;
  model: EarningModel;
  fixedCosts: number;
  netTarget: number;
  now: number;
}): PeriodSummary {
  const { days, data, settings: s, model, fixedCosts, netTarget, now } = args;
  const list = days.map((d) => dayActuals(d, data, now));
  const t = sumActuals(list);
  const fuelEstimated = model.fuelPerHour * t.hours;
  const fuelIsEstimate = t.fuel === 0;
  const fuelUsed = fuelIsEstimate ? fuelEstimated : t.fuel;
  const money = breakdown(s, t.gross, fuelUsed, fixedCosts);

  const worked = list.filter((d) => d.hours > 0);
  const bestDay = worked
    .map((d) => ({ day: d.day, gross: d.gross, perHour: d.gross / d.hours }))
    .sort((a, b) => b.gross - a.gross)[0];

  const cells = cellStats(data, now, new Set(days));
  const bestHours: PeriodSummary['bestHours'] = [];
  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) {
      const hrs = cells.hours[wd][h];
      if (hrs >= 0.75) bestHours.push({ weekday: wd as Weekday, hour: h, perHour: cells.gross[wd][h] / hrs, hours: hrs });
    }
  }
  bestHours.sort((a, b) => b.perHour - a.perHour);

  return {
    days: list,
    hours: t.hours,
    rides: t.rideCount,
    rideGross: t.rideGross,
    bonusGross: t.bonusGross,
    fuelLogged: t.fuel,
    fuelEstimated,
    fuelUsed,
    fuelIsEstimate,
    money,
    netTarget,
    grossPerHour: t.hours > 0 ? t.gross / t.hours : 0,
    netPerHour: t.hours > 0 ? (money.net + fixedCosts) / t.hours : 0,
    bestDay,
    bestHours: bestHours.slice(0, 5),
  };
}

const WD = ['Lunea', 'Marțea', 'Miercurea', 'Joia', 'Vinerea', 'Sâmbăta', 'Duminica'];

/**
 * 1–3 short, useful observations from real data (needs a few worked days).
 * e.g. "Vinerea câștigi cu 28% mai mult pe oră decât media ta."
 */
export function insights(list: DayActuals[], cells: { hours: number[][]; gross: number[][] }): string[] {
  const out: string[] = [];
  const worked = list.filter((d) => d.hours > 0.5);
  const totalH = worked.reduce((a, d) => a + d.hours, 0);
  const totalG = worked.reduce((a, d) => a + d.gross, 0);
  if (worked.length < 3 || totalH < 6) return out;
  const avg = totalG / totalH;

  const byWd = perWeekday(worked).filter((x) => x.hours >= 2);
  if (byWd.length >= 2) {
    const best = byWd.reduce((a, b) => (b.gross / b.hours > a.gross / a.hours ? b : a));
    const diff = (best.gross / best.hours / avg - 1) * 100;
    if (diff >= 8) out.push(`${WD[best.weekday]} câștigi cu ${Math.round(diff)}% mai mult pe oră decât media ta.`);
  }

  let bestCell: { wd: number; h: number; rate: number } | null = null;
  for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) {
    const hrs = cells.hours[wd][h];
    if (hrs < 1) continue;
    const rate = cells.gross[wd][h] / hrs;
    if (!bestCell || rate > bestCell.rate) bestCell = { wd, h, rate };
  }
  if (bestCell && bestCell.rate > avg * 1.15) {
    out.push(`Cea mai bună oră: ${WD[bestCell.wd].toLowerCase()} ${String(bestCell.h).padStart(2, '0')}:00, ~${Math.round(bestCell.rate)} lei/h.`);
  }

  const bonus = worked.reduce((a, d) => a + d.bonusGross, 0);
  if (bonus > 0 && totalG > 0) out.push(`Bonusurile au adus ${Math.round((bonus / totalG) * 100)}% din încasări.`);
  return out.slice(0, 3);
}

/** Average gross per weekday across the given days (for "best days"). */
export function perWeekday(list: DayActuals[]): { weekday: Weekday; gross: number; hours: number }[] {
  const out = Array.from({ length: 7 }, (_, i) => ({ weekday: i as Weekday, gross: 0, hours: 0 }));
  for (const d of list) {
    const o = out[weekdayOf(d.day)];
    o.gross += d.gross;
    o.hours += d.hours;
  }
  return out;
}
