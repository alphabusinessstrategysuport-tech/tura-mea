// Weekly scheduler.
//
// Works on 30-minute slots inside each day's allowed windows and grows
// continuous blocks greedily:
//   A. minimum hours per window / per day (your habits),
//   B. bonuses that are worth it (may relax "home by 21:00"),
//   C. extra hours in the best-paid slots until the net target is reached,
//      never above each day's max hours.
// Breaks are laid out inside every block afterwards (see breaks.ts).
import { expandBonus, expectedRidesInWindows, type BonusInstance } from './bonus';
import { layoutRun, workMinutes } from './breaks';
import { grossNeeded, keepRate } from './finance';
import { integrate } from './model';
import { weekDays, weekIdOf, weekdayOf } from './time';
import type {
  Bonus, BonusEval, BonusStatus, DayKey, DayPlan, DayTemplate, EarningModel, Heatmap, PlanItem, Run, Settings, WeekPlan, WeekTemplate, Weekday,
} from './types';

export const SLOT = 30;
const MAX_SLOTS = 66; // up to 33:00 (09:00 next day)
const EPS = 1e-6;
const BONUS_MARGIN = 1.2; // plan 20% more rides than required (safety margin)

export interface ScheduleInput {
  weekStart: DayKey;
  settings: Settings;
  template: WeekTemplate;
  heatmap: Heatmap;
  model: EarningModel;
  bonuses: Bonus[];
  netTarget: number;
  fixedCosts: number;
  /** Days to plan. Defaults to the whole week. Other days come from `lockedDays` or stay empty. */
  includeDays?: DayKey[];
  /** Already happened (actuals) for days not being planned. */
  locked?: { gross: number; hours: number };
  /** Plans kept as-is for display (e.g. past days). */
  lockedDays?: DayPlan[];
  /** Do not plan slots before this moment (re-planning in the middle of a day). */
  notBefore?: { day: DayKey; minute: number };
  now?: number;
}

interface DayState {
  day: DayKey;
  weekday: Weekday;
  tpl: DayTemplate;
  segs: Run[]; // merged allowed windows (template + accepted bonus windows)
  sel: boolean[];
  minSlot: number;
  items: PlanItem[];
  work: number; // hours
}

function mergeRuns(runs: Run[]): Run[] {
  const sorted = [...runs].sort((a, b) => a.start - b.start);
  const out: Run[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export function runsOfSlots(sel: boolean[]): Run[] {
  const runs: Run[] = [];
  let start = -1;
  for (let i = 0; i <= sel.length; i++) {
    if (i < sel.length && sel[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push({ start: start * SLOT, end: i * SLOT });
      start = -1;
    }
  }
  return runs;
}

/** Items (work + breaks) for a list of runs. */
export function layoutDay(runs: Run[], weekday: number, s: Settings, heat: Heatmap): PlanItem[] {
  return runs.flatMap((r) => layoutRun(r, weekday, s.breaks, heat));
}

function segIndex(segs: Run[], slot: number): number {
  const a = slot * SLOT;
  const b = a + SLOT;
  return segs.findIndex((g) => g.start <= a && b <= g.end);
}

function inRuns(runs: Run[], slot: number): boolean {
  const a = slot * SLOT;
  return runs.some((r) => r.start <= a && a + SLOT <= r.end);
}

export function schedule(input: ScheduleInput): WeekPlan {
  const { settings: s, template, heatmap: heat, model, weekStart } = input;
  const keep = keepRate(s);
  const fuelH = model.fuelPerHour;
  const days = weekDays(weekStart);
  const include = new Set(input.includeDays ?? days);
  const locked = input.locked ?? { gross: 0, hours: 0 };

  const states = new Map<DayKey, DayState>();
  for (const day of days) {
    if (!include.has(day)) continue;
    const wd = weekdayOf(day);
    const tpl = template[wd];
    if (!tpl?.enabled) continue;
    let minSlot = 0;
    if (input.notBefore && input.notBefore.day === day) minSlot = Math.ceil(input.notBefore.minute / SLOT);
    states.set(day, { day, weekday: wd, tpl, segs: mergeRuns(tpl.windows), sel: Array(MAX_SLOTS).fill(false), minSlot, items: [], work: 0 });
  }

  const refresh = (st: DayState) => {
    st.items = layoutDay(runsOfSlots(st.sel), st.weekday, s, heat);
    st.work = workMinutes(st.items) / 60;
  };
  const itemsByDay = () => new Map([...states.values()].map((st) => [st.day, st.items] as [DayKey, PlanItem[]]));

  const slotGross = (st: DayState, slot: number) => integrate(model.grossPerHour, st.weekday, slot * SLOT, slot * SLOT + SLOT);
  const slotRides = (st: DayState, slot: number) => integrate(model.ridesPerHour, st.weekday, slot * SLOT, slot * SLOT + SLOT);

  /** Can `slot` be added while keeping one continuous block per window and respecting max hours? */
  const canAdd = (st: DayState, slot: number, maxHours: number): boolean => {
    if (slot < st.minSlot || slot >= MAX_SLOTS || st.sel[slot]) return false;
    const gi = segIndex(st.segs, slot);
    if (gi < 0) return false;
    const adjacent = (slot > 0 && st.sel[slot - 1]) || (slot + 1 < MAX_SLOTS && st.sel[slot + 1]);
    if (!adjacent) {
      const g = st.segs[gi];
      for (let i = Math.floor(g.start / SLOT); i < Math.ceil(g.end / SLOT); i++) if (st.sel[i]) return false;
    }
    if (st.work + SLOT / 60 <= maxHours + EPS) return true;
    st.sel[slot] = true;
    const w = workMinutes(layoutDay(runsOfSlots(st.sel), st.weekday, s, heat)) / 60;
    st.sel[slot] = false;
    return w <= maxHours + EPS;
  };

  /** Adds the best slot among candidates; returns false if none. */
  const addBest = (candidates: { st: DayState; slot: number; value: number }[]): boolean => {
    let best: (typeof candidates)[number] | null = null;
    for (const c of candidates) if (!best || c.value > best.value) best = c;
    if (!best) return false;
    best.st.sel[best.slot] = true;
    refresh(best.st);
    return true;
  };

  const slotsIn = (st: DayState, range: Run): number[] => {
    const out: number[] = [];
    for (let i = Math.max(st.minSlot, Math.ceil(range.start / SLOT)); (i + 1) * SLOT <= range.end && i < MAX_SLOTS; i++) out.push(i);
    return out;
  };

  // ---------- Bonus decisions ----------
  const instances: BonusInstance[] = input.bonuses
    .flatMap((b) => expandBonus(b, weekStart))
    .map((inst) => ({ ...inst, windows: inst.windows.filter((w) => states.has(w.day)) }));

  const baselineNetPerHour = model.baseGrossPerHour * keep - fuelH;
  interface Decision { inst: BonusInstance; accepted: boolean; worth: boolean; impossible: boolean; maxRides: number; hoursNeeded: number; eff: number; relax: boolean }
  const decisions: Decision[] = instances.map((inst) => {
    const b = inst.bonus;
    let maxRides = 0;
    let windowHours = 0;
    let grossWin = 0;
    let relax = false;
    let maxHoursAvail = 0;
    for (const w of inst.windows) {
      maxRides += integrate(model.ridesPerHour, w.weekday, w.start, w.end);
      grossWin += integrate(model.grossPerHour, w.weekday, w.start, w.end);
      windowHours += (w.end - w.start) / 60;
      const st = states.get(w.day)!;
      maxHoursAvail += st.tpl.maxHours;
      const tplSegs = mergeRuns(st.tpl.windows);
      if (!tplSegs.some((g) => g.start <= w.start && w.end <= g.end)) relax = true;
    }
    const avgRph = windowHours > 0 ? maxRides / windowHours : 0;
    const hoursNeeded = avgRph > 0 ? b.ridesRequired / avgRph : Infinity;
    const grossRate = windowHours > 0 ? grossWin / windowHours : 0;
    const eff = Number.isFinite(hoursNeeded) ? grossRate * keep - fuelH + (b.reward * keep) / hoursNeeded : 0;
    const impossible = inst.windows.length === 0 || maxRides < b.ridesRequired * 0.9 || hoursNeeded > Math.min(windowHours, maxHoursAvail) + EPS;
    const worth = !impossible && eff >= baselineNetPerHour * (relax ? 1.3 : 1.0);
    const accepted = b.mode === 'on' ? inst.windows.length > 0 : b.mode === 'off' ? false : worth;
    return { inst, accepted, worth, impossible, maxRides, hoursNeeded, eff, relax };
  });

  // Accepted bonus windows become allowed time (this is how 21:00 is relaxed).
  for (const d of decisions) {
    if (!d.accepted) continue;
    for (const w of d.inst.windows) {
      const st = states.get(w.day)!;
      st.segs = mergeRuns([...st.segs, { start: w.start, end: Math.min(w.end, MAX_SLOTS * SLOT) }]);
    }
  }

  // ---------- Phase A: minimum hours ----------
  for (const st of states.values()) {
    const tplSegs = mergeRuns(st.tpl.windows);
    for (const w of st.tpl.windows) {
      if (!w.minHours) continue;
      const inWin = () => workMinutes(st.items.filter((i) => i.start >= w.start && i.end <= w.end)) / 60;
      while (inWin() < w.minHours - EPS) {
        const cands = slotsIn(st, w).filter((i) => canAdd(st, i, st.tpl.maxHours)).map((slot) => ({ st, slot, value: slotGross(st, slot) }));
        if (!addBest(cands)) break;
      }
    }
    while (st.work < st.tpl.minHours - EPS) {
      const cands: { st: DayState; slot: number; value: number }[] = [];
      for (let i = st.minSlot; i < MAX_SLOTS; i++) if (inRuns(tplSegs, i) && canAdd(st, i, st.tpl.maxHours)) cands.push({ st, slot: i, value: slotGross(st, i) });
      if (!addBest(cands)) break;
    }
  }

  // ---------- Phase B: bonuses ----------
  const accepted = decisions.filter((d) => d.accepted).sort((a, b) => b.eff - a.eff);
  for (const d of accepted) {
    const need = d.inst.bonus.ridesRequired * BONUS_MARGIN;
    for (let guard = 0; guard < 200; guard++) {
      if (expectedRidesInWindows(d.inst.windows, itemsByDay(), model).total >= need) break;
      const cands: { st: DayState; slot: number; value: number }[] = [];
      for (const w of d.inst.windows) {
        const st = states.get(w.day)!;
        for (const i of slotsIn(st, w)) if (canAdd(st, i, st.tpl.maxHours)) cands.push({ st, slot: i, value: slotRides(st, i) });
      }
      if (!addBest(cands)) break;
    }
  }

  // ---------- Evaluation helpers ----------
  const bonusOutcome = () => {
  const ibd = itemsByDay();
    let total = 0;
    const perDay = new Map<DayKey, number>();
    const evals = decisions.map((d) => {
      const exp = expectedRidesInWindows(d.inst.windows, ibd, model);
      const reached = d.accepted && exp.total >= d.inst.bonus.ridesRequired - EPS;
      if (reached) {
        total += d.inst.bonus.reward;
        for (const [day, r] of exp.byDay) perDay.set(day, (perDay.get(day) ?? 0) + (exp.total > 0 ? (d.inst.bonus.reward * r) / exp.total : 0));
      }
      return { d, exp, reached };
    });
    return { total, perDay, evals };
  };

  const planTotals = () => {
    let gross = 0;
    let hours = 0;
    for (const st of states.values()) {
      for (const it of st.items) if (it.kind === 'work') gross += integrate(model.grossPerHour, st.weekday, it.start, it.end);
      hours += st.work;
    }
    const bonus = bonusOutcome().total;
    const net = (locked.gross + gross + bonus) * keep - input.fixedCosts - fuelH * (locked.hours + hours);
    return { gross, hours, bonus, net };
  };

  // ---------- Phase C: reach the net target ----------
  for (let guard = 0; guard < 400; guard++) {
    if (planTotals().net >= input.netTarget - EPS) break;
    const cands: { st: DayState; slot: number; value: number }[] = [];
    for (const st of states.values()) {
      for (let i = st.minSlot; i < MAX_SLOTS; i++) {
        if (!canAdd(st, i, st.tpl.maxHours)) continue;
        const value = slotGross(st, i) * keep - fuelH * (SLOT / 60);
        if (value > 0) cands.push({ st, slot: i, value });
      }
    }
    if (!addBest(cands)) break;
  }

  // ---------- Build output ----------
  const totals = planTotals();
  const outcome = bonusOutcome();
  const totalHours = locked.hours + totals.hours;
  const needed = grossNeeded({ netTarget: input.netTarget, fixedCosts: input.fixedCosts, fuelPerHour: fuelH, hours: totalHours, keep });
  const rideGrossNeeded = Math.max(0, needed - locked.gross - outcome.total);

  const lockedByDay = new Map((input.lockedDays ?? []).map((d) => [d.day, d]));
  const dayPlans: DayPlan[] = days.map((day) => {
    const st = states.get(day);
    if (!st) {
      const l = lockedByDay.get(day);
      if (l) return l;
      return emptyDay(day);
    }
    const runs = runsOfSlots(st.sel);
    let gross = 0;
    let rides = 0;
    for (const it of st.items) {
      if (it.kind !== 'work') continue;
      gross += integrate(model.grossPerHour, st.weekday, it.start, it.end);
      rides += integrate(model.ridesPerHour, st.weekday, it.start, it.end);
    }
    const bonusGross = outcome.perDay.get(day) ?? 0;
    const fuel = fuelH * st.work;
    const fixedShare = totalHours > 0 ? (input.fixedCosts * st.work) / totalHours : 0;
    return {
      day,
      weekday: st.weekday,
      runs,
      items: st.items,
      workHours: st.work,
      gross,
      bonusGross,
      rides,
      fuel,
      net: (gross + bonusGross) * keep - fuel - fixedShare,
      targetGross: totals.gross > 0 ? (rideGrossNeeded * gross) / totals.gross : 0,
    };
  });

  const bonusEvals: BonusEval[] = outcome.evals.map(({ d, exp }) => {
    const required = d.inst.bonus.ridesRequired;
    let status: BonusStatus;
    let reason: string;
    const ratio = required > 0 ? exp.total / required : 0;
    if (d.inst.bonus.mode === 'off') {
      status = 'ignorat';
      reason = 'Ai ales să nu urmărești acest bonus.';
    } else if (d.impossible && !(d.accepted && ratio >= 0.95)) {
      status = 'imposibil';
      reason = d.inst.windows.length === 0
        ? 'Ziua bonusului nu e în programul tău.'
        : `Estimat maxim ${Math.floor(d.maxRides)} curse în fereastră, ai nevoie de ${required}.`;
    } else if (!d.accepted) {
      status = 'neplanificat';
      reason = `Nu merită: ~${Math.round(d.eff)} lei/h net față de ~${Math.round(baselineNetPerHour)} lei/h în mod normal.`;
    } else if (ratio >= 1.15) {
      status = 'sigur';
      reason = `Programul acoperă ~${exp.hours.toFixed(1)} h în fereastră (~${Math.round(exp.total)} curse estimate).`;
    } else if (ratio >= 0.95) {
      status = 'strans';
      reason = `La limită: ~${Math.round(exp.total)} curse estimate pentru ${required}. Fii activ în fereastră.`;
    } else {
      status = 'neplanificat';
      reason = 'Nu încape în limitele tale de ore. Mărește orele maxime ale zilei dacă îl vrei.';
    }
    return {
      bonusId: d.inst.bonus.id,
      key: d.inst.key,
      day: d.inst.bonus.kind === 'daily' ? d.inst.windows[0]?.day ?? d.inst.key.split('@')[1] : undefined,
      accepted: d.accepted,
      worth: d.worth,
      status,
      required,
      expectedRides: exp.total,
      maxRides: d.maxRides,
      hoursNeeded: d.hoursNeeded,
      effectiveNetPerHour: d.eff,
      reason,
    };
  });

  const now = input.now ?? Date.now();
  return {
    id: weekIdOf(weekStart),
    weekStart,
    createdAt: now,
    updatedAt: now,
    netTarget: input.netTarget,
    fixedCosts: input.fixedCosts,
    days: dayPlans,
    bonusEvals,
    totals: {
      workHours: totals.hours,
      gross: totals.gross,
      bonusGross: outcome.total,
      fuel: fuelH * totals.hours,
      net: totals.net,
      grossNeeded: needed,
    },
    shortfall: Math.max(0, input.netTarget - totals.net),
  };
}

export function emptyDay(day: DayKey): DayPlan {
  return { day, weekday: weekdayOf(day), runs: [], items: [], workHours: 0, gross: 0, bonusGross: 0, rides: 0, fuel: 0, net: 0, targetGross: 0 };
}

/** Recomputes a day after the user edited its runs by hand. */
export function recomputeDay(day: DayPlan, runs: Run[], s: Settings, heat: Heatmap, model: EarningModel): DayPlan {
  const merged = mergeRuns(runs.filter((r) => r.end > r.start));
  const items = layoutDay(merged, day.weekday, s, heat);
  let gross = 0;
  let rides = 0;
  for (const it of items) {
    if (it.kind !== 'work') continue;
    gross += integrate(model.grossPerHour, day.weekday, it.start, it.end);
    rides += integrate(model.ridesPerHour, day.weekday, it.start, it.end);
  }
  const workHours = workMinutes(items) / 60;
  const keep = keepRate(s);
  const fuel = model.fuelPerHour * workHours;
  const fixedShare = day.workHours > 0 ? ((day.gross + day.bonusGross) * keep - day.fuel - day.net) * (workHours / day.workHours) : 0;
  return { ...day, runs: merged, items, workHours, gross, rides, fuel, net: (gross + day.bonusGross) * keep - fuel - fixedShare };
}

/** Re-totals a plan after manual edits and re-splits day gross targets. */
export function retotal(plan: WeekPlan, s: Settings, model: EarningModel): WeekPlan {
  const keep = keepRate(s);
  const hours = plan.days.reduce((a, d) => a + d.workHours, 0);
  const gross = plan.days.reduce((a, d) => a + d.gross, 0);
  const bonus = plan.days.reduce((a, d) => a + d.bonusGross, 0);
  const fuel = model.fuelPerHour * hours;
  const net = (gross + bonus) * keep - plan.fixedCosts - fuel;
  const needed = grossNeeded({ netTarget: plan.netTarget, fixedCosts: plan.fixedCosts, fuelPerHour: model.fuelPerHour, hours, keep });
  const rideNeeded = Math.max(0, needed - bonus);
  return {
    ...plan,
    updatedAt: Date.now(),
    days: plan.days.map((d) => ({ ...d, targetGross: gross > 0 ? (rideNeeded * d.gross) / gross : 0 })),
    totals: { workHours: hours, gross, bonusGross: bonus, fuel, net, grossNeeded: needed },
    shortfall: Math.max(0, plan.netTarget - net),
  };
}
