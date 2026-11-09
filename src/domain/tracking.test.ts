import { describe, expect, it } from 'vitest';
import { dayActuals, frequentAmounts, shiftIntervals, shiftMinutes } from './actuals';
import { bonusProgress, expandBonus } from './bonus';
import { defaultHeatmap, defaultSettings, defaultTemplate } from './defaults';
import { weeklyFixedCosts, weeklyNetTarget } from './finance';
import { cellStats, learnModel } from './learning';
import { priorModel } from './model';
import { rebalance } from './rebalance';
import { schedule } from './scheduler';
import { insights, summarize } from './stats';
import { HOUR, weekDays, weekdayOf, zonedToTs } from './time';
import type { Bonus, LoggedData, Ride, Shift } from './types';

const MON = '2026-11-09';
const empty = (): LoggedData => ({ shifts: [], rides: [], fuel: [], payouts: [], dailyTotals: [] });

function shift(day: string, startMin: number, endMin: number, pauses: [number, number][] = []): Shift {
  return {
    id: `${day}-${startMin}`,
    day,
    start: zonedToTs(day, startMin),
    end: zonedToTs(day, endMin),
    pauses: pauses.map(([a, b]) => ({ start: zonedToTs(day, a), end: zonedToTs(day, b) })),
  };
}

function rides(day: string, fromMin: number, count: number, amount: number, everyMin = 25): Ride[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${day}-${fromMin}-${i}`, day, ts: zonedToTs(day, fromMin + i * everyMin), amount }));
}

describe('actuals', () => {
  it('removes pauses from shift time', () => {
    const s = shift(MON, 8 * 60, 12 * 60, [[10 * 60, 10 * 60 + 30]]);
    expect(shiftIntervals(s, 0)).toHaveLength(2);
    expect(shiftMinutes(s, 0)).toBe(210);
  });

  it('counts an open shift until now', () => {
    const s: Shift = { id: 'x', day: MON, start: zonedToTs(MON, 8 * 60), end: null, pauses: [] };
    expect(shiftMinutes(s, zonedToTs(MON, 9 * 60))).toBe(60);
  });

  it('a daily total from Bolt overrides individual rides', () => {
    const data = { ...empty(), rides: rides(MON, 8 * 60, 3, 20), dailyTotals: [{ day: MON, gross: 250, rides: 11 }] };
    const a = dayActuals(MON, data, 0);
    expect(a.rideGross).toBe(250);
    expect(a.rideCount).toBe(11);
    expect(a.usedDailyTotal).toBe(true);
  });
});

describe('frequent amounts', () => {
  it('suggests the most used amounts, sorted', () => {
    const now = zonedToTs(MON, 20 * 60);
    const r = [...rides(MON, 8 * 60, 5, 22), ...rides(MON, 12 * 60, 3, 31.5), ...rides(MON, 14 * 60, 1, 60), ...rides('2026-08-01', 600, 9, 99)];
    const f = frequentAmounts(r, now, 2);
    expect(f).toEqual([22, 31.5]); // 99 is older than 60 days, 60 used only once
  });
});

describe('bonus progress', () => {
  const b: Bonus = { id: 'b', weekId: '2026-W46', kind: 'daily', days: [0], start: 15 * 60, end: 21 * 60, ridesRequired: 12, reward: 130, mode: 'auto' };

  it('counts rides inside the window and the time left', () => {
    const [inst] = expandBonus(b, MON);
    const r = [...rides(MON, 14 * 60, 2, 20), ...rides(MON, 15 * 60, 7, 20)];
    const p = bonusProgress(inst, r, zonedToTs(MON, 18 * 60 + 50));
    expect(p.done).toBe(7);
    expect(p.remaining).toBe(5);
    expect(p.state).toBe('active');
    expect(p.minutesLeft).toBe(130);
  });

  it('expands daily bonuses per day, weekly ones as one', () => {
    expect(expandBonus({ ...b, days: [0, 2, 4] }, MON)).toHaveLength(3);
    expect(expandBonus({ ...b, kind: 'weekly', days: [0, 2, 4] }, MON)).toHaveLength(1);
  });
});

describe('learning', () => {
  const s = defaultSettings();
  const heat = defaultHeatmap();

  it('returns the prior when there is no data', () => {
    expect(learnModel(s, heat, empty(), 0)).toEqual(priorModel(s, heat));
  });

  it('moves the base rate towards real earnings as hours accumulate', () => {
    const data = empty();
    // 10 days × 4h, earning much more than the 55 lei/h estimate
    for (let i = 0; i < 10; i++) {
      const day = `2026-10-${String(10 + i).padStart(2, '0')}`;
      data.shifts.push(shift(day, 10 * 60, 14 * 60));
      data.rides.push(...rides(day, 10 * 60, 12, 30, 20)); // 360 lei / 4h = 90 lei/h
    }
    const m = learnModel(s, heat, data, Date.now());
    expect(m.learnedHours).toBeCloseTo(40);
    expect(m.baseGrossPerHour).toBeGreaterThan(70);
    expect(m.avgFare).toBeGreaterThan(25);
  });

  it('learns fuel cost per hour from fill-ups', () => {
    const data = empty();
    for (let i = 0; i < 5; i++) data.shifts.push(shift(`2026-10-${10 + i}`, 8 * 60, 18 * 60));
    data.fuel.push({ id: 'f1', day: '2026-10-10', ts: zonedToTs('2026-10-10', 7 * 60), total: 200 });
    data.fuel.push({ id: 'f2', day: '2026-10-14', ts: zonedToTs('2026-10-14', 19 * 60), total: 400 });
    const m = learnModel({ ...s, learning: { enabled: true, fullTrustHours: 40 } }, heat, data, Date.now());
    expect(m.fuelPerHour).toBeCloseTo(400 / 50, 1); // price unknown → trust real data
  });
});

describe('rebalance', () => {
  const s = { ...defaultSettings(), fuel: { consumptionL100: 10, pricePerL: 4 } };
  const heat = defaultHeatmap();
  const model = priorModel(s, heat);
  const plan = schedule({
    weekStart: MON, settings: s, template: defaultTemplate(), heatmap: heat, model, bonuses: [],
    netTarget: weeklyNetTarget(s), fixedCosts: weeklyFixedCosts(s), now: 0,
  });

  function actualsFor(data: LoggedData) {
    return new Map(weekDays(MON).map((d) => [d, dayActuals(d, data, Date.now())]));
  }

  it('moves a weak Monday onto the remaining days', () => {
    const data = { ...empty(), shifts: [shift(MON, 16 * 60, 20 * 60)], dailyTotals: [{ day: MON, gross: 100, rides: 5 }] };
    const r = rebalance({ plan, today: '2026-11-10', actuals: actualsFor(data), settings: s, model, template: defaultTemplate() });
    expect(r.deltaVsPlan).toBeLessThan(0);
    const tue = r.days[1];
    expect(tue.targetGross).toBeGreaterThan(tue.plannedGross);
    const remainingSum = r.days.slice(1).reduce((a, d) => a + d.targetGross, 0);
    expect(remainingSum + r.shortfallGross).toBeCloseTo(r.remainingGross, 3);
  });

  it('lowers the remaining targets when you are ahead', () => {
    const data = { ...empty(), shifts: [shift(MON, 16 * 60, 20 * 60)], dailyTotals: [{ day: MON, gross: 900, rides: 30 }] };
    const r = rebalance({ plan, today: '2026-11-10', actuals: actualsFor(data), settings: s, model, template: defaultTemplate() });
    expect(r.deltaVsPlan).toBeGreaterThan(0);
    expect(r.days[1].targetGross).toBeLessThan(r.days[1].plannedGross);
  });

  it('caps days at their max hours and reports what does not fit', () => {
    const r = rebalance({ plan: { ...plan, netTarget: 6000 }, today: MON, actuals: actualsFor(empty()), settings: s, model, template: defaultTemplate() });
    expect(r.shortfallGross).toBeGreaterThan(0);
    for (const d of r.days) expect(d.suggestedHours).toBeLessThanOrEqual(defaultTemplate()[weekdayOf(d.day)].maxHours + 1e-6);
  });
});

describe('insights', () => {
  it('finds the best weekday, best hour and bonus share', () => {
    const data = empty();
    const days = ['2026-11-09', '2026-11-10', '2026-11-13']; // Mon, Tue, Fri
    data.shifts.push(shift(days[0], 9 * 60, 13 * 60), shift(days[1], 9 * 60, 13 * 60), shift(days[2], 18 * 60, 22 * 60));
    data.rides.push(...rides(days[0], 9 * 60, 8, 25, 30), ...rides(days[1], 9 * 60, 8, 25, 30), ...rides(days[2], 18 * 60, 10, 40, 24));
    data.payouts.push({ id: 'p', day: days[2], ts: zonedToTs(days[2], 23 * 60), amount: 100 });
    const list = days.map((d) => dayActuals(d, data, Date.now()));
    const out = insights(list, cellStats(data, Date.now()));
    expect(out[0]).toMatch(/^Vinerea câștigi cu \d+% mai mult/);
    expect(out.some((s) => s.startsWith('Cea mai bună oră: vinerea'))).toBe(true);
    expect(out.some((s) => s.includes('Bonusurile au adus'))).toBe(true);
  });

  it('stays quiet without enough data', () => {
    expect(insights([dayActuals(MON, empty(), 0)], cellStats(empty(), 0))).toEqual([]);
  });
});

describe('stats', () => {
  it('summarises net profit and best hours', () => {
    const s = defaultSettings();
    const data = empty();
    data.shifts.push(shift(MON, 7 * 60, 11 * 60), shift('2026-11-10', 16 * 60, 20 * 60));
    data.rides.push(...rides(MON, 7 * 60, 8, 25, 30), ...rides('2026-11-10', 16 * 60, 10, 30, 24));
    data.payouts.push({ id: 'p', day: '2026-11-10', ts: zonedToTs('2026-11-10', 21 * 60), amount: 130 });
    data.fuel.push({ id: 'f', day: MON, ts: zonedToTs(MON, 6 * 60), total: 100 });
    const sum = summarize({ days: weekDays(MON), data, settings: s, model: priorModel(s, defaultHeatmap()), fixedCosts: 920, netTarget: 1270, now: Date.now() });
    expect(sum.hours).toBeCloseTo(8);
    expect(sum.rideGross).toBe(500);
    expect(sum.bonusGross).toBe(130);
    expect(sum.money.net).toBeCloseTo(630 * 0.9 - 100 - 920);
    expect(sum.bestDay?.day).toBe('2026-11-10');
    expect(sum.bestHours[0].perHour).toBeGreaterThan(0);
    expect(HOUR).toBe(3_600_000);
  });
});
