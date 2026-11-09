// Decides WHAT to notify and WHEN. Pure logic; the browser side lives in src/notifications/runner.ts.
// Tone: warm and encouraging, never pushy.
import type { BonusProgress } from './bonus';
import { lei } from './money';
import { demandAt } from './model';
import { addDays, fmtDuration, fmtHM, weekdayOf, zonedToTs } from './time';
import type { DayKey, DayPlan, Heatmap, NotificationType, Settings } from './types';

export interface Notice {
  key: string; // unique; used to never send the same notice twice
  type: NotificationType;
  title: string;
  body: string;
  at: number;
}

export interface NoticeContext {
  now: number;
  today: DayKey; // current work day
  settings: Settings;
  heat: Heatmap;
  dayPlans: DayPlan[]; // plans of today and yesterday (late night runs)
  todayTarget: number;
  todayEarned: number;
  shiftActive: boolean;
  bonuses: BonusProgress[];
  nextWeekPlanned: boolean;
  nextWeekId: string;
}

/** Every notice that can happen today, ordered by time. */
export function allNotices(ctx: NoticeContext): Notice[] {
  const { settings: s, heat } = ctx;
  const out: Notice[] = [];

  for (const dp of ctx.dayPlans) {
    const at = (m: number) => zonedToTs(dp.day, m);
    dp.runs.forEach((r, idx) => {
      const busy = demandAt(heat, dp.weekday, r.start) >= 75;
      if (!ctx.shiftActive || idx > 0) {
        out.push({
          key: `leave:${dp.day}:${r.start}`,
          type: 'leave',
          at: at(r.start - s.notifyLeadMin),
          title: busy ? 'Pleacă acum: vine ora de vârf 🚗' : 'E aproape ora de plecare 🚗',
          body: busy
            ? `La ${fmtHM(r.start)} începe o perioadă aglomerată. Ținta de azi: ${lei(ctx.todayTarget)}.`
            : `Programul tău începe la ${fmtHM(r.start)}. Ținta de azi: ${lei(ctx.todayTarget)}.`,
        });
      }
    });
    for (const it of dp.items) {
      if (it.kind === 'meal') {
        out.push({
          key: `meal:${dp.day}:${it.start}`, type: 'breaks', at: at(it.start),
          title: 'Pauză de masă 🍽️',
          body: `Ai muncit bine. Ia-ți ${it.end - it.start} de minute și mănâncă liniștit.`,
        });
      } else if (it.kind === 'rest') {
        out.push({
          key: `rest:${dp.day}:${it.start}`, type: 'breaks', at: at(it.start),
          title: 'Pauză scurtă ☕',
          body: `${it.end - it.start} minute de respiro: întinde-te, bea apă.`,
        });
      }
    }
    const last = dp.runs[dp.runs.length - 1];
    if (last) {
      const reached = ctx.todayEarned >= ctx.todayTarget && ctx.todayTarget > 0;
      out.push({
        key: `home:${dp.day}`, type: 'goHome', at: at(last.end),
        title: 'Gata pe azi 🏠',
        body: reached
          ? `Ai atins ținta zilei: ${lei(ctx.todayEarned)}. Drum bun spre casă!`
          : `Ai încasat ${lei(ctx.todayEarned)} din ${lei(ctx.todayTarget)}. Restul îl împart pe zilele următoare. Odihnește-te!`,
      });
    }
  }

  for (const b of ctx.bonuses) {
    if (b.achieved) continue;
    if (b.state === 'active') {
      const left = fmtDuration(b.minutesLeft);
      if (b.remaining <= 3) {
        out.push({
          key: `bonus:${b.key}:r${b.remaining}`, type: 'bonus', at: ctx.now,
          title: `Încă ${b.remaining} ${b.remaining === 1 ? 'cursă' : 'curse'} pentru bonus 💪`,
          body: `Bonusul de ${lei(b.bonus.reward)} e aproape. Mai ai ${left}. Poți!`,
        });
      }
      if (b.minutesLeft <= 60) {
        out.push({
          key: `bonus:${b.key}:t60`, type: 'bonus', at: ctx.now,
          title: 'Ultima oră pentru bonus ⏳',
          body: `${b.done}/${b.required} curse, mai ai ${left} pentru ${lei(b.bonus.reward)}.`,
        });
      }
    } else if (b.state === 'before' && b.startsInMin <= 15) {
      out.push({
        key: `bonus:${b.key}:start`, type: 'bonus', at: ctx.now,
        title: 'Începe fereastra de bonus 🎯',
        body: `${b.required} curse până la ${fmtHM(b.bonus.end)} pentru ${lei(b.bonus.reward)}.`,
      });
    }
  }

  if (ctx.todayTarget > 0 && ctx.todayEarned >= ctx.todayTarget) {
    out.push({
      key: `progress:${ctx.today}`, type: 'progress', at: ctx.now,
      title: 'Ținta de azi e atinsă 🎉',
      body: `Ai încasat ${lei(ctx.todayEarned)}. Tot ce faci de acum e în avans pentru săptămână.`,
    });
  }

  // Sunday planning (calendar day, not work day)
  const calendarDay = ctx.today;
  const sunday = weekdayOf(calendarDay) === 6 ? calendarDay : weekdayOf(addDays(calendarDay, 1)) === 6 ? addDays(calendarDay, 1) : null;
  if (sunday && !ctx.nextWeekPlanned) {
    out.push({
      key: `plan:${ctx.nextWeekId}:9`, type: 'planning', at: zonedToTs(sunday, 9 * 60),
      title: 'Planificarea săptămânii 📅',
      body: 'Bună dimineața! Introdu bonusurile săptămânii și îți fac programul. Gata până la 10:00.',
    });
    out.push({
      key: `plan:${ctx.nextWeekId}:945`, type: 'planning', at: zonedToTs(sunday, 9 * 60 + 45),
      title: 'Mai sunt 15 minute până la 10:00 ⏰',
      body: 'Planul săptămânii durează doar două minute. Hai să-l facem!',
    });
  }

  return out.filter((n) => s.notifications[n.type]).sort((a, b) => a.at - b.at);
}

/** Notices due now (not older than `graceMin`, so old ones are not spammed when the app opens). */
export function dueNotices(ctx: NoticeContext, sent: Set<string>, graceMin = 20): Notice[] {
  return allNotices(ctx).filter((n) => n.at <= ctx.now && n.at > ctx.now - graceMin * 60_000 && !sent.has(n.key));
}

export function nextNoticeAt(ctx: NoticeContext, sent: Set<string>): number | null {
  const n = allNotices(ctx).find((x) => x.at > ctx.now && !sent.has(x.key));
  return n ? n.at : null;
}
