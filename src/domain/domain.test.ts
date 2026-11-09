import { describe, expect, it } from 'vitest';
import { layoutRun, workMinutes } from './breaks';
import { defaultHeatmap, defaultSettings } from './defaults';
import { breakdown, fuelPerHourEstimate, grossNeeded, keepRate, monthlyNetTarget, weeklyFixedCosts, weeklyNetTarget } from './finance';
import { cellOf, demandFactor, integrate, priorModel } from './model';
import {
  addDays, dayKeyOf, fmtDuration, fmtHM, minuteOfDay, mondayOf, weekdayOf, weekIdOf, weekStartOf, workDayOf, zonedToTs,
} from './time';

describe('time (Europe/Bucharest)', () => {
  it('converts wall clock to timestamps across DST', () => {
    // Summer: UTC+3
    expect(new Date(zonedToTs('2026-07-01', 9 * 60)).toISOString()).toBe('2026-07-01T06:00:00.000Z');
    // Winter: UTC+2
    expect(new Date(zonedToTs('2026-11-09', 9 * 60)).toISOString()).toBe('2026-11-09T07:00:00.000Z');
    // Day minutes past midnight belong to the next calendar day
    expect(dayKeyOf(zonedToTs('2026-11-14', 26 * 60))).toBe('2026-11-15');
    expect(minuteOfDay(zonedToTs('2026-11-14', 26 * 60))).toBe(120);
  });

  it('handles weeks and weekdays (Monday = 0)', () => {
    expect(weekdayOf('2026-11-09')).toBe(0);
    expect(weekdayOf('2026-11-15')).toBe(6);
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(weekIdOf('2026-11-09')).toBe('2026-W46');
    expect(weekStartOf('2026-W46')).toBe('2026-11-09');
    expect(weekIdOf('2027-01-01')).toBe('2026-W53');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('counts Saturday-night rides for Saturday', () => {
    const sundayNight = zonedToTs('2026-11-15', 3 * 60); // Sunday 03:00
    expect(workDayOf(sundayNight, 5)).toBe('2026-11-14');
    expect(workDayOf(zonedToTs('2026-11-15', 9 * 60), 5)).toBe('2026-11-15');
  });

  it('formats times and durations', () => {
    expect(fmtHM(26 * 60 + 30)).toBe('02:30');
    expect(fmtDuration(130)).toBe('2h 10m');
    expect(fmtDuration(45)).toBe('45m');
  });
});

describe('finance', () => {
  const s = defaultSettings();

  it('converts the monthly target with 4.33 weeks', () => {
    expect(weeklyNetTarget(s)).toBeCloseTo(1270.2, 1);
    expect(monthlyNetTarget(s)).toBe(5500);
    expect(weeklyNetTarget({ ...s, target: { mode: 'weekly', amount: 1300 } })).toBe(1300);
  });

  it('sums weekly and monthly cost items', () => {
    expect(weeklyFixedCosts(s)).toBe(920);
    const withMonthly = { ...s, costItems: [...s.costItems, { id: 'x', name: 'Telefon', amount: 43.3, period: 'month' as const }] };
    expect(weeklyFixedCosts(withMonthly)).toBeCloseTo(930, 5);
  });

  it('works backwards from net to gross (10% commission, no tax)', () => {
    expect(keepRate(s)).toBeCloseTo(0.9);
    const fuelH = fuelPerHourEstimate({ ...s, fuel: { consumptionL100: 10, pricePerL: 4 } });
    expect(fuelH).toBeCloseTo(22 * 0.1 * 4); // 8.8 lei/h
    const g = grossNeeded({ netTarget: 1270, fixedCosts: 920, fuelPerHour: 8.8, hours: 50, keep: 0.9 });
    expect(g).toBeCloseTo((1270 + 920 + 440) / 0.9);
    const b = breakdown(s, g, 440, 920);
    expect(b.net).toBeCloseTo(1270);
    expect(b.commission).toBeCloseTo(g * 0.1);
  });

  it('applies the optional tax after commission', () => {
    const t = { ...s, taxPct: 10 };
    expect(keepRate(t)).toBeCloseTo(0.81);
    expect(breakdown(t, 1000, 0, 0).net).toBeCloseTo(810);
  });

  it('fuel cost is 0 until the LPG price is filled in', () => {
    expect(fuelPerHourEstimate(s)).toBe(0);
  });
});

describe('model', () => {
  it('maps demand to a rate multiplier', () => {
    expect(demandFactor(50)).toBe(1);
    expect(demandFactor(100)).toBe(1.5);
    expect(demandFactor(0)).toBe(0.5);
  });

  it('rolls late-night minutes into the next weekday', () => {
    expect(cellOf(5, 26 * 60)).toEqual([6, 2]);
    expect(cellOf(6, 25 * 60)).toEqual([0, 1]);
  });

  it('integrates hourly rates over partial hours', () => {
    const m = priorModel(defaultSettings(), defaultHeatmap());
    const r = integrate(m.grossPerHour, 0, 8 * 60 + 30, 9 * 60 + 30);
    expect(r).toBeCloseTo(m.grossPerHour[0][8] / 2 + m.grossPerHour[0][9] / 2);
  });
});

describe('breaks', () => {
  const rules = defaultSettings().breaks;

  it('adds rests every 2h and a meal after ~4h', () => {
    const items = layoutRun({ start: 9 * 60, end: 17 * 60 }, 6, rules, defaultHeatmap());
    const meals = items.filter((i) => i.kind === 'meal');
    const rests = items.filter((i) => i.kind === 'rest');
    expect(meals).toHaveLength(1);
    expect(meals[0].start).toBeGreaterThanOrEqual(9 * 60 + 210);
    expect(meals[0].start).toBeLessThanOrEqual(9 * 60 + 300);
    expect(rests.length).toBeGreaterThanOrEqual(2);
    // items are continuous and cover the whole run
    for (let i = 1; i < items.length; i++) expect(items[i].start).toBe(items[i - 1].end);
    expect(items[items.length - 1].end).toBe(17 * 60);
  });

  it('does not add a meal to a short block', () => {
    const items = layoutRun({ start: 7 * 60, end: 11 * 60 + 30 }, 0, rules);
    expect(items.some((i) => i.kind === 'meal')).toBe(false);
    expect(workMinutes(items)).toBeGreaterThan(250);
  });
});
