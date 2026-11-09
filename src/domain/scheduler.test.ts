import { describe, expect, it } from 'vitest';
import { defaultHeatmap, defaultSettings, defaultTemplate } from './defaults';
import { keepRate, weeklyFixedCosts, weeklyNetTarget } from './finance';
import { priorModel } from './model';
import { recomputeDay, retotal, schedule, type ScheduleInput } from './scheduler';
import type { Bonus, Settings } from './types';

const WEEK = '2026-11-09';

function base(over: Partial<ScheduleInput> = {}, settings?: Settings): ScheduleInput {
  const s = settings ?? { ...defaultSettings(), fuel: { consumptionL100: 10, pricePerL: 4 } };
  const heat = defaultHeatmap();
  return {
    weekStart: WEEK,
    settings: s,
    template: defaultTemplate(),
    heatmap: heat,
    model: priorModel(s, heat),
    bonuses: [],
    netTarget: weeklyNetTarget(s),
    fixedCosts: weeklyFixedCosts(s),
    now: 0,
    ...over,
  };
}

function bonus(over: Partial<Bonus>): Bonus {
  return { id: 'b1', weekId: '2026-W46', kind: 'daily', days: [1], start: 15 * 60, end: 21 * 60, ridesRequired: 12, reward: 130, mode: 'auto', ...over };
}

describe('scheduler', () => {
  it('respects min/max hours, windows and ramps up towards the weekend', () => {
    const input = base();
    const plan = schedule(input);
    expect(plan.days).toHaveLength(7);
    plan.days.forEach((d, i) => {
      const tpl = input.template[i];
      expect(d.workHours).toBeGreaterThanOrEqual(tpl.minHours - 1e-6);
      expect(d.workHours).toBeLessThanOrEqual(tpl.maxHours + 1e-6);
      for (const r of d.runs) {
        expect(tpl.windows.some((w) => w.start <= r.start && r.end <= w.end)).toBe(true);
      }
    });
    expect(plan.days[5].workHours).toBeGreaterThan(plan.days[0].workHours);
    // weekdays end by 21:00
    for (const d of plan.days.slice(0, 4)) for (const r of d.runs) expect(r.end).toBeLessThanOrEqual(21 * 60);
  });

  it('reaches the net target when possible and splits day targets to the needed gross', () => {
    const plan = schedule(base());
    expect(plan.shortfall).toBe(0);
    expect(plan.totals.net).toBeGreaterThanOrEqual(plan.netTarget - 1e-6);
    const sumTargets = plan.days.reduce((a, d) => a + d.targetGross, 0);
    expect(sumTargets + plan.totals.bonusGross).toBeCloseTo(plan.totals.grossNeeded, 4);
  });

  it('prefers high-demand hours (weekday evening rush over mid-day)', () => {
    const plan = schedule(base());
    const mon = plan.days[0];
    const coversRush = mon.runs.some((r) => r.start <= 18 * 60 && r.end >= 19 * 60);
    expect(coversRush).toBe(true);
  });

  it('Saturday has a day part and a night part with a long evening break', () => {
    const sat = schedule(base()).days[5];
    expect(sat.runs.length).toBe(2);
    expect(sat.runs[1].start - sat.runs[0].end).toBeGreaterThanOrEqual(180);
    expect(sat.runs[1].end).toBeGreaterThan(24 * 60);
  });

  it('includes meal and rest breaks automatically', () => {
    const sun = schedule(base()).days[6];
    expect(sun.items.some((i) => i.kind === 'meal')).toBe(true);
    expect(sun.items.some((i) => i.kind === 'rest')).toBe(true);
  });

  it('reports a shortfall when the target cannot fit in max hours', () => {
    const plan = schedule(base({ netTarget: 10_000 }));
    expect(plan.shortfall).toBeGreaterThan(0);
    plan.days.forEach((d, i) => expect(d.workHours).toBeLessThanOrEqual(defaultTemplate()[i].maxHours + 1e-6));
  });

  it('places work to hit a worthwhile bonus (12 rides in 6h for 130 lei)', () => {
    const plan = schedule(base({ bonuses: [bonus({})] }));
    const ev = plan.bonusEvals[0];
    expect(ev.accepted).toBe(true);
    expect(['sigur', 'strans']).toContain(ev.status);
    expect(ev.expectedRides).toBeGreaterThanOrEqual(12);
    expect(plan.days[1].bonusGross).toBeCloseTo(130);
  });

  it('relaxes "home by 21:00" when a bonus needs it', () => {
    const b = bonus({ start: 19 * 60, end: 23 * 60, ridesRequired: 6, reward: 120, days: [0] });
    const plan = schedule(base({ bonuses: [b] }));
    expect(plan.bonusEvals[0].accepted).toBe(true);
    expect(plan.days[0].runs.some((r) => r.end > 21 * 60)).toBe(true);
  });

  it('marks an impossible bonus', () => {
    const b = bonus({ ridesRequired: 40, start: 15 * 60, end: 17 * 60 });
    const ev = schedule(base({ bonuses: [b] })).bonusEvals[0];
    expect(ev.status).toBe('imposibil');
    expect(ev.accepted).toBe(false);
  });

  it('ignores a bonus switched off', () => {
    const ev = schedule(base({ bonuses: [bonus({ mode: 'off' })] })).bonusEvals[0];
    expect(ev.status).toBe('ignorat');
  });

  it('handles a weekly bonus across several days', () => {
    const b = bonus({ id: 'w', kind: 'weekly', days: [4, 5], start: 20 * 60, end: 27 * 60, ridesRequired: 25, reward: 250 });
    const plan = schedule(base({ bonuses: [b] }));
    expect(plan.bonusEvals).toHaveLength(1);
    expect(plan.bonusEvals[0].expectedRides).toBeGreaterThanOrEqual(25);
    expect(plan.days[4].bonusGross + plan.days[5].bonusGross).toBeCloseTo(250);
  });

  it('handles a real Bolt week: morning + evening bonuses, Saturday night bonus', () => {
    const rows: [number, number, number, number, number][] = [
      [1, 6, 9, 7, 78], [1, 16, 19, 7, 78], [2, 6, 10, 9, 99], [2, 15, 19, 8, 87],
      [3, 6, 12, 12, 132], [3, 14, 20, 12, 66], [4, 7, 10, 7, 78], [4, 11, 15, 8, 87], [4, 15, 21, 12, 132],
      [5, 9, 15, 14, 153], [5, 17, 21, 10, 111], [5, 23, 28, 12, 132], [6, 9, 15, 14, 153], [6, 15, 21, 14, 153],
    ];
    const bonuses = rows.map(([d, s, e, r, p], i) => bonus({ id: `b${i}`, days: [d as 0], start: s * 60, end: e * 60, ridesRequired: r, reward: p }));
    const input = base({ bonuses });
    const plan = schedule(input);
    const ev = (id: string) => plan.bonusEvals.find((x) => x.bonusId === id)!;
    // Wednesday: two separate blocks so both bonuses fit
    expect(ev('b2').expectedRides).toBeGreaterThan(0);
    expect(ev('b3').expectedRides).toBeGreaterThan(0);
    expect(plan.days[2].runs.length).toBeGreaterThanOrEqual(2);
    // Saturday night bonus is planned and day/night stay separate blocks
    expect(ev('b11').expectedRides).toBeGreaterThanOrEqual(12);
    expect(plan.days[5].runs.length).toBeGreaterThanOrEqual(2);
    // 14 rides in 6h is tight, not impossible
    expect(ev('b9').status).not.toBe('imposibil');
    // limits still respected
    plan.days.forEach((d, i) => expect(d.workHours).toBeLessThanOrEqual(input.template[i].maxHours + 1e-6));
    expect(plan.totals.bonusGross).toBeGreaterThan(500);
  });

  it('re-plans only the remaining days with what was already earned', () => {
    const input = base();
    const full = schedule(input);
    const rest = schedule({
      ...input,
      includeDays: full.days.slice(2).map((d) => d.day),
      lockedDays: full.days.slice(0, 2),
      locked: { gross: 0, hours: 0 }, // weak Monday + Tuesday: nothing earned
    });
    const restHours = rest.days.slice(2).reduce((a, d) => a + d.workHours, 0);
    const fullHours = full.days.slice(2).reduce((a, d) => a + d.workHours, 0);
    expect(restHours).toBeGreaterThan(fullHours);
    expect(rest.days[0]).toEqual(full.days[0]);
  });

  it('does not plan before "now" when re-planning in the middle of a day', () => {
    const input = base();
    const plan = schedule({ ...input, includeDays: [WEEK], notBefore: { day: WEEK, minute: 16 * 60 } });
    for (const r of plan.days[0].runs) expect(r.start).toBeGreaterThanOrEqual(16 * 60);
  });

  it('recomputes a day and totals after manual edits', () => {
    const input = base();
    const plan = schedule(input);
    const mon = plan.days[0];
    const edited = recomputeDay(mon, [{ start: 7 * 60, end: 9 * 60 }], input.settings, input.heatmap, input.model);
    expect(edited.workHours).toBeCloseTo(2, 5); // a 2h block has no break
    const re = retotal({ ...plan, days: [edited, ...plan.days.slice(1)] }, input.settings, input.model);
    expect(re.totals.workHours).toBeLessThan(plan.totals.workHours);
    expect(keepRate(input.settings)).toBeCloseTo(0.9);
  });
});
