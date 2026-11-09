// Re-splits what is left of the weekly target over the remaining days
// when you fall behind or get ahead, respecting each day's max hours.
import type { DayActuals } from './actuals';
import { grossNeeded, keepRate } from './finance';
import type { DayKey, DayPlan, EarningModel, Settings, WeekPlan, WeekTemplate } from './types';

export interface RebalancedDay {
  day: DayKey;
  status: 'past' | 'today' | 'future';
  plannedGross: number; // original plan (rides)
  targetGross: number; // what this day should bring now (rides + its bonuses)
  actualGross: number;
  plannedHours: number;
  suggestedHours: number;
  capped: boolean; // hit max hours
}

export interface Rebalance {
  days: RebalancedDay[];
  weekGrossNeeded: number;
  weekGrossEarned: number;
  remainingGross: number; // still to earn this week (from today on, before today's earnings)
  shortfallGross: number; // cannot fit within max hours
  deltaVsPlan: number; // + ahead, − behind (past days only)
}

export function rebalance(args: {
  plan: WeekPlan;
  today: DayKey;
  actuals: Map<DayKey, DayActuals>;
  settings: Settings;
  model: EarningModel;
  template: WeekTemplate;
}): Rebalance {
  const { plan, today, actuals, settings: s, model, template } = args;
  const keep = keepRate(s);
  const status = (d: DayPlan): RebalancedDay['status'] => (d.day < today ? 'past' : d.day === today ? 'today' : 'future');

  const past = plan.days.filter((d) => status(d) === 'past');
  const rest = plan.days.filter((d) => status(d) !== 'past');
  const act = (day: DayKey) => actuals.get(day);

  const pastGross = past.reduce((a, d) => a + (act(d.day)?.gross ?? 0), 0);
  const pastHours = past.reduce((a, d) => a + (act(d.day)?.hours ?? 0), 0);
  const restHours = rest.reduce((a, d) => a + d.workHours, 0);
  const weekGrossNeeded = grossNeeded({
    netTarget: plan.netTarget,
    fixedCosts: plan.fixedCosts,
    fuelPerHour: model.fuelPerHour,
    hours: pastHours + restHours,
    keep,
  });
  const remainingGross = Math.max(0, weekGrossNeeded - pastGross);
  const deltaVsPlan = past.reduce((a, d) => a + (act(d.day)?.gross ?? 0) - (d.targetGross + d.bonusGross), 0);

  // Capacity of each remaining day = its plan's hourly rate × max hours.
  const info = rest.map((d) => {
    const rate = d.workHours > 0 ? (d.gross + d.bonusGross) / d.workHours : model.baseGrossPerHour;
    const tpl = template[d.weekday];
    const maxH = tpl?.enabled ? Math.max(tpl.maxHours, d.workHours) : d.workHours;
    return { d, rate, cap: rate * maxH, weight: d.gross + d.bonusGross, target: 0, capped: false };
  });

  // Water-filling: split proportionally to planned earnings, cap at capacity, redistribute the excess.
  let left = remainingGross;
  let open = info.filter((x) => x.weight > 0 && x.cap > 0);
  for (let iter = 0; iter < 10 && left > 0.01 && open.length; iter++) {
    const w = open.reduce((a, x) => a + x.weight, 0);
    let spilled = 0;
    for (const x of open) {
      const add = (left * x.weight) / w;
      const room = x.cap - x.target;
      if (add >= room) {
        x.target = x.cap;
        x.capped = true;
        spilled += add - room;
      } else x.target += add;
    }
    left = spilled;
    open = open.filter((x) => !x.capped);
  }

  const days: RebalancedDay[] = plan.days.map((d) => {
    const st = status(d);
    const a = act(d.day);
    if (st === 'past') {
      return {
        day: d.day, status: st, plannedGross: d.targetGross + d.bonusGross, targetGross: a?.gross ?? 0, actualGross: a?.gross ?? 0,
        plannedHours: d.workHours, suggestedHours: a?.hours ?? 0, capped: false,
      };
    }
    const x = info.find((i) => i.d.day === d.day)!;
    return {
      day: d.day, status: st, plannedGross: d.targetGross + d.bonusGross, targetGross: x.target, actualGross: a?.gross ?? 0,
      plannedHours: d.workHours, suggestedHours: x.rate > 0 ? x.target / x.rate : 0, capped: x.capped,
    };
  });

  const weekGrossEarned = plan.days.reduce((a, d) => a + (act(d.day)?.gross ?? 0), 0);
  return { days, weekGrossNeeded, weekGrossEarned, remainingGross, shortfallGross: Math.max(0, left), deltaVsPlan };
}
