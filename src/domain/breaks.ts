// Places meal and short rest breaks inside a continuous run on the road.
// Meals go to the quietest moment (lowest demand) near the ideal time.
import { demandAt } from './model';
import type { BreakRules, Heatmap, PlanItem, Run } from './types';

const STEP = 10;

export function layoutRun(run: Run, weekday: number, rules: BreakRules, heat?: Heatmap): PlanItem[] {
  const items: PlanItem[] = [];
  let t = run.start;
  let workStart = t;
  let sinceMeal = 0;
  let sinceRest = 0;
  let mealAt: number | null = null; // planned meal start; -1 = no meal fits any more

  const pushWork = (end: number) => {
    if (end > workStart) items.push({ start: workStart, end, kind: 'work' });
  };

  while (t < run.end) {
    const remaining = run.end - t;

    if (mealAt === null && sinceMeal >= rules.mealAfterMin - 30) {
      const ideal = t + Math.max(0, rules.mealAfterMin - sinceMeal);
      let best = -1;
      let bestScore = Infinity;
      for (let k = 0; k <= 6; k++) {
        const c = t + k * STEP;
        if (run.end - c - rules.mealMin < 60) break; // keep at least 1h of work after the meal
        const score = (heat ? demandAt(heat, weekday, c) : 0) + Math.abs(c - ideal) / 6;
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
      mealAt = best;
    }

    if (mealAt !== null && mealAt >= 0 && t >= mealAt) {
      pushWork(t);
      items.push({ start: t, end: t + rules.mealMin, kind: 'meal' });
      t += rules.mealMin;
      workStart = t;
      sinceMeal = 0;
      sinceRest = 0;
      mealAt = null;
      continue;
    }

    const mealSoon = mealAt !== null && mealAt >= 0 && mealAt - t <= 30;
    if (sinceRest >= rules.restEveryMin && remaining - rules.restMin >= 30 && !mealSoon) {
      pushWork(t);
      items.push({ start: t, end: t + rules.restMin, kind: 'rest' });
      t += rules.restMin;
      workStart = t;
      sinceRest = 0;
      continue;
    }

    const step = Math.min(STEP, remaining);
    t += step;
    sinceMeal += step;
    sinceRest += step;
  }
  pushWork(run.end);
  return items;
}

export function workMinutes(items: PlanItem[]): number {
  return items.reduce((a, i) => a + (i.kind === 'work' ? i.end - i.start : 0), 0);
}
