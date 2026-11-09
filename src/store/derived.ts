// Derived values for the UI (today, week, month, live rates, bonus progress)
// and the bridge between stored data and the scheduler.
import { useEffect, useMemo, useState } from 'react';
import { activeShift, dayActuals, isPaused, type DayActuals } from '../domain/actuals';
import { bonusProgress, instancesForDay, type BonusProgress } from '../domain/bonus';
import { grossNeeded, keepRate, monthlyFixedCosts, monthlyNetTarget, weeklyFixedCosts, weeklyNetTarget } from '../domain/finance';
import { learnModel } from '../domain/learning';
import { rebalance, type Rebalance } from '../domain/rebalance';
import { emptyDay, schedule } from '../domain/scheduler';
import { addDays, daysInMonth, dayMinutesOf, mondayOf, monthKeyOf, weekDays, weekIdOf, workDayOf } from '../domain/time';
import type { Bonus, DayKey, DayPlan, EarningModel, LoggedData, PlanItem, Settings, Shift, WeekPlan, WeekTemplate, Heatmap } from '../domain/types';
import { useApp } from './app';

export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const vis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intervalMs]);
  return now;
}

interface Source {
  settings: Settings;
  template: WeekTemplate;
  heatmap: Heatmap;
  plans: Record<string, WeekPlan>;
  bonuses: Bonus[];
  data: LoggedData;
}

export function currentWorkDay(src: Source, now: number): DayKey {
  const a = activeShift(src.data.shifts);
  return a ? a.day : workDayOf(now, src.settings.dayCutoffHour);
}

export function templateWeekHours(t: WeekTemplate): number {
  return t.reduce((a, d) => a + (d.enabled ? (d.minHours + d.maxHours) / 2 : 0), 0);
}

/**
 * Builds a plan for a week. For the current week only the remaining time is planned;
 * what already happened is taken from your logged data.
 */
export function planWeek(src: Source, weekStart: DayKey, now: number, opts: { netTarget?: number; bonuses?: Bonus[]; model?: EarningModel } = {}): WeekPlan {
  const { settings: s } = src;
  const model = opts.model ?? learnModel(s, src.heatmap, src.data, now);
  const weekId = weekIdOf(weekStart);
  const bonuses = opts.bonuses ?? src.bonuses.filter((b) => b.weekId === weekId);
  const days = weekDays(weekStart);
  const today = currentWorkDay(src, now);
  const base = {
    weekStart, settings: s, template: src.template, heatmap: src.heatmap, model, bonuses,
    netTarget: opts.netTarget ?? weeklyNetTarget(s), fixedCosts: weeklyFixedCosts(s), now,
  };
  if (today < days[0] || today > days[6]) return schedule(base);

  const existing = src.plans[weekId];
  const past = days.filter((d) => d < today);
  const doneSoFar = [...past, today].map((d) => dayActuals(d, src.data, now));
  const locked = doneSoFar.reduce((a, x) => ({ gross: a.gross + x.gross, hours: a.hours + x.hours }), { gross: 0, hours: 0 });
  return schedule({
    ...base,
    includeDays: days.filter((d) => d >= today),
    locked,
    lockedDays: past.map((d) => existing?.days.find((x) => x.day === d) ?? emptyDay(d)),
    notBefore: { day: today, minute: Math.max(0, dayMinutesOf(now, today)) },
  });
}

export interface Derived {
  now: number;
  today: DayKey;
  nowMin: number;
  weekStart: DayKey;
  weekId: string;
  plan?: WeekPlan;
  model: EarningModel;
  todayPlan?: DayPlan;
  nextWeekStart: DayKey;
  nextWeekId: string;
  nextWeekPlanned: boolean;
  actuals: Map<DayKey, DayActuals>;
  todayAct: DayActuals;
  rb: Rebalance | null;
  todayTarget: number;
  remainingToday: number;
  weekEarned: number;
  weekNeeded: number;
  weekNetTarget: number;
  monthEarned: number;
  monthNeeded: number;
  monthNetTarget: number;
  shift?: Shift;
  paused: boolean;
  hoursToday: number;
  perHourNow: number;
  neededPerHour: number;
  bonuses: BonusProgress[];
  currentItem?: PlanItem;
  nextItem?: PlanItem;
  dayPlansForNotices: DayPlan[];
}

export function computeDerived(src: Source, now: number): Derived {
  const s = src.settings;
  const today = currentWorkDay(src, now);
  const weekStart = mondayOf(today);
  const weekId = weekIdOf(weekStart);
  const plan = src.plans[weekId];
  const model = learnModel(s, src.heatmap, src.data, now);
  const nextWeekStart = addDays(weekStart, 7);
  const nextWeekId = weekIdOf(nextWeekStart);
  const days = weekDays(weekStart);
  const actuals = new Map(days.map((d) => [d, dayActuals(d, src.data, now)]));
  const todayAct = actuals.get(today)!;
  const keep = keepRate(s);

  const rb = plan ? rebalance({ plan, today, actuals, settings: s, model, template: src.template }) : null;
  const weekEarned = [...actuals.values()].reduce((a, x) => a + x.gross, 0);
  const estHours = plan?.totals.workHours ?? templateWeekHours(src.template);
  const weekNeeded = rb?.weekGrossNeeded ?? grossNeeded({ netTarget: weeklyNetTarget(s), fixedCosts: weeklyFixedCosts(s), fuelPerHour: model.fuelPerHour, hours: estHours, keep });

  let todayTarget = rb?.days.find((d) => d.day === today)?.targetGross ?? 0;
  if (!plan) {
    const earnedBefore = days.filter((d) => d < today).reduce((a, d) => a + (actuals.get(d)?.gross ?? 0), 0);
    const left = days.filter((d) => d >= today && src.template[days.indexOf(d)]?.enabled).length || 1;
    todayTarget = Math.max(0, weekNeeded - earnedBefore) / left;
  }

  const monthDays = daysInMonth(monthKeyOf(today));
  const monthEarned = monthDays.reduce((a, d) => a + dayActuals(d, src.data, now).gross, 0);
  const monthNeeded = (monthlyNetTarget(s) + monthlyFixedCosts(s) + model.fuelPerHour * estHours * s.weeksPerMonth) / keep;

  const shift = activeShift(src.data.shifts);
  const hoursToday = todayAct.hours;
  const todayPlan = plan?.days.find((d) => d.day === today);
  const remainingToday = Math.max(0, todayTarget - todayAct.gross);
  const remainingPlannedHours = Math.max(0.5, (todayPlan?.workHours ?? 0) - hoursToday);
  const nowMin = dayMinutesOf(now, today);
  const currentItem = todayPlan?.items.find((i) => i.start <= nowMin && nowMin < i.end);
  const nextItem = todayPlan?.items.find((i) => i.start > nowMin && (i.kind !== 'work' || !currentItem || currentItem.kind !== 'work'));

  const bonuses = instancesForDay(src.bonuses.filter((b) => b.weekId === weekId), weekStart, today).map((inst) => bonusProgress(inst, src.data.rides, now));

  const yesterday = addDays(today, -1);
  const dayPlansForNotices = [todayPlan, plan?.days.find((d) => d.day === yesterday) ?? src.plans[weekIdOf(yesterday)]?.days.find((d) => d.day === yesterday)]
    .filter((d): d is DayPlan => !!d);

  return {
    now, today, nowMin, weekStart, weekId, plan, model, todayPlan, nextWeekStart, nextWeekId,
    nextWeekPlanned: !!src.plans[nextWeekId],
    actuals, todayAct, rb, todayTarget, remainingToday, weekEarned, weekNeeded,
    weekNetTarget: plan?.netTarget ?? weeklyNetTarget(s),
    monthEarned, monthNeeded, monthNetTarget: monthlyNetTarget(s),
    shift, paused: shift ? isPaused(shift) : false, hoursToday,
    perHourNow: hoursToday > 0.05 ? todayAct.rideGross / hoursToday : 0,
    neededPerHour: remainingToday / remainingPlannedHours,
    bonuses, currentItem, nextItem, dayPlansForNotices,
  };
}

export function useDerived(): Derived {
  const now = useNow();
  const settings = useApp((x) => x.settings);
  const template = useApp((x) => x.template);
  const heatmap = useApp((x) => x.heatmap);
  const plans = useApp((x) => x.plans);
  const bonuses = useApp((x) => x.bonuses);
  const data = useApp((x) => x.data);
  return useMemo(() => computeDerived({ settings, template, heatmap, plans, bonuses, data }, now), [settings, template, heatmap, plans, bonuses, data, now]);
}

export function useSource(): Source {
  const settings = useApp((x) => x.settings);
  const template = useApp((x) => x.template);
  const heatmap = useApp((x) => x.heatmap);
  const plans = useApp((x) => x.plans);
  const bonuses = useApp((x) => x.bonuses);
  const data = useApp((x) => x.data);
  return useMemo(() => ({ settings, template, heatmap, plans, bonuses, data }), [settings, template, heatmap, plans, bonuses, data]);
}
